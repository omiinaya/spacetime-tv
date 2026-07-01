"""Spacetime-TV configuration — environment, paths, constants."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from server directory
_env_path = Path(__file__).parent / ".env"
load_dotenv(_env_path)

# IPTV provider
IPTV_BASE = os.getenv("IPTV_BASE", "http://iptv-provider.example.com")
IPTV_USER = os.getenv("IPTV_USER", "")
IPTV_PASS = os.getenv("IPTV_PASS", "")

# EPG
EPG_CACHE_FILE = Path(__file__).parent / "epg_cache.json"
EPG_CACHE_TTL = int(os.getenv("EPG_CACHE_TTL", "3600"))  # 1 hour default

# Paths
ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "web" / "dist"

# TMDB v3 API (optional — enriches metadata when set)
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
TMDB_BASE = "https://api.themoviedb.org/3"

# User-Agent for requests
UA_STR = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

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
MAX_FILE_UPLOAD = int(os.getenv("MAX_FILE_UPLOAD", "52428800"))   # 50 MB for file uploads

# Path to tmdb-enrich CLI (browserless SSR extraction from themoviedb.org)
# No API key required — uses HTML scraping from TMDB's own pages
TMDB_ENRICH_PATH = os.getenv(
    "TMDB_ENRICH_PATH",
    "/home/user/.local/share/hermes-cli-tools-venv/bin/tmdb-enrich",
)

# CORS — restrict to known origins instead of wide-open *
# Comma-separated list — overridable via env var
DEFAULT_CORS_ORIGINS = (
    "http://localhost:5180,http://127.0.0.1:5180,"
    "http://localhost:8720,http://127.0.0.1:8720,"
    "http://localhost:8722,http://127.0.0.1:8722,"
    "http://192.0.2.10:8720,http://192.0.2.10:8722"
)
CORS_ORIGINS = os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")

# Rate limiting
RATE_WINDOW = 60  # 1 minute window
RATE_SEARCH_LIMIT = 100     # requests per window for search/proxy
RATE_DEFAULT_LIMIT = 1000   # requests per window for everything else
