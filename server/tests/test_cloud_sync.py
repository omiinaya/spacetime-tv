"""Tests for cloud_sync.py — cloud favorites backup/restore/merge.

Covers:
  - POST /api/cloud/backup — upload, missing device_id, multiple devices, prune
  - GET  /api/cloud/backup — retrieve, no backup, invalid device_id
  - POST /api/cloud/merge  — additive merge, deduplication
  - Response structure
  - Device token auth enforcement (X-Device-Token)
  - Admin key override (X-Admin-Key bypasses device token check)
  - Token hash verification (wrong token is rejected after registration)
"""

import os
from pathlib import Path

BACKUP_FILE = Path("/tmp/stv_cloud_backup.json")

TEST_TOKEN = "test-device-token-abc-123"


def _cleanup():
    try:
        if BACKUP_FILE.exists():
            BACKUP_FILE.unlink()
    except Exception:
        pass


def _headers(token: str = TEST_TOKEN) -> dict:
    return {"X-Device-Token": token}


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
        }, headers=_headers())
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_upload_with_watchlist(self, client):
        """Upload a backup with watchlist."""
        resp = client.post("/api/v1/cloud/backup", json={
            "device_id": "device-abc-xyz",
            "favorites": [42],
            "watchlist": {"movie_550": True, "series_1399": True},
        }, headers=_headers())
        assert resp.json()["status"] == "ok"

    def test_upload_with_settings(self, client):
        """Upload a backup with settings."""
        resp = client.post("/api/v1/cloud/backup", json={
            "device_id": "device-settings",
            "favorites": [],
            "settings": {"theme": "dark", "language": "en"},
        }, headers=_headers())
        assert resp.json()["status"] == "ok"

    def test_upload_overwrites_previous(self, client):
        """Uploading twice for same device updates the entry."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "overwrite-me-plz",
            "favorites": [1, 2],
        }, headers=_headers())
        client.post("/api/v1/cloud/backup", json={
            "device_id": "overwrite-me-plz",
            "favorites": [3, 4],
        }, headers=_headers())
        resp = client.get("/api/v1/cloud/backup?device_id=overwrite-me-plz", headers=_headers())
        assert resp.json()["data"]["favorites"] == [3, 4]

    def test_upload_missing_device_id(self, client):
        """Missing device_id returns error."""
        resp = client.post("/api/v1/cloud/backup", json={"favorites": [1]}, headers=_headers())
        assert resp.json()["status"] == "error"

    def test_upload_short_device_id(self, client):
        """Too-short device_id returns error."""
        resp = client.post("/api/v1/cloud/backup", json={
            "device_id": "short",
            "favorites": [1],
        }, headers=_headers())
        assert resp.json()["status"] == "error"

    def test_upload_non_string_device_id(self, client):
        """Non-string device_id returns error."""
        resp = client.post("/api/v1/cloud/backup", json={
            "device_id": 12345,
            "favorites": [1],
        }, headers=_headers())
        assert resp.json()["status"] == "error"

    def test_upload_auto_timestamps(self, client):
        """Upload auto-fills timestamp if not provided."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "auto-ts-device-xx",
            "favorites": [1],
        }, headers=_headers())
        resp = client.get("/api/v1/cloud/backup?device_id=auto-ts-device-xx", headers=_headers())
        data = resp.json()["data"]
        assert "timestamp" in data
        assert isinstance(data["timestamp"], (int, float))

    def test_upload_prunes_old_devices(self, client):
        """After 50 devices, oldest are pruned."""
        for i in range(55):
            client.post("/api/v1/cloud/backup", json={
                "device_id": f"device-{i:04d}",
                "favorites": [i],
            }, headers=_headers())
        # The first 5 should be pruned
        resp = client.get("/api/v1/cloud/backup?device_id=device-0000", headers=_headers())
        assert resp.json()["data"]["favorites"] == []
        # Last one should still be there
        resp = client.get("/api/v1/cloud/backup?device_id=device-0054", headers=_headers())
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
        }, headers=_headers())
        resp = client.get("/api/v1/cloud/backup?device_id=get-test-device", headers=_headers())
        assert resp.json()["data"]["favorites"] == [7, 8, 9]

    def test_get_backup_no_data(self, client):
        """GET returns empty defaults when no backup exists."""
        resp = client.get("/api/v1/cloud/backup?device_id=nonexistent-device", headers=_headers())
        data = resp.json()
        assert data["status"] == "ok"
        assert data["data"]["favorites"] == []
        assert data["data"]["watchlist"] == {}
        assert data["data"]["settings"] == {}

    def test_get_backup_invalid_device_id(self, client):
        """Short device_id returns error."""
        resp = client.get("/api/v1/cloud/backup?device_id=ab", headers=_headers())
        assert resp.json()["status"] == "error"

    def test_get_backup_response_structure(self, client):
        """Response has expected shape."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "struct-test-device",
            "favorites": [1, 2],
        }, headers=_headers())
        resp = client.get("/api/v1/cloud/backup?device_id=struct-test-device", headers=_headers())
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
        }, headers=_headers())
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "merge-test-device",
            "favorites": [4, 5],
        }, headers=_headers())
        assert sorted(resp.json()["favorites"]) == [1, 2, 3, 4, 5]

    def test_merge_deduplicates(self, client):
        """Merge does not add duplicates."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "dedup-test-device",
            "favorites": [1, 2, 3],
        }, headers=_headers())
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "dedup-test-device",
            "favorites": [2, 3, 4],
        }, headers=_headers())
        assert sorted(resp.json()["favorites"]) == [1, 2, 3, 4]

    def test_merge_empty_works(self, client):
        """Merge with empty favorites array is fine."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "empty-merge-device",
            "favorites": [1, 2],
        }, headers=_headers())
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "empty-merge-device",
            "favorites": [],
        }, headers=_headers())
        assert sorted(resp.json()["favorites"]) == [1, 2]

    def test_merge_no_existing_creates_new(self, client):
        """Merge with no existing backup creates a new entry."""
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "new-merge-device",
            "favorites": [10, 20],
        }, headers=_headers())
        assert sorted(resp.json()["favorites"]) == [10, 20]

    def test_merge_invalid_device_id(self, client):
        """Short device_id returns error."""
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "ab",
            "favorites": [1],
        }, headers=_headers())
        assert resp.json()["status"] == "error"


# ── Device Token Auth ─────────────────────────────────────────────────────


class TestDeviceTokenAuth:
    def setup_method(self):
        _cleanup()

    def teardown_method(self):
        _cleanup()

    def test_upload_requires_token(self, client):
        """POST /cloud/backup without token registers the device (first upload = registration)."""
        # client fixture injects X-Admin-Key by default — clear it for this test
        client.headers.clear()
        resp = client.post("/api/v1/cloud/backup", json={
            "device_id": "no-token-device",
            "favorites": [1],
        })
        # No token = first upload registers the device (no existing backup to protect)
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

        # But a subsequent read without token should fail (device is now registered)
        client.headers.clear()
        resp = client.get(
            "/api/v1/cloud/backup?device_id=no-token-device",
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "error"

    def test_upload_rejects_wrong_token(self, client):
        """After registering with one token, a different token is rejected."""
        # Register with TEST_TOKEN (client fixture has admin key — ignore for registration)
        client.post("/api/v1/cloud/backup", json={
            "device_id": "wrong-token-device",
            "favorites": [1, 2, 3],
        }, headers=_headers())

        # Try to read with a different token — clear admin key to test device auth only
        client.headers.clear()
        resp = client.get(
            "/api/v1/cloud/backup?device_id=wrong-token-device",
            headers={"X-Device-Token": "wrong-token-xyz-789"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "error"
        assert "Unauthorized" in resp.json()["detail"]

    def test_get_rejects_wrong_token(self, client):
        """GET with wrong token after registration returns unauthorized."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "wrong-get-device",
            "favorites": [99],
        }, headers=_headers())

        client.headers.clear()
        resp = client.get(
            "/api/v1/cloud/backup?device_id=wrong-get-device",
            headers={"X-Device-Token": "wrong-token-xyz-789"},
        )
        assert resp.json()["status"] == "error"

    def test_merge_rejects_wrong_token(self, client):
        """Merge with wrong token after registration returns unauthorized."""
        client.post("/api/v1/cloud/backup", json={
            "device_id": "wrong-merge-device",
            "favorites": [1, 2],
        }, headers=_headers())

        client.headers.clear()
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "wrong-merge-device",
            "favorites": [3],
        }, headers={"X-Device-Token": "wrong-token-xyz-789"})
        assert resp.json()["status"] == "error"

    def test_correct_token_works_after_registration(self, client):
        """The same token that registered can read and write."""
        client.headers.clear()
        client.post("/api/v1/cloud/backup", json={
            "device_id": "correct-token-device",
            "favorites": [10, 20],
        }, headers=_headers())

        # Read with same token (no admin key)
        client.headers.clear()
        resp = client.get(
            "/api/v1/cloud/backup?device_id=correct-token-device",
            headers=_headers(),
        )
        assert resp.json()["data"]["favorites"] == [10, 20]

        # Merge with same token (no admin key)
        client.headers.clear()
        resp = client.post("/api/v1/cloud/merge", json={
            "device_id": "correct-token-device",
            "favorites": [30],
        }, headers=_headers())
        assert sorted(resp.json()["favorites"]) == [10, 20, 30]

    def test_short_token_rejected(self, client):
        """Token shorter than 8 chars is rejected."""
        resp = client.post("/api/v1/cloud/backup", json={
            "device_id": "short-token-dev",
            "favorites": [1],
        }, headers={"X-Device-Token": "short"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "error"


# ── Admin Key Override ────────────────────────────────────────────────────


class TestAdminKeyOverride:
    """When ADMIN_API_KEY is set, admin key bypasses device token checks."""

    ADMIN_KEY = "test-cloud-admin-key-999"

    def _make_client_with_key(self):
        """Create a TestClient with ADMIN_API_KEY set."""
        import importlib
        os.environ["ADMIN_API_KEY"] = self.ADMIN_KEY
        import config as cfg
        importlib.reload(cfg)
        from main import app
        from fastapi.testclient import TestClient
        return TestClient(app)

    def teardown_method(self):
        os.environ.pop("ADMIN_API_KEY", None)

    def test_admin_key_bypasses_device_token(self):
        """Admin key can read any device's backup without device token."""
        c = self._make_client_with_key()

        # Upload with admin key and no device token
        resp = c.post(
            "/api/v1/cloud/backup",
            json={"device_id": "admin-test-device", "favorites": [42]},
            headers={"X-Admin-Key": self.ADMIN_KEY},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

        # Read with admin key and no device token
        resp = c.get(
            "/api/v1/cloud/backup?device_id=admin-test-device",
            headers={"X-Admin-Key": self.ADMIN_KEY},
        )
        assert resp.json()["data"]["favorites"] == [42]

    def test_admin_key_can_read_wrong_token_device(self):
        """Admin key bypasses device token — can read any device."""
        import importlib
        os.environ["ADMIN_API_KEY"] = self.ADMIN_KEY
        import config as cfg
        importlib.reload(cfg)
        from main import app
        from fastapi.testclient import TestClient
        c = TestClient(app)

        # Register with a specific token
        c.post(
            "/api/v1/cloud/backup",
            json={"device_id": "locked-device", "favorites": [77]},
            headers={"X-Device-Token": "secret-token-000"},
        )

        # Try with wrong token → rejected
        resp = c.get(
            "/api/v1/cloud/backup?device_id=locked-device",
            headers={"X-Device-Token": "wrong-token-999"},
        )
        assert resp.json()["status"] == "error"

        # Admin key bypasses → success
        resp = c.get(
            "/api/v1/cloud/backup?device_id=locked-device",
            headers={"X-Admin-Key": self.ADMIN_KEY},
        )
        assert resp.json()["data"]["favorites"] == [77]
        os.environ.pop("ADMIN_API_KEY", None)
