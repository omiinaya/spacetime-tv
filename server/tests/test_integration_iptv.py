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
