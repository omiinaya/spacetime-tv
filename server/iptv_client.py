"""IPTV API client — fetch with caching, URL building, HTTP client.

Extracted from main.py to eliminate circular import pattern where route
modules did ``import main as _main`` just to call ``cached_fetch()``.

Usage:
    from iptv_client import cached_fetch, client
    data = await cached_fetch("vod_categories", "get_vod_categories")
    resp = await client.get(url)
"""

import json
import logging
import time
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from config import IPTV_BASE, IPTV_PASS, IPTV_USER
from state import CACHE_TTL, _cache, _cache_hits, _cache_misses

log = logging.getLogger("spacetime-tv")

# ── HTTP Client ─────────────────────────────────────────────────────────────
client = httpx.AsyncClient(
    timeout=30.0,
    headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
)


def iptv_url(action: str, **params) -> str:
    """Build IPTV API URL (player_api.php) with credentials."""
    params.setdefault("username", IPTV_USER)
    params.setdefault("password", IPTV_PASS)
    params["action"] = action
    return f"{IPTV_BASE}/player_api.php?{urlencode(params)}"


def iptv_stream_url(stream_id: int, stream_type: str = "live", ext: str | None = None) -> str:
    """Build a direct stream URL for the IPTV CDN.

    Format: {base}/{prefix}/{user}/{pass}/{stream_id}.{ext}

    For live streams the extension is "ts"; for VOD the extension
    should be resolved upstream (e.g. via _lookup_extension).
    """
    prefix = "live" if stream_type == "live" else stream_type
    if ext is None:
        ext = "ts" if stream_type == "live" else "mkv"
    return f"{IPTV_BASE}/{prefix}/{IPTV_USER}/{IPTV_PASS}/{stream_id}.{ext}"


def iptv_vod_url(stream_id: int, media_type: str = "movie") -> str:
    """Build a provider MKV URL for ffprobe/ffmpeg (VOD probe context).

    Always uses .mkv extension — ffprobe probes the container regardless.
    """
    prefix = "movie" if media_type == "movie" else "series"
    return f"{IPTV_BASE}/{prefix}/{IPTV_USER}/{IPTV_PASS}/{stream_id}.mkv"


def iptv_timeshift_url(stream_id: int, duration_seconds: int) -> str:
    """Build a timeshift URL for catch-up TV playback.

    Xtream Codes API format:
      {base}/live/{user}/{pass}/{stream_id}/timeshift/{duration}.ts
    """
    return f"{IPTV_BASE}/live/{IPTV_USER}/{IPTV_PASS}/{stream_id}/timeshift/{duration_seconds}.ts"


def iptv_xmltv_url() -> str:
    """Build the EPG XMLTV URL."""
    return f"{IPTV_BASE}/xmltv.php?username={IPTV_USER}&password={IPTV_PASS}"


def iptv_raw_proxy_url(path: str) -> str:
    """Build a URL for proxying arbitrary IPTV paths (images, etc.)."""
    params = {"username": IPTV_USER, "password": IPTV_PASS}
    return f"{IPTV_BASE}/{path}?{urlencode(params)}"


def iptv_referer() -> str:
    """Build the Referer header value for IPTV CDN requests."""
    return f"{IPTV_BASE}/"


def vod_url(stream_id: int, media_type: str = "movie") -> str:
    """Build the provider MKV URL for ffprobe/ffmpeg (VOD subtitle/audio context).

    Always uses .mkv extension — ffprobe probes the container regardless.
    Alias for iptv_vod_url() for backward compatibility.
    """
    return iptv_vod_url(stream_id, media_type)


def build_timeshift_url(stream_id: int, duration_seconds: int) -> str:
    """Build timeshift URL for catch-up TV playback.

    Xtream Codes API format:
      {base}/live/{user}/{pass}/{stream_id}/timeshift/{duration}.ts

    Duration is how far back in seconds (e.g. 3600 = 1 hour ago).
    Returns the raw provider URL; the caller proxies it through the server.
    """
    return iptv_timeshift_url(stream_id, duration_seconds)


async def fetch_iptv(action: str, **params) -> dict | list:
    """Fetch from IPTV API and parse JSON."""
    url = iptv_url(action, **params)
    try:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()
    except (httpx.HTTPError, httpx.TimeoutException, json.JSONDecodeError) as e:
        log.error(f"IPTV API error ({action}): {e}")
        raise HTTPException(502, f"IPTV provider error: {e}")


async def cached_fetch(key: str, action: str, **params) -> list | dict:
    """Fetch with caching — returns cached data within TTL, stale fallback on error."""
    # These are global mutable counters in state.py
    global _cache_hits, _cache_misses  # noqa: PLW0603
    now = time.time()
    if key in _cache and (now - _cache[key][0]) < CACHE_TTL:
        _cache_hits += 1
        return _cache[key][1]
    _cache_misses += 1
    try:
        data = await fetch_iptv(action, **params)
    except HTTPException as e:
        log.warning(f"cached_fetch: {key} fetch failed ({e})", extra={"action": action, "params": params})
        if key in _cache:
            stale_data = _cache[key][1]
            log.warning(f"cached_fetch: falling back to stale cache for {key} ({type(stale_data).__name__})")
            return stale_data
        raise
    if isinstance(data, list) and len(data) == 0:
        log.warning(f"cached_fetch: {key} returned empty list, not caching")
        if key in _cache:
            stale_data = _cache[key][1]
            log.warning(f"cached_fetch: falling back to stale cache for {key} ({len(stale_data)} entries)")
            return stale_data
        return data
    _cache[key] = (now, data)
    return data
