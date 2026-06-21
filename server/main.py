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
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("spacetime-tv")

# ── Config ──────────────────────────────────────────────────────────────────
IPTV_BASE = "http://iptv-provider.example.com"
IPTV_USER = "18e099789687"
IPTV_PASS = "9e38d82518"
EPG_CACHE_FILE = Path(__file__).parent / "epg_cache.json"
EPG_CACHE_TTL = 3600  # 1 hour
ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "web" / "dist"

app = FastAPI(title="Spacetime-TV")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── HTTP Client ─────────────────────────────────────────────────────────────
client = httpx.AsyncClient(timeout=30.0)


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
        except Exception:
            pass

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
    if stream_type == "live":
        return f"{IPTV_BASE}/live/{IPTV_USER}/{IPTV_PASS}/{stream_id}.ts"
    elif stream_type == "movie":
        return f"{IPTV_BASE}/movie/{IPTV_USER}/{IPTV_PASS}/{stream_id}.mkv"
    elif stream_type == "series":
        return f"{IPTV_BASE}/series/{IPTV_USER}/{IPTV_PASS}/{stream_id}.mkv"
    return ""


async def get_content_length(url: str) -> Optional[int]:
    """HEAD the remote URL to discover Content-Length."""
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True,
                                     headers={"User-Agent": UA_STR}) as c:
            resp = await c.head(url)
            cl = resp.headers.get("content-length")
            return int(cl) if cl else None
    except Exception:
        return None


async def stream_bytes(url: str):
    """Generator that yields bytes from a streaming URL."""
    headers = {"User-Agent": UA_STR}
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True, headers=headers) as sc:
        async with sc.stream("GET", url) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes():
                yield chunk


async def stream_vod_bytes(url: str, range_header: Optional[str] = None):
    """Generator that yields VOD bytes, optionally with Range support."""
    headers = {"User-Agent": UA_STR}
    if range_header:
        headers["Range"] = range_header
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True, headers=headers) as sc:
        async with sc.stream("GET", url) as resp:
            resp.raise_for_status()
            async for chunk in resp.aiter_bytes():
                yield chunk


async def handle_vod_request(req: Request, stream_id: int, stream_type: str,
                              content_type: str = "video/x-matroska"):
    """Handle a VOD stream request with Range/206 support for seeking."""
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
async def stream_live(stream_id: int):
    """Proxy live TV stream (raw MPEG-TS)."""
    return await stream_proxy(
        build_stream_url(stream_id, "live"), "video/mp2t"
    )


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
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            "-user_agent", ua,
            "-select_streams", "v:0",
            url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _stderr = await asyncio.wait_for(proc.communicate(), timeout=10.0)
    except (asyncio.TimeoutError, Exception) as e:
        log.warning(f"ffprobe failed for {stream_id}: {e}")
        return {"codec": "unknown", "error": str(e)}

    if proc.returncode != 0 or not stdout:
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
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as c:
            async with c.stream("GET", url) as resp:
                cdn_url = str(resp.url)
    except Exception as e:
        log.warning(f"VOD remux URL resolution failed, using original: {e}")

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
    data = await cached_fetch("vod_cats", "get_vod_categories")
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


# ── EPG GUIDE ───────────────────────────────────────────────────────────────

@app.get("/api/guide")
async def tv_guide(channel: Optional[str] = None):
    """EPG data. Optional channel filter."""
    epg = await load_epg()
    programmes = epg.get("programmes", [])
    channels = epg.get("channels", [])

    if channel:
        programmes = [p for p in programmes if p["channel"] == channel]

    # Build channel map
    ch_map = {c["id"]: c["name"] for c in channels}

    now = datetime.now(timezone.utc)
    now_str = now.strftime("%Y%m%d%H%M%S")

    # Filter to currently airing + upcoming (next 4 hours)
    relevant = []
    for p in programmes:
        try:
            start = datetime.strptime(p["start"][:14] + "+0000", "%Y%m%d%H%M%S%z")
            stop = datetime.strptime(p["stop"][:14] + "+0000", "%Y%m%d%H%M%S%z")
            if stop < now - timedelta(minutes=30):
                continue
            if start > now + timedelta(hours=4):
                continue
            relevant.append({
                **p,
                "channel_name": ch_map.get(p["channel"], p["channel"]),
                "is_live": start <= now <= stop,
            })
        except (ValueError, IndexError):
            continue

    # Sort by channel then start time
    relevant.sort(key=lambda p: (p["channel"], p["start"]))
    return {"programmes": relevant, "channels": channels}


# ── SEARCH ───────────────────────────────────────────────────────────────────

@app.get("/api/search")
async def search(q: str = Query(..., min_length=2)):
    """Search across live TV, movies, and series."""
    query = q.lower().strip()
    results = {"live": [], "movies": [], "series": []}

    try:
        # Search live streams (need to fetch all — cached)
        live_data = await cached_fetch("live_all", "get_live_streams")
        for s in live_data:
            name = s.get("name", "").lower()
            if query in name:
                results["live"].append(s)
        results["live"] = results["live"][:20]
    except Exception as e:
        log.error(f"Live search error: {e}")

    try:
        vod_data = await cached_fetch("vod_all", "get_vod_streams")
        for s in vod_data:
            name = s.get("name", "").lower()
            if query in name:
                results["movies"].append(s)
        results["movies"] = results["movies"][:20]
    except Exception as e:
        log.error(f"VOD search error: {e}")

    try:
        series_data = await cached_fetch("series_all", "get_series")
        for s in series_data:
            name = s.get("name", "").lower()
            if query in name or query in (s.get("plot", "") or "").lower():
                results["series"].append(s)
        results["series"] = results["series"][:20]
    except Exception as e:
        log.error(f"Series search error: {e}")

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

    if output_path.exists():
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

    if output_path.exists():
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

    if not output_path.exists():
        raise HTTPException(404, "MP4 not yet converted. Call /api/movie/convert/{id} first.")

    return serve_cached_mp4(output_path, request)


@app.get("/api/stream/series/{series_id}/{episode_id}/mp4")
async def serve_series_mp4(series_id: int, episode_id: int, request: Request):
    """Serve a cached MP4 series episode with byte-range support."""
    cache_key = f"series_{episode_id}"
    output_path = CACHE_DIR / f"{cache_key}.mp4"

    if not output_path.exists():
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
    if mkv_path.exists():
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


async def run_hls_segmenter(cache_key: str, input_path: Path, seek_seconds: float = 0):
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
    ]
    if seek_seconds > 0:
        ffmpeg_args += ["-ss", str(seek_seconds)]
    ffmpeg_args += [
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

    log.info(f"[HLS] Segmenting {cache_key} seek={seek_seconds}s")
    proc = await asyncio.create_subprocess_exec(*ffmpeg_args)
    _hls_procs[cache_key] = proc
    await proc.wait()
    _hls_procs.pop(cache_key, None)

    if proc.returncode != 0:
        log.warning(f"[HLS] Segmenter exited {proc.returncode} for {cache_key}")


async def ensure_hls(stream_id: str, stream_type: str, seek_seconds: float = 0) -> bool:
    """Ensure HLS segments exist for a VOD stream. Returns True if ready."""
    cache_key = f"{stream_type}_{stream_id}"
    seg_dir = HLS_DIR / cache_key
    pl_path = seg_dir / "playlist.m3u8"

    # Check if we already have a cached MP4 (fast path)
    mp4_path = CACHE_DIR / f"{cache_key}.mp4"

    if mp4_path.exists():
        # Cached MP4 → convert to HLS (~7s for full movie)
        if not pl_path.exists():
            log.info(f"[HLS] Converting cached MP4 → HLS: {cache_key}")
            await run_hls_segmenter(cache_key, mp4_path, seek_seconds)
        elif seek_seconds > 0:
            # Re-segment at new position
            await run_hls_segmenter(cache_key, mp4_path, seek_seconds)
        return pl_path.exists()

    # No cached MP4 — download MKV then convert
    if cache_key in _hls_tasks:
        # Already in progress
        return pl_path.exists()

    async def _do():
        try:
            mkv = await download_mkv(stream_id, stream_type, cache_key)
            if mkv:
                await run_hls_segmenter(cache_key, mkv, seek_seconds)
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
        return {"status": "ready", "playlist": f"/api/hls/movie/{stream_id}/playlist.m3u8"}

    return {"status": "preparing", "message": "Downloading and segmenting..."}


@app.get("/api/series/hls/{series_id}/{episode_id}")
async def series_hls_start(series_id: int, episode_id: int, start: float = 0):
    """Start HLS streaming for a series episode."""
    ready = await ensure_hls(str(episode_id), "series", start)
    cache_key = f"series_{episode_id}"
    pl_path = HLS_DIR / cache_key / "playlist.m3u8"

    if pl_path.exists():
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

    media = "application/vnd.apple.mpegurl" if filename.endswith(".m3u8") else "video/mp2t"
    return FastAPIFileResponse(file_path, media_type=media, headers={
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
    })


# ── Serve Frontend (must be last) ───────────────────────────────────────────
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

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
