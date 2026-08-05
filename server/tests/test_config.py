"""Tests for server/config.py — module constants, ProviderConfig, env var parsing, persistence.

Tests the config module which reads env vars at import time.  We use
``importlib.reload()`` + ``monkeypatch`` to control which env vars are visible
for each test scenario, then verify the resulting module-level state.
"""

import importlib
import json
import os as _os
from unittest.mock import patch

import pytest

# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _reload_config(monkeypatch, setenv=None, delenv=None):
    """Apply *setenv* (dict) and/or *delenv* (list), then reload ``config``.

    Returns the reloaded module.  monkeypatch undoes env changes after the
    calling test function finishes.
    """
    import config as cfg

    for key, value in (setenv or {}).items():
        monkeypatch.setenv(key, value)
    for key in delenv or []:
        monkeypatch.delenv(key, raising=False)
    # Prevent load_dotenv from re-reading .env during reload, which would
    # overwrite our monkeypatched env vars.
    import dotenv

    monkeypatch.setattr(dotenv, "load_dotenv", lambda _path=None, **kw: None)
    importlib.reload(cfg)
    return cfg


# ═══════════════════════════════════════════════════════════════════════════════
# Cross-module isolation
# ═══════════════════════════════════════════════════════════════════════════════
# Every test in this module reloads ``config`` with monkeypatched env vars.
# monkeypatch restores the *env vars* afterwards, but the reloaded module
# keeps the last scenario's state — e.g. config.PROVIDERS left pointing at
# "env.tv" providers. Without restoring the module, every later test file
# that reads config.PROVIDERS (iptv_client.get_active_provider, admin routes,
# stream URL builders, ...) sees the polluted list and fails.
#
# The autouse fixture below snapshots the baseline env at import time (after
# conftest set the test env) and re-applies it + reloads config after each
# test, so the module is pristine for the next test.

_BASELINE_ENV = {
    key: _os.environ.get(key)
    for key in (
        "IPTV_BASE",
        "IPTV_USER",
        "IPTV_PASS",
        "PROVIDERS_JSON",
        "ENCRYPT_CREDENTIALS",
        "ADMIN_API_KEY",
        "TMDB_API_KEY",
        "TMDB_BASE",
        "STV_DATA_DIR",
        "CACHE_WARM_ENABLED",
        "CACHE_TTL_HOURS",
        "CLEANUP_INTERVAL",
        "EPG_CACHE_FILE",
        "ENFORCE_HTTPS",
    )
}


@pytest.fixture(autouse=True)
def _restore_config_module():
    """Restore ``config`` to the baseline state after each test.

    Re-applies the original test env vars and reloads the module, undoing
    whatever scenario a test left it in. load_dotenv is stubbed so the real
    server/.env never leaks into the reload.
    """
    yield

    import config as cfg

    for key, value in _BASELINE_ENV.items():
        if value is None:
            _os.environ.pop(key, None)
        else:
            _os.environ[key] = value
    with patch("dotenv.load_dotenv", lambda _path=None, **kw: None):
        importlib.reload(cfg)


# ═══════════════════════════════════════════════════════════════════════════════
# 1.  ProviderConfig dataclass
# ═══════════════════════════════════════════════════════════════════════════════


class TestProviderConfig:
    """ProviderConfig creation with all fields, defaults, and mutation."""

    def test_minimal_creation(self):
        from config import ProviderConfig

        pc = ProviderConfig(
            name="Test Provider",
            base_url="http://example.com",
            username="test_user",
            password="test_pass",
        )
        assert pc.name == "Test Provider"
        assert pc.base_url == "http://example.com"
        assert pc.username == "test_user"
        assert pc.password == "test_pass"
        assert pc.enabled is True
        assert pc.order == 0

    def test_all_fields_explicit(self):
        from config import ProviderConfig

        pc = ProviderConfig(
            name="Custom",
            base_url="http://custom.tv",
            username="admin",
            password="s3kr1t",
            enabled=False,
            order=5,
        )
        assert pc.name == "Custom"
        assert pc.base_url == "http://custom.tv"
        assert pc.username == "admin"
        assert pc.password == "s3kr1t"
        assert pc.enabled is False
        assert pc.order == 5

    def test_default_enabled_is_true(self):
        from config import ProviderConfig

        pc = ProviderConfig(name="X", base_url="http://x.tv", username="u", password="p")
        assert pc.enabled is True

    def test_default_order_is_zero(self):
        from config import ProviderConfig

        pc = ProviderConfig(name="X", base_url="http://x.tv", username="u", password="p")
        assert pc.order == 0

    def test_mutable_fields(self):
        """ProviderConfig is a regular dataclass – fields can be reassigned."""
        from config import ProviderConfig

        pc = ProviderConfig(name="X", base_url="http://x.tv", username="u", password="p")
        pc.enabled = False
        pc.order = 99
        assert pc.enabled is False
        assert pc.order == 99
        assert pc.base_url == "http://x.tv"


# ═══════════════════════════════════════════════════════════════════════════════
# 2.  PROVIDERS from PROVIDERS_JSON env var
# ═══════════════════════════════════════════════════════════════════════════════


class TestProvidersFromJson:
    """PROVIDERS list built from PROVIDERS_JSON (disables encryption for clarity)."""

    @staticmethod
    def _reload(monkeypatch, data):
        return _reload_config(
            monkeypatch,
            setenv={
                "PROVIDERS_JSON": json.dumps(data) if isinstance(data, list) else data,
                "ENCRYPT_CREDENTIALS": "false",
            },
        )

    def test_valid_json_providers(self, monkeypatch):
        cfg = self._reload(
            monkeypatch,
            [
                {
                    "name": "Fast",
                    "base_url": "http://fast.tv",
                    "username": "u1",
                    "password": "p1",
                    "enabled": True,
                    "order": 1,
                },
                {
                    "name": "Slow",
                    "base_url": "http://slow.tv",
                    "username": "u2",
                    "password": "p2",
                    "enabled": False,
                    "order": 2,
                },
            ],
        )
        assert len(cfg.PROVIDERS) == 2
        assert cfg.PROVIDERS[0].name == "Fast"
        assert cfg.PROVIDERS[0].base_url == "http://fast.tv"
        assert cfg.PROVIDERS[0].enabled is True
        assert cfg.PROVIDERS[0].order == 1
        assert cfg.PROVIDERS[1].name == "Slow"
        assert cfg.PROVIDERS[1].enabled is False
        assert cfg.PROVIDERS[1].order == 2

    def test_sorted_by_order(self, monkeypatch):
        cfg = self._reload(
            monkeypatch,
            [
                {
                    "name": "Z",
                    "base_url": "http://z.tv",
                    "username": "u",
                    "password": "p",
                    "order": 5,
                },
                {
                    "name": "A",
                    "base_url": "http://a.tv",
                    "username": "u",
                    "password": "p",
                    "order": 1,
                },
            ],
        )
        assert cfg.PROVIDERS[0].name == "A"
        assert cfg.PROVIDERS[1].name == "Z"

    def test_default_order_is_index(self, monkeypatch):
        """Providers without an explicit order get their list index."""
        cfg = self._reload(
            monkeypatch,
            [
                {"name": "First", "base_url": "http://a.tv", "username": "u", "password": "p"},
                {"name": "Second", "base_url": "http://b.tv", "username": "u", "password": "p"},
            ],
        )
        assert cfg.PROVIDERS[0].order == 0
        assert cfg.PROVIDERS[1].order == 1

    def test_auto_name_fallback(self, monkeypatch):
        """Entries without 'name' get a generated 'Provider N' name."""
        cfg = self._reload(
            monkeypatch,
            [
                {"base_url": "http://a.tv", "username": "u", "password": "p"},
                {"base_url": "http://b.tv", "username": "u", "password": "p"},
            ],
        )
        assert cfg.PROVIDERS[0].name == "Provider 1"
        assert cfg.PROVIDERS[1].name == "Provider 2"

    def test_invalid_json_falls_back_to_empty_list(self, monkeypatch):
        cfg = self._reload(monkeypatch, "not valid json at all")
        assert cfg.PROVIDERS == []

    def test_missing_required_field_falls_back_to_empty(self, monkeypatch):
        """Missing 'base_url' or 'username' triggers KeyError → empty list."""
        cfg = self._reload(monkeypatch, [{"name": "Incomplete"}])
        assert cfg.PROVIDERS == []

    def test_empty_array_gives_empty_list(self, monkeypatch):
        cfg = self._reload(monkeypatch, [])
        assert cfg.PROVIDERS == []

    def test_default_enabled_when_not_in_json(self, monkeypatch):
        """If 'enabled' is absent, the provider is enabled by default."""
        cfg = self._reload(
            monkeypatch,
            [{"name": "P", "base_url": "http://p.tv", "username": "u", "password": "p"}],
        )
        assert cfg.PROVIDERS[0].enabled is True

    def test_password_runs_through_maybe_encrypt(self, monkeypatch):
        """Password is passed through _maybe_encrypt when building from JSON."""
        cfg = _reload_config(
            monkeypatch,
            setenv={
                "PROVIDERS_JSON": json.dumps(
                    [
                        {
                            "base_url": "http://tv.tv",
                            "username": "u",
                            "password": "plain_pass",
                        }
                    ]
                ),
                "ENCRYPT_CREDENTIALS": "true",
            },
        )
        # With ENCRYPT_CREDENTIALS=true, the password should have been encrypted.
        # We mock crypto_utils.encrypt to avoid real Fernet dependency.
        with patch("crypto_utils.encrypt", return_value="enc:mocked_token") as mock_enc:
            importlib.reload(cfg)
            assert cfg.PROVIDERS[0].password == "enc:mocked_token"
            mock_enc.assert_called_once_with("plain_pass")


# ═══════════════════════════════════════════════════════════════════════════════
# 3.  PROVIDERS from legacy IPTV_BASE / IPTV_USER / IPTV_PASS
# ═══════════════════════════════════════════════════════════════════════════════


class TestProvidersFromLegacy:
    """Legacy single-provider path when PROVIDERS_JSON is absent."""

    def test_legacy_vars_create_single_provider(self, monkeypatch):
        cfg = _reload_config(
            monkeypatch,
            setenv={
                "PROVIDERS_JSON": "",  # explicitly clear
                "IPTV_BASE": "http://legacy.tv",
                "IPTV_USER": "legacy_user",
                "IPTV_PASS": "legacy_pass",
                "ENCRYPT_CREDENTIALS": "false",
            },
        )
        assert len(cfg.PROVIDERS) == 1
        p = cfg.PROVIDERS[0]
        assert p.name == "Default"
        assert p.base_url == "http://legacy.tv"
        assert p.username == "legacy_user"
        assert p.password == "legacy_pass"
        assert p.enabled is True
        assert p.order == 0

    def test_empty_ip_tv_base_gives_no_provider(self, monkeypatch):
        cfg = _reload_config(
            monkeypatch,
            setenv={
                "PROVIDERS_JSON": "",
                "IPTV_BASE": "",
                "IPTV_USER": "some_user",
                "IPTV_PASS": "some_pass",
                "ENCRYPT_CREDENTIALS": "false",
            },
        )
        assert cfg.PROVIDERS == []

    def test_all_empty_legacy_vars_gives_no_provider(self, monkeypatch):
        cfg = _reload_config(
            monkeypatch,
            setenv={
                "PROVIDERS_JSON": "",
                "IPTV_BASE": "",
                "IPTV_USER": "",
                "IPTV_PASS": "",
                "ENCRYPT_CREDENTIALS": "false",
            },
        )
        assert cfg.PROVIDERS == []

    def test_providers_json_takes_precedence_over_legacy(self, monkeypatch):
        """When PROVIDERS_JSON is non-empty, legacy IPTV_BASE is ignored."""
        cfg = _reload_config(
            monkeypatch,
            setenv={
                "PROVIDERS_JSON": json.dumps(
                    [
                        {
                            "name": "FromJson",
                            "base_url": "http://json.tv",
                            "username": "ju",
                            "password": "jp",
                        }
                    ]
                ),
                "IPTV_BASE": "http://legacy.tv",
                "IPTV_USER": "legacy_user",
                "IPTV_PASS": "legacy_pass",
                "ENCRYPT_CREDENTIALS": "false",
            },
        )
        assert len(cfg.PROVIDERS) == 1
        assert cfg.PROVIDERS[0].base_url == "http://json.tv"
        assert cfg.PROVIDERS[0].name == "FromJson"

    def test_legacy_disabled_when_no_base(self, monkeypatch):
        """Legacy provider has enabled=False when IPTV_BASE is empty."""
        cfg = _reload_config(
            monkeypatch,
            setenv={
                "PROVIDERS_JSON": "",
                "IPTV_BASE": "",
                "IPTV_USER": "user",
                "IPTV_PASS": "pass",
                "ENCRYPT_CREDENTIALS": "false",
            },
        )
        assert cfg.PROVIDERS == []


# ═══════════════════════════════════════════════════════════════════════════════
# 4.  _maybe_encrypt()
# ═══════════════════════════════════════════════════════════════════════════════


class TestMaybeEncrypt:
    """_maybe_encrypt() with encryption enabled/disabled and edge cases."""

    def test_disabled_returns_plaintext(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"ENCRYPT_CREDENTIALS": "false"})
        assert cfg._maybe_encrypt("my_password") == "my_password"

    def test_enabled_calls_encrypt_and_prefixes(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"ENCRYPT_CREDENTIALS": "true"})
        with patch("crypto_utils.encrypt", return_value="enc:encrypted_token") as mock_enc:
            result = cfg._maybe_encrypt("my_password")
            assert result == "enc:encrypted_token"
            mock_enc.assert_called_once_with("my_password")

    def test_skips_empty_string(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"ENCRYPT_CREDENTIALS": "true"})
        with patch("crypto_utils.encrypt") as mock_enc:
            assert cfg._maybe_encrypt("") == ""
            mock_enc.assert_not_called()

    def test_skips_already_encrypted(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"ENCRYPT_CREDENTIALS": "true"})
        with patch("crypto_utils.encrypt") as mock_enc:
            assert cfg._maybe_encrypt("enc:token123") == "enc:token123"
            mock_enc.assert_not_called()

    def test_import_error_falls_back_to_plaintext(self, monkeypatch):
        """If crypto_utils can't be imported, return the original password."""
        cfg = _reload_config(monkeypatch, setenv={"ENCRYPT_CREDENTIALS": "true"})
        with patch("crypto_utils.encrypt", side_effect=ImportError("no crypto package")):
            result = cfg._maybe_encrypt("my_password")
            assert result == "my_password"

    def test_os_error_falls_back_to_plaintext(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"ENCRYPT_CREDENTIALS": "true"})
        with patch("crypto_utils.encrypt", side_effect=OSError("permission denied")):
            result = cfg._maybe_encrypt("my_password")
            assert result == "my_password"

    def test_value_error_falls_back_to_plaintext(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"ENCRYPT_CREDENTIALS": "true"})
        with patch("crypto_utils.encrypt", side_effect=ValueError("bad value")):
            result = cfg._maybe_encrypt("my_password")
            assert result == "my_password"


# ═══════════════════════════════════════════════════════════════════════════════
# 5.  _load_providers_from_file()
# ═══════════════════════════════════════════════════════════════════════════════


class TestLoadProvidersFromFile:
    """_load_providers_from_file() with valid, invalid, and missing files."""

    @pytest.fixture
    def cfg(self):
        import config as cfg

        return cfg

    def test_missing_file_returns_none(self, cfg, tmp_path):
        cfg.PROVIDERS_FILE = tmp_path / "nonexistent.json"
        assert cfg._load_providers_from_file() is None

    def test_valid_file(self, cfg, tmp_path):
        f = tmp_path / "providers.json"
        f.write_text(
            json.dumps(
                [
                    {
                        "name": "FileProv",
                        "base_url": "http://file.tv",
                        "username": "fu",
                        "password": "fp",
                    }
                ]
            )
        )
        cfg.PROVIDERS_FILE = f
        result = cfg._load_providers_from_file()
        assert result is not None
        assert len(result) == 1
        assert result[0].name == "FileProv"
        assert result[0].base_url == "http://file.tv"
        assert result[0].username == "fu"
        assert result[0].password == "fp"
        assert result[0].enabled is True
        assert result[0].order == 0

    def test_invalid_json_returns_none(self, cfg, tmp_path):
        f = tmp_path / "providers.json"
        f.write_text("this is not valid json")
        cfg.PROVIDERS_FILE = f
        assert cfg._load_providers_from_file() is None

    def test_missing_required_field_returns_none(self, cfg, tmp_path):
        """Missing 'base_url' triggers KeyError → returns None."""
        f = tmp_path / "providers.json"
        f.write_text(json.dumps([{"name": "Incomplete"}]))
        cfg.PROVIDERS_FILE = f
        assert cfg._load_providers_from_file() is None

    def test_empty_json_array_returns_empty_list(self, cfg, tmp_path):
        f = tmp_path / "providers.json"
        f.write_text("[]")
        cfg.PROVIDERS_FILE = f
        result = cfg._load_providers_from_file()
        assert result is not None
        assert result == []

    def test_sorted_by_order(self, cfg, tmp_path):
        f = tmp_path / "providers.json"
        f.write_text(
            json.dumps(
                [
                    {
                        "name": "B",
                        "base_url": "http://b.tv",
                        "username": "u",
                        "password": "p",
                        "order": 2,
                    },
                    {
                        "name": "A",
                        "base_url": "http://a.tv",
                        "username": "u",
                        "password": "p",
                        "order": 1,
                    },
                ]
            )
        )
        cfg.PROVIDERS_FILE = f
        result = cfg._load_providers_from_file()
        assert result[0].name == "A"
        assert result[1].name == "B"

    def test_default_order_is_index(self, cfg, tmp_path):
        """Providers without an explicit 'order' field get their list index."""
        f = tmp_path / "providers.json"
        f.write_text(
            json.dumps(
                [
                    {"name": "A", "base_url": "http://a.tv", "username": "u", "password": "p"},
                    {"name": "B", "base_url": "http://b.tv", "username": "u", "password": "p"},
                ]
            )
        )
        cfg.PROVIDERS_FILE = f
        result = cfg._load_providers_from_file()
        assert result[0].order == 0
        assert result[1].order == 1

    def test_auto_name_fallback(self, cfg, tmp_path):
        """Entries without 'name' get a generated name."""
        f = tmp_path / "providers.json"
        f.write_text(
            json.dumps(
                [
                    {"base_url": "http://a.tv", "username": "u", "password": "p"},
                    {"base_url": "http://b.tv", "username": "u", "password": "p"},
                ]
            )
        )
        cfg.PROVIDERS_FILE = f
        result = cfg._load_providers_from_file()
        assert result[0].name == "Provider 1"
        assert result[1].name == "Provider 2"

    def test_default_enabled_when_absent(self, cfg, tmp_path):
        f = tmp_path / "providers.json"
        f.write_text(json.dumps([{"name": "P", "base_url": "http://p.tv", "username": "u", "password": "p"}]))
        cfg.PROVIDERS_FILE = f
        result = cfg._load_providers_from_file()
        assert result[0].enabled is True

    def test_password_defaults_to_empty_string(self, cfg, tmp_path):
        f = tmp_path / "providers.json"
        f.write_text(json.dumps([{"name": "P", "base_url": "http://p.tv", "username": "u"}]))
        cfg.PROVIDERS_FILE = f
        result = cfg._load_providers_from_file()
        assert result[0].password == ""


# ═══════════════════════════════════════════════════════════════════════════════
# 6.  _save_providers_to_file()
# ═══════════════════════════════════════════════════════════════════════════════


class TestSaveProvidersToFile:
    """_save_providers_to_file() writes correct JSON structure."""

    @pytest.fixture
    def cfg(self):
        import config as cfg

        return cfg

    @pytest.fixture
    def sample_providers(self):
        from config import ProviderConfig

        return [
            ProviderConfig(
                name="P1",
                base_url="http://p1.tv",
                username="u1",
                password="p1",
                enabled=True,
                order=0,
            ),
            ProviderConfig(
                name="P2",
                base_url="http://p2.tv",
                username="u2",
                password="p2",
                enabled=False,
                order=1,
            ),
        ]

    def test_basic_save(self, cfg, tmp_path):
        from config import ProviderConfig

        providers = [
            ProviderConfig(
                name="Prov",
                base_url="http://prov.tv",
                username="admin",
                password="secret",
            )
        ]
        dest = tmp_path / "providers.json"
        cfg.PROVIDERS_FILE = dest
        cfg._save_providers_to_file(providers)

        saved = json.loads(dest.read_text())
        assert len(saved) == 1
        assert saved[0]["name"] == "Prov"
        assert saved[0]["base_url"] == "http://prov.tv"
        assert saved[0]["username"] == "admin"
        assert saved[0]["password"] == "secret"
        assert saved[0]["enabled"] is True
        assert saved[0]["order"] == 0

    def test_save_multiple_providers(self, cfg, tmp_path, sample_providers):
        dest = tmp_path / "providers.json"
        cfg.PROVIDERS_FILE = dest
        cfg._save_providers_to_file(sample_providers)

        saved = json.loads(dest.read_text())
        assert len(saved) == 2
        assert saved[0]["name"] == "P1"
        assert saved[1]["name"] == "P2"
        assert saved[1]["enabled"] is False

    def test_save_handles_encrypted_password(self, cfg, tmp_path):
        from config import ProviderConfig

        providers = [
            ProviderConfig(
                name="Enc",
                base_url="http://enc.tv",
                username="eu",
                password="enc:already_encrypted_token",
            )
        ]
        dest = tmp_path / "providers.json"
        cfg.PROVIDERS_FILE = dest
        cfg._save_providers_to_file(providers)

        saved = json.loads(dest.read_text())
        assert saved[0]["password"] == "enc:already_encrypted_token"

    def test_save_creates_parent_directory(self, cfg, tmp_path):
        from config import ProviderConfig

        providers = [
            ProviderConfig(
                name="Deep",
                base_url="http://deep.tv",
                username="u",
                password="p",
            )
        ]
        deep_path = tmp_path / "sub" / "nested" / "providers.json"
        cfg.PROVIDERS_FILE = deep_path
        cfg._save_providers_to_file(providers)

        assert deep_path.exists()
        saved = json.loads(deep_path.read_text())
        assert len(saved) == 1

    def test_save_roundtrip(self, cfg, tmp_path):
        """Writing and re-reading should produce equivalent configs."""
        from config import ProviderConfig

        original = [
            ProviderConfig(
                name="RT",
                base_url="http://rt.tv",
                username="ru",
                password="rp",
                enabled=True,
                order=42,
            )
        ]
        dest = tmp_path / "providers.json"
        cfg.PROVIDERS_FILE = dest
        cfg._save_providers_to_file(original)

        loaded = cfg._load_providers_from_file()
        assert loaded is not None
        assert len(loaded) == 1
        assert loaded[0].name == "RT"
        assert loaded[0].base_url == "http://rt.tv"
        assert loaded[0].username == "ru"
        assert loaded[0].password == "rp"
        assert loaded[0].enabled is True
        assert loaded[0].order == 42

    def test_save_with_order_attribute(self, cfg, tmp_path):
        """Verify 'order' is persisted when it exists on the dataclass."""
        from config import ProviderConfig

        providers = [
            ProviderConfig(
                name="Ordered",
                base_url="http://o.tv",
                username="ou",
                password="op",
                order=99,
            )
        ]
        dest = tmp_path / "providers.json"
        cfg.PROVIDERS_FILE = dest
        cfg._save_providers_to_file(providers)

        saved = json.loads(dest.read_text())
        assert saved[0]["order"] == 99


class TestSaveProvidersToEnv:
    """_save_providers_to_env() writes PROVIDERS_JSON back to the .env file.

    This is the durable store: UI saves go to both providers.json AND the
    .env file so creds/endpoints survive data-dir wipes / container
    recreates.
    """

    @pytest.fixture
    def cfg(self):
        import config as cfg

        return cfg

    def test_writes_providers_json_with_plaintext_creds(self, cfg, tmp_path, monkeypatch):
        """_save_providers_to_env writes PROVIDERS_JSON with plaintext creds."""
        from config import ProviderConfig

        env_file = tmp_path / ".env"
        monkeypatch.setattr(cfg, "PROVIDERS_ENV_FILE", env_file)
        providers = [
            ProviderConfig(
                name="P1",
                base_url="http://p1.live",
                username="u1",
                password="pw1",
                enabled=True,
                order=0,
            ),
            ProviderConfig(
                name="P2",
                base_url="http://p2.live",
                username="u2",
                password="pw2",
                enabled=False,
                order=1,
            ),
        ]
        cfg._save_providers_to_env(providers)

        text = env_file.read_text()
        assert "PROVIDERS_JSON=" in text
        line = [ln for ln in text.splitlines() if ln.startswith("PROVIDERS_JSON=")][0]
        data = json.loads(line.split("=", 1)[1])
        assert len(data) == 2
        assert data[0]["name"] == "P1"
        assert data[0]["base_url"] == "http://p1.live"
        assert data[0]["username"] == "u1"
        assert data[0]["password"] == "pw1"  # plaintext in env (durable store)
        assert data[1]["enabled"] is False

    def test_preserves_other_env_lines(self, cfg, tmp_path, monkeypatch):
        """_save_providers_to_env keeps unrelated .env lines intact."""
        from config import ProviderConfig

        env_file = tmp_path / ".env"
        env_file.write_text("TMDB_API_KEY=abc\nIPTV_BASE=http://old.live\n")
        monkeypatch.setattr(cfg, "PROVIDERS_ENV_FILE", env_file)
        providers = [
            ProviderConfig(
                name="P1",
                base_url="http://p1.live",
                username="u1",
                password="pw1",
                enabled=True,
                order=0,
            )
        ]
        cfg._save_providers_to_env(providers)

        text = env_file.read_text()
        assert "TMDB_API_KEY=abc" in text
        assert "IPTV_BASE=http://old.live" in text
        assert "PROVIDERS_JSON=" in text

    def test_replaces_existing_line(self, cfg, tmp_path, monkeypatch):
        """_save_providers_to_env replaces an existing PROVIDERS_JSON line."""
        from config import ProviderConfig

        env_file = tmp_path / ".env"
        env_file.write_text('PROVIDERS_JSON=[{"name":"Old"}]\nOTHER=1\n')
        monkeypatch.setattr(cfg, "PROVIDERS_ENV_FILE", env_file)
        providers = [
            ProviderConfig(
                name="New",
                base_url="http://new.live",
                username="u",
                password="p",
                enabled=True,
                order=0,
            )
        ]
        cfg._save_providers_to_env(providers)

        text = env_file.read_text()
        assert text.count("PROVIDERS_JSON=") == 1  # replaced, not duplicated
        assert "OTHER=1" in text
        assert "New" in text and "Old" not in text

    def test_decrypts_enc_password_before_env_write(self, cfg, tmp_path, monkeypatch):
        """enc: passwords are decrypted before writing to env."""
        from config import ProviderConfig

        env_file = tmp_path / ".env"
        monkeypatch.setattr(cfg, "PROVIDERS_ENV_FILE", env_file)
        providers = [
            ProviderConfig(
                name="P1",
                base_url="http://p1.live",
                username="u1",
                password="enc:not-a-real-token",
                enabled=True,
                order=0,
            )
        ]
        cfg._save_providers_to_env(providers)
        text = env_file.read_text()
        # decryption failed (bogus token) → keep enc: form, never crash
        assert "enc:not-a-real-token" in text

    def test_persist_writes_both_file_and_env(self, cfg, tmp_path, monkeypatch):
        """_persist_providers writes to BOTH providers.json AND the .env file."""
        from config import ProviderConfig

        data_dir = tmp_path / "data"
        env_file = tmp_path / ".env"
        monkeypatch.setattr(cfg, "PROVIDERS_FILE", data_dir / "providers.json")
        monkeypatch.setattr(cfg, "PROVIDERS_ENV_FILE", env_file)
        providers = [
            ProviderConfig(
                name="P1",
                base_url="http://p1.live",
                username="u1",
                password="pw1",
                enabled=True,
                order=0,
            )
        ]
        cfg._persist_providers(providers)

        assert (data_dir / "providers.json").exists()
        assert "PROVIDERS_JSON=" in env_file.read_text()


# ═══════════════════════════════════════════════════════════════════════════════
# 7.  ADMIN_API_KEY — auto-generation vs. user-supplied
# ═══════════════════════════════════════════════════════════════════════════════


class TestAdminApiKey:
    """ADMIN_API_KEY auto-generates when not set; uses env var when provided."""

    def test_auto_generates_when_not_set(self, monkeypatch):
        """When ADMIN_API_KEY is empty, a 64-char hex key is generated."""
        cfg = _reload_config(monkeypatch, setenv={"ADMIN_API_KEY": ""}, delenv=["ADMIN_API_KEY"])
        assert cfg.ADMIN_API_KEY
        assert len(cfg.ADMIN_API_KEY) == 64  # token_hex(32) → 64 hex chars

    def test_uses_env_var_when_set(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"ADMIN_API_KEY": "my-static-admin-key"})
        assert cfg.ADMIN_API_KEY == "my-static-admin-key"

    def test_auto_key_is_random(self, monkeypatch):
        """Two reloads without ADMIN_API_KEY should produce different keys."""
        cfg1 = _reload_config(monkeypatch, setenv={"ADMIN_API_KEY": ""}, delenv=["ADMIN_API_KEY"])
        key1 = cfg1.ADMIN_API_KEY
        cfg2 = _reload_config(monkeypatch, setenv={"ADMIN_API_KEY": ""}, delenv=["ADMIN_API_KEY"])
        key2 = cfg2.ADMIN_API_KEY
        assert key1 != key2


# ═══════════════════════════════════════════════════════════════════════════════
# 8.  Module-level constants — defaults when env vars are absent
# ═══════════════════════════════════════════════════════════════════════════════


class TestConstantsDefaults:
    """Verify module-level constant defaults when env vars are unset."""

    def test_tmdb_api_key_default_empty(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"TMDB_API_KEY": ""})
        assert cfg.TMDB_API_KEY == ""

    def test_tmdb_base_default(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"TMDB_API_KEY": ""}, delenv=["TMDB_BASE"])
        assert cfg.TMDB_BASE == "https://api.themoviedb.org/3"

    def test_user_agent_default(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["UA_STR"])
        assert "Chrome/120" in cfg.UA_STR

    def test_max_request_body_default_1mb(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["MAX_REQUEST_BODY"])
        assert cfg.MAX_REQUEST_BODY == 1048576

    def test_max_file_upload_default_50mb(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["MAX_FILE_UPLOAD"])
        assert cfg.MAX_FILE_UPLOAD == 52428800

    def test_epg_cache_ttl_default(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["EPG_CACHE_TTL"])
        assert cfg.EPG_CACHE_TTL == 3600

    def test_enforce_https_default_true(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["ENFORCE_HTTPS"])
        assert cfg.ENFORCE_HTTPS is True

    def test_rate_window_default(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["RATE_WINDOW"])
        assert cfg.RATE_WINDOW == 60

    def test_rate_search_limit_default(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["RATE_SEARCH_LIMIT"])
        assert cfg.RATE_SEARCH_LIMIT == 300

    def test_rate_default_limit_default(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["RATE_DEFAULT_LIMIT"])
        assert cfg.RATE_DEFAULT_LIMIT == 1000


# ═══════════════════════════════════════════════════════════════════════════════
# 9.  PROVIDERS_FILE path resolution
# ═══════════════════════════════════════════════════════════════════════════════


class TestProvidersFilePath:
    """PROVIDERS_FILE is always DATA_DIR / 'providers.json'."""

    def test_providers_file_is_under_data_dir(self):
        from config import DATA_DIR, PROVIDERS_FILE

        assert PROVIDERS_FILE is not None
        assert PROVIDERS_FILE == DATA_DIR / "providers.json"

    def test_providers_file_is_path_object(self):
        from config import PROVIDERS_FILE

        assert hasattr(PROVIDERS_FILE, "parent")
        assert PROVIDERS_FILE.name == "providers.json"

    def test_data_dir_default_is_relative_to_config(self, monkeypatch):
        # conftest forces STV_DATA_DIR for test isolation — reload config
        # without it to verify the TRUE default (relative to config.py).
        _reload_config(monkeypatch, delenv=["STV_DATA_DIR"])
        from config import DATA_DIR

        assert DATA_DIR.name == "data"
        assert (DATA_DIR / "providers.json").name == "providers.json"


# ═══════════════════════════════════════════════════════════════════════════════
# 10.  TMDB_ENRICH_PATH, CORS_ORIGINS, RATE_* defaults
# ═══════════════════════════════════════════════════════════════════════════════


class TestExtraDefaults:
    """TMDB_ENRICH_PATH, CORS_ORIGINS, RATE_* — default values and env-override."""

    # -- TMDB_ENRICH_PATH ----------------------------------------------------

    def test_tmdb_enrich_path_default_none(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["TMDB_ENRICH_PATH"])
        assert cfg.TMDB_ENRICH_PATH is None

    def test_tmdb_enrich_path_from_env(self, monkeypatch):
        cfg = _reload_config(
            monkeypatch,
            setenv={"TMDB_ENRICH_PATH": "/path/to/tmdb-enrich"},
        )
        assert cfg.TMDB_ENRICH_PATH == "/path/to/tmdb-enrich"

    # -- CORS_ORIGINS --------------------------------------------------------

    def test_cors_origins_default_list(self):
        from config import CORS_ORIGINS

        assert isinstance(CORS_ORIGINS, list)
        assert len(CORS_ORIGINS) > 0
        # The default list includes localhost:5180
        assert any("localhost:5180" in origin for origin in CORS_ORIGINS)
        assert any("localhost:8720" in origin for origin in CORS_ORIGINS)

    def test_cors_origins_from_env(self, monkeypatch):
        cfg = _reload_config(
            monkeypatch,
            setenv={"CORS_ORIGINS": "http://myapp.com,https://myapp.com"},
        )
        assert cfg.CORS_ORIGINS == ["http://myapp.com", "https://myapp.com"]

    def test_cors_origins_single_origin(self, monkeypatch):
        cfg = _reload_config(
            monkeypatch,
            setenv={"CORS_ORIGINS": "http://single-origin.com"},
        )
        assert cfg.CORS_ORIGINS == ["http://single-origin.com"]

    def test_cors_origins_default_has_no_lan_ip(self, monkeypatch):
        """Default CORS list must NOT contain hardcoded LAN IPs (public-safe)."""
        cfg = _reload_config(
            monkeypatch,
            delenv=["CORS_ORIGINS", "STV_HOST"],
        )
        for origin in cfg.CORS_ORIGINS:
            assert "192.168." not in origin
            assert "10." not in origin or "http://10." not in origin

    def test_stv_host_appends_origins(self, monkeypatch):
        """STV_HOST auto-appends http/https origins for the standard ports."""
        cfg = _reload_config(
            monkeypatch,
            delenv=["CORS_ORIGINS"],
            setenv={"STV_HOST": "192.168.1.50"},
        )
        joined = ",".join(cfg.CORS_ORIGINS)
        assert "http://192.168.1.50:5183" in joined
        assert "https://192.168.1.50:8722" in joined
        assert "http://192.168.1.50:8720" in joined

    def test_stv_host_empty_no_extra_origins(self, monkeypatch):
        """Without STV_HOST the default list contains no LAN-host origins."""
        cfg = _reload_config(
            monkeypatch,
            delenv=["CORS_ORIGINS", "STV_HOST"],
        )
        joined = ",".join(cfg.CORS_ORIGINS)
        assert "192.168." not in joined

    # -- RATE_* --------------------------------------------------------------

    def test_rate_window_env_override(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"RATE_WINDOW": "120"})
        assert cfg.RATE_WINDOW == 120

    def test_rate_search_limit_env_override(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"RATE_SEARCH_LIMIT": "50"})
        assert cfg.RATE_SEARCH_LIMIT == 50

    def test_rate_default_limit_env_override(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"RATE_DEFAULT_LIMIT": "500"})
        assert cfg.RATE_DEFAULT_LIMIT == 500

    # -- ENCRYPT_CREDENTIALS --------------------------------------------------

    def test_encrypt_credentials_default_true(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["ENCRYPT_CREDENTIALS"])
        assert cfg.ENCRYPT_CREDENTIALS is True

    def test_encrypt_credentials_false_from_env(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"ENCRYPT_CREDENTIALS": "false"})
        assert cfg.ENCRYPT_CREDENTIALS is False

    def test_encrypt_credentials_case_insensitive(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"ENCRYPT_CREDENTIALS": "FALSE"})
        assert cfg.ENCRYPT_CREDENTIALS is False

    # -- STV_ENCRYPT_KEY -----------------------------------------------------

    def test_encrypt_key_default_empty(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["STV_ENCRYPT_KEY"])
        assert cfg.STV_ENCRYPT_KEY == ""

    def test_encrypt_key_from_env(self, monkeypatch):
        cfg = _reload_config(
            monkeypatch,
            setenv={"STV_ENCRYPT_KEY": "my-custom-encryption-key"},
        )
        assert cfg.STV_ENCRYPT_KEY == "my-custom-encryption-key"

    # -- IPTV legacy constants -----------------------------------------------

    def test_iptv_base_default_empty(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"IPTV_BASE": ""})
        assert cfg.IPTV_BASE == ""

    def test_iptv_base_from_env(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"IPTV_BASE": "http://custom.tv"})
        assert cfg.IPTV_BASE == "http://custom.tv"

    def test_iptv_user_default_empty(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"IPTV_USER": ""})
        assert cfg.IPTV_USER == ""

    def test_iptv_pass_default_empty(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"IPTV_PASS": ""})
        assert cfg.IPTV_PASS == ""

    # -- EPG_CACHE_FILE ------------------------------------------------------

    def test_epg_cache_file_default(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["EPG_CACHE_FILE"])
        # Default is the config's directory / epg_cache.json
        assert str(cfg.EPG_CACHE_FILE).endswith("epg_cache.json")

    # -- STATIC_DIR ----------------------------------------------------------

    def test_static_dir_default(self):
        from config import ROOT, STATIC_DIR

        assert STATIC_DIR == ROOT / "web" / "dist"

    def test_static_dir_from_env(self, monkeypatch):
        cfg = _reload_config(monkeypatch, setenv={"STATIC_DIR": "/custom/static"})
        assert str(cfg.STATIC_DIR) == "/custom/static"

    # -- DATA_DIR / CACHE_DIR ------------------------------------------------

    def test_data_dir_default(self, monkeypatch):
        # conftest forces STV_DATA_DIR for test isolation — reload config
        # without it to verify the TRUE default.
        _reload_config(monkeypatch, delenv=["STV_DATA_DIR"])
        from config import DATA_DIR

        assert DATA_DIR.name == "data"
        assert DATA_DIR.exists()

    def test_cache_dir_is_under_data_dir(self):
        from config import CACHE_DIR, DATA_DIR

        assert CACHE_DIR == DATA_DIR / "cache"

    def test_data_dir_from_env(self, monkeypatch, tmp_path):
        custom_data = tmp_path / "custom_data"
        cfg = _reload_config(monkeypatch, setenv={"STV_DATA_DIR": str(custom_data)})
        assert custom_data == cfg.DATA_DIR
        assert custom_data.exists()  # mkdir called at import time
        assert custom_data / "cache" == cfg.CACHE_DIR


# ═══════════════════════════════════════════════════════════════════════════════
# 11.  EPG_CACHE_FILE env override
# ═══════════════════════════════════════════════════════════════════════════════


class TestEpgCacheFile:
    """EPG_CACHE_FILE path resolution."""

    def test_epg_cache_file_env_override(self, monkeypatch):
        cfg = _reload_config(
            monkeypatch,
            setenv={"EPG_CACHE_FILE": "/tmp/custom_epg_cache.json"},
        )
        assert str(cfg.EPG_CACHE_FILE) == "/tmp/custom_epg_cache.json"

    def test_epg_cache_file_default_path_ends_with_epg_cache_json(self, monkeypatch):
        cfg = _reload_config(monkeypatch, delenv=["EPG_CACHE_FILE"])
        assert str(cfg.EPG_CACHE_FILE).endswith("epg_cache.json")


# ═══════════════════════════════════════════════════════════════════════════════
# 12.  PROVIDERS_FILE override behavior at import time
# ═══════════════════════════════════════════════════════════════════════════════


class TestFileOverrideProvider:
    """When providers.json exists, it overrides PROVIDERS at import time."""

    def test_file_overrides_env_providers(self, monkeypatch, tmp_path):
        """Module-level PROVIDERS is replaced by file contents on import."""
        custom_data = tmp_path / "data"
        custom_data.mkdir(parents=True)
        providers_file = custom_data / "providers.json"
        providers_file.write_text(
            json.dumps(
                [
                    {
                        "name": "FromFile",
                        "base_url": "http://file-provider.tv",
                        "username": "fu",
                        "password": "fp",
                    }
                ]
            )
        )

        cfg = _reload_config(
            monkeypatch,
            setenv={
                "STV_DATA_DIR": str(custom_data),
                "PROVIDERS_JSON": json.dumps(
                    [
                        {
                            "name": "FromEnv",
                            "base_url": "http://env-provider.tv",
                            "username": "eu",
                            "password": "ep",
                        }
                    ]
                ),
                "ENCRYPT_CREDENTIALS": "false",
            },
        )
        # File takes precedence: PROVIDERS should be from file, not env
        assert len(cfg.PROVIDERS) == 1
        assert cfg.PROVIDERS[0].name == "FromFile"
        assert cfg.PROVIDERS[0].base_url == "http://file-provider.tv"

    def test_missing_file_does_not_override(self, monkeypatch, tmp_path):
        """When providers.json doesn't exist, env-based PROVIDERS is kept."""
        custom_data = tmp_path / "data_no_file"
        custom_data.mkdir(parents=True)

        cfg = _reload_config(
            monkeypatch,
            setenv={
                "STV_DATA_DIR": str(custom_data),
                "PROVIDERS_JSON": json.dumps(
                    [
                        {
                            "name": "EnvOnly",
                            "base_url": "http://env.tv",
                            "username": "eu",
                            "password": "ep",
                        }
                    ]
                ),
                "ENCRYPT_CREDENTIALS": "false",
            },
        )
        assert len(cfg.PROVIDERS) == 1
        assert cfg.PROVIDERS[0].name == "EnvOnly"


class TestProviderFileEdgeBranches:
    """Direct unit tests for _load/_save providers-file error paths."""

    def test_load_when_providers_file_unset(self, monkeypatch):
        """PROVIDERS_FILE None -> _load returns None."""
        import config
        from config import _load_providers_from_file

        monkeypatch.setattr(config, "PROVIDERS_FILE", None)
        assert _load_providers_from_file() is None

    def test_load_missing_file_returns_none(self, monkeypatch, tmp_path):
        import config
        from config import _load_providers_from_file

        monkeypatch.setattr(config, "PROVIDERS_FILE", tmp_path / "nope.json")
        assert _load_providers_from_file() is None

    def test_load_corrupted_file_logs_warning(self, monkeypatch, tmp_path, caplog):
        """Corrupt providers.json content -> warning + None."""
        import config
        from config import _load_providers_from_file

        bad = tmp_path / "providers.json"
        bad.write_text("{not valid json !!!")
        monkeypatch.setattr(config, "PROVIDERS_FILE", bad)
        with caplog.at_level("WARNING"):
            result = _load_providers_from_file()
        assert result is None
        assert "Failed to load PROVIDERS_FILE" in caplog.text

    def test_save_providers_file_unset_is_noop(self, monkeypatch):
        """PROVIDERS_FILE None -> _save returns without writing."""
        import config
        from config import PROVIDERS, _save_providers_to_file

        monkeypatch.setattr(config, "PROVIDERS_FILE", None)
        _save_providers_to_file(PROVIDERS)  # must not raise

    def test_save_oserror_logs_warning(self, monkeypatch, tmp_path, caplog):
        """OSError on save -> logged warning, no crash."""
        import config
        from config import PROVIDERS, _save_providers_to_file

        # Point at a path whose parent can't be created (file under a file)
        not_a_dir = tmp_path / "somefile"
        not_a_dir.write_text("x")
        monkeypatch.setattr(config, "PROVIDERS_FILE", not_a_dir / "providers.json")
        with caplog.at_level("WARNING"):
            _save_providers_to_file(PROVIDERS)
        assert "Failed to save PROVIDERS_FILE" in caplog.text

    def test_save_round_trips_through_file(self, monkeypatch, tmp_path):
        """Saving then loading yields equivalent provider configs."""
        import config
        from config import PROVIDERS, _load_providers_from_file, _save_providers_to_file

        dest = tmp_path / "providers.json"
        monkeypatch.setattr(config, "PROVIDERS_FILE", dest)
        _save_providers_to_file(PROVIDERS)
        loaded = _load_providers_from_file()
        assert loaded is not None
        assert [p.name for p in loaded] == [p.name for p in PROVIDERS]
