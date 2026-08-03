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

    def test_get_or_create_key_default_data_dir_when_unset(self, monkeypatch, tmp_path):
        """No STV_DATA_DIR -> fall back to server/data under the module path."""
        import crypto_utils

        monkeypatch.setattr(crypto_utils, "_cipher", None)
        monkeypatch.setattr(crypto_utils, "_KEY_FILE", None)
        monkeypatch.delenv("STV_ENCRYPT_KEY", raising=False)
        monkeypatch.delenv("STV_DATA_DIR", raising=False)

        key = crypto_utils._get_or_create_key()
        assert isinstance(key, bytes)

    def test_get_or_create_key_handles_read_oserror(self, monkeypatch, tmp_path, caplog):
        """An OSError reading the key file is swallowed (falls through to generate)."""
        import crypto_utils

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        monkeypatch.setenv("STV_DATA_DIR", str(data_dir))
        monkeypatch.delenv("STV_ENCRYPT_KEY", raising=False)
        monkeypatch.setattr(crypto_utils, "_cipher", None)
        monkeypatch.setattr(crypto_utils, "_KEY_FILE", None)

        # Pre-create the key file so exists() is True, then patch read_bytes
        # on pathlib.Path so the function's fresh Path object hit the OSError.
        data_dir.joinpath(".encrypt_key").write_bytes(b"valid-key-data")
        import pathlib

        real_read_bytes = pathlib.Path.read_bytes

        def raising_read(self, *a, **k):
            if self.name == ".encrypt_key":
                raise OSError("failed to read")
            return real_read_bytes(self, *a, **k)

        monkeypatch.setattr(pathlib.Path, "read_bytes", raising_read)
        key = crypto_utils._get_or_create_key()
        assert isinstance(key, bytes)

    def test_write_key_oserror_logs_warning(self, monkeypatch, tmp_path, caplog):
        """OSError writing the key file logs a warning and returns the key."""
        import pathlib

        import crypto_utils

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        monkeypatch.setenv("STV_DATA_DIR", str(data_dir))
        monkeypatch.delenv("STV_ENCRYPT_KEY", raising=False)
        monkeypatch.setattr(crypto_utils, "_cipher", None)
        monkeypatch.setattr(crypto_utils, "_KEY_FILE", None)

        real_write_bytes = pathlib.Path.write_bytes
        data_dir.joinpath("__touch").write_bytes(b"")  # ensure dir usable elsewhere

        def raising_write(self, *a, **k):
            if self.name == ".encrypt_key":
                raise OSError("disk full")
            return real_write_bytes(self, *a, **k)

        monkeypatch.setattr(pathlib.Path, "write_bytes", raising_write)
        with caplog.at_level("WARNING"):
            key = crypto_utils._get_or_create_key()
        assert isinstance(key, bytes)
        assert "Could not persist encryption key" in caplog.text


class TestCryptoImportMissing:
    """Fernet fallback when cryptography isn't installed (lines 11-13)."""

    def test_import_error_sets_fernet_none(self, monkeypatch):
        """Blocking the cryptography import sets Fernet=None and get_cipher raises."""
        import builtins

        import crypto_utils

        real_import = builtins.__import__

        def block_cryptography(name, *a, **k):
            if name == "cryptography" or name.startswith("cryptography."):
                raise ImportError("cryptography not installed")
            return real_import(name, *a, **k)

        monkeypatch.setattr(builtins, "__import__", block_cryptography)
        monkeypatch.setattr(crypto_utils, "_cipher", None)

        # re-run the module's import-try block by reloading under the blocker
        import importlib

        reloaded = importlib.reload(crypto_utils)
        assert reloaded.Fernet is None
        assert reloaded.InvalidToken is None
        with pytest.raises(ImportError, match="cryptography package required"):
            reloaded.get_cipher()

        # restore then re-import so the real Fernet is used by later tests
        monkeypatch.undo()
        import importlib as _il

        _il.reload(crypto_utils)
        assert crypto_utils.Fernet is not None
