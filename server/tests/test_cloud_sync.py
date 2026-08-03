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

from config import DATA_DIR

BACKUP_FILE = DATA_DIR / "cloud_backup.json"

TEST_TOKEN = "test-device-token-abc-123"


def _cleanup():
    try:
        if BACKUP_FILE.exists():
            BACKUP_FILE.unlink()
    except OSError:
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
        resp = client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "test-device-123",
                "favorites": [100, 200, 300],
            },
            headers=_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_upload_with_watchlist(self, client):
        """Upload a backup with movie + series watchlists."""
        resp = client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "device-abc-xyz",
                "favorites": [42],
                "watchlist": [550, 551],
                "series_watchlist": [1399],
            },
            headers=_headers(),
        )
        assert resp.json()["status"] == "ok"

    def test_upload_watchlists_roundtrip(self, client):
        """Watchlists uploaded for a device come back on GET."""
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "watchlist-roundtrip",
                "watchlist": [1, 2, 3],
                "series_watchlist": [4, 5],
            },
            headers=_headers(),
        )
        resp = client.get("/api/v1/cloud/backup?device_id=watchlist-roundtrip", headers=_headers())
        data = resp.json()["data"]
        assert data["watchlist"] == [1, 2, 3]
        assert data["series_watchlist"] == [4, 5]

    def test_upload_with_settings(self, client):
        """Upload a backup with settings."""
        resp = client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "device-settings",
                "favorites": [],
                "settings": {"theme": "dark", "language": "en"},
            },
            headers=_headers(),
        )
        assert resp.json()["status"] == "ok"

    def test_upload_overwrites_previous(self, client):
        """Uploading twice for same device updates the entry."""
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "overwrite-me-plz",
                "favorites": [1, 2],
            },
            headers=_headers(),
        )
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "overwrite-me-plz",
                "favorites": [3, 4],
            },
            headers=_headers(),
        )
        resp = client.get("/api/v1/cloud/backup?device_id=overwrite-me-plz", headers=_headers())
        assert resp.json()["data"]["favorites"] == [3, 4]

    def test_upload_missing_device_id(self, client):
        """Missing device_id returns error."""
        resp = client.post("/api/v1/cloud/backup", json={"favorites": [1]}, headers=_headers())
        assert resp.json()["status"] == "error"

    def test_upload_short_device_id(self, client):
        """Too-short device_id returns error."""
        resp = client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "short",
                "favorites": [1],
            },
            headers=_headers(),
        )
        assert resp.json()["status"] == "error"

    def test_upload_non_string_device_id(self, client):
        """Non-string device_id returns error."""
        resp = client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": 12345,
                "favorites": [1],
            },
            headers=_headers(),
        )
        assert resp.json()["status"] == "error"

    def test_upload_auto_timestamps(self, client):
        """Upload auto-fills timestamp if not provided."""
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "auto-ts-device-xx",
                "favorites": [1],
            },
            headers=_headers(),
        )
        resp = client.get("/api/v1/cloud/backup?device_id=auto-ts-device-xx", headers=_headers())
        data = resp.json()["data"]
        assert "timestamp" in data
        assert isinstance(data["timestamp"], (int, float))

    def test_upload_prunes_old_devices(self, client):
        """After 50 devices, oldest are pruned."""
        for i in range(55):
            client.post(
                "/api/v1/cloud/backup",
                json={
                    "device_id": f"device-{i:04d}",
                    "favorites": [i],
                },
                headers=_headers(),
            )
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
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "get-test-device",
                "favorites": [7, 8, 9],
            },
            headers=_headers(),
        )
        resp = client.get("/api/v1/cloud/backup?device_id=get-test-device", headers=_headers())
        assert resp.json()["data"]["favorites"] == [7, 8, 9]

    def test_get_backup_no_data(self, client):
        """GET returns empty defaults when no backup exists."""
        resp = client.get("/api/v1/cloud/backup?device_id=nonexistent-device", headers=_headers())
        data = resp.json()
        assert data["status"] == "ok"
        assert data["data"]["favorites"] == []
        assert data["data"]["watchlist"] == []
        assert data["data"]["series_watchlist"] == []
        assert data["data"]["settings"] == {}

    def test_get_backup_invalid_device_id(self, client):
        """Short device_id returns error."""
        resp = client.get("/api/v1/cloud/backup?device_id=ab", headers=_headers())
        assert resp.json()["status"] == "error"

    def test_get_backup_response_structure(self, client):
        """Response has expected shape."""
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "struct-test-device",
                "favorites": [1, 2],
            },
            headers=_headers(),
        )
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
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "merge-test-device",
                "favorites": [1, 2, 3],
            },
            headers=_headers(),
        )
        resp = client.post(
            "/api/v1/cloud/merge",
            json={
                "device_id": "merge-test-device",
                "favorites": [4, 5],
            },
            headers=_headers(),
        )
        assert sorted(resp.json()["favorites"]) == [1, 2, 3, 4, 5]

    def test_merge_deduplicates(self, client):
        """Merge does not add duplicates."""
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "dedup-test-device",
                "favorites": [1, 2, 3],
            },
            headers=_headers(),
        )
        resp = client.post(
            "/api/v1/cloud/merge",
            json={
                "device_id": "dedup-test-device",
                "favorites": [2, 3, 4],
            },
            headers=_headers(),
        )
        assert sorted(resp.json()["favorites"]) == [1, 2, 3, 4]

    def test_merge_empty_works(self, client):
        """Merge with empty favorites array is fine."""
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "empty-merge-device",
                "favorites": [1, 2],
            },
            headers=_headers(),
        )
        resp = client.post(
            "/api/v1/cloud/merge",
            json={
                "device_id": "empty-merge-device",
                "favorites": [],
            },
            headers=_headers(),
        )
        assert sorted(resp.json()["favorites"]) == [1, 2]

    def test_merge_no_existing_creates_new(self, client):
        """Merge with no existing backup creates a new entry."""
        resp = client.post(
            "/api/v1/cloud/merge",
            json={
                "device_id": "new-merge-device",
                "favorites": [10, 20],
            },
            headers=_headers(),
        )
        assert sorted(resp.json()["favorites"]) == [10, 20]

    def test_merge_invalid_device_id(self, client):
        """Short device_id returns error."""
        resp = client.post(
            "/api/v1/cloud/merge",
            json={
                "device_id": "ab",
                "favorites": [1],
            },
            headers=_headers(),
        )
        assert resp.json()["status"] == "error"


# ── Device Token Auth ─────────────────────────────────────────────────────


class TestDeviceTokenAuth:
    def setup_method(self):
        _cleanup()

    def teardown_method(self):
        _cleanup()

    def test_upload_requires_token(self, client):
        """POST /cloud/backup without a token is rejected — a tokenless
        registration would store an empty _token_hash and permanently brick
        the device_id (no future token would ever match)."""
        # client fixture injects X-Admin-Key by default — clear it for this test
        client.headers.clear()
        resp = client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "no-token-device",
                "favorites": [1],
            },
        )
        # No token = rejected, even for first-time registration
        assert resp.json()["status"] == "error"
        assert "Unauthorized" in resp.json()["detail"]

        # Short token (< 8 chars) is also rejected
        resp = client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "no-token-device",
                "favorites": [1],
            },
            headers={"X-Device-Token": "short"},
        )
        assert resp.json()["status"] == "error"

        # The device was never registered (tokenless write rejected) — a read
        # with a valid token returns empty data, proving nothing was stored.
        client.headers.clear()
        resp = client.get(
            "/api/v1/cloud/backup?device_id=no-token-device",
            headers={"X-Device-Token": "test-device-token-abc-123"},
        )
        assert resp.json()["status"] == "ok"
        assert resp.json()["data"]["favorites"] == []

    def test_upload_rejects_wrong_token(self, client):
        """After registering with one token, a different token is rejected."""
        # Register with TEST_TOKEN (client fixture has admin key — ignore for registration)
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "wrong-token-device",
                "favorites": [1, 2, 3],
            },
            headers=_headers(),
        )

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
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "wrong-get-device",
                "favorites": [99],
            },
            headers=_headers(),
        )

        client.headers.clear()
        resp = client.get(
            "/api/v1/cloud/backup?device_id=wrong-get-device",
            headers={"X-Device-Token": "wrong-token-xyz-789"},
        )
        assert resp.json()["status"] == "error"

    def test_merge_rejects_wrong_token(self, client):
        """Merge with wrong token after registration returns unauthorized."""
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "wrong-merge-device",
                "favorites": [1, 2],
            },
            headers=_headers(),
        )

        # Clear default admin key so device token auth is enforced
        client.headers.clear()
        resp = client.post(
            "/api/v1/cloud/merge",
            json={
                "device_id": "wrong-merge-device",
                "favorites": [3],
            },
            headers={"X-Device-Token": "wrong-token-xyz-789"},
        )
        # Auth middleware may return 403 before cloud handler, or
        # cloud handler returns {"status": "error"} with matching admin key
        if resp.status_code == 403:
            assert "detail" in resp.json()
        else:
            assert resp.json().get("status") == "error"

    def test_correct_token_works_after_registration(self, client):
        """The same token that registered can read and write."""
        client.headers.clear()
        client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "correct-token-device",
                "favorites": [10, 20],
            },
            headers=_headers(),
        )

        # Read with same token (no admin key)
        client.headers.clear()
        resp = client.get(
            "/api/v1/cloud/backup?device_id=correct-token-device",
            headers=_headers(),
        )
        assert resp.json()["data"]["favorites"] == [10, 20]

        # Merge with same token (no admin key)
        client.headers.clear()
        resp = client.post(
            "/api/v1/cloud/merge",
            json={
                "device_id": "correct-token-device",
                "favorites": [30],
            },
            headers=_headers(),
        )
        assert sorted(resp.json()["favorites"]) == [10, 20, 30]

    def test_short_token_rejected(self, client):
        """Token shorter than 8 chars is rejected (device-auth only, no admin)."""
        client.headers.clear()
        resp = client.post(
            "/api/v1/cloud/backup",
            json={
                "device_id": "short-token-dev",
                "favorites": [1],
            },
            headers={"X-Device-Token": "short"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "error"


# ── Admin Key Override ────────────────────────────────────────────────────


class TestAdminKeyOverride:
    """When ADMIN_API_KEY is set, admin key bypasses device token checks."""

    ADMIN_KEY = "test-cloud-admin-key-999"

    def test_admin_key_bypasses_device_token(self):
        """Admin key can read any device's backup without device token."""
        from unittest.mock import patch

        from fastapi.testclient import TestClient

        import config as cfg
        from main import app

        with patch.object(cfg, "ADMIN_API_KEY", self.ADMIN_KEY):
            c = TestClient(app)
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
        from unittest.mock import patch

        from fastapi.testclient import TestClient

        import config as cfg
        from main import app

        with patch.object(cfg, "ADMIN_API_KEY", self.ADMIN_KEY):
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


# ── Low-level helper error paths ─────────────────────────────────────


class TestCloudHelpers:
    """Direct unit tests for _read/_write backups + _verify_device_access."""

    def test_read_backups_corrupted_returns_empty(self, monkeypatch, caplog):
        """Corrupt cloud_backup.json -> empty dict (no crash)."""
        from routes.cloud_sync import _read_backups

        monkeypatch.setattr("routes.cloud_sync.BACKUP_FILE", BACKUP_FILE)
        BACKUP_FILE.write_text("{corrupt json !!!")
        try:
            result = _read_backups()
        finally:
            _cleanup()
        assert result == {}

    def test_read_backups_non_dict_returns_empty(self, monkeypatch):
        """cloud_backup.json containing a list -> empty dict."""
        from routes.cloud_sync import _read_backups

        BACKUP_FILE.write_text("[1, 2, 3]")
        try:
            result = _read_backups()
        finally:
            _cleanup()
        assert result == {}

    def test_write_backups_oserror_logs_warning(self, monkeypatch, tmp_path, caplog):
        """OSError writing backups is logged, not raised."""
        from routes.cloud_sync import _write_backups

        # Point BACKUP_FILE at an unwritable path (parent is a file)
        blocker = tmp_path / "file"
        blocker.write_text("x")
        monkeypatch.setattr("routes.cloud_sync.BACKUP_FILE", blocker / "cloud.json")
        with caplog.at_level("WARNING"):
            _write_backups({"device": {}})
        assert "Failed to write backup" in caplog.text

    def test_verify_existing_entry_short_token_rejected(self, monkeypatch):
        """Existing entry + token < 8 chars -> False."""
        from unittest.mock import MagicMock

        from routes.cloud_sync import _verify_device_access

        monkeypatch.setattr(
            "routes.cloud_sync._read_backups",
            lambda: {"dev-123": {"_token_hash": "x" * 64}},
        )
        req = MagicMock()
        req.headers.get.return_value = "short"
        assert _verify_device_access(req, "dev-123") is False

    def test_verify_existing_entry_missing_hash_rejected(self, monkeypatch):
        """Existing entry without _token_hash -> False even with valid token."""
        from unittest.mock import MagicMock

        from routes.cloud_sync import _verify_device_access

        monkeypatch.setattr(
            "routes.cloud_sync._read_backups",
            lambda: {"dev-123": {"favorites": []}},
        )
        req = MagicMock()
        req.headers.get.return_value = "device-token-1234567890"
        assert _verify_device_access(req, "dev-123") is False

    def test_verify_no_entry_requires_long_token(self, monkeypatch):
        """First-time registration with no token -> False (must have >=8 chars)."""
        from unittest.mock import MagicMock

        from routes.cloud_sync import _verify_device_access

        monkeypatch.setattr("routes.cloud_sync._read_backups", lambda: {})
        req = MagicMock()
        req.headers.get.return_value = ""
        assert _verify_device_access(req, "brand-new-device") is False
