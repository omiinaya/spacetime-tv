"""Credentials encryption at rest using Fernet symmetric encryption."""

import base64
import binascii
import logging
import os
from pathlib import Path

try:
    from cryptography.fernet import Fernet, InvalidToken
except ImportError:
    Fernet = None
    InvalidToken = None
log = logging.getLogger("spacetime-tv")
_KEY_FILE = None
_cipher = None


def _get_or_create_key():
    global _KEY_FILE
    env_key = os.getenv("STV_ENCRYPT_KEY", "")
    if env_key:
        try:
            if len(env_key) == 44 and env_key.endswith("="):
                return env_key.encode("ascii")
            key_bytes = bytes.fromhex(env_key)
            return base64.urlsafe_b64encode(key_bytes)
        except (ValueError, binascii.Error):
            log.warning("Invalid STV_ENCRYPT_KEY format")
    # Use STV_DATA_DIR env var or default to server/data/
    _data_dir = os.getenv("STV_DATA_DIR", "")
    if not _data_dir:
        _data_dir = str(Path(__file__).resolve().parent / "data")
    _KEY_FILE = Path(_data_dir) / ".encrypt_key"
    if _KEY_FILE.exists():
        try:
            key_data = _KEY_FILE.read_bytes().strip()
            if len(key_data) == 44:
                return key_data
        except OSError:
            pass
    from cryptography.fernet import Fernet

    new_key = Fernet.generate_key()
    try:
        _KEY_FILE.write_bytes(new_key)
        _KEY_FILE.chmod(0o600)
        log.info(f"Generated new encryption key at {_KEY_FILE}")
    except OSError as e:
        log.warning(f"Could not persist encryption key: {e}")
    return new_key


def get_cipher():
    global _cipher
    if _cipher is None:
        if Fernet is None:
            raise ImportError("cryptography package required")
        key = _get_or_create_key()
        _cipher = Fernet(key)
    return _cipher


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    cipher = get_cipher()
    token = cipher.encrypt(plaintext.encode("utf-8"))
    return "enc:" + token.decode("utf-8")


def decrypt(encrypted: str) -> str:
    if not encrypted:
        return ""
    if not encrypted.startswith("enc:"):
        return encrypted
    try:
        cipher = get_cipher()
        token = encrypted[4:].encode("utf-8")
        return cipher.decrypt(token).decode("utf-8")
    except (InvalidToken, TypeError, ValueError) as e:
        log.error(f"Decryption failed: {e}")
        return ""


def is_encrypted(value: str) -> bool:
    return bool(value and value.startswith("enc:"))


def encrypt_provider_password(provider: dict) -> dict:
    provider = dict(provider)
    if provider.get("password") and not is_encrypted(provider["password"]):
        provider["password"] = encrypt(provider["password"])
    return provider


def decrypt_provider_password(provider: dict) -> dict:
    provider = dict(provider)
    if provider.get("password") and is_encrypted(provider["password"]):
        provider["password"] = decrypt(provider["password"])
    return provider
