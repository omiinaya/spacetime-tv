"""EPG Guide, SSE, and enrichment routes.

Extracted from main.py during P1.1 Phase 5 decomposition.
"""
import asyncio
import json
import logging
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from config import EPG_CACHE_FILE, EPG_CACHE_TTL, IPTV_BASE, IPTV_PASS, IPTV_USER, UA_STR
from state import _epg_clients, epg_cache, _epg_refresh_task

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["guide"])

_TMDB_ENRICH = "/home/user/.local/share/hermes-cli-tools-venv/bin/tmdb-enrich"

# ── EPG Enrichment cache ─────────────────────────────────────────────
_EPG_ENRICH_CACHE: dict[str, tuple[float, dict | None]] = {}
_EPG_ENRICH_TTL = 3600


# ── XMLTV Parsing ─────────────────────────────────────────────────────
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


# ── EPG Loading ───────────────────────────────────────────────────────
async def load_epg() -> dict:
    """Load EPG from cache or fetch XMLTV."""
    import main as _main  # noqa: E402

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
        resp = await _main.client.get(url, timeout=120.0)
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


async def load_epg_background() -> dict:
    """Load EPG — returns cached data immediately (even stale), refreshes in background."""
    now = time.time()
    if epg_cache["data"] is not None:
        if (now - epg_cache["fetched"]) >= EPG_CACHE_TTL:
            global _epg_refresh_task
            if _epg_refresh_task is None or _epg_refresh_task.done():
                _epg_refresh_task = asyncio.create_task(_refresh_epg_background())
        return epg_cache["data"]
    return await load_epg()


async def _refresh_epg_background():
    """Refresh EPG in background task — logs failures but never raises."""
    try:
        await load_epg()
    except Exception as e:
        log.warning(f"Background EPG refresh failed: {e}")


# ── EPG Broadcast (SSE refresh loop) ─────────────────────────────────
async def _epg_broadcast_loop():
    """Background task: refresh EPG every 30 min and notify clients."""
    while True:
        await asyncio.sleep(1800)
        log.info("[EPG-SSE] Refreshing EPG for broadcast…")
        try:
            epg_cache["fetched"] = 0
            await load_epg()
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


# ── Route: TV Guide ──────────────────────────────────────────────────
@router.get("/api/guide")
async def tv_guide(
    channel: Optional[str] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(60, ge=1, le=200),
):
    """EPG guide — paginated by channel, with stream_id mapping for click-to-play.

    Returns: { channel_groups: [...], total_channels: N }
    Each group: { channel_id, channel_name, channel_icon, stream_id, programmes: [...] }
    """
    import main as _main  # noqa: E402

    epg = await load_epg_background()
    programmes = epg.get("programmes", [])
    channels = epg.get("channels", [])

    if channel:
        programmes = [p for p in programmes if p["channel"] == channel]

    ch_map = {c["id"]: c["name"] for c in channels}
    ch_icon_map = {c["id"]: c.get("icon", "") for c in channels}

    ch_to_stream: dict[str, int] = {}
    try:
        live_all = await _main.cached_fetch("live_all", "get_live_streams")
        for s in live_all:
            epg_id = s.get("epg_channel_id")
            if epg_id and epg_id not in ch_to_stream:
                ch_to_stream[epg_id] = s["stream_id"]
    except Exception as e:
        log.warning(f"EPG: Failed to load live_all for stream mapping: {e}")

    now = datetime.now(timezone.utc)
    cutoff_past = now - timedelta(minutes=30)
    cutoff_future = now + timedelta(hours=4)

    def parse_ts(raw: str) -> datetime:
        iso = f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}T{raw[8:10]}:{raw[10:12]}:{raw[12:14]}{raw[15:18]}:{raw[18:20]}"
        return datetime.fromisoformat(iso)

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

    channel_groups.sort(key=lambda g: g["channel_name"].lower())
    total = len(channel_groups)
    page = channel_groups[offset:offset + limit]

    return {
        "channel_groups": page,
        "total_channels": total,
        "offset": offset,
        "limit": limit,
    }


# ── Route: EPG SSE ───────────────────────────────────────────────────
@router.get("/api/epg/events")
async def epg_sse(request: Request):
    """SSE endpoint: notifies clients when EPG data has been refreshed."""
    async def event_stream():
        q: asyncio.Queue = asyncio.Queue(maxsize=8)
        _epg_clients.append(q)
        try:
            yield "event: connected\ndata: ok\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=30.0)
                    yield f"event: {msg}\ndata: refreshed\n\n"
                except asyncio.TimeoutError:
                    ts = int(time.time())
                    yield f"event: ping\ndata: {ts}\n\n"
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


# ── Route: Guide Now ─────────────────────────────────────────────────
@router.get("/api/guide/now")
async def guide_now(
    stream_ids: str = Query(..., description="Comma-separated stream IDs"),
):
    """Batch lookup: returns currently-airing programme for each stream_id."""
    import main as _main  # noqa: E402

    ids = []
    for part in stream_ids.split(","):
        part = part.strip()
        if part.isdigit():
            ids.append(int(part))
    if not ids:
        return {"programmes": {}}

    epg = await load_epg_background()
    programmes = epg.get("programmes", [])
    channels = epg.get("channels", [])

    ch_map = {c["id"]: c["name"] for c in channels}

    stream_to_ch: dict[int, str] = {}
    try:
        live_all = await _main.cached_fetch("live_all", "get_live_streams")
        for s in live_all:
            sid = s["stream_id"]
            epg_id = s.get("epg_channel_id")
            if sid in ids and epg_id:
                stream_to_ch[sid] = epg_id
    except Exception as e:
        log.warning(f"[GUIDE/NOW] Failed to load live_all: {e}")

    now = datetime.now(timezone.utc)
    cutoff_past = now - timedelta(minutes=30)

    def parse_ts(raw: str) -> datetime:
        iso = f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}T{raw[8:10]}:{raw[10:12]}:{raw[12:14]}{raw[15:18]}:{raw[18:20]}"
        return datetime.fromisoformat(iso)

    result: dict[str, dict | None] = {}
    for sid in ids:
        ch_id = stream_to_ch.get(sid)
        if not ch_id:
            result[str(sid)] = None
            continue

        current = None
        for p in programmes:
            if p["channel"] != ch_id:
                continue
            try:
                start = parse_ts(p["start"])
                stop = parse_ts(p["stop"])
                if start <= now <= stop:
                    current = {
                        "title": p.get("title", ""),
                        "channel_name": ch_map.get(ch_id, ch_id),
                    }
                    break
                if stop < cutoff_past:
                    continue
            except (ValueError, IndexError):
                continue

        result[str(sid)] = current

    return {"programmes": result}


# ── Route: Guide Enrich ──────────────────────────────────────────────
@router.get("/api/guide/enrich")
async def guide_enrich(
    q: str = Query(..., min_length=2, max_length=200),
):
    """Enrich an EPG programme title with TMDB metadata (poster, rating, description).

    Uses the tmdb-enrich CLI tool (browserless SSR extraction from themoviedb.org).
    Results are cached for 1 hour.
    """
    cache_key = q.strip().lower()
    now = time.time()
    if cache_key in _EPG_ENRICH_CACHE:
        ts, data = _EPG_ENRICH_CACHE[cache_key]
        if now - ts < _EPG_ENRICH_TTL:
            return data if data else {"enabled": False, "result": None}

    try:
        proc = await asyncio.create_subprocess_exec(
            _TMDB_ENRICH, "--json", "enrich", q,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
        if proc.returncode != 0:
            log.warning(f"tmdb-enrich failed (exit {proc.returncode}): {stderr.decode()[:200]}")
            _EPG_ENRICH_CACHE[cache_key] = (now, None)
            return {"enabled": False, "result": None}

        result = json.loads(stdout.decode())
        if result:
            _EPG_ENRICH_CACHE[cache_key] = (now, result)
            return {"enabled": True, "result": result}
    except asyncio.TimeoutError:
        log.warning(f"tmdb-enrich timed out for: {q[:50]}")
    except Exception as e:
        log.warning(f"tmdb-enrich error for '{q[:50]}': {e}")

    _EPG_ENRICH_CACHE[cache_key] = (now, None)
    return {"enabled": False, "result": None}
