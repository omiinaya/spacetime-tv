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

# Load .env from server directory
from dotenv import load_dotenv
_env_path = Path(__file__).parent / ".env"
load_dotenv(_env_path)

# ── Config ──────────────────────────────────────────────────────────────────
IPTV_BASE = os.getenv("IPTV_BASE", "http://iptv-provider.example.com")
IPTV_USER = os.getenv("IPTV_USER", "")
IPTV_PASS = os.getenv("IPTV_PASS", "")
EPG_CACHE_FILE = Path(__file__).parent / "epg_cache.json"
EPG_CACHE_TTL = 1800  # 30 min — background SSE refreshes
ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(os.getenv("STATIC_DIR", ROOT / "web" / "dist"))
SERVER_START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_cleanup_task()
    start_cache_warmer()
    _epg_broadcast_task = asyncio.create_task(_epg_broadcast_loop())
    yield


app = FastAPI(title="Spacetime-TV", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Rate Limiting (in-memory fixed window) ──────────────────────────────────
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

_rate_limits: dict[str, tuple[float, int]] = {}  # ip -> (window_start, count)
_RATE_WINDOW = 60  # 1 minute window
_RATE_SEARCH_LIMIT = 100    # requests per window for search/proxy
_RATE_DEFAULT_LIMIT = 1000  # requests per window for everything else

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        path = request.url.path
        
        limit = _RATE_SEARCH_LIMIT if "/api/search" in path or "/api/image-proxy" in path else _RATE_DEFAULT_LIMIT
        
        window_start, count = _rate_limits.get(ip, (0, 0))
        if now - window_start > _RATE_WINDOW:
            window_start = now
            count = 0
        
        if count >= limit:
            return Response(
                content='{"detail":"Too many requests"}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(int(_RATE_WINDOW - (now - window_start)))},
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


# ── EPG Cache ───────────────────────────────────────────────────────────────
epg_cache: dict = {"data": None, "fetched": 0}


async def load_epg() -> dict:
    """Load EPG from cache or fetch XMLTV."""
    now = time.time()
    if epg_cache["data"] and (now - epg_cache["fetched"]) < EPG_CACHE_TTL:
        return epg_cache["data"]

    # Try on-disk cache first
    if EPG_CACHE_FILE.exists():
        try:
            cached = json.loads(EPG_CACHE_FILE.read_text())
            if (now - cached.get("fetched", 0)) < EPG_CACHE_TTL:
                epg_cache["data"] = cached["data"]
                epg_cache["fetched"] = cached["fetched"]
                return cached["data"]
        except Exception as e:
            log.warning(f"EPG cache file corrupted: {e} — will refetch")

    log.info("Fetching EPG XMLTV ...")
    url = f"{IPTV_BASE}/xmltv.php?username={IPTV_USER}&password={IPTV_PASS}"
    try:
        resp = await client.get(url, timeout=120.0)
        resp.raise_for_status()
        data = parse_xmltv(resp.text)
        epg_cache["data"] = data
        epg_cache["fetched"] = now
        # Save to disk
        EPG_CACHE_FILE.write_text(json.dumps({"data": data, "fetched": now}))
        log.info(f"EPG parsed: {len(data.get('programmes', []))} programmes")
        return data
    except Exception as e:
        log.error(f"EPG fetch failed: {e}")
        if epg_cache["data"]:
            return epg_cache["data"]
        return {"channels": [], "programmes": []}


_epg_refresh_task: Optional[asyncio.Task] = None


async def load_epg_background() -> dict:
    """Load EPG — returns cached data immediately (even stale), refreshes in background."""
    now = time.time()
    # If we have cached data, return it straight away
    if epg_cache["data"] is not None:
        if (now - epg_cache["fetched"]) >= EPG_CACHE_TTL:
            # Stale cache — refresh in background
            global _epg_refresh_task
            if _epg_refresh_task is None or _epg_refresh_task.done():
                _epg_refresh_task = asyncio.create_task(_refresh_epg_background())
        return epg_cache["data"]
    # No cache at all — fetch synchronously (first ever load)
    return await load_epg()


async def _refresh_epg_background():
    """Refresh EPG in background task — logs failures but never raises."""
    try:
        await load_epg()
    except Exception as e:
        log.warning(f"Background EPG refresh failed: {e}")


def parse_xmltv(xml_text: str) -> dict:
    """Parse XMLTV into structured data."""
    root = ET.fromstring(xml_text)

    channels = []
    for ch in root.findall("channel"):
        channels.append({
            "id": ch.get("id", ""),
            "name": " ".join(
                (ch.findtext("display-name") or "").split()
            ),
            "icon": (ch.find("icon") or {}).get("src", ""),
        })

    programmes = []
    for prog in root.findall("programme"):
        start_str = prog.get("start", "")
        stop_str = prog.get("stop", "")
        channel = prog.get("channel", "")

        title_el = prog.find("title")
        desc_el = prog.find("desc")
        icon_el = prog.find("icon")
        cat_el = prog.find("category")
        subtitle_el = prog.find("sub-title")

        programmes.append({
            "channel": channel,
            "start": start_str,
            "stop": stop_str,
            "title": (title_el.text or "") if title_el is not None else "",
            "subtitle": (subtitle_el.text or "") if subtitle_el is not None else "",
            "desc": (desc_el.text or "") if desc_el is not None else "",
            "icon": (icon_el.get("src", "")) if icon_el is not None else "",
            "category": (cat_el.text or "") if cat_el is not None else "",
        })

    return {"channels": channels, "programmes": programmes}


# ── Cache helpers ───────────────────────────────────────────────────────────
_cache: dict[str, tuple[float, list | dict]] = {}
CACHE_TTL = 300  # 5 min for API data


async def cached_fetch(key: str, action: str, **params) -> list | dict:
    now = time.time()
    if key in _cache and (now - _cache[key][0]) < CACHE_TTL:
        return _cache[key][1]
    data = await fetch_iptv(action, **params)
    # Don't cache empty lists — provider may have had a transient error
    if isinstance(data, list) and len(data) == 0:
        log.warning(f"cached_fetch: {key} returned empty list, not caching")
        return data
    _cache[key] = (now, data)
    return data


# ── Health ────────────────────────────────────────────────────────────────────

_stream_hits: dict[str, int] = {}  # "type:id" → count
_error_log: list[dict] = []  # [{ts, message, path}] — last 100

def track_hit(stream_type: str, stream_id: int | str):
    key = f"{stream_type}:{stream_id}"
    _stream_hits[key] = _stream_hits.get(key, 0) + 1

def log_error(msg: str, path: str = ""):
    _error_log.append({"ts": time.time(), "message": msg, "path": path})
    if len(_error_log) > 100:
        _error_log.pop(0)

@app.get("/api/health")
async def health_check():
    """Server health: status, uptime, cache stats."""
    uptime = time.time() - SERVER_START_TIME
    cache_stats = {}
    for key, (ts, val) in _cache.items():
        if isinstance(val, list):
            cache_stats[key] = len(val)
        elif isinstance(val, dict):
            cache_stats[key] = list(val.keys())[:5] if val else []
    return {
        "status": "healthy",
        "uptime": round(uptime, 1),
        "epg_age": round(time.time() - epg_cache["fetched"], 0) if epg_cache["fetched"] else None,
        "cached_categories": list(cache_stats.keys()),
    }


@app.post("/api/error")
async def report_error(request: Request):
    """Frontend error beacon: log client-side errors server-side."""
    try:
        body = await request.json()
        msg = body.get("message", "unknown")
        stack = body.get("stack", "")
        component_stack = body.get("componentStack", "")
        url = body.get("url", "")
        user_agent = request.headers.get("user-agent", "")
        log.error(
            f"[CLIENT ERROR] {msg} | URL: {url} | UA: {user_agent[:80]}\n"
            f"  stack: {(stack or 'none')[:300]}\n"
            f"  component: {(component_stack or 'none')[:200]}"
        )
    except Exception as e:
        log.warning(f"[CLIENT ERROR] Failed to parse error body: {e}")
    return {"ok": True}


@app.get("/api/admin/stats")
async def admin_stats():
    """Admin dashboard: cache stats, popular content, error trends."""
    uptime = time.time() - SERVER_START_TIME

    # Popular content — top 20 by hit count
    popular = sorted(_stream_hits.items(), key=lambda x: -x[1])[:20]
    popular_list = [{"stream": k, "hits": v} for k, v in popular]

    # Cache overview
    cache_entries = len(_cache)
    vod_cached = sum(1 for k in _cache if k.startswith("vod_"))
    series_cached = sum(1 for k in _cache if k.startswith("series_"))

    # Recent errors (last 20)
    recent_errors = list(reversed(_error_log[-20:]))

    return {
        "uptime": round(uptime, 1),
        "cache": {
            "total_entries": cache_entries,
            "vod_categories": vod_cached,
            "series_categories": series_cached,
            "epg_age": round(time.time() - epg_cache["fetched"], 0) if epg_cache["fetched"] else None,
        },
        "streams": {
            "total_hits": sum(_stream_hits.values()),
            "unique_streams": len(_stream_hits),
            "popular": popular_list,
        },
        "errors": {
            "total": len(_error_log),
            "recent": recent_errors,
        },
        "sse_clients": len(_epg_clients),
    }


# ── LIVE TV ─────────────────────────────────────────────────────────────────

@app.get("/api/live/categories")
async def live_categories():
    """All live TV categories."""
    data = await cached_fetch("live_cats", "get_live_categories")
    return {"categories": data}


@app.get("/api/live/all")
async def live_all_streams():
    """All live TV streams (cached, for cross-category search)."""
    data = await cached_fetch("live_all", "get_live_streams")
    return {"streams": data}


@app.get("/api/live/streams")
async def live_streams(category_id: str = Query(...)):
    """Live streams for a category."""
    data = await cached_fetch(f"live_{category_id}", "get_live_streams", category_id=category_id)
    return {"streams": data}


# ── STREAM PROXY ─────────────────────────────────────────────────────────────

from starlette.responses import StreamingResponse
from fastapi.responses import Response

UA_STR = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

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
        "ffmpeg",
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


# ── Stream Probe (codec detection) ──────────────────────────────────────────

_probe_cache: dict[str, tuple[float, dict]] = {}
PROBE_CACHE_TTL = 3600


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
            "timeout", "8", "ffprobe",
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
        # Check if CDN returned 405 (movie not on this edge)
        if "405" in stderr_text or "Method Not Allowed" in stderr_text:
            log.info(f"Probe {stream_id}: CDN returned 405 — unavailable on this edge")
            result = {"codec": "unavailable", "error": "Not on this CDN edge"}
            _probe_cache[cache_key] = (now, result)
            return result
        # Try a quick GET to check for 405
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


@app.get("/api/live/probe/{stream_id}")
async def probe_endpoint(stream_id: int):
    """Probe a live stream to detect video codec before playback."""
    return await probe_stream(stream_id, "live")


@app.get("/api/movie/probe/{stream_id}")
async def probe_movie(stream_id: int):
    """Probe a movie stream to detect video codec."""
    return await probe_stream(stream_id, "movie")


@app.get("/api/series/probe/{stream_id}")
async def probe_series(stream_id: int):
    """Probe a series stream to detect video codec."""
    return await probe_stream(stream_id, "series")


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
        "ffmpeg",
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
        "ffmpeg",
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

@app.get("/api/movies/categories")
async def movies_categories():
    """All VOD categories."""
    data = await cached_fetch("vod_categories", "get_vod_categories")
    return {"categories": data}


@app.get("/api/movies")
async def movies(
    category_id: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Movies in a category, with pagination."""
    data = await cached_fetch(f"vod_{category_id}", "get_vod_streams", category_id=category_id)
    if isinstance(data, list):
        total = len(data)
        data = data[offset : offset + limit]
        return {"movies": data, "total": total, "offset": offset, "limit": limit}
    return {"movies": data}


@app.get("/api/movies/unified")
async def movies_unified(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: str = Query(None),
):
    """Unified movie list — all languages merged, grouped by TMDB ID.

    Each entry includes a ``languages`` array so the frontend can offer
    a language switcher on the overlay.
    """
    # ── Collect all VOD streams from the in-memory cache ─────────────
    groups: dict[str, dict] = {}  # tmdb → {movie, languages: {lang_code: {name, stream_id}}}

    for key, (ts, data) in _cache.items():
        if not key.startswith("vod_") or key in ("vod_categories", "vod_cats"):
            continue
        if not isinstance(data, list):
            continue
        for m in data:
            tmdb = m.get("tmdb")
            if not tmdb:
                continue
            name = m.get("name", "")
            lang_match = re.match(r"^(\w{2,3})\s*-\s*(.+)$", name)
            lang_code = lang_match.group(1) if lang_match else ""
            base_name = lang_match.group(2).strip() if lang_match else name

            if tmdb not in groups:
                groups[tmdb] = {
                    "movie": m,
                    "base_name": base_name,
                    "languages": {},
                }
            groups[tmdb]["languages"][lang_code or "??"] = {
                "name": name,
                "stream_id": m["stream_id"],
                "container_extension": m.get("container_extension", ""),
            }

    # ── Build consolidated list ──────────────────────────────────────
    unified = []
    for tmdb, grp in groups.items():
        movie = grp["movie"]
        langs = grp["languages"]
        lang_list = [{"code": code, **info} for code, info in langs.items()]
        # Sort: EN first, then alphabetical
        lang_list.sort(key=lambda x: (x["code"] != "EN", x["code"]))
        unified.append({
            **movie,
            "base_name": grp["base_name"],
            "languages": lang_list,
            "language_count": len(lang_list),
        })

    # ── Search filter ────────────────────────────────────────────────
    if q:
        ql = q.lower()
        unified = [u for u in unified if ql in u.get("name", "").lower() or ql in u.get("base_name", "").lower()]

    # ── Paginate ─────────────────────────────────────────────────────
    total = len(unified)
    unified = unified[offset : offset + limit]
    return {"movies": unified, "total": total, "offset": offset, "limit": limit}


@app.get("/api/movies/{stream_id}")
async def movie_details(stream_id: int):
    """Movie details — plot, cast, director, genre, backdrop, etc."""
    data = await cached_fetch(f"vod_info_{stream_id}", "get_vod_info", vod_id=stream_id)
    if isinstance(data, dict):
        # Wrap in consistent structure
        info = data.get("info", data)
        return {"info": info}
    return {"info": data}


# ── SERIES ──────────────────────────────────────────────────────────────────

@app.get("/api/series/categories")
async def series_categories():
    """All series categories."""
    data = await cached_fetch("series_cats", "get_series_categories")
    return {"categories": data}


@app.get("/api/series")
async def series_list(
    category_id: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Series in a category, with pagination."""
    data = await cached_fetch(f"series_{category_id}", "get_series", category_id=category_id)
    if isinstance(data, list):
        total = len(data)
        data = data[offset : offset + limit]
        return {"series": data, "total": total, "offset": offset, "limit": limit}
    return {"series": data}


@app.get("/api/series/{series_id}")
async def series_details(series_id: int):
    """Series details with episodes."""
    data = await cached_fetch(f"series_info_{series_id}", "get_series_info", series_id=series_id)
    if isinstance(data, dict):
        return data
    return {"info": data}


# ── Subtitles ────────────────────────────────────────────────────────────────
# Probe streams for embedded subtitle tracks, extract to WebVTT on demand.

SUBTITLE_CACHE: dict[str, list[dict]] = {}  # stream_id → [{index, language, codec}]
SUBTITLE_VTT_CACHE: dict[str, str] = {}     # "stream_id:index" → VTT content
AUDIO_CACHE: dict[str, list[dict]] = {}     # stream_id → [{index, language, codec, channels}]


def _get_stream_url(stream_id: int, media_type: str = "movie") -> str:
    """Build the provider MKV URL for ffprobe/ffmpeg."""
    if media_type == "movie":
        return f"{IPTV_BASE}/movie/{IPTV_USER}/{IPTV_PASS}/{stream_id}.mkv"
    else:
        return f"{IPTV_BASE}/series/{IPTV_USER}/{IPTV_PASS}/{stream_id}.mkv"


@app.get("/api/subtitles/probe/{media_type}/{stream_id}")
async def probe_subtitles(media_type: str, stream_id: int):
    """Probe a stream for embedded subtitle tracks. Returns list of tracks."""
    cache_key = f"{media_type}:{stream_id}"
    if cache_key in SUBTITLE_CACHE:
        return {"tracks": SUBTITLE_CACHE[cache_key], "cached": True}

    url = _get_stream_url(stream_id, media_type)
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=20.0)
        if proc.returncode != 0:
            return {"tracks": [], "error": "Probe failed"}

        info = json.loads(stdout)
        tracks = []
        for s in info.get("streams", []):
            if s.get("codec_type") == "subtitle":
                tags = s.get("tags", {})
                tracks.append({
                    "index": s.get("index", 0),
                    "language": tags.get("language", "und"),
                    "title": tags.get("title", ""),
                    "codec": s.get("codec_name", "unknown"),
                })
        SUBTITLE_CACHE[cache_key] = tracks
        return {"tracks": tracks, "cached": False}
    except asyncio.TimeoutError:
        return {"tracks": [], "error": "Probe timed out"}
    except Exception as e:
        return {"tracks": [], "error": str(e)}


@app.get("/api/subtitles/{media_type}/{stream_id}/{track_index}")
async def get_subtitles(media_type: str, stream_id: int, track_index: int):
    """Extract a subtitle track to WebVTT and serve it."""
    cache_key = f"{media_type}:{stream_id}:{track_index}"
    if cache_key in SUBTITLE_VTT_CACHE:
        return Response(
            content=SUBTITLE_VTT_CACHE[cache_key],
            media_type="text/vtt",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    url = _get_stream_url(stream_id, media_type)
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y",
            "-i", url,
            "-map", f"0:s:{track_index}",
            "-f", "webvtt",
            "pipe:1",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60.0)
        if proc.returncode != 0 or not stdout:
            raise HTTPException(500, f"Subtitle extraction failed")

        vtt = stdout.decode("utf-8", errors="replace")
        SUBTITLE_VTT_CACHE[cache_key] = vtt
        return Response(
            content=vtt,
            media_type="text/vtt",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except asyncio.TimeoutError:
        raise HTTPException(504, "Subtitle extraction timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/api/audio/probe/{media_type}/{stream_id}")
async def probe_audio(media_type: str, stream_id: int):
    """Probe a stream for audio tracks. Returns list of tracks with language/codec/channels."""
    cache_key = f"{media_type}:{stream_id}"
    if cache_key in AUDIO_CACHE:
        return {"tracks": AUDIO_CACHE[cache_key], "cached": True}

    url = _get_stream_url(stream_id, media_type)
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=20.0)
        if proc.returncode != 0:
            return {"tracks": [], "error": "Probe failed"}

        info = json.loads(stdout)
        tracks = []
        for s in info.get("streams", []):
            if s.get("codec_type") == "audio":
                tags = s.get("tags", {})
                tracks.append({
                    "index": s.get("index", 0),
                    "language": tags.get("language", "und"),
                    "title": tags.get("title", ""),
                    "codec": s.get("codec_name", "unknown"),
                    "channels": s.get("channels", 0),
                })
        AUDIO_CACHE[cache_key] = tracks
        return {"tracks": tracks, "cached": False}
    except asyncio.TimeoutError:
        return {"tracks": [], "error": "Probe timed out"}
    except Exception as e:
        return {"tracks": [], "error": str(e)}


@app.get("/api/download/{media_type}/{stream_id}")
async def download_stream(media_type: str, stream_id: int):
    """Download a VOD stream as MKV for offline playback."""
    url = _get_stream_url(stream_id, media_type)
    return RedirectResponse(url=url, status_code=302)


# ── EPG GUIDE ───────────────────────────────────────────────────────────────

@app.get("/api/guide")
async def tv_guide(
    channel: Optional[str] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(60, ge=1, le=200),
):
    """EPG guide — paginated by channel, with stream_id mapping for click-to-play.

    Returns: { channel_groups: [...], total_channels: N }
    Each group: { channel_id, channel_name, channel_icon, stream_id, programmes: [...] }
    """
    epg = await load_epg_background()
    programmes = epg.get("programmes", [])
    channels = epg.get("channels", [])

    if channel:
        programmes = [p for p in programmes if p["channel"] == channel]

    # Build channel map (id → name) and icon map (id → icon URL)
    ch_map = {c["id"]: c["name"] for c in channels}
    ch_icon_map = {c["id"]: c.get("icon", "") for c in channels}

    # Build channel_id → stream_id mapping from live_all cache
    ch_to_stream: dict[str, int] = {}
    try:
        live_all = await cached_fetch("live_all", "get_live_streams")
        for s in live_all:
            epg_id = s.get("epg_channel_id")
            if epg_id and epg_id not in ch_to_stream:
                ch_to_stream[epg_id] = s["stream_id"]
    except Exception as e:
        log.warning(f"EPG: Failed to load live_all for stream mapping: {e}")

    now = datetime.now(timezone.utc)
    cutoff_past = now - timedelta(minutes=30)
    cutoff_future = now + timedelta(hours=4)

    # Fast XMLTV timestamp → datetime via fromisoformat (28x faster than strptime)
    def parse_ts(raw: str) -> datetime:
        """'20260623043400 +0200' → datetime"""
        # Build ISO: '2026-06-23T04:34:00+02:00'
        iso = f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}T{raw[8:10]}:{raw[10:12]}:{raw[12:14]}{raw[15:18]}:{raw[18:20]}"
        return datetime.fromisoformat(iso)

    # Filter to currently airing + upcoming (next 4 hours) and group by channel
    by_channel: dict[str, list[dict]] = {}
    for p in programmes:
        try:
            start = parse_ts(p["start"])
            stop = parse_ts(p["stop"])
            if stop < cutoff_past:
                continue
            if start > cutoff_future:
                continue
            ch_id = p["channel"]
            if ch_id not in by_channel:
                by_channel[ch_id] = []
            by_channel[ch_id].append({
                "start": p["start"],
                "stop": p["stop"],
                "title": p.get("title", ""),
                "subtitle": p.get("subtitle", ""),
                "desc": p.get("desc", ""),
                "category": p.get("category", ""),
                "is_live": start <= now <= stop,
            })
        except (ValueError, IndexError) as e:
            log.debug(f"Bad EPG timestamp in programme: {e}")
            continue

    # Build channel groups sorted by name
    channel_groups = []
    for ch_id, progs in by_channel.items():
        progs.sort(key=lambda p: p["start"])
        channel_groups.append({
            "channel_id": ch_id,
            "channel_name": ch_map.get(ch_id, ch_id),
            "channel_icon": ch_icon_map.get(ch_id, ""),
            "stream_id": ch_to_stream.get(ch_id),
            "programmes": progs,
        })

    # Sort by channel name (case-insensitive)
    channel_groups.sort(key=lambda g: g["channel_name"].lower())

    total = len(channel_groups)
    page = channel_groups[offset:offset + limit]

    return {
        "channel_groups": page,
        "total_channels": total,
        "offset": offset,
        "limit": limit,
    }


# ── EPG SSE ─────────────────────────────────────────────────────────────────
# Background EPG broadcast: every 30 minutes, force-refresh the EPG cache
# and notify all connected SSE clients to reload.

_epg_clients: list[asyncio.Queue] = []

async def _epg_broadcast_loop():
    """Background task: refresh EPG every 30 min and notify clients."""
    while True:
        await asyncio.sleep(1800)  # 30 minutes
        log.info("[EPG-SSE] Refreshing EPG for broadcast…")
        try:
            # Force fresh fetch by bumping cache timestamp
            epg_cache["fetched"] = 0
            await load_epg()
            # Notify all connected clients
            dead: list[asyncio.Queue] = []
            for q in _epg_clients:
                try:
                    q.put_nowait("update")
                except asyncio.QueueFull:
                    dead.append(q)
            for q in dead:
                if q in _epg_clients:
                    _epg_clients.remove(q)
            log.info(f"[EPG-SSE] Broadcast to {len(_epg_clients)} clients")
        except Exception as e:
            log.error(f"[EPG-SSE] Broadcast failed: {e}")


@app.get("/api/epg/events")
async def epg_sse(request: Request):
    """SSE endpoint: notifies clients when EPG data has been refreshed."""
    async def event_stream():
        q: asyncio.Queue = asyncio.Queue(maxsize=8)
        _epg_clients.append(q)
        try:
            # Send initial connected event
            yield "event: connected\ndata: ok\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"event: {msg}\ndata: refreshed\n\n"
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield ": keepalive\n\n"
        finally:
            if q in _epg_clients:
                _epg_clients.remove(q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Cache Warming ───────────────────────────────────────────────────────────
# Pre-fetch all VOD/series data at startup so searches are instant.
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

# ── SEARCH ───────────────────────────────────────────────────────────────────

@app.get("/api/search")
async def search(q: str = Query(..., min_length=2)):
    """Search across live TV, movies, and series (cache-aware fast path)."""
    query = q.lower().strip()
    results = {"live": [], "movies": [], "series": []}

    try:
        live_data = await cached_fetch("live_all", "get_live_streams")
        results["live"] = [s for s in live_data if query in s.get("name", "").lower()][:20]
    except Exception as e:
        log.error(f"Live search error: {e}")

    def _search_cached(prefix: str, id_field: str, name_fields=("name",)):
        """Search in-memory cache — scan ALL categories, return top 20 matches."""
        seen = set()
        out = []
        for key, (ts, data) in _cache.items():
            if not key.startswith(prefix):
                continue
            if not isinstance(data, list):
                continue
            for s in data:
                sid = s.get(id_field)
                if not sid or sid in seen:
                    continue
                seen.add(sid)
                text = " ".join(str(s.get(f, "") or "") for f in name_fields).lower()
                if query in text:
                    out.append(s)
        return out[:20]

    # Fast path: if caches are warm, scan in-memory directly (no async overhead)
    results["movies"] = _search_cached("vod_", "stream_id")
    results["series"] = _search_cached("series_", "series_id", ("name", "plot"))

    # If caches weren't warm, fall back to per-category fetch
    if not results["movies"]:
        async def get_vod_results():
            try:
                vod_cats = await cached_fetch("vod_categories", "get_vod_categories")
                vod_cat_ids = [c["category_id"] for c in vod_cats if c.get("category_id")]
                sem = asyncio.Semaphore(20)
                async def fetch_cat(cid):
                    async with sem:
                        return await cached_fetch(f"vod_{cid}", "get_vod_streams", category_id=cid)
                all_streams = await asyncio.gather(*[fetch_cat(cid) for cid in vod_cat_ids], return_exceptions=True)
                seen = set()
                out = []
                for streams in all_streams:
                    if isinstance(streams, Exception):
                        continue
                    for s in streams:
                        sid = s.get("stream_id")
                        if sid and sid not in seen:
                            seen.add(sid)
                            if query in s.get("name", "").lower():
                                out.append(s)
                                if len(out) >= 20:
                                    return out
                return out
            except Exception as e:
                log.error(f"VOD search error: {e}")
                return []
        results["movies"] = await get_vod_results()

    if not results["series"]:
        async def get_series_results():
            try:
                series_cats = await cached_fetch("series_categories", "get_series_categories")
                series_cat_ids = [c["category_id"] for c in series_cats if c.get("category_id")]
                sem = asyncio.Semaphore(20)
                async def fetch_cat(cid):
                    async with sem:
                        return await cached_fetch(f"series_{cid}", "get_series", category_id=cid)
                all_series = await asyncio.gather(*[fetch_cat(cid) for cid in series_cat_ids], return_exceptions=True)
                seen = set()
                out = []
                for slist in all_series:
                    if isinstance(slist, Exception):
                        continue
                    for s in slist:
                        sid = s.get("series_id")
                        if sid and sid not in seen:
                            seen.add(sid)
                            name = (s.get("name") or "").lower()
                            plot = (s.get("plot") or "").lower()
                            if query in name or query in plot:
                                out.append(s)
                                if len(out) >= 20:
                                    return out
                return out
            except Exception as e:
                log.error(f"Series search error: {e}")
                return []
        results["series"] = await get_series_results()

    return results


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
        "ffmpeg", "-loglevel", "warning",
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
        "ffmpeg", "-loglevel", "warning", "-y",
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

_TMDB_CACHE: dict[str, tuple[float, dict]] = {}  # cache_key -> (fetched_at, data)
_TMDB_CACHE_TTL = 600  # 10 minutes

async def _tmdb_fetch(path: str) -> dict | None:
    """Fetch from TMDB v3 API with caching."""
    api_key = os.getenv("TMDB_API_KEY", "")
    tmdb_base = "https://api.themoviedb.org/3"

    if not api_key:
        return None

    cache_key = f"tmdb_{path}"
    now = time.time()
    if cache_key in _TMDB_CACHE:
        ts, data = _TMDB_CACHE[cache_key]
        if now - ts < _TMDB_CACHE_TTL:
            return data
        del _TMDB_CACHE[cache_key]

    url = f"{tmdb_base}/{path}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            resp = await c.get(url, params={"api_key": api_key})
            if resp.status_code != 200:
                log.warning(f"TMDB API error {resp.status_code} for {path}")
                return None
            data = resp.json()
            _TMDB_CACHE[cache_key] = (now, data)
            return data
    except Exception as e:
        log.error(f"TMDB fetch error for {path}: {e}")
        return None

@app.get("/api/tmdb/trending")
async def tmdb_trending(
    time_window: str = Query("week", regex="^(day|week)$"),
    page: int = Query(1, ge=1, le=20),
):
    """Trending movies from TMDB v3 API.

    Requires TMDB_API_KEY to be set. Returns empty trending list when unset.
    Results are cached for 10 minutes.
    """
    data = await _tmdb_fetch(f"trending/movie/{time_window}?page={page}")
    if data is None:
        return {"trending": [], "total_pages": 0, "total_results": 0, "enabled": False}
    return {
        "trending": data.get("results", []),
        "total_pages": data.get("total_pages", 0),
        "total_results": data.get("total_results", 0),
        "enabled": True,
    }

@app.get("/api/tmdb/search")
async def tmdb_search(
    q: str = Query(..., min_length=2),
    page: int = Query(1, ge=1, le=20),
):
    """Search movies via TMDB v3 API.

    Useful as a fallback when the provider catalog lacks results.
    Requires TMDB_API_KEY to be set.
    """
    data = await _tmdb_fetch(f"search/movie?query={q}&page={page}")
    if data is None:
        return {"results": [], "total_pages": 0, "total_results": 0, "enabled": False}
    return {
        "results": data.get("results", []),
        "total_pages": data.get("total_pages", 0),
        "total_results": data.get("total_results", 0),
        "enabled": True,
    }

@app.get("/api/tmdb/movie/{tmdb_id}")
async def tmdb_movie_details(tmdb_id: int):
    """Full movie details from TMDB v3 API by TMDB ID.

    Enriches the provider metadata with TMDB plot, cast, director, runtime,
    IMDb ID, budget/revenue, production companies, etc.
    Requires TMDB_API_KEY to be set.
    """
    data = await _tmdb_fetch(f"movie/{tmdb_id}")
    if data is None:
        return {"enabled": False, "info": None}
    return {"enabled": True, "info": data}

@app.get("/api/tmdb/movie/{tmdb_id}/similar")
async def tmdb_movie_similar(tmdb_id: int, page: int = Query(1, ge=1, le=10)):
    """Similar movies from TMDB by TMDB ID.

    Used for 'More Like This' recommendations.
    Requires TMDB_API_KEY to be set.
    """
    data = await _tmdb_fetch(f"movie/{tmdb_id}/similar?page={page}")
    if data is None:
        return {"results": [], "total_pages": 0, "total_results": 0, "enabled": False}
    return {
        "results": data.get("results", []),
        "total_pages": data.get("total_pages", 0),
        "total_results": data.get("total_results", 0),
        "enabled": True,
    }

@app.get("/api/tmdb/configuration")
async def tmdb_configuration():
    """TMDB API configuration (image base URLs, sizes, etc.).

    Useful for the frontend to construct correct image URLs.
    Requires TMDB_API_KEY to be set.
    """
    data = await _tmdb_fetch("configuration")
    if data is None:
        return {"enabled": False, "images": None}
    return {"enabled": True, "images": data.get("images", {})}

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
    
    # Check server-side cache
    now = time.time()
    if url in _img_cache:
        cached_at, content, ct = _img_cache[url]
        if now - cached_at < _IMG_CACHE_TTL:
            return Response(content=content, media_type=ct,
                          headers={"Cache-Control": "public, max-age=86400"})
        del _img_cache[url]
    
    resp = await client.get(url, follow_redirects=True)
    resp.raise_for_status()
    content = resp.content
    content_type = resp.headers.get("content-type", "image/jpeg")
    
    # Evict oldest entry if cache is full
    if len(_img_cache) >= _MAX_IMG_CACHE_SIZE:
        oldest_key = min(_img_cache, key=lambda k: _img_cache[k][0])
        del _img_cache[oldest_key]
    
    _img_cache[url] = (now, content, content_type)
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
