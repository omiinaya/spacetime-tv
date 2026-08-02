"""Tests for per-user profile management with PIN-based auth."""

import os

# Must set before importing app
os.environ["ENFORCE_HTTPS"] = "false"
os.environ["DISABLE_CACHE"] = "1"

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# Ensure conftest doesn't override this
if os.environ.get("ENFORCE_HTTPS") not in ("false", "False"):
    os.environ["ENFORCE_HTTPS"] = "false"


@pytest.fixture
def temp_profiles_file(tmp_path):
    """Create a temporary profiles file."""
    profiles_path = tmp_path / "profiles.json"
    # Patch the PROFILES_FILE path
    with patch("auth._get_profiles_path", return_value=str(profiles_path)):
        yield profiles_path


@pytest.fixture
def client(temp_profiles_file):
    """Create a test client with profile support."""
    from main import app

    # Ensure default profile doesn't exist yet
    profiles_path = temp_profiles_file
    if profiles_path.exists():
        profiles_path.unlink()
    client = TestClient(app)
    return client


class TestProfileAuth:
    """Test profile authentication and token system."""

    def test_create_profile(self, client):
        """Test creating a profile with PIN."""
        from auth import _hash_pin, _verify_pin

        hashed = _hash_pin("1234")
        assert _verify_pin(hashed, "1234") is True
        assert _verify_pin(hashed, "5678") is False
        assert _verify_pin(hashed, "") is False

    def test_create_profile_validates_pin(self, client):
        """Test PIN validation on profile creation."""
        from auth import create_profile

        with pytest.raises(ValueError, match="PIN must be 4-6 digits"):
            create_profile("Test", "12")

        with pytest.raises(ValueError, match="PIN must be 4-6 digits"):
            create_profile("Test", "abc")

        with pytest.raises(ValueError, match="PIN must be 4-6 digits"):
            create_profile("Test", "")

        # Valid cases
        profile = create_profile("Test", "1234", "avatar1")
        assert profile["name"] == "Test"
        assert "profile_id" in profile

    def test_verify_profile_pin(self, client):
        """Test PIN verification."""
        from auth import create_profile, verify_profile_pin

        profile = create_profile("Test", "4321", "")
        pid = profile["profile_id"]

        assert verify_profile_pin(pid, "4321") is True
        assert verify_profile_pin(pid, "1234") is False
        assert verify_profile_pin(pid, "") is False
        assert verify_profile_pin("nonexistent", "4321") is False


class TestProfileToken:
    """Test profile token generation and verification."""

    def test_generate_and_verify_token(self, client):
        """Test token generation and verification."""
        from auth import create_profile, generate_profile_token, verify_profile_token

        profile = create_profile("Test", "1234", "")
        pid = profile["profile_id"]

        token = generate_profile_token(pid, "device123")
        result = verify_profile_token(token)
        assert result is not None
        assert result["profile_id"] == pid
        assert result["device_id"] == "device123"
        assert "expiry" in result

    def test_verify_invalid_token(self, client):
        """Test verification of malformed tokens."""
        from auth import verify_profile_token

        assert verify_profile_token("") is None
        assert verify_profile_token("invalid") is None
        assert verify_profile_token("a:b:c:d:extra") is None

    def test_profile_list_excludes_pin(self, client):
        """Test that profile list does not expose PIN."""
        from auth import create_profile, list_profiles

        create_profile("Test1", "1111", "")
        create_profile("Test2", "2222", "")

        profiles = list_profiles()
        assert len(profiles) >= 2
        for p in profiles:
            assert "pin" not in p
            assert "pin_hash" not in p
            assert "profile_id" in p
            assert "name" in p


class TestProfileAPI:
    """Test profile API endpoints."""

    def test_list_profiles(self, client):
        """Test GET /profiles."""
        from auth import ensure_default_profile

        ensure_default_profile()

        response = client.get("/api/v1/profiles")
        assert response.status_code == 200
        data = response.json()
        assert "profiles" in data
        assert len(data["profiles"]) >= 1

    def test_create_profile_api(self, client):
        """Test POST /profiles."""
        response = client.post(
            "/api/v1/profiles",
            json={"name": "API Test", "pin": "5678", "avatar": "default"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["profile"]["name"] == "API Test"
        assert "pin" not in data["profile"]

    def test_create_profile_bad_pin(self, client):
        """Test validation errors."""
        response = client.post(
            "/api/v1/profiles",
            json={"name": "Bad", "pin": "12"},
        )
        assert response.status_code == 400

        response = client.post(
            "/api/v1/profiles",
            json={"name": "Bad", "pin": "abc"},
        )
        assert response.status_code == 400

    def test_verify_pin_endpoint(self, client):
        """Test POST /profiles/{id}/verify."""
        # Create a profile first
        create_resp = client.post(
            "/api/v1/profiles",
            json={"name": "Verify Test", "pin": "9999"},
        )
        pid = create_resp.json()["profile"]["profile_id"]

        # Correct PIN
        response = client.post(
            f"/api/v1/profiles/{pid}/verify",
            json={"pin": "9999"},
        )
        assert response.status_code == 200
        assert response.json()["valid"] is True

        # Wrong PIN
        response = client.post(
            f"/api/v1/profiles/{pid}/verify",
            json={"pin": "0000"},
        )
        assert response.status_code == 200
        assert response.json()["valid"] is False

    def test_get_profile(self, client):
        """Test GET /profiles/{id}."""
        create_resp = client.post(
            "/api/v1/profiles",
            json={"name": "Get Test", "pin": "1111"},
        )
        pid = create_resp.json()["profile"]["profile_id"]

        response = client.get(f"/api/v1/profiles/{pid}")
        assert response.status_code == 200
        data = response.json()
        assert data["profile"]["name"] == "Get Test"
        assert "pin" not in data["profile"]

    def test_profile_session(self, client):
        """Test profile session token flow."""
        # Create profile
        create_resp = client.post(
            "/api/v1/profiles",
            json={"name": "Session Test", "pin": "1234"},
        )
        pid = create_resp.json()["profile"]["profile_id"]

        # Get session token
        session_resp = client.post(
            "/api/v1/profiles/session",
            json={"profile_id": pid, "pin": "1234"},
        )
        assert session_resp.status_code == 200
        data = session_resp.json()
        assert "token" in data
        assert "profile" in data

        # Verify session token works
        me_resp = client.get(
            "/api/v1/profiles/me",
            headers={"X-Profile-Token": data["token"]},
        )
        assert me_resp.status_code == 200
        assert me_resp.json()["profile"]["name"] == "Session Test"

    def test_profile_progress_auth_required(self, client):
        """Test that progress endpoints require auth."""
        create_resp = client.post(
            "/api/v1/profiles",
            json={"name": "Progress Test", "pin": "1234"},
        )
        pid = create_resp.json()["profile"]["profile_id"]

        # Get progress without token should fail
        response = client.get(f"/api/v1/profiles/{pid}/progress")
        assert response.status_code == 401

    def test_profile_history_isolation(self, client):
        """Test that profile history is isolated per profile."""
        # Create two profiles
        p1 = client.post("/api/v1/profiles", json={"name": "P1", "pin": "1111"}).json()["profile"]
        p2 = client.post("/api/v1/profiles", json={"name": "P2", "pin": "2222"}).json()["profile"]

        # Get session tokens
        t1 = client.post("/api/v1/profiles/session", json={"profile_id": p1["profile_id"], "pin": "1111"}).json()[
            "token"
        ]
        t2 = client.post("/api/v1/profiles/session", json={"profile_id": p2["profile_id"], "pin": "2222"}).json()[
            "token"
        ]

        # Add history to P1
        h1_resp = client.post(
            f"/api/v1/profiles/{p1['profile_id']}/history",
            headers={"X-Profile-Token": t1},
            json={"watchKey": "movie:100", "title": "Movie A", "contentType": "movie"},
        )
        assert h1_resp.status_code == 200

        # Add history to P2
        client.post(
            f"/api/v1/profiles/{p2['profile_id']}/history",
            headers={"X-Profile-Token": t2},
            json={"watchKey": "movie:200", "title": "Movie B", "contentType": "movie"},
        )

        # P1 should only see their history
        h1 = client.get(
            f"/api/v1/profiles/{p1['profile_id']}/history",
            headers={"X-Profile-Token": t1},
        ).json()
        assert len(h1["history"]) == 1
        assert h1["history"][0]["watchKey"] == "movie:100"

        # P2 should only see their history
        h2 = client.get(
            f"/api/v1/profiles/{p2['profile_id']}/history",
            headers={"X-Profile-Token": t2},
        ).json()
        assert len(h2["history"]) == 1
        assert h2["history"][0]["watchKey"] == "movie:200"

    def test_profile_favorites_isolation(self, client):
        """Test that favorites are isolated per profile."""
        # Create two profiles
        p1 = client.post("/api/v1/profiles", json={"name": "Fav1", "pin": "1111"}).json()["profile"]
        p2 = client.post("/api/v1/profiles", json={"name": "Fav2", "pin": "2222"}).json()["profile"]

        t1 = client.post("/api/v1/profiles/session", json={"profile_id": p1["profile_id"], "pin": "1111"}).json()[
            "token"
        ]
        t2 = client.post("/api/v1/profiles/session", json={"profile_id": p2["profile_id"], "pin": "2222"}).json()[
            "token"
        ]

        # Add favorite to P1
        client.post(
            f"/api/v1/profiles/{p1['profile_id']}/favorites",
            headers={"X-Profile-Token": t1},
            json={"watchKey": "movie:100", "title": "Movie A"},
        )

        # P1 should have 1 favorite
        f1 = client.get(
            f"/api/v1/profiles/{p1['profile_id']}/favorites",
            headers={"X-Profile-Token": t1},
        ).json()
        assert len(f1["favorites"]) == 1

        # P2 should have 0 favorites
        f2 = client.get(
            f"/api/v1/profiles/{p2['profile_id']}/favorites",
            headers={"X-Profile-Token": t2},
        ).json()
        assert len(f2["favorites"]) == 0

    def test_profile_settings_isolation(self, client):
        """Test that settings are isolated per profile."""
        p1 = client.post("/api/v1/profiles", json={"name": "Set1", "pin": "1111"}).json()["profile"]
        p2 = client.post("/api/v1/profiles", json={"name": "Set2", "pin": "2222"}).json()["profile"]

        t1 = client.post("/api/v1/profiles/session", json={"profile_id": p1["profile_id"], "pin": "1111"}).json()[
            "token"
        ]
        t2 = client.post("/api/v1/profiles/session", json={"profile_id": p2["profile_id"], "pin": "2222"}).json()[
            "token"
        ]

        # Set theme for P1
        client.put(
            f"/api/v1/profiles/{p1['profile_id']}/settings",
            headers={"X-Profile-Token": t1},
            json={"theme": "dark"},
        )

        # Set theme for P2
        client.put(
            f"/api/v1/profiles/{p2['profile_id']}/settings",
            headers={"X-Profile-Token": t2},
            json={"theme": "light"},
        )

        # P1 should have dark
        s1 = client.get(
            f"/api/v1/profiles/{p1['profile_id']}/settings",
            headers={"X-Profile-Token": t1},
        ).json()
        assert s1["settings"]["theme"] == "dark"

        # P2 should have light
        s2 = client.get(
            f"/api/v1/profiles/{p2['profile_id']}/settings",
            headers={"X-Profile-Token": t2},
        ).json()
        assert s2["settings"]["theme"] == "light"


class TestProfileAccessGuard:
    """Security-critical branches of _require_profile_access + auth endpoints."""

    def _create_and_token(self, client, name="Guard", pin="9999"):
        prof = client.post("/api/v1/profiles", json={"name": name, "pin": pin}).json()["profile"]
        tok = client.post("/api/v1/profiles/session", json={"profile_id": prof["profile_id"], "pin": pin}).json()[
            "token"
        ]
        return prof, tok

    def test_delete_profile_requires_own_token(self, client):
        """Deleting with the wrong profile's token → 403."""
        p1, t1 = self._create_and_token(client, "Del1", "1111")
        _, t2 = self._create_and_token(client, name="Del2", pin="2222")
        resp = client.delete(
            f"/api/v1/profiles/{p1['profile_id']}",
            headers={"X-Profile-Token": t2},
        )
        assert resp.status_code == 403

    def test_delete_profile_with_own_token(self, client):
        p1, t1 = self._create_and_token(client, name="Del3", pin="1234")
        resp = client.delete(
            f"/api/v1/profiles/{p1['profile_id']}",
            headers={"X-Profile-Token": t1},
        )
        assert resp.status_code == 200
        # Gone
        assert client.get(f"/api/v1/profiles/{p1['profile_id']}").status_code == 404

    def test_delete_profile_with_admin_key(self, client):
        p1, _ = self._create_and_token(client, name="DelAdm", pin="1234")
        resp = client.delete(
            f"/api/v1/profiles/{p1['profile_id']}",
            headers={"X-Admin-Key": "test-admin-key-insecure"},
        )
        assert resp.status_code == 200

    def test_delete_missing_profile_404(self, client):
        resp = client.delete(
            "/api/v1/profiles/nonexistent-id",
            headers={"X-Admin-Key": "test-admin-key-insecure"},
        )
        assert resp.status_code == 404

    def test_get_missing_profile_404(self, client):
        assert client.get("/api/v1/profiles/nope").status_code == 404

    def test_progress_wrong_token_forbidden(self, client):
        p1, _ = self._create_and_token(client, name="PG1", pin="1111")
        _, t2 = self._create_and_token(client, name="PG2", pin="2222")
        resp = client.get(
            f"/api/v1/profiles/{p1['profile_id']}/progress",
            headers={"X-Profile-Token": t2},
        )
        assert resp.status_code == 403

    def test_refresh_profile_token(self, client):
        p1, t1 = self._create_and_token(client, name="Refresh", pin="1234")
        resp = client.post(
            "/api/v1/profiles/session/refresh",
            headers={"X-Profile-Token": t1},
        )
        assert resp.status_code == 200
        assert "token" in resp.json()

    def test_refresh_requires_token(self, client):
        assert client.post("/api/v1/profiles/session/refresh").status_code == 401

    def test_me_requires_token(self, client):
        assert client.get("/api/v1/profiles/me").status_code == 401

    def test_me_invalid_token(self, client):
        resp = client.get(
            "/api/v1/profiles/me",
            headers={"X-Profile-Token": "garbage-token"},
        )
        assert resp.status_code == 401

    def test_settings_get_own_profile_empty(self, client):
        """A valid token reads its own profile's (empty) settings — 200 {}."""
        pprof, tok = self._create_and_token(client, name="SetEmpty", pin="1111")
        resp = client.get(
            f"/api/v1/profiles/{pprof['profile_id']}/settings",
            headers={"X-Profile-Token": tok},
        )
        assert resp.status_code == 200
        assert resp.json()["settings"] == {}

    def test_settings_wrong_profile_forbidden(self, client):
        """A token bound to profile A cannot read profile B's settings → 403."""
        p1, _ = self._create_and_token(client, name="SetA", pin="1111")
        _, t2 = self._create_and_token(client, name="SetB", pin="2222")
        resp = client.get(
            f"/api/v1/profiles/{p1['profile_id']}/settings",
            headers={"X-Profile-Token": t2},
        )
        assert resp.status_code == 403

    def test_switch_profile_missing_id_400(self, client):
        resp = client.post("/api/v1/profiles/session", json={"pin": "1234"})
        assert resp.status_code == 400

    def test_switch_profile_bad_pin_403(self, client):
        pprof, _ = self._create_and_token(client, name="SwitchPin", pin="1234")
        resp = client.post(
            "/api/v1/profiles/session",
            json={"profile_id": pprof["profile_id"], "pin": "0000"},
        )
        assert resp.status_code == 403

    def test_verify_pin_endpoint_success_and_failure(self, client):
        pprof, _ = self._create_and_token(client, name="VerifyPin", pin="5678")
        ok = client.post(f"/api/v1/profiles/{pprof['profile_id']}/verify", json={"pin": "5678"}).json()
        bad = client.post(f"/api/v1/profiles/{pprof['profile_id']}/verify", json={"pin": "0000"}).json()
        assert ok["valid"] is True
        assert bad["valid"] is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
