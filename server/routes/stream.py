"""Stream proxy, transcode, and probe routes.

Extracted from main.py to decompose the monolithic backend.
Phase 3 of P1.1: probe endpoints + stream URL builders.
"""
import asyncio
import json
import logging
import time
from typing import Optional

import httpx
from fastapi import APIRouter

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["stream"])

# ── Probe cache ────────────────────────────────────────────────────────────
_probe_cache: dict[str, tuple[float, dict]] = {}
PROBE_CACHE_TTL = 3600


# ── Helpers (imports from main lazily to avoid circular deps) ──────────────
def _iptv_url(action: str, **params) -> str:
    """Build IPTV backend URL — delegated to main module."""
    import main as m
    return m.iptv_url(action, **params)


def _lookup_extension(stream_id: int, stream_type: str) -> str:
    """Look up the container_extension for a VOD stream from the in-memory cache."""
    from state import _cache
    prefix = f"{stream_type}_" if stream_type == "series" else "vod_"
    for key, (ts, data) in _cache.items():
        if not key.startswith(prefix):
            continue
        if not isinstance(data, list):
            continue
        for item in data:
            sid = item.get("stream_id") if stream_type == "movie" else item.get("series_id")
            if sid == stream_id:
                ext = item.get("container_extension", "mkv")
                return ext if ext else "mkv"
    return "mkv"


def build_stream_url(stream_id: int, stream_type: str) -> str:
    """Build the IPTV stream URL for a given stream ID and type."""
    from config import IPTV_BASE, IPTV_USER, IPTV_PASS
    ext = "ts" if stream_type == "live" else _lookup_extension(stream_id, stream_type)
    prefix = "live" if stream_type == "live" else stream_type
    return f"{IPTV_BASE}/{prefix}/{IPTV_USER}/{IPTV_PASS}/{stream_id}.{ext}"


async def get_content_length(url: str) -> Optional[int]:
    """HEAD the remote URL to discover Content-Length."""
    from config import UA_STR
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True,
                                     headers={"User-Agent": UA_STR}) as c:
            resp = await c.head(url)
            cl = resp.headers.get("content-length")
            return int(cl) if cl else None
    except Exception as e:
        log.debug(f"Content-Length HEAD failed for {url}: {e}")
        return None


async def probe_stream(stream_id: int, stream_type: str = "live") -> dict:
    """Run ffprobe on a stream to detect codec. Cached for 1 hour."""
    cache_key = f"{stream_type}_{stream_id}"
    now = time.time()
    if cache_key in _probe_cache and (now - _probe_cache[cache_key][0]) < PROBE_CACHE_TTL:
        return _probe_cache[cache_key][1]

    url = build_stream_url(stream_id, stream_type)
    ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    try:
        proc = await asyncio.create_subprocess_exec(
            "/usr/bin/timeout", "8", "/usr/bin/ffprobe",
            "-v", "error",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            "-user_agent", ua,
            "-select_streams", "v:0",
            url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=10.0)
        stderr_text = stderr_bytes.decode() if stderr_bytes else ""
    except (asyncio.TimeoutError, Exception) as e:
        log.warning(f"ffprobe failed for {stream_id}: {e}")
        return {"codec": "unknown", "error": str(e)}

    if proc.returncode != 0 or not stdout:
        if "405" in stderr_text or "Method Not Allowed" in stderr_text:
            log.info(f"Probe {stream_id}: CDN returned 405 — unavailable on this edge")
            result = {"codec": "unavailable", "error": "Not on this CDN edge"}
            _probe_cache[cache_key] = (now, result)
            return result
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True,
                                         headers={"User-Agent": ua}) as c:
                resp = await c.get(url)
                if resp.status_code == 405:
                    log.info(f"Probe {stream_id}: GET returned 405 — unavailable")
                    result = {"codec": "unavailable", "error": "Not on this CDN edge"}
                    _probe_cache[cache_key] = (now, result)
                    return result
        except Exception as e:
            log.warning(f"Probe HTTP GET failed for stream {stream_id}: {e}")
        return {"codec": "unknown"}

    try:
        data = json.loads(stdout)
        streams = data.get("streams", [])
        if not streams:
            return {"codec": "unknown"}
        s = streams[0]
        fmt = data.get("format", {})
        result = {
            "codec": s.get("codec_name", "unknown"),
            "codec_long": s.get("codec_long_name", ""),
            "width": s.get("width", 0),
            "height": s.get("height", 0),
            "profile": s.get("profile", ""),
            "container": fmt.get("format_name", ""),
        }
        _probe_cache[cache_key] = (now, result)
        log.info(f"Probe {stream_id}: {result['codec']} {result['width']}x{result['height']}")
        return result
    except json.JSONDecodeError:
        return {"codec": "unknown"}


# ── Probe endpoints ────────────────────────────────────────────────────────
@router.get("/api/live/probe/{stream_id}")
async def probe_endpoint(stream_id: int):
    """Probe a live stream to detect video codec before playback."""
    return await probe_stream(stream_id, "live")


@router.get("/api/movie/probe/{stream_id}")
async def probe_movie(stream_id: int):
    """Probe a movie stream to detect video codec."""
    return await probe_stream(stream_id, "movie")


@router.get("/api/series/probe/{stream_id}")
async def probe_series(stream_id: int):
    """Probe a series stream to detect video codec."""
    return await probe_stream(stream_id, "series")
