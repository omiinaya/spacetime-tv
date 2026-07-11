"""Integration tests against real IPTV provider endpoints.

Uses FastAPI TestClient against the full application stack (middleware,
route handlers, and real IPTV API calls). Requires valid .env credentials.

Run:  python -m pytest tests/ -m integration -v
Skip: pytest automatically when IPTV credentials are placeholder values.
"""
import pytest
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import IPTV_USER, IPTV_PASS

# Only run if we have real-looking credentials (not test placeholders)
_has_creds = bool(IPTV_USER and IPTV_PASS) and "test" not in IPTV_USER.lower()

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(not _has_creds, reason="Real IPTV credentials not configured"),
]

# Lazy import to avoid loading the app for skip conditions
@pytest.fixture(scope="module")
def client():
    from main import app
    from fastapi.testclient import TestClient
    return TestClient(app)


class TestLiveEndpoints:
    """Validate live TV endpoints against real IPTV provider."""

    def test_get_live_categories(self, client):
        """GET /api/v1/live/categories returns list with expected schema."""
        r = client.get("/api/v1/live/categories")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        item = data[0]
        assert "category_id" in item, f"Missing category_id in {list(item.keys())}"
        assert "category_name" in item, f"Missing category_name in {list(item.keys())}"

    def test_get_live_streams(self, client):
        """GET /api/v1/live returns paginated streams."""
        r = client.get("/api/v1/live?limit=10")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        # Some providers return a dict with 'data' key when paginated
        streams = data if isinstance(data, list) else data.get("data", [])
        assert len(streams) > 0
        for s in streams[:5]:
            assert "stream_id" in s
            assert "name" in s
            assert "stream_icon" in s

    def test_live_stream_has_name(self, client):
        """Every live stream has a non-empty name."""
        r = client.get("/api/v1/live?limit=20")
        assert r.status_code == 200
        data = r.json()
        streams = data if isinstance(data, list) else data.get("data", [])
        for s in streams:
            assert s.get("name"), f"Stream {s.get('stream_id')} has empty name"


class TestVodEndpoints:
    """Validate VOD endpoints against real IPTV provider."""

    def test_get_vod_categories(self, client):
        """GET /api/v1/vod/categories returns list."""
        r = client.get("/api/v1/vod/categories")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert "category_id" in data[0]
        assert "category_name" in data[0]

    def test_get_vod_streams_by_category(self, client):
        """GET /api/v1/vod/{category_id} returns VOD streams."""
        # Get first category
        cats = client.get("/api/v1/vod/categories").json()
        assert len(cats) > 0
        cat_id = cats[0]["category_id"]
        r = client.get(f"/api/v1/vod/{cat_id}")
        assert r.status_code == 200
        data = r.json()
        streams = data if isinstance(data, list) else data.get("data", [])
        assert len(streams) > 0, f"Category {cat_id} returned 0 streams"
        assert "stream_id" in streams[0]
        assert "name" in streams[0]


class TestSeriesEndpoints:
    """Validate series endpoints against real IPTV provider."""

    def test_get_series_categories(self, client):
        """GET /api/v1/vod/series/categories returns list."""
        r = client.get("/api/v1/vod/series/categories")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert "category_id" in data[0]
        assert "category_name" in data[0]

    def test_get_series_by_category(self, client):
        """GET /api/v1/vod/series/{category_id} returns series list."""
        cats = client.get("/api/v1/vod/series/categories").json()
        assert len(cats) > 0
        cat_id = cats[0]["category_id"]
        r = client.get(f"/api/v1/vod/series/{cat_id}")
        assert r.status_code == 200
        data = r.json()
        series = data if isinstance(data, list) else data.get("data", [])
        assert len(series) > 0, f"Category {cat_id} returned 0 series"
        assert "series_id" in series[0]
        assert "name" in series[0]


class TestHealthEndpoint:
    """Health endpoint always works regardless of IPTV credentials."""

    def test_health_returns_ok(self, client):
        """GET /api/v1/health always returns 200."""
        r = client.get("/api/v1/health")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "healthy"
        assert "uptime" in data

# ── Streaming E2E Integration Tests ──────────────────────────────────────
# These tests verify both live and VOD streaming paths deliver playable content
# against the real IPTV provider. They check content types, streaming headers,
# status codes, and that the response body starts with valid container bytes.

class TestLiveStreamingE2E:
    """Verify live TV streaming path delivers playable MPEG-TS."""

    def test_live_stream_content_type(self, client):
        """Live stream returns video/mp2t (playable MPEG-TS)."""
        # Get first live stream
        streams = client.get("/api/v1/live?limit=1").json()
        if not streams or (isinstance(streams, dict) and not streams.get("streams")):
            pytest.skip("No live streams available")
        data = streams if isinstance(streams, list) else streams.get("streams", [])
        if not data:
            pytest.skip("No live streams available")
        stream_id = data[0]["stream_id"]

        resp = client.get(f"/api/v1/stream/live/{stream_id}")
        assert resp.status_code == 200, f"Live stream {stream_id} returned {resp.status_code}"
        assert resp.headers.get("content-type") == "video/mp2t",             f"Expected video/mp2t, got {resp.headers.get('content-type')}"
        assert "no-cache" in resp.headers.get("cache-control", "")

    def test_live_stream_starts_with_ts_sync_byte(self, client):
        """Live stream response body starts with MPEG-TS sync byte 0x47."""
        streams = client.get("/api/v1/live?limit=1").json()
        data = streams if isinstance(streams, list) else streams.get("streams", [])
        if not data:
            pytest.skip("No live streams available")
        stream_id = data[0]["stream_id"]

        # Read first few bytes to verify MPEG-TS sync
        resp = client.get(f"/api/v1/stream/live/{stream_id}")
        assert resp.status_code == 200
        data = resp.read(188)  # MPEG-TS packet size
        assert len(data) == 188, f"Expected 188 bytes, got {len(data)}"
        assert data[0] == 0x47, f"First byte not TS sync byte (0x47), got {hex(data[0])}"


class TestVODStreamingE2E:
    """Verify VOD streaming path delivers playable content."""

    def test_vod_movie_stream_content_type(self, client):
        """VOD movie stream returns appropriate video content type."""
        # Get first VOD category
        cats = client.get("/api/v1/vod/categories").json()
        if not cats:
            pytest.skip("No VOD categories available")
        cat_id = cats[0]["category_id"]

        # Get first movie in category
        movies = client.get(f"/api/v1/vod/{cat_id}").json()
        data = movies if isinstance(movies, list) else movies.get("data", [])
        if not data:
            pytest.skip("No movies available in first category")
        stream_id = data[0]["stream_id"]

        resp = client.get(f"/api/v1/stream/movie/{stream_id}")
        assert resp.status_code in (200, 206),             f"VOD movie stream {stream_id} returned {resp.status_code}"
        ct = resp.headers.get("content-type", "")
        assert any(v in ct for v in ["video/x-matroska", "video/mp4", "video/mp2t", "video/webm"]),             f"Unexpected content-type: {ct}"
        assert "no-cache" in resp.headers.get("cache-control", "")
        assert resp.headers.get("accept-ranges") == "bytes"

    def test_vod_movie_remux_content_type(self, client):
        """VOD movie remux returns MPEG-TS playable content."""
        cats = client.get("/api/v1/vod/categories").json()
        if not cats:
            pytest.skip("No VOD categories available")
        cat_id = cats[0]["category_id"]
        movies = client.get(f"/api/v1/vod/{cat_id}").json()
        data = movies if isinstance(movies, list) else movies.get("data", [])
        if not data:
            pytest.skip("No movies available")
        stream_id = data[0]["stream_id"]

        resp = client.get(f"/api/v1/stream/movie/{stream_id}/remux")
        assert resp.status_code == 200,             f"VOD movie remux {stream_id} returned {resp.status_code}"
        assert resp.headers.get("content-type") == "video/mp2t",             f"Expected video/mp2t, got {resp.headers.get('content-type')}"
        assert "no-cache" in resp.headers.get("cache-control", "")

    def test_vod_movie_transcode_content_type(self, client):
        """VOD movie transcode returns MPEG-TS playable content."""
        cats = client.get("/api/v1/vod/categories").json()
        if not cats:
            pytest.skip("No VOD categories available")
        cat_id = cats[0]["category_id"]
        movies = client.get(f"/api/v1/vod/{cat_id}").json()
        data = movies if isinstance(movies, list) else movies.get("data", [])
        if not data:
            pytest.skip("No movies available")
        stream_id = data[0]["stream_id"]

        resp = client.get(f"/api/v1/stream/movie/{stream_id}/transcode")
        assert resp.status_code == 200,             f"VOD movie transcode {stream_id} returned {resp.status_code}"
        assert resp.headers.get("content-type") == "video/mp2t",             f"Expected video/mp2t, got {resp.headers.get('content-type')}"

    def test_vod_movie_stream_with_range(self, client):
        """VOD movie stream with Range header returns 206 with content-range."""
        cats = client.get("/api/v1/vod/categories").json()
        if not cats:
            pytest.skip("No VOD categories available")
        cat_id = cats[0]["category_id"]
        movies = client.get(f"/api/v1/vod/{cat_id}").json()
        data = movies if isinstance(movies, list) else movies.get("data", [])
        if not data:
            pytest.skip("No movies available")
        stream_id = data[0]["stream_id"]

        resp = client.get(f"/api/v1/stream/movie/{stream_id}", headers={"range": "bytes=0-1023"})
        assert resp.status_code == 206,             f"VOD movie range request {stream_id} returned {resp.status_code}"
        assert "content-range" in resp.headers
        assert resp.headers.get("accept-ranges") == "bytes"
        # Should have partial content
        body = resp.read()
        assert len(body) > 0, "Empty response body for range request"
        assert len(body) <= 1024, f"Expected <=1024 bytes, got {len(body)}"

    def test_vod_series_stream_content_type(self, client):
        """VOD series episode stream returns appropriate video content type."""
        cats = client.get("/api/v1/vod/series/categories").json()
        if not cats:
            pytest.skip("No series categories available")
        cat_id = cats[0]["category_id"]
        series_list = client.get(f"/api/v1/vod/series/{cat_id}").json()
        series = series_list if isinstance(series_list, list) else series_list.get("data", [])
        if not series:
            pytest.skip("No series available")
        series_id = series[0]["series_id"]

        # Get episodes
        info = client.get(f"/api/v1/series/{series_id}").json()
        episodes = info.get("episodes", [])
        if not episodes:
            pytest.skip("No episodes available for first series")
        episode_id = episodes[0]["id"]

        resp = client.get(f"/api/v1/stream/series/{series_id}/{episode_id}")
        assert resp.status_code in (200, 206),             f"Series stream {series_id}/{episode_id} returned {resp.status_code}"
        ct = resp.headers.get("content-type", "")
        assert any(v in ct for v in ["video/x-matroska", "video/mp4", "video/mp2t", "video/webm"]),             f"Unexpected content-type: {ct}"
        assert resp.headers.get("accept-ranges") == "bytes"

    def test_vod_series_remux_content_type(self, client):
        """VOD series remux returns MPEG-TS playable content."""
        cats = client.get("/api/v1/vod/series/categories").json()
        if not cats:
            pytest.skip("No series categories available")
        cat_id = cats[0]["category_id"]
        series_list = client.get(f"/api/v1/vod/series/{cat_id}").json()
        series = series_list if isinstance(series_list, list) else series_list.get("data", [])
        if not series:
            pytest.skip("No series available")
        series_id = series[0]["series_id"]
        info = client.get(f"/api/v1/series/{series_id}").json()
        episodes = info.get("episodes", [])
        if not episodes:
            pytest.skip("No episodes available")
        episode_id = episodes[0]["id"]

        resp = client.get(f"/api/v1/stream/series/{series_id}/{episode_id}/remux")
        assert resp.status_code == 200,             f"Series remux {series_id}/{episode_id} returned {resp.status_code}"
        assert resp.headers.get("content-type") == "video/mp2t",             f"Expected video/mp2t, got {resp.headers.get('content-type')}"

    def test_vod_series_transcode_content_type(self, client):
        """VOD series transcode returns MPEG-TS playable content."""
        cats = client.get("/api/v1/vod/series/categories").json()
        if not cats:
            pytest.skip("No series categories available")
        cat_id = cats[0]["category_id"]
        series_list = client.get(f"/api/v1/vod/series/{cat_id}").json()
        series = series_list if isinstance(series_list, list) else series_list.get("data", [])
        if not series:
            pytest.skip("No series available")
        series_id = series[0]["series_id"]
        info = client.get(f"/api/v1/series/{series_id}").json()
        episodes = info.get("episodes", [])
        if not episodes:
            pytest.skip("No episodes available")
        episode_id = episodes[0]["id"]

        resp = client.get(f"/api/v1/stream/series/{series_id}/{episode_id}/transcode")
        assert resp.status_code == 200,             f"Series transcode {series_id}/{episode_id} returned {resp.status_code}"
        assert resp.headers.get("content-type") == "video/mp2t",             f"Expected video/mp2t, got {resp.headers.get('content-type')}"
