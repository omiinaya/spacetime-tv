"""EPG loading, background refresh, broadcast loop, and cache building.

Extracted from guide.py during decomposition of the 434-line monolithic file.
"""

import asyncio
import json
import logging
import time
from datetime import UTC, datetime, timedelta

import httpx

import state
from config import EPG_CACHE_FILE, EPG_CACHE_TTL
from iptv_client import cached_fetch, client, iptv_xmltv_url
from state import CACHE_LIVE_ALL, _epg_clients, _guide_cache, epg_cache

from .guide_core import parse_xmltv

log = logging.getLogger("spacetime-tv")


# ── EPG Loading ─────────────────────────────────────────────────────────
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
                _guide_cache["channel_groups"] = None
                return cached["data"]
        except (json.JSONDecodeError, OSError, KeyError) as e:
            log.warning(f"EPG cache file corrupted: {e} — will refetch")

    from iptv_client import fetch_epg_all_providers, get_enabled_providers

    providers = get_enabled_providers()

    if len(providers) <= 1:
        # Single provider — use direct fetch (backward compatible)
        log.info("Fetching EPG XMLTV from single provider ...")
        url = iptv_xmltv_url()
        try:
            resp = await client.get(url, timeout=120.0)
            resp.raise_for_status()
            data = parse_xmltv(resp.text)
            epg_cache["data"] = data
            epg_cache["fetched"] = now
            _guide_cache["channel_groups"] = None
            EPG_CACHE_FILE.write_text(json.dumps({"data": data, "fetched": now}))
            log.info(f"EPG parsed: {len(data.get('programmes', []))} programmes")
            return data
        except (TimeoutError, httpx.HTTPError, httpx.TimeoutException, RuntimeError, json.JSONDecodeError) as e:
            log.error(f"EPG fetch failed: {e}")
            if epg_cache["data"]:
                return epg_cache["data"]
            return {"channels": [], "programmes": []}
    else:
        # Multi-provider — fetch from all in parallel and merge
        log.info(f"Fetching EPG XMLTV from {len(providers)} providers in parallel ...")
        try:
            data = await fetch_epg_all_providers()
            epg_cache["data"] = data
            epg_cache["fetched"] = now
            _guide_cache["channel_groups"] = None
            EPG_CACHE_FILE.write_text(json.dumps({"data": data, "fetched": now}))
            log.info(f"Multi-provider EPG merged: {len(data.get('programmes', []))} programmes")
            return data
        except Exception as e:
            log.error(f"Multi-provider EPG fetch failed: {e}")
            if epg_cache["data"]:
                return epg_cache["data"]
            return {"channels": [], "programmes": []}


async def load_epg_background() -> dict:
    """Load EPG — returns cached data immediately (even stale), refreshes in background."""
    now = time.time()
    if epg_cache["data"] is None:
        return await load_epg()
    if (now - epg_cache["fetched"]) >= EPG_CACHE_TTL and (
        state._epg_refresh_task is None or state._epg_refresh_task.done()
    ):
        # Track the task on the shared state module (not a local copy) so
        # admin.py's dedup check can see in-flight refreshes.
        state._epg_refresh_task = asyncio.create_task(_refresh_epg_background())
    return epg_cache["data"]


async def _refresh_epg_background():
    """Refresh EPG in background task — logs failures but never raises."""
    try:
        await load_epg()
    except Exception as e:
        log.warning(f"Background EPG refresh failed: {e}")


# ── EPG Broadcast (SSE refresh loop) ───────────────────────────────────
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
            # Task-level guard: any unexpected exception must not kill the
            # loop silently (the task reference is dropped at creation —
            # 'Task exception was never retrieved'). load_epg() may raise
            # HTTPException, JSONDecodeError, KeyError, etc. on bad EPG data.
            log.error(f"[EPG-SSE] Broadcast failed: {e}")


# ── Guide cache building ────────────────────────────────────────────────
def _parse_ts(raw: str) -> datetime:
    """Parse XMLTV timestamp format to datetime."""
    iso = f"{raw[:4]}-{raw[4:6]}-{raw[6:8]}T{raw[8:10]}:{raw[10:12]}:{raw[12:14]}{raw[15:18]}:{raw[18:20]}"
    return datetime.fromisoformat(iso)


async def _build_guide_cache() -> tuple[list[dict], int]:
    """Build and cache the full channel_groups list from EPG data.

    Returns (channel_groups, total_channels). The result is cached in
    _guide_cache so paginated requests don't re-parse every programme.
    Invalidated automatically when EPG data is refreshed.
    """
    epg = await load_epg_background()
    programmes = epg.get("programmes", [])
    channels = epg.get("channels", [])

    ch_map = {c["id"]: c["name"] for c in channels}
    ch_icon_map = {c["id"]: c.get("icon", "") for c in channels}

    # Stream ID mapping (48K live channels → EPG channel IDs)
    ch_to_stream: dict[str, int] = {}
    try:
        live_all = await cached_fetch(CACHE_LIVE_ALL, "get_live_streams")
        for s in live_all:
            epg_id = s.get("epg_channel_id")
            if epg_id and epg_id not in ch_to_stream:
                ch_to_stream[epg_id] = s["stream_id"]
    except (httpx.HTTPError, KeyError, IndexError) as e:
        log.warning(f"EPG: Failed to load live_all for stream mapping: {e}")

    now = datetime.now(UTC)
    cutoff_past = now - timedelta(minutes=30)
    cutoff_future = now + timedelta(hours=4)

    by_channel: dict[str, list[dict]] = {}
    for p in programmes:
        try:
            start = _parse_ts(p["start"])
            stop = _parse_ts(p["stop"])
            if stop < cutoff_past:
                continue
            if start > cutoff_future:
                continue
            ch_id = p["channel"]
            if ch_id not in by_channel:
                by_channel[ch_id] = []
            by_channel[ch_id].append(
                {
                    "start": p["start"],
                    "stop": p["stop"],
                    "title": p.get("title", ""),
                    "subtitle": p.get("subtitle", ""),
                    "desc": p.get("desc", ""),
                    "category": p.get("category", ""),
                    "is_live": start <= now <= stop,
                }
            )
        except (ValueError, IndexError):
            continue

    channel_groups = []
    for ch_id, progs in by_channel.items():
        progs.sort(key=lambda p: p["start"])
        channel_groups.append(
            {
                "channel_id": ch_id,
                "channel_name": ch_map.get(ch_id, ch_id),
                "channel_icon": ch_icon_map.get(ch_id, ""),
                "stream_id": ch_to_stream.get(ch_id),
                "programmes": progs,
            }
        )

    channel_groups.sort(key=lambda g: g["channel_name"].lower())
    total = len(channel_groups)

    _guide_cache["channel_groups"] = channel_groups
    _guide_cache["total_channels"] = total
    _guide_cache["built_at"] = time.time()

    log.info(f"Guide cache built: {total} channels, {sum(len(g['programmes']) for g in channel_groups)} programmes")
    return channel_groups, total
