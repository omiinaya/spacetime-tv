"""Spacetime-TV configuration — environment, paths, constants."""

import json
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Load .env from server directory
_env_path = Path(__file__).parent / ".env"
load_dotenv(_env_path)

# IPTV provider — legacy single-provider env vars (kept for backward compat)
IPTV_BASE = os.getenv("IPTV_BASE", "")
IPTV_USER = os.getenv("IPTV_USER", "")
IPTV_PASS = os.getenv("IPTV_PASS", "")

# ── Multi-provider support ──────────────────────────────────────────────
# Set PROVIDERS_JSON env var for multiple Xtream accounts.
# Each entry: {"name":"Provider1","base_url":"...","username":"...","password":"...","enabled":true}
# Falls back to single-provider IPTV_BASE/IPTV_USER/IPTV_PASS for backward compat.


@dataclass
class ProviderConfig:
    """Configuration for a single IPTV Xtream provider."""

    name: str
    base_url: str
    username: str
    password: str
    enabled: bool = True
    order: int = 0  # lower = higher priority for failover


# Credential encryption at rest
# Set ENCRYPT_CREDENTIALS=false to disable Fernet encryption of stored IPTV passwords
ENCRYPT_CREDENTIALS = os.getenv("ENCRYPT_CREDENTIALS", "true").lower() == "true"
# Encryption key override (auto-generated if not set, stored in DATA_DIR/.encrypt_key)
STV_ENCRYPT_KEY = os.getenv("STV_ENCRYPT_KEY", "")


# ── Credential encryption helper ───────────────────────────────────────
def _maybe_encrypt(pwd: str) -> str:
    """Encrypt password if encryption is enabled and not already encrypted."""
    if not pwd or pwd.startswith("enc:"):
        return pwd
    if ENCRYPT_CREDENTIALS:
        try:
            from crypto_utils import encrypt as _enc

            return _enc(pwd)
        except (ImportError, OSError, ValueError, TypeError):
            pass  # fallback to plaintext if crypto unavailable
    return pwd


_PROVIDERS_ENV = os.getenv("PROVIDERS_JSON", "")
if _PROVIDERS_ENV:
    try:
        raw = json.loads(_PROVIDERS_ENV)
        PROVIDERS = []
        for i, p in enumerate(raw):
            PROVIDERS.append(
                ProviderConfig(
                    name=p.get("name", f"Provider {i + 1}"),
                    base_url=p["base_url"],
                    username=p["username"],
                    password=_maybe_encrypt(p["password"]),
                    enabled=p.get("enabled", True),
                    order=p.get("order", i),
                )
            )
        PROVIDERS.sort(key=lambda x: x.order)
    except (json.JSONDecodeError, TypeError, KeyError) as e:
        import logging

        logging.getLogger("spacetime-tv").error(f"Invalid PROVIDERS_JSON: {e}")
        PROVIDERS = []
else:
    # Legacy single-provider support — create a default provider
    PROVIDERS = (
        [
            ProviderConfig(
                name="Default",
                base_url=IPTV_BASE,
                username=IPTV_USER,
                password=_maybe_encrypt(IPTV_PASS),
                enabled=bool(IPTV_BASE),
                order=0,
            )
        ]
        if IPTV_BASE
        else []
    )

# EPG
EPG_CACHE_FILE = Path(os.getenv("EPG_CACHE_FILE", str(Path(__file__).parent / "epg_cache.json")))
EPG_CACHE_TTL = int(os.getenv("EPG_CACHE_TTL", "3600"))  # 1 hour default

# Paths
ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR_env = os.getenv("STATIC_DIR")
if STATIC_DIR_env:
    STATIC_DIR = Path(STATIC_DIR_env)
else:
    STATIC_DIR = ROOT / "web" / "dist"

# TMDB v3 API (optional — enriches metadata when set)
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
TMDB_BASE = os.getenv("TMDB_BASE", "https://api.themoviedb.org/3")

# User-Agent for requests (configurable to avoid blocking)
UA_STR = os.getenv(
    "UA_STR", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Admin authentication (set ADMIN_API_KEY in .env)
# Auto-generates a random key if not set — logs it on first startup.
# Set ADMIN_API_KEY in .env to disable auto-generation and use a known key.
import secrets as _secrets

_AUTO_GEN_KEY: str | None = None
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "")
if not ADMIN_API_KEY:
    _AUTO_GEN_KEY = _secrets.token_hex(32)
    ADMIN_API_KEY = _AUTO_GEN_KEY

# Request body size limits (bytes)
MAX_REQUEST_BODY = int(os.getenv("MAX_REQUEST_BODY", "1048576"))  # 1 MB default for POST bodies
MAX_FILE_UPLOAD = int(os.getenv("MAX_FILE_UPLOAD", "52428800"))  # 50 MB for file uploads

# Path to tmdb-enrich CLI (browserless SSR extraction from themoviedb.org)
# No API key required — uses HTML scraping from TMDB's own pages
# Must be set via TMDB_ENRICH_PATH env var (no fallback)
TMDB_ENRICH_PATH = os.getenv("TMDB_ENRICH_PATH")

# CORS — restrict to known origins instead of wide-open *
# Comma-separated list — overridable via env var
DEFAULT_CORS_ORIGINS = (
    "http://localhost:5180,http://127.0.0.1:5180,"
    "http://localhost:8720,http://127.0.0.1:8720,"
    "http://localhost:8722,http://127.0.0.1:8722,"
    "https://localhost:5180,https://127.0.0.1:5180,"
    "https://localhost:8720,https://127.0.0.1:8720,"
    "https://localhost:8722,https://127.0.0.1:8722"
)
CORS_ORIGINS = os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")

# HTTPS enforcement
# Set to "true" to redirect all HTTP to HTTPS
ENFORCE_HTTPS = os.getenv("ENFORCE_HTTPS", "true").lower() == "true"

# Rate limiting (env-configurable)
RATE_WINDOW = int(os.getenv("RATE_WINDOW", "60"))  # seconds
RATE_SEARCH_LIMIT = int(os.getenv("RATE_SEARCH_LIMIT", "100"))  # requests per window for search/proxy
RATE_DEFAULT_LIMIT = int(os.getenv("RATE_DEFAULT_LIMIT", "1000"))  # requests per window for everything else


# Data directory — persistent store for all runtime data.
# Defaults to server/data/ beside config.py. Override via STV_DATA_DIR env var.
DATA_DIR = Path(os.getenv("STV_DATA_DIR", Path(__file__).parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Cache directory for transcoded files, image cache, etc.
CACHE_DIR = DATA_DIR / "cache"

# ── Provider persistence ───────────────────────────────────────────────────
# Providers can be persisted to a JSON file for runtime add/remove/modify.
# The providers.json file takes precedence over env var config when present.
try:
    PROVIDERS_FILE = DATA_DIR / "providers.json"
except NameError:
    PROVIDERS_FILE = None


def _load_providers_from_file() -> list | None:
    """Load providers from persistent file if it exists and is valid."""
    try:
        path = PROVIDERS_FILE
    except NameError:
        return None
    if not path or not path.exists():
        return None
    try:
        with open(path) as f:
            raw = json.load(f)
        providers = []
        for i, p in enumerate(raw):
            providers.append(
                ProviderConfig(
                    name=p.get("name", f"Provider {i + 1}"),
                    base_url=p["base_url"],
                    username=p["username"],
                    password=p.get("password", ""),
                    enabled=p.get("enabled", True),
                    order=p.get("order", i),
                )
            )
        providers.sort(key=lambda x: x.order)
        return providers
    except (json.JSONDecodeError, TypeError, KeyError, OSError) as e:
        import logging
        logging.getLogger("spacetime-tv").warning(f"Failed to load PROVIDERS_FILE: {e}")
        return None


def _save_providers_to_file(providers: list) -> None:
    """Save current providers to persistent file."""
    try:
        path = PROVIDERS_FILE
    except NameError:
        return
    if not path:
        return
    try:
        data = []
        for i, p in enumerate(providers):
            data.append({
                "name": p.name,
                "base_url": p.base_url,
                "username": p.username,
                "password": p.password if not p.password.startswith("enc:") else f"enc:{p.password[4:]}",
                "enabled": p.enabled,
                "order": p.order if hasattr(p, "order") else i,
            })
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
    except (OSError, TypeError) as e:
        import logging
        logging.getLogger("spacetime-tv").warning(f"Failed to save PROVIDERS_FILE: {e}")


# Override PROVIDERS with file-based config if available
try:
    _file_providers = _load_providers_from_file()
    if _file_providers is not None:
        PROVIDERS = _file_providers
except NameError:
    pass
