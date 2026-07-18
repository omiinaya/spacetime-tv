"""Cache warmer — shared between main.py and admin route modules.

Provides the warm_cache() background task plus start_cache_warmer() launcher
with _warm_task tracking. Both main.py and admin routes import from here
instead of across each other, eliminating circular imports.
"""

import asyncio
import json
import logging
import os
import time

import httpx
from fastapi import HTTPException

log = logging.getLogger("spacetime-tv")

_warm_task: asyncio.Task | None = None


def start_cache_warmer() -> None:
    """Launch cache warming in background (non-blocking).

    Uses the local warm_cache() function directly -- no circular import risk
    now that warm_cache lives in this module.
    """
    global _warm_task
    if _warm_task is None or _warm_task.done():
        _warm_task = asyncio.create_task(warm_cache())


def is_warm_running() -> bool:
    """Return True if a warm task exists and hasn't finished."""
    return _warm_task is not None and not _warm_task.done()


async def get_warm_task() -> asyncio.Task | None:
    """FastAPI dependency: returns the current warm task (if any)."""
    return _warm_task


# ── Config (same defaults as main.py) ───────────────────────────────────
CACHE_WARM_ENABLED = os.getenv("CACHE_WARM_ENABLED", "true").lower() in ("1", "true", "yes")
CACHE_WARM_CONCURRENCY = int(os.getenv("CACHE_WARM_CONCURRENCY", "50"))
CACHE_WARM_CATEGORIES = os.getenv("CACHE_WARM_CATEGORIES", "")


async def warm_cache():
    """Pre-fetch all VOD and series data into memory (background task).

    Moved here from main.py so cache_warmer and all route modules
    (admin, etc.) can access it without circular imports.
    """
    from iptv_client import cached_fetch
    from state import (
        CACHE_LIVE_ALL,
        CACHE_SERIES_CAT,
        CACHE_SERIES_CATEGORIES,
        CACHE_VOD_CAT,
        CACHE_VOD_CATEGORIES,
    )

    if not CACHE_WARM_ENABLED:
        log.info("[WARMER] Disabled via CACHE_WARM_ENABLED env var -- skipping")
        return
    filter_cats = None
    if CACHE_WARM_CATEGORIES:
        filter_cats = set(int(x.strip()) for x in CACHE_WARM_CATEGORIES.split(",") if x.strip())
        log.info(f"[WARMER] Filtering to {len(filter_cats)} categories: {filter_cats}")

    log.info("[WARMER] Starting cache warming for VOD + Series...")
    start = time.time()

    # -- Live (single request, fast) --------------------------------
    try:
        live_all = await cached_fetch(CACHE_LIVE_ALL, "get_live_streams")
        log.info(f"[WARMER] Live: {len(live_all)} streams cached")
    except HTTPException as e:
        log.warning(f"[WARMER] Live warm failed (non-fatal): {e}")

    # -- VOD + Series in parallel ------------------------------------
    async def _warm_vod():
        try:
            vod_cats = await cached_fetch(CACHE_VOD_CATEGORIES, "get_vod_categories")
            if not vod_cats:
                log.warning("[WARMER] VOD categories empty -- upstream may be degraded, will retry next cycle")
            vod_cat_ids = [c["category_id"] for c in vod_cats if c.get("category_id")]
            if filter_cats:
                vod_cat_ids = [cid for cid in vod_cat_ids if cid in filter_cats]
            sem = asyncio.Semaphore(CACHE_WARM_CONCURRENCY)

            async def fetch_vod_cat(cid):
                async with sem:
                    for attempt in range(2):
                        try:
                            return await cached_fetch(CACHE_VOD_CAT.format(id=cid), "get_vod_streams", category_id=cid)
                        except HTTPException as e:
                            if attempt == 0:
                                log.warning(f"[WARMER] VOD cat {cid} failed (retrying): {e}")
                                await asyncio.sleep(1)
                            else:
                                log.warning(f"[WARMER] VOD cat {cid} failed after retry: {e}")
                                return None

            await asyncio.gather(*[fetch_vod_cat(cid) for cid in vod_cat_ids], return_exceptions=True)
            log.info(f"[WARMER] VOD: {len(vod_cat_ids)} categories cached")
        except HTTPException as e:
            log.warning(f"[WARMER] VOD warm failed (non-fatal): {e}")

    async def _warm_series():
        try:
            series_cats = await cached_fetch(CACHE_SERIES_CATEGORIES, "get_series_categories")
            if not series_cats:
                log.warning("[WARMER] Series categories empty -- upstream may be degraded, will retry next cycle")
            series_cat_ids = [c["category_id"] for c in series_cats if c.get("category_id")]
            if filter_cats:
                series_cat_ids = [cid for cid in series_cat_ids if cid in filter_cats]
            sem = asyncio.Semaphore(CACHE_WARM_CONCURRENCY)

            async def fetch_series_cat(cid):
                async with sem:
                    for attempt in range(2):
                        try:
                            return await cached_fetch(CACHE_SERIES_CAT.format(id=cid), "get_series", category_id=cid)
                        except HTTPException as e:
                            if attempt == 0:
                                log.warning(f"[WARMER] Series cat {cid} failed (retrying): {e}")
                                await asyncio.sleep(1)
                            else:
                                log.warning(f"[WARMER] Series cat {cid} failed after retry: {e}")
                                return None

            await asyncio.gather(*[fetch_series_cat(cid) for cid in series_cat_ids], return_exceptions=True)
            log.info(f"[WARMER] Series: {len(series_cat_ids)} categories cached")
        except HTTPException as e:
            log.warning(f"[WARMER] Series warm failed (non-fatal): {e}")

    # Fire VOD and series in parallel
    await asyncio.gather(_warm_vod(), _warm_series())

    # -- EPG ---------------------------------------------------------
    try:
        log.info("[WARMER] Pre-warming EPG...")
        from routes.guide import load_epg

        epg_data = await load_epg()
        channels = epg_data.get("channels", [])
        programmes = epg_data.get("programmes", [])
        log.info(f"[WARMER] EPG: {len(channels)} channels, {len(programmes)} programmes")
    except (TimeoutError, httpx.HTTPError, httpx.TimeoutException, OSError, json.JSONDecodeError) as e:
        log.warning(f"[WARMER] EPG warm failed (non-fatal): {e}")

    elapsed = time.time() - start
    log.info(f"[WARMER] Done in {elapsed:.1f}s -- all searches now instant")
    await _verify_cache_coherence()


async def _verify_cache_coherence():
    """After warming, verify that every static cache key has an entry in _cache.

    This catches producer/consumer key drift: if the warmer cached under one
    key but an endpoint reads a different key, the endpoint gets an empty/miss.
    Template keys (containing {id} placeholder) are checked for any matching
    prefix entries rather than an exact match.
    """
    from state import CACHE_KEY_PATTERNS, _cache

    warnings_issued = 0
    for name, pattern in CACHE_KEY_PATTERNS.items():
        if "{id}" in pattern:
            prefix = pattern.split("{")[0]  # e.g. "vod_" from "vod_{id}"
            matching = sum(1 for k in _cache if k.startswith(prefix))
            if matching == 0:
                log.warning(f"[CACHE-COHERENCE] No entries for template key '{pattern}' (prefix '{prefix}')")
                warnings_issued += 1
        else:
            if pattern not in _cache:
                log.warning(
                    f"[CACHE-COHERENCE] Missing cache key '{pattern}' (alias '{name}') -- endpoint may serve stale/empty data"
                )
                warnings_issued += 1
    if warnings_issued:
        log.warning(f"[CACHE-COHERENCE] {warnings_issued} coherence warnings -- check for key drift")
    else:
        log.info(f"[CACHE-COHERENCE] All {len(CACHE_KEY_PATTERNS)} cache keys verified OK")
