"""Spacetime-TV Backend — IPTV proxy + EPG parser."""
import asyncio
import hashlib
import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import FastAPI, HTTPException, Query
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
    _cache[key] = (now, data)
    return data


# ── LIVE TV ─────────────────────────────────────────────────────────────────

@app.get("/api/live/categories")
async def live_categories():
    """All live TV categories."""
    data = await cached_fetch("live_cats", "get_live_categories")
    return {"categories": data}


@app.get("/api/live/streams")
async def live_streams(category_id: str = Query(...)):
    """Live streams for a category."""
    data = await cached_fetch(f"live_{category_id}", "get_live_streams", category_id=category_id)
    return {"streams": data}


# ── STREAM PROXY ─────────────────────────────────────────────────────────────

from starlette.responses import StreamingResponse
from fastapi.responses import Response


def build_stream_url(stream_id: int, stream_type: str) -> str:
    """Build the IPTV stream URL for a given stream ID and type."""
    if stream_type == "live":
        return f"{IPTV_BASE}/live/{IPTV_USER}/{IPTV_PASS}/{stream_id}.ts"
    elif stream_type == "movie":
        return f"{IPTV_BASE}/movie/{IPTV_USER}/{IPTV_PASS}/{stream_id}.mkv"
    elif stream_type == "series":
        return f"{IPTV_BASE}/series/{IPTV_USER}/{IPTV_PASS}/{stream_id}.mkv"
    return ""


async def stream_bytes(url: str):
    """Generator that yields bytes from a streaming URL."""
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True, headers=headers) as stream_client:
        async with stream_client.stream("GET", url) as resp:
            resp.raise_for_status()
            ct = resp.headers.get("content-type", "application/octet-stream")
            async for chunk in resp.aiter_bytes():
                yield chunk


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


@app.get("/api/stream/movie/{stream_id}")
async def stream_movie(stream_id: int):
    """Proxy movie stream (MKV)."""
    return await stream_proxy(
        build_stream_url(stream_id, "movie"), "video/x-matroska"
    )


@app.get("/api/stream/series/{series_id}/{episode_id}")
async def stream_series_ep(series_id: int, episode_id: int):
    """Proxy series episode stream (MKV)."""
    return await stream_proxy(
        build_stream_url(episode_id, "series"), "video/x-matroska"
    )

@app.get("/api/movies/categories")
async def movies_categories():
    """All VOD categories."""
    data = await cached_fetch("vod_cats", "get_vod_categories")
    return {"categories": data}


@app.get("/api/movies")
async def movies(category_id: str = Query(...)):
    """Movies in a category."""
    data = await cached_fetch(f"vod_{category_id}", "get_vod_streams", category_id=category_id)
    return {"movies": data}


# ── SERIES ──────────────────────────────────────────────────────────────────

@app.get("/api/series/categories")
async def series_categories():
    """All series categories."""
    data = await cached_fetch("series_cats", "get_series_categories")
    return {"categories": data}


@app.get("/api/series")
async def series_list(category_id: str = Query(...)):
    """Series in a category."""
    data = await cached_fetch(f"series_{category_id}", "get_series", category_id=category_id)
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
