"""Tests for cloud_sync.py — cloud favorites backup/restore/merge.

Covers:
  - POST /api/cloud/backup — upload, missing device_id, multiple devices, prune
  - GET  /api/cloud/backup — retrieve, no backup, invalid device_id
  - POST /api/cloud/merge  — additive merge, deduplication
  - Response structure
  - Auth enforcement when ADMIN_API_KEY is set
"""

import os
from pathlib import Path

BACKUP_FILE = Path("/tmp/stv_cloud_backup.json")


def _cleanup():
    try:
        if BACKUP_FILE.exists():
            BACKUP_FILE.unlink()
    except Exception:
        pass


# ── POST /api/cloud/backup ────────────────────────────────────────────────


class TestUploadBackup:
    def setup_method(self):
        _cleanup()

    def teardown_method(self):
        _cleanup()

    def test_upload_favorites(self, client):
        """Upload a backup with favorites."""
        resp = client.post("/api/v1/cloud/backup", json={
            "device_id": "test-device-123",
            "favorites": [100, 200, 300],
        })
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_upload_with_watchlist(self, client):
        """Upload a backup with watchlist."""
        resp = client.post("/api/v1/cloud/backup", json={
            "device_id": "device-abc-xyz",
            "favorites": [42],
            "watchlist": {"movie_550": True, "series_1399": True},
        })
        assert resp.json()["status"] == "ok"

    def test_upload_with_settings(self, client):
        """Upload a backup with settings."""
        resp = client.post("/api/v1/cloud/backup", json={
            "device_id": "device-settings",
            "favorites": [],
            "settings": {"theme": "dark", "language": "en"},
        })
        assert resp.json()["status"] == "ok"

    def test_upload_overwrites_previous(self, client):
        """Uploading twice for same device updates the entry."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "overwrite-me-plz",
            "favorites": [1, 2],
        })
        client.post("/api/v1/cloud/backup", json={
            "device_id": "overwrite-me-plz",
            "favorites": [3, 4],
        })
        resp = client.get("/api/v1/cloud/backup?device_id=overwrite-me-plz")
        assert resp.json()["data"]["favorites"] == [3, 4]

    def test_upload_missing_device_id(self, client):
        """Missing device_id returns error."""
        resp = client.post("/api/v1/cloud/backup", json={"favorites": [1]})
        assert resp.json()["status"] == "error"

    def test_upload_short_device_id(self, client):
        """Too-short device_id returns error."""
        resp = client.post("/api/v1/cloud/backup", json={
            "device_id": "short",
            "favorites": [1],
        })
        assert resp.json()["status"] == "error"

    def test_upload_non_string_device_id(self, client):
        """Non-string device_id returns error."""
        resp = client.post("/api/v1/cloud/backup", json={
            "device_id": 12345,
            "favorites": [1],
        })
        assert resp.json()["status"] == "error"

    def test_upload_auto_timestamps(self, client):
        """Upload auto-fills timestamp if not provided."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "auto-ts-device-xx",
            "favorites": [1],
        })
        resp = client.get("/api/v1/cloud/backup?device_id=auto-ts-device-xx")
        data = resp.json()["data"]
        assert "timestamp" in data
        assert isinstance(data["timestamp"], (int, float))

    def test_upload_prunes_old_devices(self, client):
        """After 50 devices, oldest are pruned."""
        for i in range(55):
            client.post("/api/v1/cloud/backup", json={
                "device_id": f"device-{i:04d}",
                "favorites": [i],
            })
        # The first 5 should be pruned
        resp = client.get("/api/v1/cloud/backup?device_id=device-0000")
        assert resp.json()["data"]["favorites"] == []
        # Last one should still be there
        resp = client.get("/api/v1/cloud/backup?device_id=device-0054")
        assert resp.json()["data"]["favorites"] == [54]


# ── GET /api/cloud/backup ─────────────────────────────────────────────────


class TestGetBackup:
    def setup_method(self):
        _cleanup()

    def teardown_method(self):
        _cleanup()

    def test_get_backup_returns_data(self, client):
        """GET returns uploaded backup data."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "get-test-device",
            "favorites": [7, 8, 9],
        })
        resp = client.get("/api/v1/cloud/backup?device_id=get-test-device")
        assert resp.json()["data"]["favorites"] == [7, 8, 9]

    def test_get_backup_no_data(self, client):
        """GET returns empty defaults when no backup exists."""
        resp = client.get("/api/v1/cloud/backup?device_id=nonexistent-device")
        data = resp.json()
        assert data["status"] == "ok"
        assert data["data"]["favorites"] == []
        assert data["data"]["watchlist"] == {}
        assert data["data"]["settings"] == {}

    def test_get_backup_invalid_device_id(self, client):
        """Short device_id returns error."""
        resp = client.get("/api/v1/cloud/backup?device_id=ab")
        assert resp.json()["status"] == "error"

    def test_get_backup_response_structure(self, client):
        """Response has expected shape."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "struct-test-device",
            "favorites": [1, 2],
        })
        resp = client.get("/api/v1/cloud/backup?device_id=struct-test-device")
        data = resp.json()
        assert "status" in data
        assert "data" in data
        assert "favorites" in data["data"]


# ── POST /api/cloud/merge ─────────────────────────────────────────────────


class TestMergeFavorites:
    def setup_method(self):
        _cleanup()

    def teardown_method(self):
        _cleanup()

    def test_merge_adds_new_favorites(self, client):
        """Merge adds new favorites to existing set."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "merge-test-device",
            "favorites": [1, 2, 3],
        })
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "merge-test-device",
            "favorites": [4, 5],
        })
        assert sorted(resp.json()["favorites"]) == [1, 2, 3, 4, 5]

    def test_merge_deduplicates(self, client):
        """Merge does not add duplicates."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "dedup-test-device",
            "favorites": [1, 2, 3],
        })
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "dedup-test-device",
            "favorites": [2, 3, 4],
        })
        assert sorted(resp.json()["favorites"]) == [1, 2, 3, 4]

    def test_merge_empty_works(self, client):
        """Merge with empty favorites array is fine."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "empty-merge-device",
            "favorites": [1, 2],
        })
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "empty-merge-device",
            "favorites": [],
        })
        assert sorted(resp.json()["favorites"]) == [1, 2]

    def test_merge_no_existing_creates_new(self, client):
        """Merge with no existing backup creates a new entry."""
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "new-merge-device",
            "favorites": [10, 20],
        })
        assert sorted(resp.json()["favorites"]) == [10, 20]

    def test_merge_invalid_device_id(self, client):
        """Short device_id returns error."""
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "ab",
            "favorites": [1],
        })
        assert resp.json()["status"] == "error"


# ── Auth Enforcement ─────────────────────────────────────────────────────


class TestCloudAuthEnforcement:
    """When ADMIN_API_KEY is set, unauthenticated requests get 403."""

    def _make_client_with_key(self, key: str):
        """Create a TestClient with ADMIN_API_KEY set to the given value."""
        import os
        import importlib
        os.environ["ADMIN_API_KEY"] = key
        import config as cfg
        importlib.reload(cfg)
        from main import app
        from fastapi.testclient import TestClient
        return TestClient(app)

    def test_upload_requires_auth_when_key_set(self):
        """POST /cloud/backup returns 403 without X-Admin-Key when key is set."""
        old = os.environ.get("ADMIN_API_KEY", "")
        try:
            c = self._make_client_with_key("test-cloud-key-000")
            resp = c.post("/api/v1/cloud/backup", json={
                "device_id": "auth-test-device",
                "favorites": [1],
            })
            assert resp.status_code == 403
            assert "admin key" in resp.json()["detail"].lower()
        finally:
            os.environ["ADMIN_API_KEY"] = old
            import importlib
            import config as cfg
            importlib.reload(cfg)

    def test_get_requires_auth_when_key_set(self):
        """GET /cloud/backup returns 403 without X-Admin-Key when key is set."""
        old = os.environ.get("ADMIN_API_KEY", "")
        try:
            c = self._make_client_with_key("test-cloud-key-001")
            resp = c.get("/api/v1/cloud/backup?device_id=auth-test-device")
            assert resp.status_code == 403
        finally:
            os.environ["ADMIN_API_KEY"] = old
            import importlib
            import config as cfg
            importlib.reload(cfg)

    def test_merge_requires_auth_when_key_set(self):
        """POST /cloud/merge returns 403 without X-Admin-Key when key is set."""
        old = os.environ.get("ADMIN_API_KEY", "")
        try:
            c = self._make_client_with_key("test-cloud-key-002")
            resp = c.post("/api/v1/cloud/merge", json={
                "device_id": "auth-test-device",
                "favorites": [1],
            })
            assert resp.status_code == 403
        finally:
            os.environ["ADMIN_API_KEY"] = old
            import importlib
            import config as cfg
            importlib.reload(cfg)

    def test_upload_succeeds_with_valid_key(self):
        """POST /cloud/backup succeeds with correct X-Admin-Key."""
        old = os.environ.get("ADMIN_API_KEY", "")
        try:
            c = self._make_client_with_key("test-cloud-key-003")
            resp = c.post(
                "/api/v1/cloud/backup",
                json={"device_id": "auth-ok-device", "favorites": [1]},
                headers={"X-Admin-Key": "test-cloud-key-003"},
            )
            assert resp.status_code == 200
            assert resp.json()["status"] == "ok"
        finally:
            os.environ["ADMIN_API_KEY"] = old
            import importlib
            import config as cfg
            importlib.reload(cfg)

    def test_get_succeeds_with_valid_key(self):
        """GET /cloud/backup succeeds with correct X-Admin-Key."""
        old = os.environ.get("ADMIN_API_KEY", "")
        try:
            c = self._make_client_with_key("test-cloud-key-004")
            # First upload with key
            c.post(
                "/api/v1/cloud/backup",
                json={"device_id": "auth-get-device", "favorites": [99]},
                headers={"X-Admin-Key": "test-cloud-key-004"},
            )
            # Then get with key
            resp = c.get(
                "/api/v1/cloud/backup?device_id=auth-get-device",
                headers={"X-Admin-Key": "test-cloud-key-004"},
            )
            assert resp.status_code == 200
            assert resp.json()["data"]["favorites"] == [99]
        finally:
            os.environ["ADMIN_API_KEY"] = old
            import importlib
            import config as cfg
            importlib.reload(cfg)
