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
        """Test GET /profiles/{id} — requires matching token or admin key."""
        create_resp = client.post(
            "/api/v1/profiles",
            json={"name": "Get Test", "pin": "1111"},
        )
        pid = create_resp.json()["profile"]["profile_id"]

        # Unauthenticated GET now 401 — the full profile (progress, history,
        # favorites, settings) must not leak to anyone who knows the id.
        assert client.get(f"/api/v1/profiles/{pid}").status_code == 401

        tok = client.post(
            "/api/v1/profiles/session",
            json={"profile_id": pid, "pin": "1111"},
        ).json()["token"]
        response = client.get(
            f"/api/v1/profiles/{pid}",
            headers={"X-Profile-Token": tok},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["profile"]["name"] == "Get Test"
        assert "pin" not in data["profile"]

    def test_get_profile_wrong_token_403(self, client):
        """Another profile's token cannot read this profile's full record."""
        p1 = client.post("/api/v1/profiles", json={"name": "GetA", "pin": "1111"}).json()["profile"]
        p2 = client.post("/api/v1/profiles", json={"name": "GetB", "pin": "2222"}).json()["profile"]
        t2 = client.post(
            "/api/v1/profiles/session",
            json={"profile_id": p2["profile_id"], "pin": "2222"},
        ).json()["token"]
        resp = client.get(
            f"/api/v1/profiles/{p1['profile_id']}",
            headers={"X-Profile-Token": t2},
        )
        assert resp.status_code == 403

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

    def _mk_with_token(self, client, name="Guard", pin="9999"):
        return self._create_and_token(client, name=name, pin=pin)

    def test_delete_profile_requires_own_token(self, client):
        """Deleting with the wrong profile's token → 403."""
        p1, t1 = self._mk_with_token(client, "Del1", "1111")
        _, t2 = self._mk_with_token(client, name="Del2", pin="2222")
        resp = client.delete(
            f"/api/v1/profiles/{p1['profile_id']}",
            headers={"X-Profile-Token": t2},
        )
        assert resp.status_code == 403

    def test_delete_profile_with_own_token(self, client):
        p1, t1 = self._mk_with_token(client, name="Del3", pin="1234")
        resp = client.delete(
            f"/api/v1/profiles/{p1['profile_id']}",
            headers={"X-Profile-Token": t1},
        )
        assert resp.status_code == 200
        # Gone (need admin key to read it back — unauthenticated GET is 401)
        assert (
            client.get(
                f"/api/v1/profiles/{p1['profile_id']}",
                headers={"X-Admin-Key": "test-admin-key-insecure"},
            ).status_code
            == 404
        )

    def test_delete_profile_with_admin_key(self, client):
        p1, _ = self._mk_with_token(client, name="DelAdm", pin="1234")
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
        resp = client.get(
            "/api/v1/profiles/nope",
            headers={"X-Admin-Key": "test-admin-key-insecure"},
        )
        assert resp.status_code == 404

    def test_progress_wrong_token_forbidden(self, client):
        p1, _ = self._mk_with_token(client, name="PG1", pin="1111")
        _, t2 = self._mk_with_token(client, name="PG2", pin="2222")
        resp = client.get(
            f"/api/v1/profiles/{p1['profile_id']}/progress",
            headers={"X-Profile-Token": t2},
        )
        assert resp.status_code == 403

    def test_refresh_profile_token(self, client):
        p1, t1 = self._mk_with_token(client, name="Refresh", pin="1234")
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
        pprof, tok = self._mk_with_token(client, name="SetEmpty", pin="1111")
        resp = client.get(
            f"/api/v1/profiles/{pprof['profile_id']}/settings",
            headers={"X-Profile-Token": tok},
        )
        assert resp.status_code == 200
        assert resp.json()["settings"] == {}

    def test_settings_wrong_profile_forbidden(self, client):
        """A token bound to profile A cannot read profile B's settings → 403."""
        p1, _ = self._mk_with_token(client, name="SetA", pin="1111")
        _, t2 = self._mk_with_token(client, name="SetB", pin="2222")
        resp = client.get(
            f"/api/v1/profiles/{p1['profile_id']}/settings",
            headers={"X-Profile-Token": t2},
        )
        assert resp.status_code == 403

    def test_switch_profile_missing_id_400(self, client):
        resp = client.post("/api/v1/profiles/session", json={"pin": "1234"})
        assert resp.status_code == 400

    def test_switch_profile_bad_pin_403(self, client):
        pprof, _ = self._mk_with_token(client, name="SwitchPin", pin="1234")
        resp = client.post(
            "/api/v1/profiles/session",
            json={"profile_id": pprof["profile_id"], "pin": "0000"},
        )
        assert resp.status_code == 403

    def test_verify_pin_endpoint_success_and_failure(self, client):
        pprof, _ = self._mk_with_token(client, name="VerifyPin", pin="5678")
        ok = client.post(f"/api/v1/profiles/{pprof['profile_id']}/verify", json={"pin": "5678"}).json()
        bad = client.post(f"/api/v1/profiles/{pprof['profile_id']}/verify", json={"pin": "0000"}).json()
        assert ok["valid"] is True
        assert bad["valid"] is False


class TestProfileWriteAuth:
    """The 5 write endpoints (progress/history/favorites) MUST require a
    matching profile token. The auth middleware skips /api/v1/profiles, so
    each write handler must self-enforce — this class guards that contract."""

    def _mk(self, client, name="W", pin="1234"):
        prof = client.post("/api/v1/profiles", json={"name": name, "pin": pin}).json()["profile"]
        return prof

    def _create_and_token(self, client, name="W", pin="1234"):
        prof = client.post("/api/v1/profiles", json={"name": name, "pin": pin}).json()["profile"]
        tok = client.post(
            "/api/v1/profiles/session",
            json={"profile_id": prof["profile_id"], "pin": pin},
        ).json()["token"]
        return prof, tok

    def _mk_with_token(self, client, name="W", pin="1234"):
        return self._create_and_token(client, name=name, pin=pin)

    def test_progress_put_requires_token(self, client):
        p = self._mk(client, name="P01")
        resp = client.put(f"/api/v1/profiles/{p['profile_id']}/progress", json={"watchKey": "movie:1", "position": 30})
        assert resp.status_code == 401

    def test_progress_put_forbidden_with_wrong_token(self, client):
        p = self._mk(client, name="P02")
        _, t2 = self._mk_with_token(client, name="P02b", pin="2222")
        resp = client.put(
            f"/api/v1/profiles/{p['profile_id']}/progress",
            headers={"X-Profile-Token": t2},
            json={"watchKey": "movie:1", "position": 30},
        )
        assert resp.status_code == 403

    def test_progress_put_success_with_own_token(self, client):
        p, t = self._mk_with_token(client, name="P03", pin="1111")
        resp = client.put(
            f"/api/v1/profiles/{p['profile_id']}/progress",
            headers={"X-Profile-Token": t},
            json={"watchKey": "movie:1", "position": 30, "seriesData": {"ep": 1}},
        )
        assert resp.status_code == 200
        # Read back with GET (also requires token)
        got = client.get(
            f"/api/v1/profiles/{p['profile_id']}/progress",
            headers={"X-Profile-Token": t},
        )
        assert got.status_code == 200
        assert got.json()["progress"]["movie:1"]["position"] == 30

    def test_progress_put_missing_watchkey_400(self, client):
        p, t = self._mk_with_token(client, name="P04", pin="1111")
        resp = client.put(
            f"/api/v1/profiles/{p['profile_id']}/progress",
            headers={"X-Profile-Token": t},
            json={"position": 30},
        )
        assert resp.status_code == 400

    def test_progress_put_missing_position_400(self, client):
        p, t = self._mk_with_token(client, name="P05", pin="1111")
        resp = client.put(
            f"/api/v1/profiles/{p['profile_id']}/progress",
            headers={"X-Profile-Token": t},
            json={"watchKey": "movie:1"},
        )
        assert resp.status_code == 400

    def test_progress_put_missing_profile_404(self, client):
        resp = client.put(
            "/api/v1/profiles/nope/progress",
            headers={"X-Admin-Key": "test-admin-key-insecure"},
            json={"watchKey": "movie:1", "position": 30},
        )
        assert resp.status_code == 404

    def test_history_post_missing_watchkey_400(self, client):
        p, t = self._mk_with_token(client, name="P06", pin="1111")
        resp = client.post(
            f"/api/v1/profiles/{p['profile_id']}/history",
            headers={"X-Profile-Token": t},
            json={"title": "No key"},
        )
        assert resp.status_code == 400

    def test_history_post_missing_profile_404(self, client):
        resp = client.post(
            "/api/v1/profiles/nope/history",
            headers={"X-Admin-Key": "test-admin-key-insecure"},
            json={"watchKey": "movie:1", "title": "X"},
        )
        assert resp.status_code == 404

    def test_clear_history_requires_token(self, client):
        p = self._mk(client, name="P07")
        resp = client.delete(f"/api/v1/profiles/{p['profile_id']}/history")
        assert resp.status_code == 401

    def test_clear_history_success_with_token(self, client):
        p, t = self._mk_with_token(client, name="P08", pin="1111")
        # Add some history first
        client.post(
            f"/api/v1/profiles/{p['profile_id']}/history",
            headers={"X-Profile-Token": t},
            json={"watchKey": "movie:1", "title": "A"},
        )
        resp = client.delete(
            f"/api/v1/profiles/{p['profile_id']}/history",
            headers={"X-Profile-Token": t},
        )
        assert resp.status_code == 200
        h = client.get(
            f"/api/v1/profiles/{p['profile_id']}/history",
            headers={"X-Profile-Token": t},
        )
        assert h.json()["history"] == []

    def test_clear_history_missing_profile_404(self, client):
        resp = client.delete(
            "/api/v1/profiles/nope/history",
            headers={"X-Admin-Key": "test-admin-key-insecure"},
        )
        assert resp.status_code == 404

    def test_favorites_post_requires_token(self, client):
        p = self._mk(client, name="P09")
        resp = client.post(f"/api/v1/profiles/{p['profile_id']}/favorites", json={"watchKey": "movie:9"})
        assert resp.status_code == 401

    def test_favorites_post_missing_watchkey_400(self, client):
        p, t = self._mk_with_token(client, name="P10", pin="1111")
        resp = client.post(
            f"/api/v1/profiles/{p['profile_id']}/favorites",
            headers={"X-Profile-Token": t},
            json={"title": "no key"},
        )
        assert resp.status_code == 400

    def test_favorites_post_missing_profile_404(self, client):
        resp = client.post(
            "/api/v1/profiles/nope/favorites",
            headers={"X-Admin-Key": "test-admin-key-insecure"},
            json={"watchKey": "movie:9"},
        )
        assert resp.status_code == 404

    def test_favorites_remove_requires_token(self, client):
        p = self._mk(client, name="P11")
        resp = client.delete(f"/api/v1/profiles/{p['profile_id']}/favorites/movie:1")
        assert resp.status_code == 401

    def test_favorites_remove_wrong_token_403(self, client):
        p = self._mk(client, name="P12")
        _, t2 = self._mk_with_token(client, name="P12b", pin="2222")
        resp = client.delete(
            f"/api/v1/profiles/{p['profile_id']}/favorites/movie:1",
            headers={"X-Profile-Token": t2},
        )
        assert resp.status_code == 403

    def test_favorites_remove_missing_404(self, client):
        resp = client.delete(
            "/api/v1/profiles/nope/favorites/movie:1",
            headers={"X-Admin-Key": "test-admin-key-insecure"},
        )
        assert resp.status_code == 404


class TestProfileAuthEndpoint:
    """POST /profiles/{id}/auth — distinct from /session."""

    def test_auth_requires_pin(self, client):
        p = client.post("/api/v1/profiles", json={"name": "Auth0", "pin": "1234"}).json()["profile"]
        resp = client.post(f"/api/v1/profiles/{p['profile_id']}/auth", json={})
        assert resp.status_code == 400

    def test_auth_wrong_pin_403(self, client):
        p = client.post("/api/v1/profiles", json={"name": "Auth1", "pin": "1234"}).json()["profile"]
        resp = client.post(f"/api/v1/profiles/{p['profile_id']}/auth", json={"pin": "9999"})
        assert resp.status_code == 403

    def test_auth_success(self, client):
        p = client.post("/api/v1/profiles", json={"name": "Auth2", "pin": "1234"}).json()["profile"]
        resp = client.post(f"/api/v1/profiles/{p['profile_id']}/auth", json={"pin": "1234"})
        assert resp.status_code == 200
        assert "token" in resp.json()
        assert resp.json()["profile"]["profile_id"] == p["profile_id"]


class TestProfileProgressAndSettingsBranches:
    """Remaining branch coverage: progress GET 404, fresh-profile progress,
    favorites id-fallback, settings PUT/clear 404 + merge, /me deleted profile."""

    def _mk_with_token(self, client, name="W", pin="1111"):
        prof = client.post("/api/v1/profiles", json={"name": name, "pin": pin}).json()["profile"]
        tok = client.post(
            "/api/v1/profiles/session",
            json={"profile_id": prof["profile_id"], "pin": pin},
        ).json()["token"]
        return prof, tok

    def test_progress_get_missing_profile_404(self, client):
        resp = client.get(
            "/api/v1/profiles/nope/progress",
            headers={"X-Admin-Key": "test-admin-key-insecure"},
        )
        assert resp.status_code == 404

    def test_progress_put_on_fresh_profile_creates_key(self, client):
        """A profile with no 'progress' key gets one created (line 158 branch)."""
        p, t = self._mk_with_token(client, name="PFr", pin="1111")
        resp = client.put(
            f"/api/v1/profiles/{p['profile_id']}/progress",
            headers={"X-Profile-Token": t},
            json={"watchKey": "movie:7", "position": 12},
        )
        assert resp.status_code == 200
        got = client.get(
            f"/api/v1/profiles/{p['profile_id']}/progress",
            headers={"X-Profile-Token": t},
        )
        assert got.json()["progress"]["movie:7"]["position"] == 12

    def test_favorites_post_id_fallback(self, client):
        """'id' is accepted when 'watchKey' is absent."""
        p, t = self._mk_with_token(client, name="PFav", pin="1111")
        resp = client.post(
            f"/api/v1/profiles/{p['profile_id']}/favorites",
            headers={"X-Profile-Token": t},
            json={"id": "movie:42", "title": "By id"},
        )
        assert resp.status_code == 200
        favs = client.get(
            f"/api/v1/profiles/{p['profile_id']}/favorites",
            headers={"X-Profile-Token": t},
        )
        assert any(f.get("id") == "movie:42" for f in favs.json()["favorites"])

    def test_settings_put_missing_profile_404(self, client):
        resp = client.put(
            "/api/v1/profiles/nope/settings",
            headers={"X-Admin-Key": "test-admin-key-insecure"},
            json={"theme": "dark"},
        )
        assert resp.status_code == 404

    def test_settings_put_merges_payload(self, client):
        """PUT settings returns merged settings; preserves prior keys."""
        p, t = self._mk_with_token(client, name="PSet", pin="1111")
        r1 = client.put(
            f"/api/v1/profiles/{p['profile_id']}/settings",
            headers={"X-Profile-Token": t},
            json={"theme": "dark"},
        )
        assert r1.status_code == 200
        r2 = client.put(
            f"/api/v1/profiles/{p['profile_id']}/settings",
            headers={"X-Profile-Token": t},
            json={"language": "es"},
        )
        assert r2.json()["settings"]["theme"] == "dark"
        assert r2.json()["settings"]["language"] == "es"

    def test_settings_clear_requires_token(self, client):
        p = client.post("/api/v1/profiles", json={"name": "PClr", "pin": "1111"}).json()["profile"]
        resp = client.delete(f"/api/v1/profiles/{p['profile_id']}/settings")
        assert resp.status_code == 401

    def test_settings_clear_success(self, client):
        p, t = self._mk_with_token(client, name="PClr2", pin="1111")
        client.put(
            f"/api/v1/profiles/{p['profile_id']}/settings",
            headers={"X-Profile-Token": t},
            json={"theme": "dark"},
        )
        resp = client.delete(
            f"/api/v1/profiles/{p['profile_id']}/settings",
            headers={"X-Profile-Token": t},
        )
        assert resp.status_code == 200
        got = client.get(
            f"/api/v1/profiles/{p['profile_id']}/settings",
            headers={"X-Profile-Token": t},
        )
        assert got.json()["settings"] == {}

    def test_settings_clear_missing_profile_404(self, client):
        resp = client.delete(
            "/api/v1/profiles/nope/settings",
            headers={"X-Admin-Key": "test-admin-key-insecure"},
        )
        assert resp.status_code == 404

    def test_me_with_deleted_profile_404(self, client):
        """A valid token whose profile was deleted → /me 404."""
        p, t = self._mk_with_token(client, name="PMeDel", pin="1111")
        client.delete(
            f"/api/v1/profiles/{p['profile_id']}",
            headers={"X-Profile-Token": t},
        )
        resp = client.get("/api/v1/profiles/me", headers={"X-Profile-Token": t})
        assert resp.status_code == 404


class TestPinBruteForceLockout:
    """verify_profile_pin must enforce a per-profile failed-attempt lockout,
    or the open /verify and /session endpoints let a 4-digit PIN be walked by
    rotating client IPs (the global rate limiter keys by device-token/IP)."""

    def _mk(self, client, name="PinBrute", pin="1234"):
        return client.post("/api/v1/profiles", json={"name": name, "pin": pin}).json()["profile"]

    def _verify_returns(self, client, pid, pin):
        r = client.post(f"/api/v1/profiles/{pid}/verify", json={"pin": pin})
        return r.json()["valid"]

    def test_lockout_after_repeated_failures(self, client):
        import auth as auth_mod

        auth_mod._pin_failures.clear()
        try:
            p = self._mk(client, pin="1234")
            # 5 failed attempts cross the threshold...
            for _ in range(5):
                assert self._verify_returns(client, p["profile_id"], "0000") is False
            # ...so even the correct PIN is rejected during the lock window.
            assert self._verify_returns(client, p["profile_id"], "1234") is False
            # Session unlock is also locked out.
            r = client.post(
                "/api/v1/profiles/session",
                json={"profile_id": p["profile_id"], "pin": "1234"},
            )
            assert r.status_code == 403
        finally:
            auth_mod._pin_failures.clear()

    def test_success_resets_failure_count(self, client):
        import auth as auth_mod

        auth_mod._pin_failures.clear()
        try:
            p = self._mk(client, name="PinRes", pin="1234")
            for _ in range(3):
                self._verify_returns(client, p["profile_id"], "0000")
            # Correct PIN succeeds and clears the counter.
            assert self._verify_returns(client, p["profile_id"], "1234") is True
            # Counter reset → 3 more failures do NOT lock yet.
            for _ in range(3):
                assert self._verify_returns(client, p["profile_id"], "0000") is False
            assert self._verify_returns(client, p["profile_id"], "1234") is True
        finally:
            auth_mod._pin_failures.clear()

    def test_lockout_does_not_affect_unlocked_profile(self, client):
        """Profiles with no PIN never lock (nothing to brute-force)."""
        import auth as auth_mod

        auth_mod._pin_failures.clear()
        try:
            # create_profile always requires a PIN in this API; simulate an
            # unlocked profile directly by wiping its pin_hash.
            p = self._mk(client, name="NoPin", pin="1234")
            from auth import _load_profiles, _save_profiles

            profs = _load_profiles()
            profs[p["profile_id"]]["pin_hash"] = ""
            _save_profiles(profs)

            # Many empty-pin attempts on an unlocked profile stay valid.
            for _ in range(10):
                assert self._verify_returns(client, p["profile_id"], "") is True
        finally:
            auth_mod._pin_failures.clear()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
