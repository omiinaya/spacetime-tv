"""EPG Guide route handlers — tv_guide, epg_sse, guide_now, guide_enrich.

Extracted from guide.py during decomposition of the 434-line monolithic file.
"""
import asyncio
import json
import logging
import time
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from config import TMDB_ENRICH_PATH as _TMDB_ENRICH
from iptv_client import cached_fetch
from state import CACHE_LIVE_ALL, _epg_clients, _guide_cache, epg_cache

from .guide_core import _EPG_ENRICH_CACHE, _EPG_ENRICH_TTL
from .guide_epg import _build_guide_cache, _parse_ts, load_epg_background

log = logging.getLogger("spacetime-tv")

_RICH_ENABLED = bool(_TMDB_ENRICH)


log.info(f"TMDB enrich: {'enabled' if _RICH_ENABLED else 'disabled'} — {'path: ' + str(_TMDB_ENRICH) if _RICH_ENABLED else 'no TMDB_ENRICH_PATH set'}")
router = APIRouter(tags=["guide"])


# ── Route: TV Guide ─────────────────────────────────────────────────────
@router.get("/guide")
async def tv_guide(
    channel: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(60, ge=1, le=200),
):
    """EPG guide — paginated by channel, with stream_id mapping for click-to-play.

    Uses _guide_cache to avoid re-parsing all EPG data on every request.
    Cache is invalidated when EPG data is refreshed.
    Returns: { channel_groups: [...], total_channels: N }
    """
    # Use cached guide if available and EPG hasn't been refreshed since
    time.time()
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
    now_dt = datetime.now(UTC)
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
@router.get("/epg/events")
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
                except TimeoutError:
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
@router.get("/guide/now")
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
    except HTTPException as e:
        log.warning(f"[GUIDE/NOW] Failed to load live_all: {e}")

    now = datetime.now(UTC)
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
@router.get("/guide/enrich")
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

    if not _RICH_ENABLED:
        _EPG_ENRICH_CACHE[cache_key] = (now, None)
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
    except TimeoutError:
        log.warning(f"tmdb-enrich timed out for: {q[:50]}")
    except (OSError, json.JSONDecodeError) as e:
        log.warning(f"tmdb-enrich error for '{q[:50]}': {e}")

    _EPG_ENRICH_CACHE[cache_key] = (now, None)
    return {"enabled": False, "result": None}


# ── Route: Guide Catchup Timeline ───────────────────────────────────────
@router.get("/guide/catchup")
async def guide_catchup(
    stream_id: int = Query(..., description="Live stream ID"),
    hours: int = Query(4, ge=1, le=48, description="Hours of EPG to return"),
):
    """Return EPG programme timeline for a channel's catch-up window.

    Maps the stream_id to an EPG channel ID, then returns programmes
    covering the last N hours so the frontend can build a timeshift
    timeline with programme markers.
    """
    epg = await load_epg_background()
    programmes = epg.get("programmes", [])
    epg.get("channels", [])

    # Map stream_id → epg_channel_id
    ch_id = None
    try:
        live_all = await cached_fetch(CACHE_LIVE_ALL, "get_live_streams")
        for s in live_all:
            if s["stream_id"] == stream_id:
                ch_id = s.get("epg_channel_id")
                break
    except HTTPException as e:
        log.warning(f"[GUIDE/CATCHUP] Failed to load live_all: {e}")

    if not ch_id:
        return {"programmes": [], "channel_id": None}

    # Find channel programmes within the time window
    now = datetime.now(UTC)
    window_start = now - timedelta(hours=hours)

    results = []
    for p in programmes:
        if p["channel"] != ch_id:
            continue
        try:
            start = _parse_ts(p["start"])
            stop = _parse_ts(p["stop"])
        except (ValueError, IndexError):
            continue
        # Include programmes that end after window_start and start before now
        if stop > window_start and start < now:
            results.append({
                "title": p.get("title", ""),
                "subtitle": p.get("subtitle", ""),
                "start": start.isoformat(),
                "stop": stop.isoformat(),
                "start_ts": int(start.timestamp()),
                "stop_ts": int(stop.timestamp()),
                "start_offset": int((now - start).total_seconds()),
                "duration": int((stop - start).total_seconds()),
            })

    results.sort(key=lambda r: r["start_ts"])

    return {
        "programmes": results,
        "channel_id": ch_id,
        "window_hours": hours,
    }


# ── Route: EPG Search ────────────────────────────────────────────────────
@router.get("/guide/search")
async def guide_search(
    q: str = Query(..., min_length=2, max_length=100, description="Programme title search"),
    future_only: bool = Query(True, description="Only return upcoming programmes (default: true)"),
    limit: int = Query(20, ge=1, le=100, description="Max results"),
):
    """Search EPG programmes by title across all channels.

    Searches programme titles (case-insensitive substring match) in the
    current EPG data. Returns upcoming programmes by default, sorted by
    start time ascending so the nearest airing comes first.

    Useful for finding when a specific show or movie is airing.
    Returns channel name, start/stop times as ISO strings, and the
    programme duration.
    """
    epg = await load_epg_background()
    programmes = epg.get("programmes", [])
    channels = epg.get("channels", [])
    ch_map = {c["id"]: c.get("name", c["id"]) for c in channels}

    query = q.lower().strip()
    now = datetime.now(UTC)

    results = []
    for p in programmes:
        title = p.get("title", "")
        subtitle = p.get("subtitle", "")
        desc = p.get("desc", "")

        if query not in title.lower() and query not in subtitle.lower() and query not in desc.lower():
            continue

        try:
            start = _parse_ts(p["start"])
            stop = _parse_ts(p["stop"])
        except (ValueError, IndexError):
            continue

        if future_only and stop <= now:
            continue

        results.append({
            "title": title,
            "subtitle": subtitle or None,
            "description": desc or None,
            "channel_id": p["channel"],
            "channel_name": ch_map.get(p["channel"], p["channel"]),
            "start": start.isoformat(),
            "stop": stop.isoformat(),
            "start_ts": int(start.timestamp()),
            "stop_ts": int(stop.timestamp()),
            "duration": int((stop - start).total_seconds()),
        })

    results.sort(key=lambda r: r["start_ts"])
    results = results[:limit]

    return {
        "results": results,
        "total": len(results),
        "query": q,
        "future_only": future_only,
    }
