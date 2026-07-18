"""Probe endpoints — run ffprobe on streams to detect codecs.

Extracted from stream.py during decomposition of the 1105-line monolithic file.
"""

import asyncio
import json
import logging
import time

import curl_cffi.requests as CurlReq
import httpx
from fastapi import APIRouter

from config import UA_STR
from iptv_client import iptv_referer

from .stream_core import PROBE_CACHE_TTL, _lookup_extension, _probe_cache, build_stream_url

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["stream"])


async def probe_stream(stream_id: int, stream_type: str = "live") -> dict:
    """Run ffprobe on a stream to detect codec. Cached for 1 hour.

    For known H.264 containers (mp4, m4v) we skip ffprobe entirely —
    it would need to download the whole file for MP4s with moov-at-end,
    which is slow and unnecessary.
    """
    cache_key = f"{stream_type}_{stream_id}"
    now = time.time()
    if cache_key in _probe_cache and (now - _probe_cache[cache_key][0]) < PROBE_CACHE_TTL:
        return _probe_cache[cache_key][1]

    # ── Skip probe for known H.264 containers ──────────────────
    ext = "ts" if stream_type == "live" else await _lookup_extension(stream_id, stream_type)
    if ext in ("mp4", "m4v"):
        log.info(f"Probe {stream_id}: {ext} — assuming H.264, skipping ffprobe")
        result = {"codec": "h264", "codec_long": "H.264 / AVC / MPEG-4 AVC", "width": 0, "height": 0, "native": True}
        _probe_cache[cache_key] = (now, result)
        return result

    url = await build_stream_url(stream_id, stream_type)
    ua = UA_STR

    try:
        proc = await asyncio.create_subprocess_exec(
            "/usr/bin/timeout",
            "8",
            "/usr/bin/ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-user_agent",
            ua,
            "-select_streams",
            "v:0",
            url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=10.0)
        stderr_text = stderr_bytes.decode() if stderr_bytes else ""
    except (TimeoutError, OSError) as e:
        log.warning(f"ffprobe failed for {stream_id}: {e}")
        return {"codec": "unknown", "error": str(e)}
    except (ValueError, RuntimeError) as e:
        # stderr_bytes.decode() may raise ValueError (UnicodeDecodeError);
        # RuntimeError if the event loop is closed during asyncio operations.
        log.warning(f"ffprobe unexpected error for {stream_id}: {e}")
        return {"codec": "unknown", "error": str(e)}

    if proc.returncode != 0 or not stdout:
        if "405" in stderr_text or "Method Not Allowed" in stderr_text:
            log.info(f"Probe {stream_id}: ffprobe got 405 — trying curl_cffi fallback")
            cffi_url = await build_stream_url(stream_id, stream_type)
            resp = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: CurlReq.get(
                    cffi_url,
                    headers={"User-Agent": UA_STR, "Referer": iptv_referer(), "Range": "bytes=0-65535"},
                    timeout=10,
                    impersonate="chrome120",
                ),
            )
            cl = resp.headers.get("content-length", "0")
            if resp.status_code in (200, 206) and cl.isdigit() and int(cl) > 0:
                log.info(f"Probe {stream_id}: curl_cffi OK (HTTP {resp.status_code}, {cl}B) — accessible")
                result = {"codec": "h264", "codec_long": "H.264 (curl_cffi)", "width": 0, "height": 0}
                _probe_cache[cache_key] = (now, result)
                return result
            log.info(f"Probe {stream_id}: all probe methods failed — reporting unavailable")
            result = {
                "codec": "unavailable",
                "error": "Not on this CDN edge",
            }  # pragma: no cover — all probes failed, runtime only
            _probe_cache[cache_key] = (now, result)
            return result  # pragma: no cover — all probes failed, runtime only
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True, headers={"User-Agent": ua}) as c:
                resp = await c.get(url)
                if resp.status_code == 405:
                    log.info(f"Probe {stream_id}: GET returned 405 — unavailable")
                    result = {
                        "codec": "unavailable",
                        "error": "Not on this CDN edge",
                    }  # pragma: no cover — network runtime
                    _probe_cache[cache_key] = (now, result)
                    return result  # pragma: no cover — network runtime
        except httpx.HTTPError as e:
            log.warning(f"Probe HTTP GET failed for stream {stream_id}: {e}")  # pragma: no cover — network runtime
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
        return {"codec": "unknown"}  # pragma: no cover — invalid ffprobe JSON, runtime only


@router.get("/live/probe/{stream_id}")
async def probe_endpoint(stream_id: int):
    """Probe a live stream to detect video codec before playback."""
    return await probe_stream(stream_id, "live")


@router.get("/movie/probe/{stream_id}")
async def probe_movie(stream_id: int):
    """Probe a movie stream to detect video codec."""
    return await probe_stream(stream_id, "movie")


@router.get("/series/probe/{stream_id}")
async def probe_series(stream_id: int):
    """Probe a series stream to detect video codec."""
    return await probe_stream(stream_id, "series")
