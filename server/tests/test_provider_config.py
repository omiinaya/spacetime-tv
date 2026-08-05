"""Tests for user-facing provider configuration endpoints.

Covers the 3 routes in routes/provider_config.py:
  - GET  /api/v1/provider          — read current provider (password masked)
  - PUT  /api/v1/provider          — create/update the single provider
  - POST /api/v1/provider/test     — validate creds against upstream (no save)

These endpoints are NOT admin-key gated (LAN bypass applies), so the
client fixture's admin key is unnecessary but harmless.

Isolation: PUT mutates the module-level config.PROVIDERS list and calls
_persist_providers. Every test snapshots PROVIDERS and restores it
in teardown, and patches _persist_providers to avoid touching real
provider files / .env on disk (same pattern as test_admin_providers.py).
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

TEST_ADMIN_KEY = "test-admin-key-insecure"


def _client() -> TestClient:
    """Create TestClient (admin key set for auth middleware compatibility)."""
    from main import app

    c = TestClient(app)
    c.headers.setdefault("X-Admin-Key", TEST_ADMIN_KEY)
    return c


def _snapshot_providers():
    """Return a deep-enough snapshot of config.PROVIDERS to restore later."""
    import config as cfg

    return [
        {
            "name": p.name,
            "base_url": p.base_url,
            "username": p.username,
            "password": p.password,
            "enabled": p.enabled,
            "order": p.order,
        }
        for p in cfg.PROVIDERS
    ]


def _apply_provider_fixture():
    """Shared setup/teardown logic via pytest fixture below."""
    import config as cfg
    from state import _provider_health

    snapshot = _snapshot_providers()
    saved_list = cfg.PROVIDERS  # capture list object IDENTITY (see admin tests)
    _provider_health.clear()
    patchers = [
        patch.object(cfg, "_persist_providers", lambda providers: None),
        patch.object(cfg, "_save_providers_to_file", lambda providers: None),
        patch.object(cfg, "_save_providers_to_env", lambda providers: None),
    ]
    for p in patchers:
        p.start()
    try:
        yield
    finally:
        for p in patchers:
            p.stop()
        saved_list.clear()
        for entry in snapshot:
            saved_list.append(
                cfg.ProviderConfig(
                    name=entry["name"],
                    base_url=entry["base_url"],
                    username=entry["username"],
                    password=entry["password"],
                    enabled=entry["enabled"],
                    order=entry["order"],
                )
            )
        cfg.PROVIDERS = saved_list  # restore identity (handles mid-test rebind)
        _provider_health.clear()


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _protect_provider_state():
    """Snapshot/restore config.PROVIDERS + health state around each test."""
    yield from _apply_provider_fixture()


# ── GET /api/v1/provider ──────────────────────────────────────────────────


def test_get_provider_returns_config_without_password(client: TestClient):
    """GET returns configured:true + masked provider (no password field)."""
    with _client() as c:
        resp = c.get("/api/v1/provider")
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    p = data["provider"]
    for key in ("name", "base_url", "username", "enabled", "has_password", "health"):
        assert key in p
    assert "password" not in p  # never leak the password
    assert p["has_password"] is True  # conftest env has a password
    assert p["base_url"] == "http://test-iptv.live"
    assert p["username"] == "test_user"


def test_get_provider_empty_when_none_configured(client: TestClient):
    """When PROVIDERS is empty, GET returns configured:false."""
    import config as cfg

    cfg.PROVIDERS.clear()
    with _client() as c:
        resp = c.get("/api/v1/provider")
    assert resp.status_code == 200
    assert resp.json() == {"configured": False, "provider": None}


def test_get_provider_has_password_false_when_no_password(client: TestClient):
    """has_password is false when the provider has no stored password."""
    import config as cfg

    cfg.PROVIDERS[0].password = ""
    with _client() as c:
        resp = c.get("/api/v1/provider")
    assert resp.status_code == 200
    assert resp.json()["provider"]["has_password"] is False


# ── PUT /api/v1/provider ──────────────────────────────────────────────────


def test_put_updates_existing_provider(client: TestClient):
    """PUT updates the existing single provider and persists it."""
    import config as cfg

    with _client() as c:
        resp = c.put(
            "/api/v1/provider",
            json={
                "name": "My Panel",
                "base_url": "http://updated.live/",
                "username": "newuser",
                "password": "newpass",
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "saved" in data["message"]
    assert len(cfg.PROVIDERS) == 1  # single-provider semantics
    p = cfg.PROVIDERS[0]
    assert p.name == "My Panel"
    assert p.base_url == "http://updated.live"  # trailing slash stripped
    assert p.username == "newuser"
    assert p.password == "newpass"
    assert p.enabled is True
    # response provider mirrors the update without password
    assert data["provider"]["username"] == "newuser"
    assert "password" not in data["provider"]


def test_put_empty_password_keeps_existing(client: TestClient):
    """Omitting/empty password preserves the stored password."""
    import config as cfg

    before = cfg.PROVIDERS[0].password
    with _client() as c:
        resp = c.put(
            "/api/v1/provider",
            json={
                "base_url": "http://updated.live",
                "username": "u",
                "password": "",
            },
        )
    assert resp.status_code == 200
    assert cfg.PROVIDERS[0].password == before


def test_put_creates_provider_when_none(client: TestClient):
    """PUT with an empty PROVIDERS list creates a provider."""
    import config as cfg

    cfg.PROVIDERS.clear()
    with _client() as c:
        resp = c.put(
            "/api/v1/provider",
            json={
                "name": "Fresh",
                "base_url": "http://fresh.live",
                "username": "u",
                "password": "p",
                "enabled": False,
            },
        )
    assert resp.status_code == 200
    assert len(cfg.PROVIDERS) == 1
    p = cfg.PROVIDERS[0]
    assert p.name == "Fresh"
    assert p.enabled is False


def test_put_requires_base_url(client: TestClient):
    """PUT without base_url returns 400."""
    with _client() as c:
        resp = c.put("/api/v1/provider", json={"username": "u", "password": "p"})
    assert resp.status_code == 400


def test_put_requires_username(client: TestClient):
    """PUT without username returns 400."""
    with _client() as c:
        resp = c.put("/api/v1/provider", json={"base_url": "http://x.live", "password": "p"})
    assert resp.status_code == 400


def test_put_invalidates_cache(client: TestClient):
    """PUT clears the shared cache so new creds take effect immediately."""
    from state import _cache

    _cache["Default:live_all"] = (0.0, [{"stream_id": 1}])
    assert _cache
    with _client() as c:
        resp = c.put(
            "/api/v1/provider",
            json={"base_url": "http://updated.live", "username": "u", "password": "p"},
        )
    assert resp.status_code == 200
    assert _cache == {}


# ── POST /api/v1/provider/test ────────────────────────────────────────────


def test_test_provider_success(client: TestClient):
    """A successful upstream fetch returns ok:true with category count."""
    import httpx

    fake_response = [{"category_id": "1", "category_name": "News"}, {"category_id": "2", "category_name": "Sports"}]

    class FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return fake_response

    async def fake_get(self, url, **kwargs):
        return FakeResp()

    with patch.object(httpx.AsyncClient, "get", fake_get):
        with _client() as c:
            resp = c.post(
                "/api/v1/provider/test",
                json={"base_url": "http://ok.live", "username": "u", "password": "p"},
            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["categories"] == 2


def test_test_provider_failure(client: TestClient):
    """An upstream failure returns ok:false with the error message."""
    import httpx

    async def fake_get(self, url, **kwargs):
        raise httpx.ConnectError("connection refused")

    with patch.object(httpx.AsyncClient, "get", fake_get):
        with _client() as c:
            resp = c.post(
                "/api/v1/provider/test",
                json={"base_url": "http://bad.live", "username": "u", "password": "p"},
            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert "connection refused" in data["error"]


def test_test_provider_uses_stored_password_when_omitted(client: TestClient):
    """Omitting password falls back to the decrypted stored password."""
    import httpx

    captured = {}

    class FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return []

    async def fake_get(self, url, **kwargs):
        captured["url"] = url
        return FakeResp()

    with patch.object(httpx.AsyncClient, "get", fake_get):
        with _client() as c:
            resp = c.post(
                "/api/v1/provider/test",
                json={"base_url": "http://ok.live", "username": "u"},
            )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert "test_pass" in captured["url"]  # conftest env password used


def test_test_provider_requires_creds(client: TestClient):
    """POST /provider/test without base_url/username returns 400."""
    with _client() as c:
        resp = c.post("/api/v1/provider/test", json={"password": "p"})
    assert resp.status_code == 400


# ── GET /api/v1/providers (list) ─────────────────────────────────────────


def test_list_providers_returns_all_with_indexes(client: TestClient):
    """GET /providers lists every provider with index, order, masked password."""
    import config as cfg

    cfg.PROVIDERS.append(
        cfg.ProviderConfig(
            name="Second",
            base_url="http://second.live",
            username="u2",
            password="p2",
            enabled=False,
            order=1,
        )
    )
    with _client() as c:
        resp = c.get("/api/v1/providers")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["providers"]) == 2
    first, second = data["providers"]
    assert first["index"] == 0
    assert first["name"] == "Default"
    assert first["order"] == 0
    assert second["index"] == 1
    assert second["order"] == 1
    assert second["enabled"] is False
    for p in data["providers"]:
        assert "password" not in p  # never leak
        assert "has_password" in p


def test_list_providers_empty(client: TestClient):
    """GET /providers returns an empty list when none configured."""
    import config as cfg

    cfg.PROVIDERS.clear()
    with _client() as c:
        resp = c.get("/api/v1/providers")
    assert resp.status_code == 200
    assert resp.json() == {"providers": []}


# ── POST /api/v1/providers (add) ─────────────────────────────────────────


def test_add_provider_appends_and_persists(client: TestClient):
    """POST /providers adds a new provider to the list and persists it."""
    import config as cfg

    with patch.object(cfg, "_persist_providers") as mock_persist:
        with _client() as c:
            resp = c.post(
                "/api/v1/providers",
                json={
                    "name": "Backup Panel",
                    "base_url": "http://backup.live/",
                    "username": "bu",
                    "password": "bp",
                    "enabled": True,
                },
            )
    assert resp.status_code == 200
    data = resp.json()
    assert "added" in data["message"]
    assert data["index"] == 1
    assert len(cfg.PROVIDERS) == 2
    added = cfg.PROVIDERS[1]
    assert added.name == "Backup Panel"
    assert added.base_url == "http://backup.live"  # trailing / stripped
    assert added.username == "bu"
    assert added.order == 1
    # persisted via _persist_providers (file + env)
    mock_persist.assert_called_once_with(cfg.PROVIDERS)
    # response masks password
    assert "password" not in data["provider"]


def test_add_provider_requires_creds(client: TestClient):
    """POST /providers without base_url/username returns 400."""
    with _client() as c:
        resp = c.post("/api/v1/providers", json={"name": "x"})
    assert resp.status_code == 400


# ── PUT /api/v1/providers/{idx} (update) ─────────────────────────────────


def test_update_provider_at_index(client: TestClient):
    """PUT /providers/{idx} updates only that provider."""
    import config as cfg

    cfg.PROVIDERS.append(
        cfg.ProviderConfig(
            name="Second",
            base_url="http://second.live",
            username="u2",
            password="p2",
            enabled=True,
            order=1,
        )
    )
    with patch.object(cfg, "_persist_providers"):
        with _client() as c:
            resp = c.put(
                "/api/v1/providers/1",
                json={
                    "name": "Renamed",
                    "base_url": "http://renamed.live/",
                    "username": "newu",
                    "password": "newp",
                    "enabled": False,
                },
            )
    assert resp.status_code == 200
    assert cfg.PROVIDERS[0].base_url == "http://test-iptv.live"  # untouched
    updated = cfg.PROVIDERS[1]
    assert updated.name == "Renamed"
    assert updated.base_url == "http://renamed.live"
    assert updated.username == "newu"
    assert updated.enabled is False
    assert "password" not in resp.json()["provider"]


def test_update_provider_at_index_blank_password_keeps(client: TestClient):
    """PUT /providers/{idx} with blank password preserves stored creds."""
    import config as cfg

    cfg.PROVIDERS.append(
        cfg.ProviderConfig(
            name="Second",
            base_url="http://second.live",
            username="u2",
            password="original-pass",
            enabled=True,
            order=1,
        )
    )
    with patch.object(cfg, "_persist_providers"):
        with _client() as c:
            resp = c.put(
                "/api/v1/providers/1",
                json={"base_url": "http://updated.live", "username": "u2b"},
            )
    assert resp.status_code == 200
    assert cfg.PROVIDERS[1].password == "original-pass"
    assert cfg.PROVIDERS[1].base_url == "http://updated.live"


def test_update_provider_at_index_missing_404(client: TestClient):
    """PUT /providers/{idx} with out-of-range index returns 404."""
    with _client() as c:
        resp = c.put("/api/v1/providers/99", json={"base_url": "http://x.live"})
    assert resp.status_code == 404


# ── DELETE /api/v1/providers/{idx} ───────────────────────────────────────


def test_delete_provider_by_index(client: TestClient):
    """DELETE /providers/{idx} removes the provider and re-indexes."""
    import config as cfg

    cfg.PROVIDERS.append(
        cfg.ProviderConfig(
            name="Second",
            base_url="http://second.live",
            username="u2",
            password="p2",
            enabled=True,
            order=1,
        )
    )
    with patch.object(cfg, "_persist_providers"):
        with _client() as c:
            resp = c.delete("/api/v1/providers/0")
    assert resp.status_code == 200
    assert len(cfg.PROVIDERS) == 1
    assert cfg.PROVIDERS[0].name == "Second"
    assert cfg.PROVIDERS[0].order == 0  # re-indexed


def test_delete_provider_missing_404(client: TestClient):
    """DELETE /providers/{idx} with out-of-range index returns 404."""
    with _client() as c:
        resp = c.delete("/api/v1/providers/42")
    assert resp.status_code == 404


# ── POST /api/v1/providers/{idx}/toggle ──────────────────────────────────


def test_toggle_provider(client: TestClient):
    """POST /providers/{idx}/toggle flips enabled and persists."""
    import config as cfg

    with patch.object(cfg, "_persist_providers"):
        with _client() as c:
            resp = c.post("/api/v1/providers/0/toggle")
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False
    assert cfg.PROVIDERS[0].enabled is False


def test_toggle_provider_missing_404(client: TestClient):
    """POST /providers/{idx}/toggle with out-of-range index returns 404."""
    with _client() as c:
        resp = c.post("/api/v1/providers/99/toggle")
    assert resp.status_code == 404


# ── Cache invalidation re-warm ────────────────────────────────────────────


def test_provider_mutation_triggers_cache_rewarm(client: TestClient):
    """A provider edit clears the cache AND starts a re-warm.

    Regression (2026-08-05): _invalidate_cache used to clear the in-memory
    cache WITHOUT re-warming, so movies/unified (which reads ONLY the cache)
    went empty for minutes after any provider edit. Clearing must kick off
    the warmer (which is a no-op if already running).
    """
    import config as cfg

    with patch.object(cfg, "_persist_providers"):
        from routes import cache_warmer

        with patch.object(cache_warmer, "start_cache_warmer") as mock_warm:
            with _client() as c:
                resp = c.put(
                    "/api/v1/provider",
                    json={
                        "base_url": "http://updated.live",
                        "username": "u",
                        "password": "p",
                    },
                )
    assert resp.status_code == 200
    mock_warm.assert_called_once()
