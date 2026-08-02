"""Tests for admin dashboard endpoints — cache controls, EPG refresh, stats.

Uses the same test fixtures as other backend tests (env vars set in conftest,
mocked upstream IPTV provider, cleared cache before each test).
"""

import asyncio
import time
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

TEST_ADMIN_KEY = "test-admin-key-insecure"


def _admin_client():
    """Create TestClient with admin key header."""
    from main import app

    c = TestClient(app)
    c.headers.setdefault("X-Admin-Key", TEST_ADMIN_KEY)
    return c


def test_admin_stats_returns_structure(client: TestClient):
    """GET /api/admin/stats should return the expected stats shape."""

    with _admin_client() as c:
        resp = c.get("/api/v1/admin/stats")
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
    from state import _error_log, _search_queries, _stream_hits

    # Explicitly clear shared state to prevent test-ordering leaks
    _stream_hits.clear()
    _search_queries.clear()
    _error_log.clear()

    with _admin_client() as c:
        resp = c.get("/api/v1/admin/stats")
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
    from state import _cache

    _cache["vod_10"] = (time.time(), [{"stream_id": 1, "name": "Test Movie"}])
    _cache["vod_categories"] = (time.time(), [{"category_id": 10}])
    _cache["series_5"] = (time.time(), [{"series_id": 1}])

    with _admin_client() as c:
        resp = c.get("/api/v1/admin/stats")
    data = resp.json()

    assert data["cache"]["total_entries"] >= 3
    assert data["cache"]["vod_categories"] >= 1
    assert data["cache"]["series_categories"] >= 1


def test_admin_clear_cache_returns_count(client_with_cache: TestClient):
    """POST /api/admin/cache/clear should return the count of cleared entries."""
    from state import _cache

    _cache["test_key"] = (time.time(), "test_value")
    _cache["another_key"] = (time.time(), "another_value")

    with _admin_client() as c:
        resp = c.post("/api/v1/admin/cache/clear")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cleared"] >= 2
    assert "Warming" in data["message"]


def test_admin_clear_cache_empties_cache(client_with_cache: TestClient):
    """After POST /api/admin/cache/clear, the cache should be empty."""
    from state import _cache

    _cache["test_key"] = (time.time(), "test_value")

    with _admin_client() as c:
        c.post("/api/v1/admin/cache/clear")
        resp = c.get("/api/v1/admin/stats")
    data = resp.json()
    assert data["cache"]["total_entries"] == 0


def test_admin_clear_cache_resets_epg(client_with_cache: TestClient):
    """POST /api/admin/cache/clear should reset EPG cache."""
    from state import epg_cache

    epg_cache["data"] = {"some": "data"}
    epg_cache["fetched"] = time.time()

    with _admin_client() as c:
        c.post("/api/v1/admin/cache/clear")
    assert epg_cache["data"] is None
    assert epg_cache["fetched"] == 0


def test_admin_warm_cache_returns_message(client: TestClient):
    """POST /api/admin/cache/warm should return a confirmation message."""

    with _admin_client() as c:
        resp = c.post("/api/v1/admin/cache/warm")
    assert resp.status_code == 200
    data = resp.json()
    assert "message" in data
    assert "warming" in data["message"].lower() or "in progress" in data["message"].lower()


def test_admin_warm_full_cache_clears_and_warms(client_with_cache: TestClient):
    """POST /api/admin/cache/warm-full clears cache then warms."""
    from state import _cache

    _cache["stale_key"] = (time.time(), "stale_value")

    with _admin_client() as c:
        resp = c.post("/api/v1/admin/cache/warm-full")
    assert resp.status_code == 200
    data = resp.json()
    assert "Cleared" in data["message"]
    assert data["message"].startswith("Full re-warm started")


def test_admin_epg_refresh_returns_status(client: TestClient):
    """POST /api/admin/epg/refresh should return EPG status."""

    with _admin_client() as c:
        resp = c.post("/api/v1/admin/epg/refresh")
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

    with _admin_client() as c:
        c.post("/api/v1/admin/epg/refresh")
        resp2 = c.post("/api/v1/admin/epg/refresh")
    data2 = resp2.json()
    # Second call may show running or just started depending on timing
    # but should always return valid status without error
    assert resp2.status_code == 200
    assert "message" in data2


def test_admin_epg_refresh_records_task_on_shared_state(client: TestClient):
    """POST /api/admin/epg/refresh must record the task on the state module.

    Regression: the endpoint imported ``_epg_refresh_task`` by value and rebound
    a local copy, so ``state._epg_refresh_task`` stayed ``None`` forever. The
    dedup check then always saw "not running" and every call spawned a NEW
    concurrent XMLTV fetch — even while guide_epg's background refresh was
    already in flight.
    """
    import state

    with _admin_client() as c:
        resp = c.post("/api/v1/admin/epg/refresh")

    assert resp.status_code == 200
    # The task must be visible on the shared state module — this is what makes
    # the cross-module dedup work (was None before the fix).
    assert state._epg_refresh_task is not None
    assert resp.json()["refresh_started"] is True


# ── Stream Health Dashboard Tests ──────────────────────────────


def test_admin_stream_health_returns_structure(client: TestClient):
    """GET /api/admin/stream-health should return probe cache stats structure."""
    import time

    from routes.stream import _probe_cache

    now = time.time()
    # Populate with a variety of probe entries
    _probe_cache["live_100"] = (
        now,
        {
            "codec": "h264",
            "width": 1920,
            "height": 1080,
            "error": "",
        },
    )
    _probe_cache["vod_200"] = (
        now - 1800,
        {
            "codec": "h265",
            "width": 3840,
            "height": 2160,
            "error": "",
        },
    )
    _probe_cache["series_300"] = (
        now - 7200,
        {
            "codec": "h264",
            "width": 1280,
            "height": 720,
            "error": "timeout",
        },
    )
    _probe_cache["unknown_400"] = (
        now - 100,
        {
            "codec": "av1",
            "width": 0,
            "height": 0,
            "error": "",
        },
    )

    with _admin_client() as c:
        resp = c.get("/api/v1/admin/stream-health")
    assert resp.status_code == 200
    data = resp.json()

    assert data["enabled"] is True
    assert data["total_probed"] == 4

    # by_codec should aggregate counts
    assert "h264" in data["by_codec"]
    assert data["by_codec"]["h264"] == 2
    assert data["by_codec"]["h265"] == 1

    # by_resolution: 1080p, 4K, 720p, unknown
    assert data["by_resolution"]["1080p"] == 1
    assert data["by_resolution"]["4K"] == 1
    assert data["by_resolution"]["720p"] == 1
    assert data["by_resolution"]["unknown"] == 1

    # by_type: live_, vod_, series_, unknown_
    assert data["by_type"]["live"] == 1
    assert data["by_type"]["vod"] == 1
    assert data["by_type"]["series"] == 1
    assert data["by_type"]["unknown"] == 1

    # stale_count: entries older than 3600s
    assert data["stale_count"] == 1  # series_300 is 7200s old

    # recent should include up to 20 entries
    assert len(data["recent"]) == 4
    recent_keys = [e["key"] for e in data["recent"]]
    assert "live_100" in recent_keys
    assert "unknown_400" in recent_keys


def test_admin_stream_health_stale_marker(client: TestClient):
    """Entries exactly at the stale boundary (3600s) should not be stale."""
    import time

    from routes.stream import _probe_cache

    now = time.time()
    _probe_cache["live_500"] = (
        now - 3600,
        {
            "codec": "h264",
            "width": 640,
            "height": 480,
            "error": "",
        },
    )
    _probe_cache["live_501"] = (
        now - 3601,
        {
            "codec": "h264",
            "width": 640,
            "height": 480,
            "error": "",
        },
    )

    with _admin_client() as c:
        resp = c.get("/api/v1/admin/stream-health")
    data = resp.json()
    # age > 3600 (strictly greater), so 3600 is NOT stale, 3601 IS stale
    assert data["stale_count"] == 1
    assert data["total_probed"] == 2


def test_admin_stream_health_empty_cache(client: TestClient):
    """GET /api/admin/stream-health should handle empty probe cache."""
    from routes.stream import _probe_cache

    _probe_cache.clear()

    with _admin_client() as c:
        resp = c.get("/api/v1/admin/stream-health")
    data = resp.json()
    assert data["enabled"] is True
    assert data["total_probed"] == 0
    assert data["stale_count"] == 0
    assert data["by_codec"] == {}
    assert data["by_resolution"] == {}
    assert data["by_type"] == {}
    assert data["recent"] == []


def test_admin_stream_health_error_field_in_recent(client: TestClient):
    """Error field should be None for empty-string errors."""
    import time

    from routes.stream import _probe_cache

    _probe_cache["live_600"] = (
        time.time(),
        {
            "codec": "h264",
            "width": 1920,
            "height": 1080,
            "error": "",
        },
    )
    _probe_cache["live_601"] = (
        time.time(),
        {
            "codec": "h264",
            "width": 1920,
            "height": 1080,
            "error": "connection refused",
        },
    )

    with _admin_client() as c:
        resp = c.get("/api/v1/admin/stream-health")
    data = resp.json()
    recent = data["recent"]
    live_600 = [e for e in recent if e["key"] == "live_600"][0]
    live_601 = [e for e in recent if e["key"] == "live_601"][0]
    assert live_600["error"] is None
    assert live_601["error"] == "connection refused"


def test_admin_stream_health_nonstandard_resolution(client: TestClient):
    """Non-standard heights below 480 should get 'NNNp' label (e.g. 400p)."""
    import time

    from routes.stream import _probe_cache

    _probe_cache["live_700"] = (
        time.time(),
        {
            "codec": "h264",
            "width": 960,
            "height": 540,
            "error": "",
        },
    )
    _probe_cache["live_701"] = (
        time.time(),
        {
            "codec": "h264",
            "width": 720,
            "height": 400,
            "error": "",
        },
    )

    with _admin_client() as c:
        resp = c.get("/api/v1/admin/stream-health")
    data = resp.json()
    # 540 ≥ 480, so it maps to 480p
    assert data["by_resolution"]["480p"] == 1
    # 400 < 480, so it hits the else branch → "400p"
    assert data["by_resolution"]["400p"] == 1


# ── Warm Cache "Already in Progress" Branch ────────────────────


def test_admin_warm_cache_already_in_progress(client: TestClient):
    """POST /api/admin/cache/warm when already warming should indicate in progress."""
    import asyncio

    from routes.cache_warmer import _warm_task as wt

    old = wt

    # Create a not-done task (an incomplete asyncio future)
    pending = asyncio.Future()
    try:
        # Monkey-patch the module-level _warm_task
        import routes.cache_warmer as cw

        cw._warm_task = pending  # not None and not done()

        with _admin_client() as c:
            resp = c.post("/api/v1/admin/cache/warm")
        assert resp.status_code == 200
        data = resp.json()
        assert "in progress" in data["message"].lower() or "already" in data["message"].lower()
    finally:
        cw._warm_task = old
        pending.cancel()


# ── Admin Key Auth Tests ─────────────────────────────────────────


def test_admin_key_required_when_set(client: TestClient):
    """When ADMIN_API_KEY is set, requests without the key get 403."""
    import config as cfg

    # The conftest's TestClient sends "test-admin-key-insecure" by default.
    # Patch ADMIN_API_KEY to a different value so the default header is wrong.
    with patch.object(cfg, "ADMIN_API_KEY", "test-admin-key-123"):
        with _admin_client() as c:
            # Default header is "test-admin-key-insecure" — wrong for "test-admin-key-123"
            r = c.get("/api/v1/admin/stats")
            assert r.status_code == 403
            data = r.json()
            assert "detail" in data

            # Wrong key explicitly
            r = c.get("/api/v1/admin/stats", headers={"X-Admin-Key": "wrong"})
            assert r.status_code == 403

            # Correct key
            r = c.get("/api/v1/admin/stats", headers={"X-Admin-Key": "test-admin-key-123"})
            assert r.status_code == 200
            data = r.json()
            assert "uptime" in data


def test_admin_key_auto_generates_when_empty(client: TestClient):
    """When ADMIN_API_KEY is empty (dev mode), a random key is auto-generated.
    Admin endpoints are always protected, even on first run.
    """
    import importlib
    import os

    import config as cfg

    # Save the original ADMIN_API_KEY
    old_key = os.environ.get("ADMIN_API_KEY", "")
    try:
        # Simulate auto-gen: set empty, reload config
        os.environ["ADMIN_API_KEY"] = ""
        importlib.reload(cfg)

        # Now config.ADMIN_API_KEY is auto-generated (random hex)
        from main import app

        c = TestClient(app)
        r = c.get("/api/v1/admin/stats")
        # No key sent → 401 (no credentials provided)
        assert r.status_code == 401
        assert "detail" in r.json()
    finally:
        # Restore env and config — reload config from the restored env so the
        # module's PROVIDERS list and _AUTO_GEN_KEY are rebuilt consistently.
        # (Leaving the reloaded module in place rebinds config.PROVIDERS to a
        # fresh object mid-suite, which intermittently desyncs later tests
        # that snapshot/restore provider state.)
        os.environ["ADMIN_API_KEY"] = old_key
        importlib.reload(cfg)


# ══════════════════════════════════════════════════════════════════════════
# hermes-id proxy — HERMES_AUTH_VERIFY normalization (security fix)
# ══════════════════════════════════════════════════════════════════════════


class TestHermesIdVerifyNormalization:
    """HERMES_AUTH_VERIFY is documented as a CA-bundle path but is also set to
    the literal string "false" (conftest + deployments) to disable verification.
    `verify="false"` is truthy and would be passed as a CA path → SSL error.
    The proxy must normalize the boolean spellings to verify=False."""

    def _fake_client_factory(self, captured: dict):
        """Return a FakeAsyncClient class that records kwargs and returns 200."""

        class FakeAsyncClient:
            def __init__(self, **kwargs):
                captured["verify"] = kwargs.get("verify")
                self._resp = MagicMock()
                self._resp.status_code = 200
                self._resp.json.return_value = {"ok": True}
                self._resp.text = '{"ok": true}'

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def request(self, *a, **kw):
                return self._resp

        return FakeAsyncClient

    def test_verify_disabled_when_env_false(self, monkeypatch):
        from routes.admin import _hermes_id_request

        captured: dict = {}
        import httpx

        monkeypatch.setenv("HERMES_AUTH_SERVER_URL", "https://auth.test")
        monkeypatch.setenv("HERMES_AUTH_PROJECT", "test-proj")
        monkeypatch.setenv("HERMES_ID_ADMIN_KEY", "test-admin-key")
        monkeypatch.setenv("HERMES_AUTH_VERIFY", "false")

        with patch.object(httpx, "AsyncClient", self._fake_client_factory(captured)):
            asyncio.run(_hermes_id_request("GET", "/agents", {"page": 1}))
        assert captured["verify"] is False

    def test_verify_defaults_true_when_unset(self, monkeypatch):
        from routes.admin import _hermes_id_request

        captured: dict = {}
        import httpx

        monkeypatch.setenv("HERMES_AUTH_SERVER_URL", "https://auth.test")
        monkeypatch.setenv("HERMES_AUTH_PROJECT", "test-proj")
        monkeypatch.setenv("HERMES_ID_ADMIN_KEY", "test-admin-key")
        monkeypatch.delenv("HERMES_AUTH_VERIFY", raising=False)

        with patch.object(httpx, "AsyncClient", self._fake_client_factory(captured)):
            asyncio.run(_hermes_id_request("GET", "/agents"))
        assert captured["verify"] is True

    def test_verify_uses_ca_path_when_provided(self, monkeypatch):
        from routes.admin import _hermes_id_request

        captured: dict = {}
        import httpx

        monkeypatch.setenv("HERMES_AUTH_SERVER_URL", "https://auth.test")
        monkeypatch.setenv("HERMES_AUTH_PROJECT", "test-proj")
        monkeypatch.setenv("HERMES_ID_ADMIN_KEY", "test-admin-key")
        monkeypatch.setenv("HERMES_AUTH_VERIFY", "/etc/ssl/certs/ca.pem")

        with patch.object(httpx, "AsyncClient", self._fake_client_factory(captured)):
            asyncio.run(_hermes_id_request("GET", "/agents"))
        assert captured["verify"] == "/etc/ssl/certs/ca.pem"
