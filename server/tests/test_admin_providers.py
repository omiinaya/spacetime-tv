"""Tests for admin provider management endpoints.

Covers the 8 provider routes in routes/admin.py:
  - GET    /admin/providers          — list providers with health
  - POST   /admin/providers/{idx}/toggle    — enable/disable
  - POST   /admin/providers/{idx}/reorder   — change priority order
  - POST   /admin/providers/reset-health    — clear health counters
  - GET    /admin/providers/active          — active provider
  - POST   /admin/providers                 — add provider
  - DELETE /admin/providers/{idx}           — delete provider
  - PUT    /admin/providers/{idx}           — update provider

Isolation: these endpoints MUTATE the module-level config.PROVIDERS list
and write DATA_DIR/providers.json. Every test snapshots PROVIDERS and
restores it in teardown, and patches _save_providers_to_file to avoid
touching real provider files on disk.
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

TEST_ADMIN_KEY = "test-admin-key-insecure"


def _admin_client():
    """Create TestClient with admin key header."""
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


def _restore_providers(snapshot):
    """Restore config.PROVIDERS to a snapshot (clear + rebuild)."""
    import config as cfg

    cfg.PROVIDERS.clear()
    for entry in snapshot:
        cfg.PROVIDERS.append(
            cfg.ProviderConfig(
                name=entry["name"],
                base_url=entry["base_url"],
                username=entry["username"],
                password=entry["password"],
                enabled=entry["enabled"],
                order=entry["order"],
            )
        )


# ── Fixture: protect PROVIDERS + health state + file writes ────────────────


def _apply_provider_fixture():
    """Shared setup/teardown logic via pytest fixture below."""
    import config as cfg
    from state import _provider_health

    snapshot = _snapshot_providers()
    _provider_health.clear()
    patchers = [
        patch.object(cfg, "_save_providers_to_file", lambda providers: None),
    ]
    for p in patchers:
        p.start()
    try:
        yield
    finally:
        for p in patchers:
            p.stop()
        _restore_providers(snapshot)
        _provider_health.clear()


import pytest


@pytest.fixture(autouse=True)
def _protect_provider_state():
    """Snapshot/restore config.PROVIDERS + health state around each test.

    Autouse within this file only — prevents cross-test pollution from the
    mutating provider endpoints (toggle/reorder/add/delete).
    """
    yield from _apply_provider_fixture()


# ── GET /admin/providers ───────────────────────────────────────────────────


def test_providers_list_returns_configured(client: TestClient):
    """GET /api/v1/admin/providers lists all configured providers."""
    with _admin_client() as c:
        resp = c.get("/api/v1/admin/providers")
    assert resp.status_code == 200
    data = resp.json()
    assert "providers" in data
    assert isinstance(data["providers"], list)
    # conftest env has exactly one default provider
    assert len(data["providers"]) >= 1
    p = data["providers"][0]
    for key in ("index", "name", "base_url", "username", "enabled", "order", "health"):
        assert key in p
    assert p["health"] == {
        "last_ok": None,
        "last_error": None,
        "error_count": 0,
        "ok_count": 0,
    }


def test_providers_list_includes_health_state(client: TestClient):
    """Health counters from state._provider_health appear in the listing."""
    from state import _provider_health

    _provider_health[0] = {
        "last_ok": 1719000000.0,
        "last_error": "boom",
        "error_count": 3,
        "ok_count": 7,
    }
    with _admin_client() as c:
        resp = c.get("/api/v1/admin/providers")
    assert resp.status_code == 200
    p = resp.json()["providers"][0]
    assert p["health"]["error_count"] == 3
    assert p["health"]["ok_count"] == 7
    assert p["health"]["last_error"] == "boom"


# ── POST /admin/providers/{idx}/toggle ─────────────────────────────────────


def test_toggle_provider_flips_enabled(client: TestClient):
    """Toggling a provider flips its enabled flag."""
    import config as cfg

    before = cfg.PROVIDERS[0].enabled
    with _admin_client() as c:
        resp = c.post("/api/v1/admin/providers/0/toggle")
    assert resp.status_code == 200
    data = resp.json()
    assert data["index"] == 0
    assert data["enabled"] is (not before)
    assert cfg.PROVIDERS[0].enabled is (not before)


def test_toggle_provider_missing_index_404(client: TestClient):
    """Toggling a nonexistent provider index returns 404."""
    with _admin_client() as c:
        resp = c.post("/api/v1/admin/providers/99/toggle")
    assert resp.status_code == 404


def test_toggle_provider_negative_index_404(client: TestClient):
    """Negative provider index returns 404."""
    with _admin_client() as c:
        resp = c.post("/api/v1/admin/providers/-1/toggle")
    assert resp.status_code == 404


# ── POST /admin/providers/{idx}/reorder ────────────────────────────────────


def test_reorder_provider_changes_order(client: TestClient):
    """Reordering updates order values and re-indexes the list."""
    import config as cfg

    # Ensure at least 2 providers for a meaningful reorder
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
    with _admin_client() as c:
        resp = c.post("/api/v1/admin/providers/1/reorder?new_order=0")
    assert resp.status_code == 200
    # After reorder, provider 1 (Second) should be first
    assert cfg.PROVIDERS[0].name == "Second"
    assert [p.order for p in cfg.PROVIDERS] == [0, 1]


def test_reorder_provider_missing_index_404(client: TestClient):
    """Reordering a nonexistent provider index returns 404."""
    with _admin_client() as c:
        resp = c.post("/api/v1/admin/providers/99/reorder?new_order=0")
    assert resp.status_code == 404


# ── POST /admin/providers/reset-health ─────────────────────────────────────


def test_reset_health_clears_counters(client: TestClient):
    """Reset-health clears all provider health counters."""
    from state import _provider_health

    _provider_health[0] = {"error_count": 5, "ok_count": 2}
    _provider_health[1] = {"error_count": 1, "ok_count": 0}
    with _admin_client() as c:
        resp = c.post("/api/v1/admin/providers/reset-health")
    assert resp.status_code == 200
    assert _provider_health == {}


# ── GET /admin/providers/active ────────────────────────────────────────────


def test_active_provider_returns_first_enabled(client: TestClient):
    """Active endpoint returns the highest-priority enabled provider."""
    with _admin_client() as c:
        resp = c.get("/api/v1/admin/providers/active")
    assert resp.status_code == 200
    data = resp.json()
    assert data["active"] is not None
    assert "name" in data["active"]
    assert "base_url" in data["active"]


def test_active_provider_none_when_all_disabled(client: TestClient):
    """When all providers are disabled, active is None."""
    import config as cfg

    for p in cfg.PROVIDERS:
        p.enabled = False
    with _admin_client() as c:
        resp = c.get("/api/v1/admin/providers/active")
    assert resp.status_code == 200
    assert resp.json() == {"active": None}


def test_active_provider_empty_list(client: TestClient):
    """When no providers configured at all, active is None."""
    import config as cfg

    cfg.PROVIDERS.clear()
    with _admin_client() as c:
        resp = c.get("/api/v1/admin/providers/active")
    assert resp.status_code == 200
    assert resp.json() == {"active": None}


# ── POST /admin/providers (add) ────────────────────────────────────────────


def test_add_provider_appends(client: TestClient):
    """Adding a provider appends it and returns its index."""
    import config as cfg

    n = len(cfg.PROVIDERS)
    with _admin_client() as c:
        resp = c.post(
            "/api/v1/admin/providers",
            json={
                "name": "New Provider",
                "base_url": "http://new.live/",
                "username": "newuser",
                "password": "newpass",
                "enabled": True,
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["index"] == n
    assert cfg.PROVIDERS[-1].name == "New Provider"
    assert cfg.PROVIDERS[-1].base_url == "http://new.live"  # trailing / stripped


def test_add_provider_requires_base_url(client: TestClient):
    """Adding without base_url returns 400."""
    with _admin_client() as c:
        resp = c.post(
            "/api/v1/admin/providers",
            json={"username": "newuser", "password": "newpass"},
        )
    assert resp.status_code == 400


def test_add_provider_requires_username(client: TestClient):
    """Adding without username returns 400."""
    with _admin_client() as c:
        resp = c.post(
            "/api/v1/admin/providers",
            json={"base_url": "http://new.live", "password": "newpass"},
        )
    assert resp.status_code == 400


def test_add_provider_auto_names(client: TestClient):
    """Adding without a name auto-generates 'Provider N'."""
    import config as cfg

    n = len(cfg.PROVIDERS)
    with _admin_client() as c:
        resp = c.post(
            "/api/v1/admin/providers",
            json={"base_url": "http://auto.live", "username": "u", "password": "p"},
        )
    assert resp.status_code == 200
    assert cfg.PROVIDERS[-1].name == f"Provider {n + 1}"


def test_add_provider_defaults_enabled(client: TestClient):
    """Adding without enabled flag defaults to enabled=True."""
    import config as cfg

    with _admin_client() as c:
        resp = c.post(
            "/api/v1/admin/providers",
            json={"base_url": "http://auto.live", "username": "u", "password": "p"},
        )
    assert resp.status_code == 200
    assert cfg.PROVIDERS[-1].enabled is True


# ── DELETE /admin/providers/{idx} ──────────────────────────────────────────


def test_delete_provider_removes(client: TestClient):
    """Deleting a provider removes it and re-indexes remaining."""
    import config as cfg

    cfg.PROVIDERS.append(
        cfg.ProviderConfig(
            name="Doomed",
            base_url="http://doom.live",
            username="u",
            password="p",
            enabled=True,
            order=1,
        )
    )
    n = len(cfg.PROVIDERS)
    with _admin_client() as c:
        resp = c.delete("/api/v1/admin/providers/1")
    assert resp.status_code == 200
    assert "Doomed" in resp.json()["message"]
    assert len(cfg.PROVIDERS) == n - 1
    assert all(p.order == i for i, p in enumerate(cfg.PROVIDERS))


def test_delete_provider_missing_index_404(client: TestClient):
    """Deleting a nonexistent provider index returns 404."""
    with _admin_client() as c:
        resp = c.delete("/api/v1/admin/providers/99")
    assert resp.status_code == 404


# ── PUT /admin/providers/{idx} (update) ────────────────────────────────────


def test_update_provider_partial_fields(client: TestClient):
    """Updating only some fields leaves the rest untouched."""
    import config as cfg

    with _admin_client() as c:
        resp = c.put(
            "/api/v1/admin/providers/0",
            json={"name": "Renamed", "enabled": False},
        )
    assert resp.status_code == 200
    assert cfg.PROVIDERS[0].name == "Renamed"
    assert cfg.PROVIDERS[0].enabled is False
    # untouched fields preserved
    assert cfg.PROVIDERS[0].base_url == "http://test-iptv.live"


def test_update_provider_missing_index_404(client: TestClient):
    """Updating a nonexistent provider index returns 404."""
    with _admin_client() as c:
        resp = c.put("/api/v1/admin/providers/99", json={"name": "X"})
    assert resp.status_code == 404


def test_update_provider_strips_base_url_slash(client: TestClient):
    """base_url trailing slash is stripped on update."""
    import config as cfg

    with _admin_client() as c:
        resp = c.put(
            "/api/v1/admin/providers/0",
            json={"base_url": "http://updated.live/"},
        )
    assert resp.status_code == 200
    assert cfg.PROVIDERS[0].base_url == "http://updated.live"


def test_update_provider_order_reindexes(client: TestClient):
    """Updating order re-sorts and re-indexes the provider list."""
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
    with _admin_client() as c:
        resp = c.put("/api/v1/admin/providers/1", json={"order": 0})
    assert resp.status_code == 200
    assert cfg.PROVIDERS[0].name == "Second"
    assert [p.order for p in cfg.PROVIDERS] == [0, 1]
