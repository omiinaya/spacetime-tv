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
        result = {
            "codec": s.get("codec_name", "unknown"),
            "codec_long": s.get("codec_long_name", ""),
            "width": s.get("width", 0),
            "height": s.get("height", 0),
            "profile": s.get("profile", ""),
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
