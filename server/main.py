"""Spacetime-TV Backend — IPTV proxy + EPG parser."""
import asyncio
import hashlib
import json
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("spacetime-tv")

# ── Config (imported from config.py to avoid duplication) ─────────────────
from config import (
    IPTV_BASE, IPTV_USER, IPTV_PASS, EPG_CACHE_FILE, EPG_CACHE_TTL,
    ROOT, STATIC_DIR, TMDB_API_KEY, TMDB_BASE, UA_STR,
    RATE_WINDOW, RATE_SEARCH_LIMIT, RATE_DEFAULT_LIMIT,
)
from state import SERVER_START_TIME, _load_stream_hits


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_stream_hits()
    start_cleanup_task()
    start_cache_warmer()
    _epg_broadcast_task = asyncio.create_task(_epg_broadcast_loop())
    yield


app = FastAPI(title="Spacetime-TV", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Route modules ─────────────────────────────────────────────────────────
from routes.health import router as health_router
from routes.admin import router as admin_router
from routes.tmdb import router as tmdb_router
from routes.stream import router as stream_router
from routes.search import router as search_router
from routes.guide import router as guide_router, _epg_broadcast_loop
from routes.watchlist import router as watchlist_router
from routes.live import router as live_router
from routes.vod import router as vod_router
from routes.media import router as media_router
from routes.misc import router as misc_router
app.include_router(health_router)
app.include_router(admin_router)
app.include_router(tmdb_router)
app.include_router(stream_router)
app.include_router(search_router)
app.include_router(guide_router)
app.include_router(watchlist_router)
app.include_router(live_router)
app.include_router(vod_router)
app.include_router(media_router)
app.include_router(misc_router)

# ── Rate Limiting (in-memory fixed window) ──────────────────────────────────
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

_rate_limits: dict[str, tuple[float, int]] = {}  # ip -> (window_start, count)
# Rate window & limits imported from config.py:
# RATE_WINDOW, RATE_SEARCH_LIMIT, RATE_DEFAULT_LIMIT

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        path = request.url.path
        
        limit = RATE_SEARCH_LIMIT if "/api/search" in path or "/api/image-proxy" in path else RATE_DEFAULT_LIMIT
        
        window_start, count = _rate_limits.get(ip, (0, 0))
        if now - window_start > RATE_WINDOW:
            window_start = now
            count = 0
        
        if count >= limit:
            return Response(
                content='{"detail":"Too many requests"}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(int(RATE_WINDOW - (now - window_start)))},
            )
        
        _rate_limits[ip] = (window_start, count + 1)
        return await call_next(request)

app.add_middleware(RateLimitMiddleware)

# ── HTTP Client ─────────────────────────────────────────────────────────────
client = httpx.AsyncClient(
    timeout=30.0,
    headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"},
)


def iptv_url(action: str, **params) -> str:
    """Build IPTV API URL with credentials."""
    params.setdefault("username", IPTV_USER)
    params.setdefault("password", IPTV_PASS)
    params["action"] = action
    return f"{IPTV_BASE}/player_api.php?{urlencode(params)}"


async def fetch_iptv(action: str, **params) -> dict | list:
    """Fetch from IPTV API and parse JSON."""
    url = iptv_url(action, **params)
    try:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        log.error(f"IPTV API error ({action}): {e}")
        raise HTTPException(502, f"IPTV provider error: {e}")


# ── EPG Cache ──��────────────────────────────────────────────────────────────
from state import epg_cache, _epg_refresh_task


# ── Cache helpers ───────────────────────────────────────────────────────────
from state import _cache, _cache_hits, _cache_misses, CACHE_TTL


async def cached_fetch(key: str, action: str, **params) -> list | dict:
    global _cache_hits, _cache_misses
    now = time.time()
    if key in _cache and (now - _cache[key][0]) < CACHE_TTL:
        _cache_hits += 1
        return _cache[key][1]
    _cache_misses += 1
    try:
        data = await fetch_iptv(action, **params)
    except Exception as e:
        log.warning(f"cached_fetch: {key} fetch failed ({e})", extra={"action": action, "params": params})
        # Return stale cache if available — better than propagating the error
        if key in _cache:
            stale_data = _cache[key][1]
            log.warning(f"cached_fetch: falling back to stale cache for {key} ({type(stale_data).__name__})")
            return stale_data
        raise
    # Don't cache empty lists — provider may have had a transient error
    if isinstance(data, list) and len(data) == 0:
        log.warning(f"cached_fetch: {key} returned empty list, not caching")
        # Return stale cache if available — better than returning nothing
        if key in _cache:
            stale_data = _cache[key][1]
            log.warning(f"cached_fetch: falling back to stale cache for {key} ({len(stale_data)} entries)")
            return stale_data
        return data
    _cache[key] = (now, data)
    return data


from state import track_hit, log_error, record_search, _stream_hits, _error_log, _search_queries

# ── ADMIN (routes in routes/admin.py) ────────────────────────────────────────


# ── Cache helpers ───────────────────────────────────────────────────────────

from starlette.responses import StreamingResponse

def build_stream_url(stream_id: int, stream_type: str) -> str:
    """Build the IPTV stream URL for a given stream ID and type."""
    ext = "ts" if stream_type == "live" else _lookup_extension(stream_id, stream_type)
    prefix = "live" if stream_type == "live" else stream_type
    return f"{IPTV_BASE}/{prefix}/{IPTV_USER}/{IPTV_PASS}/{stream_id}.{ext}"


def _lookup_extension(stream_id: int, stream_type: str) -> str:
    """Look up the container_extension for a VOD stream from the in-memory cache.
    Falls back to 'mkv' if not found."""
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


async def get_content_length(url: str) -> Optional[int]:
    """HEAD the remote URL to discover Content-Length."""
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True,
                                     headers={"User-Agent": UA_STR}) as c:
            resp = await c.head(url)
            cl = resp.headers.get("content-length")
            return int(cl) if cl else None
    except Exception as e:
        log.debug(f"Content-Length HEAD failed for {url}: {e}")
        return None


async def stream_bytes(url: str):
    """Generator that yields bytes from a streaming URL.
    Uses a short read timeout so abandoned upstream connections close fast."""
    headers = {"User-Agent": UA_STR}
    timeout = httpx.Timeout(60.0, read=30.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as sc:
        async with sc.stream("GET", url) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes():
                yield chunk


async def stream_vod_bytes(url: str, range_header: Optional[str] = None):
    """Generator that yields VOD bytes, optionally with Range support."""
    headers = {"User-Agent": UA_STR}
    if range_header:
        headers["Range"] = range_header
    timeout = httpx.Timeout(30.0, read=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as sc:
        async with sc.stream("GET", url) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes():
                yield chunk


async def handle_vod_request(req: Request, stream_id: int, stream_type: str,
                              content_type: str = "video/x-matroska"):
    """Handle a VOD stream request with Range/206 support for seeking."""
    track_hit(stream_type, stream_id)
    url = build_stream_url(stream_id, stream_type)
    range_header = req.headers.get("range")

    if range_header:
        # Range request — get file size from upstream
        file_size = await get_content_length(url)

        # Forward Range to upstream and stream
        response = StreamingResponse(
            stream_vod_bytes(url, range_header),
            media_type=content_type,
            status_code=206,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
                "Accept-Ranges": "bytes",
            },
        )
        if file_size:
            response.headers["Content-Length"] = str(file_size)

        # Parse the requested range to set Content-Range
        # Simple case: bytes=X-
        if range_header.startswith("bytes="):
            parts = range_header[6:].split("-")
            start = int(parts[0]) if parts[0] else 0
            if file_size:
                end = file_size - 1
                response.headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        return response

    # Full request — no Range
    return StreamingResponse(
        stream_vod_bytes(url),
        media_type=content_type,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
            "Accept-Ranges": "bytes",
        },
    )


async def stream_bytes_transcode(url: str, target_height: Optional[int] = None):
    """Generator: resolve CDN redirect, then transcode HEVC→H.264 via ffmpeg.
    ffmpeg reads directly from the CDN URL (no pipe latency).
    If target_height is set, scales video to that height."""
    headers = {"User-Agent": UA_STR}

    # Resolve the redirect chain to get the final CDN URL for ffmpeg
    cdn_url = url
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as c:
            async with c.stream("GET", url) as resp:
                cdn_url = str(resp.url)
    except Exception as e:
        log.warning(f"URL resolution failed, using original: {e}")

    log.info(f"Transcoding {cdn_url[:100]}...")

    cmd = [
        "/usr/bin/ffmpeg",
        "-loglevel", "warning",
        "-probesize", "2M",
        "-analyzeduration", "2M",
        "-user_agent", headers["User-Agent"],
        "-i", cdn_url,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-crf", "28",
    ]
    if target_height:
        cmd += ["-vf", f"scale=-2:{target_height}"]
    cmd += [
        "-c:a", "copy",
        "-f", "mpegts",
        "pipe:1",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Background task to log ffmpeg stderr
    async def log_stderr():
        while proc.stderr:
            line = await proc.stderr.readline()
            if not line:
                break
            log.warning(f"ffmpeg: {line.decode().rstrip()}")

    stderr_task = asyncio.create_task(log_stderr())

    try:
        while proc.stdout:
            chunk = await proc.stdout.read(65536)
            if not chunk:
                break
            yield chunk
    except GeneratorExit:
        pass
    finally:
        stderr_task.cancel()
        try:
            await stderr_task
        except asyncio.CancelledError:
            pass
        if proc.returncode is None:
            proc.kill()
            await proc.wait()


async def stream_proxy(url: str, content_type: str):
    """Stream a remote URL through our backend, bypassing CORS."""
    try:
        return StreamingResponse(
            stream_bytes(url),
            media_type=content_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"Stream proxy error ({url}): {e}")
        return Response(status_code=502, content="Stream unavailable")


@app.get("/api/stream/live/{stream_id}")
async def stream_live(stream_id: int, request: Request):
    """Proxy live TV stream (raw MPEG-TS). Closes upstream fast on disconnect."""
    track_hit("live", stream_id)
    url = build_stream_url(stream_id, "live")
    log.info(f"STREAM LIVE START id={stream_id}")
    try:
        async def monitored_stream():
            try:
                async for chunk in stream_bytes(url):
                    if await request.is_disconnected():
                        log.info(f"STREAM LIVE DISCONNECT id={stream_id} — stopping upstream")
                        break
                    yield chunk
            except Exception as e:
                log.warning(f"STREAM LIVE ERROR id={stream_id}: {e}")
            finally:
                log.info(f"STREAM LIVE END id={stream_id}")
        return StreamingResponse(
            monitored_stream(),
            media_type="video/mp2t",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"Stream proxy error ({url}): {e}")
        return Response(status_code=502, content="Stream unavailable")


@app.get("/api/stream/live/{stream_id}")
async def stream_live(stream_id: int, request: Request):
    """Proxy a live TV stream — direct pass-through from IPTV provider."""
    url = build_stream_url(stream_id, "live")
    ua = UA_STR
    try:
        resp = await stream_proxy(url, "video/mp2t")
        return resp
    except Exception as e:
        log.error(f"Live stream error ({url}): {e}")
        return Response(status_code=502, content="Stream unavailable")


@app.get("/api/stream/live/{stream_id}/transcode")
async def stream_live_transcode(stream_id: int):
    """Proxy live TV stream with HEVC→H.264 transcoding via ffmpeg."""
    url = build_stream_url(stream_id, "live")
    try:
        return StreamingResponse(
            stream_bytes_transcode(url),
            media_type="video/mp2t",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"Transcode setup error ({url}): {e}")
        return Response(status_code=502, content="Transcode failed")


@app.get("/api/stream/live/{stream_id}/quality/{height}")
async def stream_live_quality(stream_id: int, height: int):
    """Proxy live TV stream transcoded to a specific height (360, 720, 1080)."""
    url = build_stream_url(stream_id, "live")
    try:
        return StreamingResponse(
            stream_bytes_transcode(url, target_height=height),
            media_type="video/mp2t",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"Quality transcode error ({url}): {e}")
        return Response(status_code=502, content="Transcode failed")


# ── VOD Transcode (HEVC→H.264 for movies/series) ───────────────────────────

async def stream_vod_transcode(url: str):
    """Transcode VOD (MKV with HEVC) → H.264+AAC in MPEG-TS container.
    Used when the browser can't decode H.265 natively."""
    headers = {"User-Agent": UA_STR}

    # Resolve the redirect chain to get the final CDN URL for ffmpeg
    cdn_url = url
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as c:
            async with c.stream("GET", url) as resp:
                cdn_url = str(resp.url)
    except Exception as e:
        log.warning(f"VOD URL resolution failed, using original: {e}")

    log.info(f"VOD transcode {cdn_url[:100]}...")
    cmd = [
        "/usr/bin/ffmpeg",
        "-loglevel", "warning",
        "-probesize", "2M",
        "-analyzeduration", "2M",
        "-user_agent", headers["User-Agent"],
        "-i", cdn_url,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-crf", "26",
        "-c:a", "aac",
        "-b:a", "128k",
        "-f", "mpegts",
        "pipe:1",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    # Background stderr logging
    async def log_stderr():
        while proc.stderr:
            line = await proc.stderr.readline()
            if not line: break
            log.warning(f"vod-ffmpeg: {line.decode().rstrip()}")

    stderr_task = asyncio.create_task(log_stderr())
    try:
        while proc.stdout:
            chunk = await proc.stdout.read(65536)
            if not chunk: break
            yield chunk
    except GeneratorExit:
        pass
    finally:
        stderr_task.cancel()
        try: await stderr_task
        except asyncio.CancelledError: pass
        if proc.returncode is None:
            proc.kill(); await proc.wait()


# ── VOD Remux: MKV→MPEG-TS via -c copy (no re-encode) ──────────────────────

async def stream_vod_mpegts(url: str, start_time: Optional[float] = None):
    """Remux VOD (any container) → MPEG-TS with -c copy (no re-encode).
    Output is playable by mpegts.js. Supports time-based seeking via start_time."""
    headers = {"User-Agent": UA_STR}

    # Resolve the redirect chain to get the final CDN URL for ffmpeg
    cdn_url = url
    cdn_error = None
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as c:
            async with c.stream("GET", url) as resp:
                if resp.status_code in (405, 404, 403):
                    cdn_error = f"CDN returned {resp.status_code} — movie unavailable on this edge"
                    log.warning(f"VOD remux {url[:100]}: {cdn_error}")
                cdn_url = str(resp.url)
    except Exception as e:
        log.warning(f"VOD remux URL resolution failed, using original: {e}")

    if cdn_error:
        # Yield nothing — the streaming response returns empty body, but we log it
        log.error(f"VOD remux aborted — {cdn_error}")
        return  # empty generator — caller sees 200 with 0 bytes... not ideal, but caller handles

    log.info(f"VOD remux {cdn_url[:100]}... start={start_time}")
    cmd = [
        "/usr/bin/ffmpeg",
        "-loglevel", "warning",
        "-probesize", "2M",
        "-analyzeduration", "2M",
        "-user_agent", headers["User-Agent"],
    ]
    if start_time and start_time > 0:
        cmd += ["-ss", str(start_time), "-copyts"]
    cmd += [
        "-i", cdn_url,
        "-c", "copy",
        "-f", "mpegts",
        "pipe:1",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    # Background stderr logging
    async def log_stderr():
        while proc.stderr:
            line = await proc.stderr.readline()
            if not line: break
            log.warning(f"vod-remux: {line.decode().rstrip()}")

    stderr_task = asyncio.create_task(log_stderr())
    try:
        while proc.stdout:
            chunk = await proc.stdout.read(65536)
            if not chunk: break
            yield chunk
    except GeneratorExit:
        pass
    finally:
        stderr_task.cancel()
        try: await stderr_task
        except asyncio.CancelledError: pass
        if proc.returncode is None:
            proc.kill(); await proc.wait()


@app.get("/api/stream/movie/{stream_id}/remux")
async def stream_movie_remux(stream_id: int, start: Optional[float] = None):
    """Remux movie MKV→MPEG-TS for browser playback (mpegts.js)."""
    url = build_stream_url(stream_id, "movie")
    
    # Pre-check CDN availability to avoid silent 0-byte responses
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True,
                                     headers={"User-Agent": UA_STR}) as c:
            async with c.stream("GET", url) as resp:
                if resp.status_code in (405, 404, 403):
                    log.info(f"Movie {stream_id}: CDN returned {resp.status_code} — unavailable")
                    return Response(
                        status_code=503,
                        content=json.dumps({"error": f"Movie unavailable on this CDN edge (HTTP {resp.status_code})"}),
                        media_type="application/json",
                    )
    except Exception as e:
        log.debug(f"VOD CDN pre-flight failed for movie {stream_id}: {e} — proceeding anyway")
    
    try:
        return StreamingResponse(
            stream_vod_mpegts(url, start),
            media_type="video/mp2t",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"Movie remux error ({stream_id}): {e}")
        return Response(status_code=502, content="Remux failed")


@app.get("/api/stream/series/{series_id}/{episode_id}/remux")
async def stream_series_remux(series_id: int, episode_id: int, start: Optional[float] = None):
    """Remux series episode MKV→MPEG-TS for browser playback (mpegts.js)."""
    url = build_stream_url(episode_id, "series")
    try:
        return StreamingResponse(
            stream_vod_mpegts(url, start),
            media_type="video/mp2t",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"Series remux error ({episode_id}): {e}")
        return Response(status_code=502, content="Remux failed")


@app.get("/api/stream/movie/{stream_id}/transcode")
async def stream_movie_transcode(stream_id: int):
    """Transcode a HEVC movie to H.264 on-the-fly."""
    url = build_stream_url(stream_id, "movie")
    try:
        return StreamingResponse(
            stream_vod_transcode(url),
            media_type="video/mp2t",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"VOD transcode error (movie {stream_id}): {e}")
        return Response(status_code=502, content="Transcode failed")


@app.get("/api/stream/series/{series_id}/{episode_id}/transcode")
async def stream_series_transcode(series_id: int, episode_id: int):
    """Transcode a HEVC series episode to H.264 on-the-fly."""
    url = build_stream_url(episode_id, "series")
    try:
        return StreamingResponse(
            stream_vod_transcode(url),
            media_type="video/mp2t",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"VOD transcode error (series {episode_id}): {e}")
        return Response(status_code=502, content="Transcode failed")


@app.get("/api/stream/movie/{stream_id}")
async def stream_movie(req: Request, stream_id: int):
    """Proxy movie stream (MKV) with Range support for seeking."""
    return await handle_vod_request(req, stream_id, "movie")


@app.get("/api/stream/series/{series_id}/{episode_id}")
async def stream_series_ep(req: Request, series_id: int, episode_id: int):
    """Proxy series episode stream (MKV) with Range support for seeking."""
    return await handle_vod_request(req, episode_id, "series")

# ── Cache Warming ───────────────────────────────────────────────────────────
# Without this, the first search triggers hundreds of per-category fetches.
#
# Configurable via env vars:
#   CACHE_WARM_ENABLED=true        — toggle on/off (default: true)
#   CACHE_WARM_CONCURRENCY=20      — max concurrent fetches (default: 20)
#   CACHE_WARM_CATEGORIES=""       — comma-separated category IDs to warm (default: all)

CACHE_WARM_ENABLED = os.getenv("CACHE_WARM_ENABLED", "true").lower() in ("1", "true", "yes")
CACHE_WARM_CONCURRENCY = int(os.getenv("CACHE_WARM_CONCURRENCY", "20"))
CACHE_WARM_CATEGORIES = os.getenv("CACHE_WARM_CATEGORIES", "")

async def warm_cache():
    """Pre-fetch all VOD and series data into memory (background task)."""
    if not CACHE_WARM_ENABLED:
        log.info("[WARMER] Disabled via CACHE_WARM_ENABLED env var — skipping")
        return

    filter_cats = None
    if CACHE_WARM_CATEGORIES:
        filter_cats = set(int(x.strip()) for x in CACHE_WARM_CATEGORIES.split(",") if x.strip())
        log.info(f"[WARMER] Filtering to {len(filter_cats)} categories: {filter_cats}")

    log.info("[WARMER] Starting cache warming for VOD + Series...")
    start = time.time()

    # Warm VOD
    try:
        vod_cats = await cached_fetch("vod_categories", "get_vod_categories")
        if not vod_cats:
            log.warning("[WARMER] VOD categories empty — upstream may be degraded, will retry next cycle")
        vod_cat_ids = [c["category_id"] for c in vod_cats if c.get("category_id")]
        if filter_cats:
            vod_cat_ids = [cid for cid in vod_cat_ids if cid in filter_cats]
        sem = asyncio.Semaphore(CACHE_WARM_CONCURRENCY)
        async def fetch_vod_cat(cid):
            async with sem:
                return await cached_fetch(f"vod_{cid}", "get_vod_streams", category_id=cid)
        await asyncio.gather(*[fetch_vod_cat(cid) for cid in vod_cat_ids], return_exceptions=True)
        log.info(f"[WARMER] VOD: {len(vod_cat_ids)} categories cached")
    except Exception as e:
        log.warning(f"[WARMER] VOD warm failed (non-fatal): {e}")

    # Warm Series
    try:
        series_cats = await cached_fetch("series_categories", "get_series_categories")
        if not series_cats:
            log.warning("[WARMER] Series categories empty — upstream may be degraded, will retry next cycle")
        series_cat_ids = [c["category_id"] for c in series_cats if c.get("category_id")]
        if filter_cats:
            series_cat_ids = [cid for cid in series_cat_ids if cid in filter_cats]
        sem = asyncio.Semaphore(CACHE_WARM_CONCURRENCY)
        async def fetch_series_cat(cid):
            async with sem:
                return await cached_fetch(f"series_{cid}", "get_series", category_id=cid)
        await asyncio.gather(*[fetch_series_cat(cid) for cid in series_cat_ids], return_exceptions=True)
        log.info(f"[WARMER] Series: {len(series_cat_ids)} categories cached")
    except Exception as e:
        log.warning(f"[WARMER] Series warm failed (non-fatal): {e}")

    # Warm EPG
    try:
        log.info("[WARMER] Pre-warming EPG...")
        from routes.guide import load_epg
        epg_data = await load_epg()
        channels = epg_data.get("channels", [])
        programmes = epg_data.get("programmes", [])
        log.info(f"[WARMER] EPG: {len(channels)} channels, {len(programmes)} programmes")
    except Exception as e:
        log.warning(f"[WARMER] EPG warm failed (non-fatal): {e}")

    elapsed = time.time() - start
    log.info(f"[WARMER] Done in {elapsed:.1f}s — all searches now instant")

_warm_task: Optional[asyncio.Task] = None

def start_cache_warmer():
    """Launch cache warming in background (non-blocking)."""
    global _warm_task
    if _warm_task is None or _warm_task.done():
        _warm_task = asyncio.create_task(warm_cache())

# ── GENERAL ─────────────────────────────────────────────────────────────────

@app.get("/api/iptv/{path:path}")
async def iptv_raw(path: str):
    """Raw proxy for any IPTV API call (images, etc.)."""
    params = {"username": IPTV_USER, "password": IPTV_PASS}
    full = f"{IPTV_BASE}/{path}?{urlencode(params)}"
    try:
        resp = await client.get(full)
        return Response(content=resp.content, media_type=resp.headers.get("content-type", "application/octet-stream"))
    except Exception as e:
        raise HTTPException(502, str(e))


# ══════════════════════════════════════════════════════════════════════════════
# ── VOD MP4 Converter (MKV → MP4 via -c copy, cached on disk) ─────────────
# ══════════════════════════════════════════════════════════════════════════════

CACHE_DIR = Path("/tmp/stv_cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)
_converting: dict[str, asyncio.Task] = {}  # stream_id → conversion task

# Image proxy disk cache (L2 — survives restarts, larger capacity)
IMG_CACHE_DIR = CACHE_DIR / "images"
IMG_CACHE_DIR.mkdir(parents=True, exist_ok=True)
_IMG_DISK_TTL = 86400  # 24 hours (images rarely change)
_IMG_DISK_MAX_BYTES = 500 * 1024 * 1024  # 500 MB total disk budget
_IMG_DISK_MAX_PER_FILE = 10 * 1024 * 1024  # 10 MB per image

# ── Cache TTL / Auto-cleanup ────────────────────────────────────────────────
CACHE_TTL_HOURS = 2  # Delete entries not accessed in this many hours
CLEANUP_INTERVAL = 600  # Run cleanup every 10 minutes
_cleanup_task: Optional[asyncio.Task] = None


def touch_access(cache_key: str):
    """Record that a cache entry was just accessed."""
    stamp_path = CACHE_DIR / f".{cache_key}.accessed"
    stamp_path.write_text(str(time.time()))


def get_last_access(cache_key: str) -> Optional[float]:
    """Get the last access time for a cache entry."""
    stamp_path = CACHE_DIR / f".{cache_key}.accessed"
    try:
        return float(stamp_path.read_text().strip())
    except Exception:
        return None


# ── Image disk cache helpers ─────────────────────────────────────────────
_IMG_CLEANUP_INTERVAL = 600  # same cadence as VOD cache cleanup


def _img_cache_key(url: str) -> str:
    """Return a safe filesystem key for a URL."""
    import hashlib
    return hashlib.md5(url.encode()).hexdigest()


def _img_cache_path(cache_key: str) -> Path:
    return IMG_CACHE_DIR / cache_key


def _img_meta_path(cache_key: str) -> Path:
    return IMG_CACHE_DIR / f"{cache_key}.meta"


def _img_stamp_path(cache_key: str) -> Path:
    return IMG_CACHE_DIR / f".{cache_key}.accessed"


def _img_touch(cache_key: str):
    """Record that an image cache entry was just accessed."""
    _img_stamp_path(cache_key).write_text(str(time.time()))


def _img_get_last_access(cache_key: str) -> float | None:
    try:
        return float(_img_stamp_path(cache_key).read_text().strip())
    except Exception:
        return None


def _img_read_disk(cache_key: str) -> tuple[bytes, str, float] | None:
    """Read image from disk cache. Returns (content, content_type, stored_at) or None."""
    img_path = _img_cache_path(cache_key)
    meta_path = _img_meta_path(cache_key)
    if not img_path.exists() or not meta_path.exists():
        return None
    now = time.time()
    last = _img_get_last_access(cache_key)
    if last is not None and (now - last) > _IMG_DISK_TTL:
        # Expired — delete
        try:
            img_path.unlink(missing_ok=True)
            meta_path.unlink(missing_ok=True)
            _img_stamp_path(cache_key).unlink(missing_ok=True)
        except Exception:
            pass
        return None
    try:
        content = img_path.read_bytes()
        meta = meta_path.read_text().strip()
        ct, stored_at_str = meta.split("|", 1)
        stored_at = float(stored_at_str)
        _img_touch(cache_key)
        return content, ct, stored_at
    except Exception:
        return None


def _img_write_disk(cache_key: str, content: bytes, content_type: str):
    """Write image to disk cache."""
    # Check per-file size limit
    if len(content) > _IMG_DISK_MAX_PER_FILE:
        return
    try:
        _img_cache_path(cache_key).write_bytes(content)
        meta = f"{content_type}|{time.time()}"
        _img_meta_path(cache_key).write_text(meta)
        _img_touch(cache_key)
    except Exception:
        pass


def _img_enforce_disk_budget():
    """Evict oldest entries when total disk cache exceeds budget."""
    import hashlib
    total = 0
    entries: list[tuple[float, str, int]] = []
    for f in IMG_CACHE_DIR.iterdir():
        if f.name.startswith(".") or f.suffix == ".meta":
            continue
        key = f.name
        last = _img_get_last_access(key)
        if last is None:
            last = f.stat().st_mtime
        total += f.stat().st_size
        entries.append((last, key, f.stat().st_size))
    if total <= _IMG_DISK_MAX_BYTES:
        return
    # Sort oldest-first, delete until under 80% of budget
    entries.sort(key=lambda x: x[0])
    target = int(_IMG_DISK_MAX_BYTES * 0.8)
    for last, key, size in entries:
        if total <= target:
            break
        try:
            _img_cache_path(key).unlink(missing_ok=True)
            _img_meta_path(key).unlink(missing_ok=True)
            _img_stamp_path(key).unlink(missing_ok=True)
        except Exception:
            pass
        total -= size


async def cleanup_image_cache():
    """Remove expired image entries and enforce budget."""
    now = time.time()
    cutoff = now - _IMG_DISK_TTL
    deleted = 0
    for f in list(IMG_CACHE_DIR.iterdir()):
        if f.name.startswith(".") or f.suffix == ".meta":
            continue
        key = f.name
        last = _img_get_last_access(key)
        if last is not None and last < cutoff:
            try:
                _img_cache_path(key).unlink(missing_ok=True)
                _img_meta_path(key).unlink(missing_ok=True)
                _img_stamp_path(key).unlink(missing_ok=True)
                deleted += 1
            except Exception:
                pass
    if deleted:
        log.info(f"[IMG_CACHE] Removed {deleted} expired entries")
    _img_enforce_disk_budget()


async def cleanup_stale_cache():
    """Delete cache entries that haven't been accessed in CACHE_TTL_HOURS."""
    cutoff = time.time() - (CACHE_TTL_HOURS * 3600)
    deleted_total = 0

    for entry in list(CACHE_DIR.iterdir()):
        if entry.name.startswith("."):
            continue  # skip .accessed files
        cache_key = entry.stem
        last = get_last_access(cache_key)
        if last is None:
            # No access record — touch it now to give it a grace period
            if entry.is_dir():
                touch_access(cache_key)
            continue
        if last < cutoff:
            log.info(f"[CLEANUP] Removing stale: {cache_key} (last access {time.time() - last:.0f}s ago)")
            try:
                if entry.is_dir():
                    import shutil
                    shutil.rmtree(entry)
                else:
                    entry.unlink()
                # Also clean up .accessed file
                stamp = CACHE_DIR / f".{cache_key}.accessed"
                if stamp.exists():
                    stamp.unlink()
                deleted_total += 1
            except Exception as e:
                log.warning(f"[CLEANUP] Failed to remove {cache_key}: {e}")

    if deleted_total:
        log.info(f"[CLEANUP] Removed {deleted_total} stale entries")


async def cleanup_loop():
    """Periodic background task that runs cleanup."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        try:
            await cleanup_stale_cache()
        except Exception as e:
            log.error(f"[CLEANUP] Error: {e}")
        try:
            await cleanup_image_cache()
        except Exception as e:
            log.error(f"[IMG_CACHE] Cleanup error: {e}")


def start_cleanup_task():
    """Start the periodic cleanup background task (must be called from running loop)."""
    global _cleanup_task
    if _cleanup_task is None or _cleanup_task.done():
        _cleanup_task = asyncio.create_task(cleanup_loop())
        log.info(f"[CLEANUP] Started — TTL={CACHE_TTL_HOURS}h, interval={CLEANUP_INTERVAL}s")


async def convert_to_mp4(stream_id: str, stream_type: str):
    """Download full MKV from CDN (with retries), then convert → fMP4 locally.
    
    Two-phase approach avoids CDN drops corrupting the output:
    1. curl --retry downloads the full MKV to disk
    2. ffmpeg -c copy converts the local file to fragmented MP4
    If the CDN drops mid-download, curl retries and resumes.
    """
    cache_key = f"{stream_type}_{stream_id}"
    mkv_path = CACHE_DIR / f"{cache_key}.mkv"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    lock_path = CACHE_DIR / f"{cache_key}.converting"

    if output_path.exists():
        return  # already cached

    lock_path.write_text(str(time.time()))
    url = build_stream_url(int(stream_id), stream_type)
    ua = UA_STR

    # Phase 1: Download full MKV with curl (retries on connection drops)
    if not mkv_path.exists():
        log.info(f"Downloading {cache_key} → {mkv_path}")
        dl_cmd = [
            "curl", "-sS", "-L",
            "--retry", "10",
            "--retry-delay", "5",
            "--retry-max-time", "600",
            "--max-time", "600",
            "-H", f"User-Agent: {ua}",
            "-o", str(mkv_path),
            url,
        ]
        dl_proc = await asyncio.create_subprocess_exec(
            *dl_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        dl_stdout, dl_stderr = await dl_proc.communicate()
        dl_size = mkv_path.stat().st_size if mkv_path.exists() else 0
        if dl_proc.returncode != 0:
            log.error(f"Download failed for {cache_key} ({dl_size/1024/1024:.0f}MB): "
                      f"curl rc={dl_proc.returncode} stderr={dl_stderr.decode()[:500]}")
            if lock_path.exists():
                lock_path.unlink()
            return
        log.info(f"Downloaded {cache_key}: {dl_size/1024/1024:.0f} MB")

    # Phase 2: Convert local MKV → fMP4 (no network, can't drop)
    log.info(f"Converting {cache_key} MKV→fMP4")
    cmd = [
        "/usr/bin/ffmpeg", "-loglevel", "warning",
        "-i", str(mkv_path),
        "-c", "copy",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-f", "mp4",
        str(output_path),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    async def log_stderr():
        while proc.stderr:
            line = await proc.stderr.readline()
            if not line: break
            log.warning(f"mp4-convert: {line.decode().rstrip()}")

    stderr_task = asyncio.create_task(log_stderr())
    await proc.wait()
    stderr_task.cancel()
    try: await stderr_task
    except asyncio.CancelledError: pass

    # Clean up
    if lock_path.exists():
        lock_path.unlink()
    # Delete MKV to free disk — only if conversion succeeded
    if proc.returncode == 0 and output_path.exists() and mkv_path.exists():
        mkv_path.unlink()
        log.info(f"Cleaned up MKV for {cache_key}")

    file_size = output_path.stat().st_size if output_path.exists() else 0
    if proc.returncode != 0:
        log.warning(f"MP4 conversion exited {proc.returncode} for {cache_key} "
                     f"(partial: {file_size / (1024*1024):.0f} MB)")
    else:
        log.info(f"MP4 cached: {cache_key} ({file_size / (1024*1024):.0f} MB)")


async def _safe_convert(stream_id: str, stream_type: str, cache_key: str):
    """Wrapper that catches exceptions so background tasks don't die silently."""
    try:
        await convert_to_mp4(stream_id, stream_type)
    except Exception as e:
        log.error(f"Conversion failed for {cache_key}: {e}", exc_info=True)
    finally:
        _converting.pop(cache_key, None)


@app.get("/api/movie/convert/{stream_id}")
async def convert_movie(stream_id: int, retry: bool = False):
    """Trigger MKV→MP4 conversion for a movie. Returns status.
    Set ?retry=1 to re-convert even if already cached."""
    cache_key = f"movie_{stream_id}"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    lock_path = CACHE_DIR / f"{cache_key}.converting"

    mkv_path = CACHE_DIR / f"{cache_key}.mkv"
    if retry:
        if output_path.exists():
            output_path.unlink()
        if mkv_path.exists():
            mkv_path.unlink()

    if output_path.exists() and output_path.stat().st_size > 0:
        touch_access(cache_key)
        return {"status": "ready", "message": "Cached"}

    if lock_path.exists():
        return {"status": "converting", "message": "Conversion in progress"}

    # Start conversion in background
    if cache_key not in _converting:
        _converting[cache_key] = asyncio.create_task(
            _safe_convert(str(stream_id), "movie", cache_key))

    return {"status": "converting", "message": "Conversion started"}


@app.get("/api/series/convert/{series_id}/{episode_id}")
async def convert_series_ep(series_id: int, episode_id: int, retry: bool = False):
    """Trigger MKV→MP4 conversion for a series episode.
    Set ?retry=1 to re-convert even if already cached."""
    cache_key = f"series_{episode_id}"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    lock_path = CACHE_DIR / f"{cache_key}.converting"
    mkv_path = CACHE_DIR / f"{cache_key}.mkv"

    if retry:
        if output_path.exists():
            output_path.unlink()
        if mkv_path.exists():
            mkv_path.unlink()

    if output_path.exists() and output_path.stat().st_size > 0:
        touch_access(cache_key)
        return {"status": "ready", "message": "Cached"}

    if lock_path.exists():
        return {"status": "converting", "message": "Conversion in progress"}

    if cache_key not in _converting:
        _converting[cache_key] = asyncio.create_task(
            _safe_convert(str(episode_id), "series", cache_key))

    return {"status": "converting", "message": "Conversion started"}


@app.get("/api/stream/movie/{stream_id}/mp4")
async def serve_movie_mp4(stream_id: int, request: Request):
    """Serve a cached MP4 movie with byte-range support for seeking."""
    cache_key = f"movie_{stream_id}"
    output_path = CACHE_DIR / f"{cache_key}.mp4"

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise HTTPException(404, "MP4 not yet converted. Call /api/movie/convert/{id} first.")

    touch_access(cache_key)
    return serve_cached_mp4(output_path, request)


@app.get("/api/stream/series/{series_id}/{episode_id}/mp4")
async def serve_series_mp4(series_id: int, episode_id: int, request: Request):
    """Serve a cached MP4 series episode with byte-range support."""
    cache_key = f"series_{episode_id}"
    output_path = CACHE_DIR / f"{cache_key}.mp4"

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise HTTPException(404, "MP4 not yet converted. Call /api/series/convert/{sid}/{eid} first.")

    return serve_cached_mp4(output_path, request)


def serve_cached_mp4(path: Path, request: Request):
    """Serve a local MP4 file with proper Range/206 support for seeking."""
    file_size = path.stat().st_size
    range_header = request.headers.get("range")

    if not range_header:
        return FileResponse(path, media_type="video/mp4", headers={
            "Access-Control-Allow-Origin": "*",
            "Accept-Ranges": "bytes",
        })

    # Parse Range: bytes=START-END
    start = 0
    end = file_size - 1
    if range_header.startswith("bytes="):
        parts = range_header[6:].split("-")
        start = int(parts[0]) if parts[0] else 0
        if len(parts) > 1 and parts[1]:
            end = min(int(parts[1]), file_size - 1)

    chunk_size = end - start + 1

    async def range_stream():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = chunk_size
            while remaining > 0:
                buf = f.read(min(65536, remaining))
                if not buf:
                    break
                remaining -= len(buf)
                yield buf

    return StreamingResponse(
        range_stream(),
        status_code=206,
        media_type="video/mp4",
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(chunk_size),
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
        },
    )


# ══════════════════════════════════════════════════════════════════════════════
# ── VOD HLS Streaming ───────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

HLS_DIR = CACHE_DIR / "hls"
HLS_DIR.mkdir(parents=True, exist_ok=True)
_hls_tasks: dict[str, asyncio.Task] = {}  # cache_key → ffprobe task
_hls_procs: dict[str, asyncio.subprocess.Process] = {}  # cache_key → ffmpeg proc
_mkv_downloaders: dict[str, asyncio.subprocess.Process] = {}  # cache_key → curl proc


async def download_mkv(stream_id: str, stream_type: str, cache_key: str) -> Optional[Path]:
    """Download MKV from CDN to disk with retries. Returns path on success."""
    mkv_path = CACHE_DIR / f"{cache_key}.mkv"
    if mkv_path.exists() and mkv_path.stat().st_size > 0:
        return mkv_path

    url = build_stream_url(int(stream_id), stream_type)
    ua = UA_STR

    log.info(f"[HLS] Downloading {cache_key} → {mkv_path}")
    cmd = [
        "curl", "-sS", "-L",
        "--retry", "10", "--retry-delay", "5",
        "--retry-max-time", "600", "--max-time", "900",
        "-H", f"User-Agent: {ua}",
        "-o", str(mkv_path), url,
    ]
    proc = await asyncio.create_subprocess_exec(*cmd)
    _mkv_downloaders[cache_key] = proc
    await proc.wait()
    _mkv_downloaders.pop(cache_key, None)

    if proc.returncode != 0 or not mkv_path.exists():
        log.error(f"[HLS] Download failed for {cache_key}")
        return None
    log.info(f"[HLS] Downloaded {cache_key}: {mkv_path.stat().st_size/1024/1024:.0f} MB")
    return mkv_path


async def run_hls_segmenter(cache_key: str, input_path: Path):
    """Run ffmpeg to segment a local MKV/MP4 into HLS (.m3u8 + .ts)."""
    seg_dir = HLS_DIR / cache_key
    seg_dir.mkdir(parents=True, exist_ok=True)

    # Clear old segments
    for f in seg_dir.glob("*.ts"):
        f.unlink()
    pl_path = seg_dir / "playlist.m3u8"
    if pl_path.exists():
        pl_path.unlink()

    ffmpeg_args = [
        "/usr/bin/ffmpeg", "-loglevel", "warning", "-y",
        "-i", str(input_path),
        "-c", "copy",
        "-f", "hls",
        "-hls_time", "4",
        "-hls_list_size", "0",
        "-hls_flags", "delete_segments",
        str(seg_dir / "playlist.m3u8"),
    ]

    # Kill any existing segmenter for this stream
    old = _hls_procs.pop(cache_key, None)
    if old and old.returncode is None:
        old.kill()

    log.info(f"[HLS] Segmenting {cache_key}")
    proc = await asyncio.create_subprocess_exec(*ffmpeg_args)
    _hls_procs[cache_key] = proc
    await proc.wait()
    _hls_procs.pop(cache_key, None)

    if proc.returncode != 0:
        log.warning(f"[HLS] Segmenter exited {proc.returncode} for {cache_key}")
    else:
        # Clean up MKV source file after successful HLS conversion (free disk)
        mkv_path = CACHE_DIR / f"{cache_key}.mkv"
        if mkv_path.exists():
            try:
                mkv_path.unlink()
                log.info(f"[HLS] Cleaned up MKV for {cache_key}")
            except Exception as e:
                log.warning(f"[HLS] Failed to clean MKV {cache_key}: {e}")


async def ensure_hls(stream_id: str, stream_type: str, seek_seconds: float = 0) -> bool:
    """Ensure HLS segments exist for a VOD stream. Returns True if ready.
    seek_seconds is ignored — seeking is handled client-side via hls.js.
    HLS is always generated from start for seekable playback."""
    cache_key = f"{stream_type}_{stream_id}"
    seg_dir = HLS_DIR / cache_key
    pl_path = seg_dir / "playlist.m3u8"

    # Check if we already have a cached MP4 (fast path)
    mp4_path = CACHE_DIR / f"{cache_key}.mp4"

    if mp4_path.exists():
        # Cached MP4 → convert to HLS (~7s for full movie)
        if not pl_path.exists():
            log.info(f"[HLS] Converting cached MP4 → HLS: {cache_key}")
            await run_hls_segmenter(cache_key, mp4_path)
        return pl_path.exists()

    # No cached MP4 — download MKV then convert
    if cache_key in _hls_tasks:
        # Already in progress
        return pl_path.exists()

    async def _do():
        try:
            mkv = await download_mkv(stream_id, stream_type, cache_key)
            if mkv:
                await run_hls_segmenter(cache_key, mkv)
        except Exception as e:
            log.error(f"[HLS] Pipeline failed for {cache_key}: {e}", exc_info=True)
        finally:
            _hls_tasks.pop(cache_key, None)

    _hls_tasks[cache_key] = asyncio.create_task(_do())
    return False  # Will be ready after download + segment


@app.get("/api/movie/hls/{stream_id}")
async def movie_hls_start(stream_id: int, start: float = 0):
    """Start HLS streaming for a movie. Returns playlist URL when ready."""
    ready = await ensure_hls(str(stream_id), "movie", start)
    cache_key = f"movie_{stream_id}"
    pl_path = HLS_DIR / cache_key / "playlist.m3u8"

    if pl_path.exists():
        touch_access(cache_key)
        return {"status": "ready", "playlist": f"/api/hls/movie/{stream_id}/playlist.m3u8"}

    return {"status": "preparing", "message": "Downloading and segmenting..."}


@app.get("/api/series/hls/{series_id}/{episode_id}")
async def series_hls_start(series_id: int, episode_id: int, start: float = 0):
    """Start HLS streaming for a series episode."""
    ready = await ensure_hls(str(episode_id), "series", start)
    cache_key = f"series_{episode_id}"
    pl_path = HLS_DIR / cache_key / "playlist.m3u8"

    if pl_path.exists():
        touch_access(cache_key)
        return {"status": "ready", "playlist": f"/api/hls/series/{episode_id}/playlist.m3u8"}

    return {"status": "preparing", "message": "Downloading and segmenting..."}


# Serve HLS segments and playlists
from fastapi.responses import FileResponse as FastAPIFileResponse


@app.get("/api/hls/{stream_type}/{stream_id}/{filename}")
async def serve_hls_file(stream_type: str, stream_id: str, filename: str):
    """Serve .m3u8 playlist or .ts segment for HLS playback."""
    if ".." in filename or "/" in filename:
        raise HTTPException(400, "Invalid filename")

    cache_key = f"{stream_type}_{stream_id}"
    file_path = HLS_DIR / cache_key / filename

    if not file_path.exists():
        raise HTTPException(404, "Segment not found")

    touch_access(cache_key)
    media = "application/vnd.apple.mpegurl" if filename.endswith(".m3u8") else "video/mp2t"
    return FastAPIFileResponse(file_path, media_type=media, headers={
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
    })


# ══════════════════════════════════════════════════════════════════════════════
# ── DASH Streaming (MPD manifest generation) ─────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════
# Generate DASH MPD manifests that wrap existing stream endpoints for
# shaka-player playback with mimeType="application/dash+xml".


def _mime_from_url(url: str) -> str:
    """Guess the content mime type from a stream URL extension."""
    ext = url.rsplit(".", 1)[-1].lower() if "." in url else ""
    mime_map = {
        "ts": "video/mp2t",
        "mkv": "video/x-matroska",
        "mp4": "video/mp4",
        "m4v": "video/mp4",
        "webm": "video/webm",
        "avi": "video/x-msvideo",
        "mov": "video/quicktime",
    }
    return mime_map.get(ext, "video/mp2t")


def generate_live_mpd(stream_id: int, stream_url: str) -> str:
    """Generate a dynamic MPD manifest for a live MPEG-TS stream.

    The MPD wraps the existing stream proxy endpoint so shaka-player
    can load it with mimeType='application/dash+xml'.
    Uses the 'dynamic' profile for live content.
    """
    mime = _mime_from_url(stream_url)
    # Escape XML special characters in the URL
    safe_url = stream_url.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    # Timestamp in ISO 8601 for availabilityStartTime
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    return f'''<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-live:2011"
     type="dynamic"
     availabilityStartTime="{now_iso}"
     publishTime="{now_iso}"
     minimumUpdatePeriod="PT10S"
     minBufferTime="PT15S"
     timeShiftBufferDepth="PT120S">
  <Period id="1">
    <AdaptationSet mimeType="{mime}" contentType="video" startWithSAP="1">
      <Representation bandwidth="5000000">
        <BaseURL>{safe_url}</BaseURL>
        <SegmentBase indexRangeExact="true">
          <Initialization range="0-0" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>'''


def generate_vod_mpd(stream_id: int, stream_type: str, stream_url: str) -> str:
    """Generate a static onDemand MPD manifest for a VOD MKV/fMP4 stream.

    Uses the 'static' onDemand profile which works with single-file
    content. shaka-player will use byte-range requests (via our
    existing Range-supporting stream endpoints) to seek within the file.
    """
    mime = _mime_from_url(stream_url)
    safe_url = stream_url.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    return f'''<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"
     type="static">
  <Period>
    <AdaptationSet mimeType="{mime}" contentType="video" startWithSAP="1">
      <Representation bandwidth="5000000">
        <BaseURL>{safe_url}</BaseURL>
        <SegmentBase indexRangeExact="true">
          <Initialization range="0-0" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>'''


@app.get("/api/stream/live/{stream_id}/manifest.mpd")
async def live_dash_manifest(stream_id: int):
    """DASH MPD manifest for live TV stream playback via shaka-player.

    Returns a dynamic MPD that wraps our existing live TS stream proxy
    endpoint. The frontend passes mimeType='application/dash+xml' to
    the useShakaPlayer hook.
    """
    url = build_stream_url(stream_id, "live")
    xml = generate_live_mpd(stream_id, url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        },
    )


@app.get("/api/stream/movie/{stream_id}/manifest.mpd")
async def movie_dash_manifest(stream_id: int):
    """DASH MPD manifest for movie playback via shaka-player.

    Returns a static onDemand MPD wrapping our existing movie stream
    proxy endpoint. shaka-player uses byte-range requests for seeking.
    """
    url = build_stream_url(stream_id, "movie")
    xml = generate_vod_mpd(stream_id, "movie", url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        },
    )


@app.get("/api/stream/series/{series_id}/{episode_id}/manifest.mpd")
async def series_dash_manifest(series_id: int, episode_id: int):
    """DASH MPD manifest for series episode playback via shaka-player.

    Returns a static onDemand MPD wrapping our existing series stream
    proxy endpoint.
    """
    url = build_stream_url(episode_id, "series")
    xml = generate_vod_mpd(episode_id, "series", url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        },
    )


# ── Serve Frontend (must be last) ───────────────────────────────────────────
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

# ── IMAGE PROXY ──────────────────────────────────────────────────

# In-memory image cache (TTL-based, to avoid re-fetching from CDN)
_img_cache: dict[str, tuple[float, bytes, str]] = {}  # url -> (fetched_at, content, content_type)
_IMG_CACHE_TTL = 3600  # 1 hour
_MAX_IMG_CACHE_SIZE = 500  # evict oldest entry when exceeded

# ── TMDB v3 API Proxy ────────────────────────────────────────────
# Requires TMDB_API_KEY env var. When unset, endpoints return empty results.


@app.get("/api/image-proxy")
async def image_proxy(request: Request, url: str = Query(...)):
    """Proxy images from blocked CDNs (cmc.exchange-cdn.com) through our server."""
    from urllib.parse import urlparse
    
    # Hotlink guard: only allow requests from our own frontend
    referer = request.headers.get("referer", "")
    origin = request.headers.get("origin", "")
    host = request.headers.get("host", "")
    # Allow: same-origin requests (empty referer = direct browser loads, our host, or localhost dev)
    is_ours = (
        not referer  # direct browser loads (CSS backgrounds, etc.)
        or host in referer
        or "localhost" in referer
        or "127.0.0.1" in referer
        or (origin and (host in origin or "localhost" in origin))
    )
    if not is_ours:
        raise HTTPException(403, "Direct access not allowed — use from the Spacetime-TV app")
    
    # SSRF guard: only allow known image CDNs
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(400, "Invalid URL")
    
    allowed_hosts = {"cmc.exchange-cdn.com", "image.tmdb.org"}
    host = parsed.hostname or ""
    if not any(host == a or host.endswith("." + a) for a in allowed_hosts):
        raise HTTPException(400, f"Host not allowed: {host}")
    
    # Check in-memory cache (L1)
    now = time.time()
    if url in _img_cache:
        cached_at, content, ct = _img_cache[url]
        if now - cached_at < _IMG_CACHE_TTL:
            return Response(content=content, media_type=ct,
                          headers={"Cache-Control": "public, max-age=86400"})
        del _img_cache[url]
    
    # Check disk cache (L2) — survive restarts, larger capacity
    img_key = _img_cache_key(url)
    disk_hit = _img_read_disk(img_key)
    if disk_hit is not None:
        content, ct, stored_at = disk_hit
        # Re-populate L1 (shorter TTL — will refetch from disk on expiry)
        if len(_img_cache) >= _MAX_IMG_CACHE_SIZE:
            oldest_key = min(_img_cache, key=lambda k: _img_cache[k][0])
            del _img_cache[oldest_key]
        _img_cache[url] = (now, content, ct)
        return Response(content=content, media_type=ct,
                       headers={"Cache-Control": "public, max-age=86400"})
    
    resp = await client.get(url, follow_redirects=True)
    resp.raise_for_status()
    content = resp.content
    content_type = resp.headers.get("content-type", "image/jpeg")
    
    # Save to L1
    if len(_img_cache) >= _MAX_IMG_CACHE_SIZE:
        oldest_key = min(_img_cache, key=lambda k: _img_cache[k][0])
        del _img_cache[oldest_key]
    _img_cache[url] = (now, content, content_type)
    
    # Save to L2 (async — fire and forget, non-blocking)
    _img_write_disk(img_key, content, content_type)
    return Response(content=content, media_type=content_type,
                  headers={"Cache-Control": "public, max-age=86400"})

# SPA catch-all: serve index.html for any unmatched route
from fastapi.responses import FileResponse

@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    """Serve index.html for client-side routing."""
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"detail": "Not Found"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8720, log_level="info")
