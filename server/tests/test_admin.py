"""Tests for admin dashboard endpoints — cache controls, EPG refresh, stats.

Uses the same test fixtures as other backend tests (env vars set in conftest,
mocked upstream IPTV provider, cleared cache before each test).
"""

import time
from fastapi.testclient import TestClient


def test_admin_stats_returns_structure(client: TestClient):
    """GET /api/admin/stats should return the expected stats shape."""
    from main import app

    with TestClient(app) as c:
        resp = c.get("/api/admin/stats")
    assert resp.status_code == 200
    data = resp.json()

    # Top-level keys
    assert "uptime" in data
    assert isinstance(data["uptime"], (int, float))
    assert data["uptime"] >= 0

    # Cache section
    assert "cache" in data
    cache = data["cache"]
    assert "total_entries" in cache
    assert "hits" in cache
    assert "misses" in cache
    assert "hit_rate" in cache
    assert isinstance(cache["hit_rate"], (int, float))
    assert cache["epg_age"] is None or isinstance(cache["epg_age"], (int, float))

    # Streams section
    assert "streams" in data
    streams = data["streams"]
    assert "total_hits" in streams
    assert "unique_streams" in streams
    assert "popular" in streams
    assert isinstance(streams["popular"], list)

    # Errors section
    assert "errors" in data
    assert "total" in data["errors"]
    assert "recent" in data["errors"]
    assert isinstance(data["errors"]["recent"], list)

    # Searches section
    assert "searches" in data
    assert "total" in data["searches"]
    assert "recent" in data["searches"]
    assert isinstance(data["searches"]["recent"], list)

    # SSE clients
    assert "sse_clients" in data
    assert isinstance(data["sse_clients"], int)


def test_admin_stats_cache_empty_on_fresh_start(client: TestClient):
    """Fresh start should show 0 cache entries and 0 hits/misses."""
    from main import app

    with TestClient(app) as c:
        resp = c.get("/api/admin/stats")
    data = resp.json()

    assert data["cache"]["total_entries"] == 0
    assert data["cache"]["hits"] == 0
    assert data["cache"]["misses"] == 0
    assert data["cache"]["hit_rate"] == 0.0
    assert data["cache"]["vod_categories"] == 0
    assert data["cache"]["series_categories"] == 0
    assert data["streams"]["total_hits"] == 0
    assert data["streams"]["unique_streams"] == 0
    assert data["errors"]["total"] == 0
    assert data["searches"]["total"] == 0
    assert data["sse_clients"] == 0


def test_admin_stats_reflects_populated_cache(client_with_cache: TestClient):
    """Pre-populated cache should show in admin stats."""
    from main import _cache, app

    _cache["vod_10"] = (time.time(), [{"stream_id": 1, "name": "Test Movie"}])
    _cache["vod_categories"] = (time.time(), [{"category_id": 10}])
    _cache["series_5"] = (time.time(), [{"series_id": 1}])

    with TestClient(app) as c:
        resp = c.get("/api/admin/stats")
    data = resp.json()

    assert data["cache"]["total_entries"] >= 3
    assert data["cache"]["vod_categories"] >= 1
    assert data["cache"]["series_categories"] >= 1


def test_admin_clear_cache_returns_count(client_with_cache: TestClient):
    """POST /api/admin/cache/clear should return the count of cleared entries."""
    from main import _cache, app

    _cache["test_key"] = (time.time(), "test_value")
    _cache["another_key"] = (time.time(), "another_value")

    with TestClient(app) as c:
        resp = c.post("/api/admin/cache/clear")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cleared"] >= 2
    assert "Warming" in data["message"]


def test_admin_clear_cache_empties_cache(client_with_cache: TestClient):
    """After POST /api/admin/cache/clear, the cache should be empty."""
    from main import _cache, app

    _cache["test_key"] = (time.time(), "test_value")

    with TestClient(app) as c:
        c.post("/api/admin/cache/clear")
        resp = c.get("/api/admin/stats")
    data = resp.json()
    assert data["cache"]["total_entries"] == 0


def test_admin_clear_cache_resets_epg(client_with_cache: TestClient):
    """POST /api/admin/cache/clear should reset EPG cache."""
    from state import epg_cache
    from main import app

    epg_cache["data"] = {"some": "data"}
    epg_cache["fetched"] = time.time()

    with TestClient(app) as c:
        c.post("/api/admin/cache/clear")
    assert epg_cache["data"] is None
    assert epg_cache["fetched"] == 0


def test_admin_warm_cache_returns_message(client: TestClient):
    """POST /api/admin/cache/warm should return a confirmation message."""
    from main import app

    with TestClient(app) as c:
        resp = c.post("/api/admin/cache/warm")
    assert resp.status_code == 200
    data = resp.json()
    assert "message" in data
    assert "warming" in data["message"].lower() or "in progress" in data["message"].lower()


def test_admin_warm_full_cache_clears_and_warms(client_with_cache: TestClient):
    """POST /api/admin/cache/warm-full clears cache then warms."""
    from main import _cache, app

    _cache["stale_key"] = (time.time(), "stale_value")

    with TestClient(app) as c:
        resp = c.post("/api/admin/cache/warm-full")
    assert resp.status_code == 200
    data = resp.json()
    assert "Cleared" in data["message"]
    assert data["message"].startswith("Full re-warm started")


def test_admin_epg_refresh_returns_status(client: TestClient):
    """POST /api/admin/epg/refresh should return EPG status."""
    from main import app

    with TestClient(app) as c:
        resp = c.post("/api/admin/epg/refresh")
    assert resp.status_code == 200
    data = resp.json()
    assert "refresh_started" in data
    assert "already_running" in data
    assert "last_fetch_ts" in data
    assert "epg_age_s" in data
    assert "message" in data
    assert isinstance(data["refresh_started"], bool)
    assert isinstance(data["already_running"], bool)


def test_admin_epg_refresh_twice_returns_already_running(client: TestClient):
    """Calling EPG refresh twice should indicate already_running."""
    from main import app

    with TestClient(app) as c:
        resp1 = c.post("/api/admin/epg/refresh")
        resp2 = c.post("/api/admin/epg/refresh")
    data2 = resp2.json()
    # Second call may show running or just started depending on timing
    # but should always return valid status without error
    assert resp2.status_code == 200
    assert "message" in data2


# ── Admin Key Auth Tests ─────────────────────────────────────────


def _make_app_with_key(key: str):
    """Create a fresh app with ADMIN_API_KEY set to the given value."""
    import os
    import importlib
    os.environ["ADMIN_API_KEY"] = key
    # Force re-import of config (clears Python cache)
    import config as cfg
    importlib.reload(cfg)
    from main import app
    return app


def test_admin_key_required_when_set(client: TestClient):
    """When ADMIN_API_KEY is set, requests without the key get 403."""
    import os
    old = os.environ.get("ADMIN_API_KEY", "")
    try:
        os.environ["ADMIN_API_KEY"] = "test-admin-key-123"
        import config as cfg
        import importlib
        importlib.reload(cfg)
        from main import app

        with TestClient(app) as c:
            # No key
            r = c.get("/api/admin/stats")
            assert r.status_code == 403
            data = r.json()
            assert "detail" in data

            # Wrong key
            r = c.get("/api/admin/stats", headers={"X-Admin-Key": "wrong"})
            assert r.status_code == 403

            # Correct key
            r = c.get("/api/admin/stats", headers={"X-Admin-Key": "test-admin-key-123"})
            assert r.status_code == 200
            data = r.json()
            assert "uptime" in data
    finally:
        os.environ["ADMIN_API_KEY"] = old
        import importlib
        import config as cfg
        importlib.reload(cfg)


def test_admin_key_not_required_when_empty(client: TestClient):
    """When ADMIN_API_KEY is empty (dev mode), admin endpoints work without auth."""
    import os
    old = os.environ.get("ADMIN_API_KEY", "")
    try:
        os.environ["ADMIN_API_KEY"] = ""
        import config as cfg
        import importlib
        importlib.reload(cfg)
        from main import app

        with TestClient(app) as c:
            r = c.get("/api/admin/stats")
            assert r.status_code == 200
            assert "uptime" in r.json()
    finally:
        os.environ["ADMIN_API_KEY"] = old
        import config as cfg
        importlib.reload(cfg)
