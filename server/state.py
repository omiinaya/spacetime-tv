"""Shared mutable state for Spacetime-TV backend.

Extracted from main.py to enable route decomposition into separate modules.
All module-level mutable state that routes depend on lives here.
"""
import asyncio
import json
import time
from pathlib import Path
from typing import Optional

# ── Cache Keys (single source of truth) ───────────────────────────────────
# Every cache key prefix/constant used across the codebase is defined here.
# Both the warmer (main.py) and route modules import from here to prevent
# string drift between producers and consumers.
#
# Convention:
#   CACHE_<description> = "literal_key"
#   CACHE_VOD_CAT = "vod_{id}"  — f-string templates use {id} placeholder
#
# When adding a new cache key, add it here and update both warmer + route.

CACHE_LIVE_ALL = "live_all"
CACHE_LIVE_CATS = "live_cats"
CACHE_VOD_CATEGORIES = "vod_categories"
CACHE_VOD_CAT = "vod_{id}"          # f"vod_{category_id}"
CACHE_VOD_INFO = "vod_info_{id}"    # f"vod_info_{stream_id}"
CACHE_SERIES_CATEGORIES = "series_categories"
CACHE_SERIES_CAT = "series_{id}"    # f"series_{category_id}"
CACHE_SERIES_INFO = "series_info_{id}"  # f"series_info_{series_id}"
CACHE_TMDB_ENRICH = "tmdb_enrich_{type}_{id}"  # f"tmdb_enrich_{item_type}_{tmdb_id}"

# All known cache key patterns (for coherence checks)
CACHE_KEY_PATTERNS = {
    "live_all": CACHE_LIVE_ALL,
    "live_cats": CACHE_LIVE_CATS,
    "vod_categories": CACHE_VOD_CATEGORIES,
    "vod_cat": CACHE_VOD_CAT,
    "vod_info": CACHE_VOD_INFO,
    "series_categories": CACHE_SERIES_CATEGORIES,
    "series_cat": CACHE_SERIES_CAT,
    "series_info": CACHE_SERIES_INFO,
}

# ── Server start ──────────────────────────────────────────────────────────
SERVER_START_TIME = time.time()

# ── Cache (API response cache, TTL-based) ─────────────────────────────────
_cache: dict[str, tuple[float, list | dict]] = {}
_cache_hits: int = 0
_cache_misses: int = 0
CACHE_TTL = 300  # 5 min for API data

# ── EPG Cache ─────────────────────────────────────────────────────────────
epg_cache: dict = {"data": None, "fetched": 0}
_epg_refresh_task: Optional[asyncio.Task] = None

# ── Guide Cache (pre-processed channel groups, rebuilt on EPG refresh) ──────
_guide_cache: dict = {"channel_groups": None, "total_channels": 0, "built_at": 0}

# ── Health & Monitoring ───────────────────────────────────────────────────
STREAM_HITS_FILE = "/tmp/stv_stream_hits.json"
_stream_hits: dict[str, int] = {}
_error_log: list[dict] = []
_search_queries: list[dict] = []

def _load_stream_hits():
    global _stream_hits
    try:
        with open(STREAM_HITS_FILE) as f:
            disk = json.load(f)
            for k, v in disk.items():
                _stream_hits[k] = max(_stream_hits.get(k, 0), v)
    except (FileNotFoundError, json.JSONDecodeError):
        pass

def _save_stream_hits():
    try:
        with open(STREAM_HITS_FILE, "w") as f:
            json.dump(_stream_hits, f)
    except Exception:
        pass

def track_hit(stream_type: str, stream_id: int | str):
    key = f"{stream_type}:{stream_id}"
    _stream_hits[key] = _stream_hits.get(key, 0) + 1
    _save_stream_hits()

def log_error(msg: str, path: str = ""):
    _error_log.append({"ts": time.time(), "message": msg, "path": path})
    if len(_error_log) > 100:
        _error_log.pop(0)

def record_search(query: str):
    _search_queries.append({"ts": time.time(), "query": query[:80]})
    if len(_search_queries) > 1000:
        _search_queries.pop(0)

# ── SSE (EPG broadcast) ───────────────────────────────────────────────────
_epg_clients: list[asyncio.Queue] = []

# ── Watch Progress Store ──────────────────────────────────────────────────
PROGRESS_FILE = Path("/tmp/stv_watch_progress.json")
_progress_store: dict = {}

def _load_progress_store():
    global _progress_store
    try:
        if PROGRESS_FILE.exists():
            _progress_store = json.loads(PROGRESS_FILE.read_text())
    except Exception:
        _progress_store = {}

def _save_progress_store():
    try:
        PROGRESS_FILE.write_text(json.dumps(_progress_store))
    except Exception:
        pass

# ── Cache Warming ─────────────────────────────────────────────────────────
_warm_task: Optional[asyncio.Task] = None

# ── Image Cache (in-memory, TTL-based) ────────────────────────────────────
_img_cache: dict[str, tuple[float, bytes, str]] = {}  # url → (ts, data, content_type)

# ── Disk Cache TTL & Budget ───────────────────────────────────────────────
DISK_CACHE_TTL = 86400 * 7  # 7 days
DISK_CACHE_BUDGET = 500 * 1024 * 1024  # 500 MB
