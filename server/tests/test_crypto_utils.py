"""Tests for crypto_utils.py — Fernet symmetric encryption for credentials."""


import pytest

# ═══════════════════════════════════════════════════════════════════════════════
# encrypt / decrypt
# ═══════════════════════════════════════════════════════════════════════════════


class TestEncryptDecrypt:
    """Round-trip encryption/decryption with real Fernet (if cryptography installed)."""

    def test_encrypt_returns_enc_prefixed(self):
        """encrypt() should return a string starting with 'enc:'."""
        from crypto_utils import encrypt

        result = encrypt("hello")
        assert result.startswith("enc:")
        assert len(result) > 4  # has actual token after prefix

    def test_decrypt_round_trip(self):
        """decrypt(encrypt(x)) should equal x."""
        from crypto_utils import decrypt, encrypt

        for val in ("hello", "", "password123", "a" * 100):
            assert decrypt(encrypt(val)) == val

    def test_encrypt_empty_string(self):
        """encrypt('') should return ''."""
        from crypto_utils import encrypt

        assert encrypt("") == ""

    def test_decrypt_empty_string(self):
        """decrypt('') should return ''."""
        from crypto_utils import decrypt

        assert decrypt("") == ""

    def test_decrypt_non_encrypted_returns_plaintext(self):
        """decrypt() on plaintext (no 'enc:' prefix) returns it as-is."""
        from crypto_utils import decrypt

        assert decrypt("plaintext") == "plaintext"
        assert decrypt("enc:") == ""  # malformed — will try to decrypt and fail

    def test_decrypt_malformed_returns_empty(self):
        """decrypt() on malformed encrypted data returns empty string."""
        from crypto_utils import decrypt

        result = decrypt("enc:not_a_valid_token")
        assert result == ""


# ═══════════════════════════════════════════════════════════════════════════════
# is_encrypted
# ═══════════════════════════════════════════════════════════════════════════════


class TestIsEncrypted:
    def test_encrypted_prefix_returns_true(self):
        from crypto_utils import is_encrypted

        assert is_encrypted("enc:token123") is True

    def test_plaintext_returns_false(self):
        from crypto_utils import is_encrypted

        assert is_encrypted("plaintext") is False

    def test_empty_returns_false(self):
        from crypto_utils import is_encrypted

        assert is_encrypted("") is False

    def test_enc_prefix_only_returns_true(self):
        from crypto_utils import is_encrypted

        assert is_encrypted("enc:") is True


# ═══════════════════════════════════════════════════════════════════════════════
# encrypt_provider_password / decrypt_provider_password
# ═══════════════════════════════════════════════════════════════════════════════


class TestProviderPassword:
    def test_encrypt_provider_password_encrypts_plaintext(self):
        from crypto_utils import encrypt_provider_password

        provider = {"name": "Test", "password": "s3kr1t"}
        result = encrypt_provider_password(provider)
        assert result["password"].startswith("enc:")
        # Original unchanged
        assert provider["password"] == "s3kr1t"

    def test_encrypt_provider_password_skips_encrypted(self):
        from crypto_utils import encrypt_provider_password

        provider = {"name": "Test", "password": "enc:already_encrypted"}
        result = encrypt_provider_password(provider)
        assert result["password"] == "enc:already_encrypted"

    def test_encrypt_provider_password_no_password(self):
        from crypto_utils import encrypt_provider_password

        provider = {"name": "Test"}
        result = encrypt_provider_password(provider)
        assert "password" not in result or result.get("password") is None

    def test_decrypt_provider_password_decrypts(self):
        from crypto_utils import decrypt_provider_password, encrypt_provider_password

        provider = {"name": "Test", "password": "s3kr1t"}
        encrypted = encrypt_provider_password(provider)
        decrypted = decrypt_provider_password(encrypted)
        assert decrypted["password"] == "s3kr1t"

    def test_decrypt_provider_password_skips_plaintext(self):
        from crypto_utils import decrypt_provider_password

        provider = {"name": "Test", "password": "plaintext"}
        result = decrypt_provider_password(provider)
        assert result["password"] == "plaintext"

    def test_decrypt_provider_password_no_password(self):
        from crypto_utils import decrypt_provider_password

        provider = {"name": "Test"}
        result = decrypt_provider_password(provider)
        assert "password" not in result or result.get("password") is None

    def test_round_trip_provider_dict(self):
        """Full round-trip through encrypt + decrypt preserves the password."""
        from crypto_utils import decrypt_provider_password, encrypt_provider_password

        original = {"name": "Test", "password": "hunter2", "enabled": True}
        encrypted = encrypt_provider_password(original)
        decrypted = decrypt_provider_password(encrypted)
        assert decrypted["password"] == "hunter2"
        # Other fields preserved
        assert decrypted["name"] == "Test"
        assert decrypted["enabled"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# get_cipher / _get_or_create_key
# ═══════════════════════════════════════════════════════════════════════════════


class TestCipherManagement:
    def test_get_cipher_returns_singleton(self, monkeypatch):
        """get_cipher() should return the same instance across calls."""
        import crypto_utils

        # Reset global state
        monkeypatch.setattr(crypto_utils, "_cipher", None)
        monkeypatch.setattr(crypto_utils, "_KEY_FILE", None)

        c1 = crypto_utils.get_cipher()
        c2 = crypto_utils.get_cipher()
        assert c1 is c2  # Same instance

    def test_get_cipher_raises_import_error_without_cryptography(self, monkeypatch):
        """If Fernet is None (cryptography not installed), raise ImportError."""
        import crypto_utils

        monkeypatch.setattr(crypto_utils, "Fernet", None)
        monkeypatch.setattr(crypto_utils, "_cipher", None)
        with pytest.raises(ImportError, match="cryptography package required"):
            crypto_utils.get_cipher()

    def test_get_or_create_key_from_env(self, monkeypatch, tmp_path):
        """STV_ENCRYPT_KEY env var should be used if set."""
        import crypto_utils

        monkeypatch.setattr(crypto_utils, "_cipher", None)
        monkeypatch.setattr(crypto_utils, "_KEY_FILE", None)
        monkeypatch.setenv("STV_ENCRYPT_KEY", "a" * 64)  # 32 bytes hex = 64 hex chars
        key = crypto_utils._get_or_create_key()
        assert isinstance(key, bytes)
        assert len(key) == 44  # base64 encoded 32-byte key

    def test_get_or_create_key_from_env_base64(self, monkeypatch):
        """STV_ENCRYPT_KEY as base64 (44 chars, ends with =) should work directly."""
        # Generate a real Fernet key
        from cryptography.fernet import Fernet

        import crypto_utils

        real_key = Fernet.generate_key().decode()

        monkeypatch.setattr(crypto_utils, "_cipher", None)
        monkeypatch.setattr(crypto_utils, "_KEY_FILE", None)
        monkeypatch.setenv("STV_ENCRYPT_KEY", real_key)
        key = crypto_utils._get_or_create_key()
        assert key.decode() == real_key

    def test_get_or_create_key_from_file(self, monkeypatch, tmp_path):
        """If no env var, key should be read from/stored to .encrypt_key file."""

        import crypto_utils

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        monkeypatch.setenv("STV_DATA_DIR", str(data_dir))
        monkeypatch.setattr(crypto_utils, "_cipher", None)
        monkeypatch.setattr(crypto_utils, "_KEY_FILE", None)

        key = crypto_utils._get_or_create_key()
        assert isinstance(key, bytes)

        # Key file should exist
        key_file = data_dir / ".encrypt_key"
        assert key_file.exists()
        assert key_file.read_bytes().strip() == key

    def test_invalid_key_format_logs_warning(self, monkeypatch, caplog):
        """An invalid STV_ENCRYPT_KEY format should log a warning."""
        import crypto_utils

        monkeypatch.setattr(crypto_utils, "_cipher", None)
        monkeypatch.setattr(crypto_utils, "_KEY_FILE", None)
        monkeypatch.setenv("STV_ENCRYPT_KEY", "not_a_valid_key")
        with caplog.at_level("WARNING"):
            crypto_utils._get_or_create_key()
            assert "Invalid STV_ENCRYPT_KEY format" in caplog.text
