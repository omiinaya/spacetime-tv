"""Tests for auth.py — authentication, profiles, PINs, session tokens."""

import time

import pytest

# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

TEST_PIN = "1234"


def _make_token_payload(profile_id: str, device_id: str, expiry: int, sig: str) -> str:
    """Build a raw token string for testing."""
    import base64

    payload = f"{profile_id}:{device_id}:{expiry}:{sig}"
    return base64.urlsafe_b64encode(payload.encode()).decode()


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture(autouse=True)
def reset_auth_globals(monkeypatch, tmp_path):
    """Point PROFILES_FILE and PROFILE_TOKEN_SECRET to test values."""
    import auth as _auth

    monkeypatch.setattr(_auth, "PROFILES_FILE", str(tmp_path / "profiles.json"))
    monkeypatch.setattr(_auth, "PROFILE_TOKEN_SECRET", "test-secret-for-testing-12345")


# ═══════════════════════════════════════════════════════════════════════════════
# 1. hash_token()
# ═══════════════════════════════════════════════════════════════════════════════


class TestHashToken:
    def test_returns_hex_string(self):
        from auth import hash_token

        result = hash_token("my-token-123")
        assert isinstance(result, str)
        assert len(result) == 64  # SHA-256 hex

    def test_different_tokens_different_hashes(self):
        from auth import hash_token

        assert hash_token("token-a") != hash_token("token-b")

    def test_same_token_same_hash(self):
        from auth import hash_token

        assert hash_token("same-token") == hash_token("same-token")

    def test_empty_token_hashes(self):
        from auth import hash_token

        result = hash_token("")
        assert isinstance(result, str)
        assert len(result) == 64


# ═══════════════════════════════════════════════════════════════════════════════
# 2. PIN hashing and verification
# ═══════════════════════════════════════════════════════════════════════════════


class TestPinHash:
    """_hash_pin produces salted hashes; _verify_pin validates them."""

    def test_hash_contains_salt_and_hash(self):
        from auth import _hash_pin

        result = _hash_pin(TEST_PIN)
        assert ":" in result
        salt_part, hash_part = result.split(":", 1)
        assert len(salt_part) == 32  # 16 bytes hex
        assert len(hash_part) == 64  # SHA-256 hex

    def test_hash_is_deterministic_with_same_salt(self):
        """Same PIN produces different hashes due to random salt."""
        from auth import _hash_pin

        h1 = _hash_pin(TEST_PIN)
        h2 = _hash_pin(TEST_PIN)
        assert h1 != h2  # different salts

    def test_verify_pin_valid(self):
        from auth import _hash_pin, _verify_pin

        stored = _hash_pin(TEST_PIN)
        assert _verify_pin(stored, TEST_PIN) is True

    def test_verify_pin_invalid(self):
        from auth import _hash_pin, _verify_pin

        stored = _hash_pin(TEST_PIN)
        assert _verify_pin(stored, "wrong") is False

    def test_verify_pin_without_salt_legacy(self):
        """Legacy format without salt (plain hash) still works."""
        import hashlib

        from auth import _verify_pin

        legacy_hash = hashlib.sha256(b"1234").hexdigest()
        assert _verify_pin(legacy_hash, "1234") is True
        assert _verify_pin(legacy_hash, "wrong") is False

    def test_verify_empty_stored(self):
        from auth import _verify_pin

        assert _verify_pin("", "1234") is False

    def test_verify_invalid_format(self):
        """Non-hex stored hash doesn't crash."""
        from auth import _verify_pin

        assert _verify_pin(":invalidsplit", "1234") is False


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Profile CRUD
# ═══════════════════════════════════════════════════════════════════════════════


class TestProfileCrud:
    def test_create_profile_returns_id_and_name(self):
        from auth import create_profile

        result = create_profile("Alice", TEST_PIN)
        assert "profile_id" in result
        assert result["name"] == "Alice"
        assert isinstance(result["profile_id"], str)
        assert len(result["profile_id"]) == 16  # token_hex(8)

    def test_create_profile_rejects_short_pin(self):
        from auth import create_profile

        with pytest.raises(ValueError, match="PIN must be 4-6 digits"):
            create_profile("Bad", "123")

    def test_create_profile_rejects_long_pin(self):
        from auth import create_profile

        with pytest.raises(ValueError, match="PIN must be 4-6 digits"):
            create_profile("Bad", "1234567")

    def test_create_profile_rejects_non_digit_pin(self):
        from auth import create_profile

        with pytest.raises(ValueError, match="PIN must be 4-6 digits"):
            create_profile("Bad", "abcd")

    def test_create_profile_rejects_empty_pin(self):
        from auth import create_profile

        with pytest.raises(ValueError, match="PIN must be 4-6 digits"):
            create_profile("Bad", "")

    def test_create_profile_with_avatar(self):
        from auth import create_profile

        result = create_profile("Ali", "1234", avatar="cat")
        profile_id = result["profile_id"]
        from auth import get_profile

        profile = get_profile(profile_id)
        assert profile["avatar"] == "cat"

    def test_get_profile_returns_safe_dict(self):
        from auth import create_profile, get_profile

        created = create_profile("Bob", "5678", avatar="cat")
        profile = get_profile(created["profile_id"])
        assert profile is not None
        assert profile["name"] == "Bob"
        assert profile["avatar"] == "cat"
        assert "profile_id" in profile
        # No password/hash leak
        assert "pin" not in profile
        assert "pin_hash" not in profile

    def test_get_profile_nonexistent_returns_none(self):
        from auth import get_profile

        assert get_profile("nonexistent") is None

    def test_list_profiles_returns_all_without_sensitive_fields(self):
        from auth import create_profile, list_profiles

        create_profile("Alice", "1111")
        create_profile("Bob", "2222")
        profiles = list_profiles()
        assert len(profiles) == 2
        names = {p["name"] for p in profiles}
        assert names == {"Alice", "Bob"}
        for p in profiles:
            assert "pin" not in p
            assert "pin_hash" not in p

    def test_list_profiles_empty(self):
        from auth import list_profiles

        assert list_profiles() == []

    def test_delete_profile_returns_true(self):
        from auth import create_profile, delete_profile

        created = create_profile("Del", "1234")
        assert delete_profile(created["profile_id"]) is True
        assert delete_profile(created["profile_id"]) is False  # already deleted

    def test_delete_profile_nonexistent(self):
        from auth import delete_profile

        assert delete_profile("nonexistent") is False

    def test_verify_profile_pin_valid(self):
        from auth import create_profile, verify_profile_pin

        created = create_profile("Test", TEST_PIN)
        assert verify_profile_pin(created["profile_id"], TEST_PIN) is True

    def test_verify_profile_pin_invalid(self):
        from auth import create_profile, verify_profile_pin

        created = create_profile("Test", TEST_PIN)
        assert verify_profile_pin(created["profile_id"], "wrong") is False

    def test_verify_profile_pin_nonexistent(self):
        from auth import verify_profile_pin

        assert verify_profile_pin("nonexistent", "1234") is False

    def test_verify_profile_pin_empty_pin(self):
        from auth import create_profile, verify_profile_pin

        created = create_profile("Test", TEST_PIN)
        assert verify_profile_pin(created["profile_id"], "") is False


# ═══════════════════════════════════════════════════════════════════════════════
# 4. Profile watch history
# ═══════════════════════════════════════════════════════════════════════════════


class TestProfileHistory:
    def test_add_history_returns_true(self):
        from auth import add_profile_history, create_profile

        created = create_profile("Hist", "1234")
        result = add_profile_history(created["profile_id"], {"watchKey": "movie:1"})
        assert result is True

    def test_add_history_nonexistent_profile(self):
        from auth import add_profile_history

        assert add_profile_history("nonexistent", {"watchKey": "x"}) is False

    def test_get_history_returns_entries(self):
        from auth import add_profile_history, create_profile, get_profile_history

        created = create_profile("Hist", "1234")
        add_profile_history(created["profile_id"], {"watchKey": "m1"})
        add_profile_history(created["profile_id"], {"watchKey": "m2"})
        history = get_profile_history(created["profile_id"])
        assert len(history) == 2
        # Most recent first
        assert history[0]["watchKey"] == "m2"
        assert history[1]["watchKey"] == "m1"

    def test_get_history_with_limit(self):
        from auth import add_profile_history, create_profile, get_profile_history

        created = create_profile("Hist", "1234")
        for i in range(10):
            add_profile_history(created["profile_id"], {"watchKey": f"m{i}"})
        history = get_profile_history(created["profile_id"], limit=3)
        assert len(history) == 3

    def test_get_history_with_offset(self):
        from auth import add_profile_history, create_profile, get_profile_history

        created = create_profile("Hist", "1234")
        for i in range(10):
            add_profile_history(created["profile_id"], {"watchKey": f"m{i}"})
        history = get_profile_history(created["profile_id"], limit=3, offset=0)
        assert history[0]["watchKey"] == "m9"
        history2 = get_profile_history(created["profile_id"], limit=3, offset=3)
        assert history2[0]["watchKey"] == "m6"

    def test_get_history_nonexistent_profile(self):
        from auth import get_profile_history

        assert get_profile_history("nonexistent") == []

    def test_history_max_500(self):
        """History is capped at 500 entries."""
        from auth import add_profile_history, create_profile, get_profile_history

        created = create_profile("Hist", "1234")
        for i in range(510):
            add_profile_history(created["profile_id"], {"watchKey": f"m{i}"})
        history = get_profile_history(created["profile_id"], limit=500)
        assert len(history) == 500

    def test_clear_history_returns_true(self):
        from auth import add_profile_history, clear_profile_history, create_profile

        created = create_profile("Hist", "1234")
        add_profile_history(created["profile_id"], {"watchKey": "m1"})
        assert clear_profile_history(created["profile_id"]) is True

    def test_clear_history_nonexistent(self):
        from auth import clear_profile_history

        assert clear_profile_history("nonexistent") is False

    def test_get_history_empty(self):
        from auth import create_profile, get_profile_history

        created = create_profile("Empty", "1234")
        assert get_profile_history(created["profile_id"]) == []


# ═══════════════════════════════════════════════════════════════════════════════
# 5. Profile favorites
# ═══════════════════════════════════════════════════════════════════════════════


class TestProfileFavorites:
    def test_add_favorite_returns_true(self):
        from auth import add_profile_favorite, create_profile

        created = create_profile("Fav", "1234")
        assert add_profile_favorite(created["profile_id"], {"id": "ch1", "name": "Channel 1"}) is True

    def test_add_favorite_nonexistent(self):
        from auth import add_profile_favorite

        assert add_profile_favorite("nonexistent", {}) is False

    def test_get_favorites_returns_list(self):
        from auth import add_profile_favorite, create_profile, get_profile_favorites

        created = create_profile("Fav", "1234")
        add_profile_favorite(created["profile_id"], {"id": "ch1"})
        add_profile_favorite(created["profile_id"], {"id": "ch2"})
        favs = get_profile_favorites(created["profile_id"])
        assert len(favs) == 2

    def test_get_favorites_empty(self):
        from auth import create_profile, get_profile_favorites

        created = create_profile("Fav", "1234")
        assert get_profile_favorites(created["profile_id"]) == []

    def test_get_favorites_nonexistent(self):
        from auth import get_profile_favorites

        assert get_profile_favorites("nonexistent") == []

    def test_remove_favorite_removes_by_watch_key(self):
        from auth import (
            add_profile_favorite,
            create_profile,
            get_profile_favorites,
            remove_profile_favorite,
        )

        created = create_profile("Fav", "1234")
        add_profile_favorite(created["profile_id"], {"watchKey": "live:1", "id": "1"})
        add_profile_favorite(created["profile_id"], {"watchKey": "live:2", "id": "2"})
        assert remove_profile_favorite(created["profile_id"], "live:1") is True
        favs = get_profile_favorites(created["profile_id"])
        assert len(favs) == 1
        assert favs[0]["id"] == "2"

    def test_remove_favorite_nonexistent(self):
        from auth import create_profile, remove_profile_favorite

        created = create_profile("Fav", "1234")
        assert remove_profile_favorite(created["profile_id"], "nonexistent") is True

    def test_remove_favorite_from_missing_profile(self):
        from auth import remove_profile_favorite

        assert remove_profile_favorite("nonexistent", "x") is False

    def test_add_favorite_dedup_by_watch_key(self):
        from auth import add_profile_favorite, create_profile, get_profile_favorites

        created = create_profile("Fav", "1234")
        add_profile_favorite(created["profile_id"], {"watchKey": "live:1", "id": "1"})
        add_profile_favorite(created["profile_id"], {"watchKey": "live:1", "id": "1"})
        favs = get_profile_favorites(created["profile_id"])
        assert len(favs) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# 6. Session tokens
# ═══════════════════════════════════════════════════════════════════════════════


class TestProfileTokens:
    def test_generate_token_returns_string(self):
        from auth import generate_profile_token

        token = generate_profile_token("profile_abc", "device_123")
        assert isinstance(token, str)
        assert len(token) > 20

    def test_verify_valid_token(self):
        from auth import generate_profile_token, verify_profile_token

        token = generate_profile_token("profile_abc", "device_123")
        result = verify_profile_token(token)
        assert result is not None
        assert result["profile_id"] == "profile_abc"
        assert result["device_id"] == "device_123"
        assert "expiry" in result

    def test_verify_expired_token(self):
        """Token with past expiry should return None."""
        from auth import verify_profile_token

        token = _make_token_payload("p1", "d1", 1, "fakesig")
        result = verify_profile_token(token)
        assert result is None

    def test_verify_malformed_token(self):
        from auth import verify_profile_token

        assert verify_profile_token("not-a-token") is None
        assert verify_profile_token("") is None

    def test_verify_token_wrong_signature(self):
        """Token with wrong signature should return None."""
        from auth import verify_profile_token

        token = _make_token_payload("p1", "d1", int(time.time()) + 3600, "bad")
        assert verify_profile_token(token) is None


# ═══════════════════════════════════════════════════════════════════════════════
# 7. ensure_default_profile
# ═══════════════════════════════════════════════════════════════════════════════


class TestEnsureDefaultProfile:
    def test_creates_when_no_profiles(self):
        from auth import ensure_default_profile

        result = ensure_default_profile()
        assert result is not None
        assert result["name"] == "Main Profile"
        assert "profile_id" in result

    def test_returns_none_when_profiles_exist(self):
        from auth import create_profile, ensure_default_profile

        create_profile("Alice", "1111")
        result = ensure_default_profile()
        assert result is None


# ═══════════════════════════════════════════════════════════════════════════════
# 8. verify_device_token_generic
# ═══════════════════════════════════════════════════════════════════════════════


class TestVerifyDeviceTokenGeneric:
    def test_empty_token_returns_false(self):
        from auth import verify_device_token_generic

        assert verify_device_token_generic("") is False

    def test_short_token_returns_false(self):
        from auth import verify_device_token_generic

        assert verify_device_token_generic("short") is False
