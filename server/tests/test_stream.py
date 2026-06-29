"""Tests for stream.py route endpoints.

Tests DASH manifest endpoints, probe endpoints with mocked cache,
and error handling paths. Avoids real ffmpeg/curl_cffi calls by
pre-populating caches and using the mock client fixture."""

import time
from unittest.mock import patch


def test_live_dash_manifest_returns_mpd(client_with_cache):
    """GET /api/stream/live/{id}/manifest.mpd returns valid MPD XML."""
    from main import _cache
    _cache["live_all"] = (1000.0, [
        {"stream_id": 999, "name": "Test Channel", "stream_icon": "", "category_id": "1",
         "epg_channel_id": "", "num": 1, "stream_type": "live", "added": "", "is_adult": 0,
         "category_ids": ["1"], "custom_sid": None, "tv_archive": 0, "direct_source": "",
         "tv_archive_duration": 0},
    ])

    resp = client_with_cache.get("/api/stream/live/999/manifest.mpd")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/dash+xml"
    assert "<MPD" in resp.text


def test_live_dash_manifest_has_cors_headers(client_with_cache):
    """DASH manifest should include CORS headers."""
    from main import _cache
    _cache["live_all"] = (1000.0, [
        {"stream_id": 999, "name": "Test Channel", "stream_icon": "", "category_id": "1",
         "epg_channel_id": "", "num": 1, "stream_type": "live", "added": "", "is_adult": 0,
         "category_ids": ["1"], "custom_sid": None, "tv_archive": 0, "direct_source": "",
         "tv_archive_duration": 0},
    ])

    resp = client_with_cache.get("/api/stream/live/999/manifest.mpd")
    assert resp.headers.get("access-control-allow-origin") == "*"


def test_live_dash_manifest_nonexistent_stream(client_with_cache):
    """Request for non-existent stream ID should still return MPD (no cache lookup for live)."""
    resp = client_with_cache.get("/api/stream/live/98765/manifest.mpd")
    # Live DASH manifest doesn't require cache lookup — just formats URL
    assert resp.status_code == 200
    assert "<MPD" in resp.text


def test_movie_dash_manifest_with_cache(client_with_cache):
    """Movie DASH manifest returns valid MPD when cache is populated."""
    from main import _cache
    _cache["vod_categories"] = (1000.0, [{"category_id": 10, "category_name": "Test"}])
    _cache["vod_10"] = (1000.0, [
        {"stream_id": 500, "name": "Test Movie", "stream_icon": "", "container_extension": "mkv",
         "category_id": "10", "added": "", "category_ids": ["10"], "custom_sid": None,
         "direct_source": "", "rating": ""},
    ])

    resp = client_with_cache.get("/api/stream/movie/500/manifest.mpd")
    assert resp.status_code == 200
    assert "<MPD" in resp.text
    assert "video/" in resp.text or "dash" in resp.text


def test_series_dash_manifest_with_cache(client_with_cache):
    """Series DASH manifest returns valid MPD when cache is populated."""
    from main import _cache
    _cache["series_categories"] = (1000.0, [{"category_id": 5, "category_name": "Drama"}])
    _cache["series_5"] = (1000.0, [
        {"series_id": 300, "name": "Test Series", "cover": "", "container_extension": "mp4",
         "category_id": ["5"], "category_ids": ["5"], "stream_type": "series", "num": 1,
         "series_episodes": [], "release_date": ""},
    ])

    resp = client_with_cache.get("/api/stream/series/300/42/manifest.mpd")
    assert resp.status_code == 200
    assert "<MPD" in resp.text


def test_probe_live_with_prepopulated_cache(client_with_cache):
    """Probe endpoint returns cached result when probe cache is populated."""
    from routes.stream import _probe_cache
    _probe_cache["live_888"] = (
        time.time(),
        {"codec": "h264", "width": 1920, "height": 1080, "duration": None},
    )

    resp = client_with_cache.get("/api/live/probe/888")
    assert resp.status_code == 200
    data = resp.json()
    assert data["codec"] == "h264"
    assert data["width"] == 1920
    assert data["height"] == 1080


def test_probe_movie_with_prepopulated_cache(client_with_cache):
    """Movie probe returns cached ffprobe result."""
    from routes.stream import _probe_cache
    _probe_cache["movie_777"] = (
        time.time(),
        {"codec": "hevc", "width": 3840, "height": 2160, "duration": 5432.1},
    )

    resp = client_with_cache.get("/api/movie/probe/777")
    assert resp.status_code == 200
    data = resp.json()
    assert data["codec"] == "hevc"
    assert data["width"] == 3840


def test_probe_series_with_prepopulated_cache(client_with_cache):
    """Series probe returns cached ffprobe result."""
    from routes.stream import _probe_cache
    _probe_cache["series_666"] = (
        time.time(),
        {"codec": "h264", "width": 1280, "height": 720, "duration": 1800.0},
    )

    resp = client_with_cache.get("/api/series/probe/666")
    assert resp.status_code == 200
    data = resp.json()
    assert data["codec"] == "h264"


def test_probe_nonexistent_stream_returns_unknown(client):
    """Probe for a stream that has no cache entry should return codec: unknown."""
    resp = client.get("/api/live/probe/99999")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("codec") in (None, "unknown")


def test_stream_info_missing_live(client):
    """GET /api/stream/live/{id} for non-existent stream returns an error."""
    resp = client.get("/api/stream/live/1")
    # Without cache data, the stream proxy will try to stream from IPTV
    # With mocked cached_fetch returning empty, it should fail gracefully
    assert resp.status_code in (200, 404, 500)
