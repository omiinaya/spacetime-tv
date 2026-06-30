"""EPG Guide route handlers — tv_guide, epg_sse, guide_now, guide_enrich.

Extracted from guide.py during decomposition of the 434-line monolithic file.
"""
import asyncio
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from config import TMDB_ENRICH_PATH as _TMDB_ENRICH
from state import _epg_clients, _guide_cache, epg_cache, CACHE_LIVE_ALL
from iptv_client import cached_fetch
from .guide_core import _EPG_ENRICH_CACHE, _EPG_ENRICH_TTL
from .guide_epg import _build_guide_cache, _parse_ts, load_epg_background

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["guide"])


# ── Route: TV Guide ─────────────────────────────────────────────────────
@router.get("/api/guide")
async def tv_guide(
    channel: Optional[str] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(60, ge=1, le=200),
):
    """EPG guide — paginated by channel, with stream_id mapping for click-to-play.

    Uses _guide_cache to avoid re-parsing all EPG data on every request.
    Cache is invalidated when EPG data is refreshed.
    Returns: { channel_groups: [...], total_channels: N }
    """
    # Use cached guide if available and EPG hasn't been refreshed since
    now = time.time()
    use_cache = (
        _guide_cache["channel_groups"] is not None
        and _guide_cache["built_at"] >= epg_cache["fetched"]
    )

    if use_cache:
        channel_groups: list[dict] = _guide_cache["channel_groups"]  # type: ignore
        total = _guide_cache["total_channels"]
    else:
        channel_groups, total = await _build_guide_cache()

    if channel:
        channel_groups = [g for g in channel_groups if g["channel_id"] == channel]
        total = len(channel_groups)

    # Recompute is_live labels for the paginated slice (time-sensitive)
    now_dt = datetime.now(timezone.utc)
    page = channel_groups[offset:offset + limit]
    for group in page:
        for prog in group["programmes"]:
            try:
                iso = f"{prog['start'][:4]}-{prog['start'][4:6]}-{prog['start'][6:8]}T{prog['start'][8:10]}:{prog['start'][10:12]}:{prog['start'][12:14]}{prog['start'][15:18]}:{prog['start'][18:20]}"
                start = datetime.fromisoformat(iso)
                iso = f"{prog['stop'][:4]}-{prog['stop'][4:6]}-{prog['stop'][6:8]}T{prog['stop'][8:10]}:{prog['stop'][10:12]}:{prog['stop'][12:14]}{prog['stop'][15:18]}:{prog['stop'][18:20]}"
                stop = datetime.fromisoformat(iso)
                prog["is_live"] = start <= now_dt <= stop
            except (ValueError, IndexError):
                pass

    return {
        "channel_groups": page,
        "total_channels": total,
        "offset": offset,
        "limit": limit,
    }


# ── Route: EPG SSE ──────────────────────────────────────────────────────
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


# ── Route: Guide Now ────────────────────────────────────────────────────
@router.get("/api/guide/now")
async def guide_now(
    stream_ids: str = Query(..., description="Comma-separated stream IDs"),
):
    """Batch lookup: returns currently-airing programme for each stream_id."""
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
        live_all = await cached_fetch(CACHE_LIVE_ALL, "get_live_streams")
        for s in live_all:
            sid = s["stream_id"]
            epg_id = s.get("epg_channel_id")
            if sid in ids and epg_id:
                stream_to_ch[sid] = epg_id
    except Exception as e:
        log.warning(f"[GUIDE/NOW] Failed to load live_all: {e}")

    now = datetime.now(timezone.utc)
    cutoff_past = now - timedelta(minutes=30)

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
                start = _parse_ts(p["start"])
                stop = _parse_ts(p["stop"])
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


# ── Route: Guide Enrich ─────────────────────────────────────────────────
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
            if data:
                return {"enabled": True, "result": data}
            return {"enabled": False, "result": None}

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
