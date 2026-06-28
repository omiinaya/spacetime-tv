"""Admin routes: cache controls, EPG refresh, stats."""
import asyncio
import logging
import time
from fastapi import APIRouter

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["admin"])


@router.get("/api/admin/stats")
async def admin_stats():
    """Admin dashboard: cache stats, popular content, error trends."""
    # Lazy import to avoid circular dependency with main.py
    import main as m
    from state import (
        _cache, _cache_hits, _cache_misses,
        epg_cache, SERVER_START_TIME,
        _stream_hits, _error_log, _search_queries, _epg_clients,
    )

    uptime = time.time() - SERVER_START_TIME
    popular = sorted(_stream_hits.items(), key=lambda x: -x[1])[:20]
    popular_list = [{"stream": k, "hits": v} for k, v in popular]

    cache_entries = len(_cache)
    vod_cached = sum(1 for k in _cache if k.startswith("vod_"))
    series_cached = sum(1 for k in _cache if k.startswith("series_"))
    recent_errors = list(reversed(_error_log[-20:]))

    return {
        "uptime": round(uptime, 1),
        "cache": {
            "total_entries": cache_entries,
            "hits": _cache_hits,
            "misses": _cache_misses,
            "hit_rate": round(_cache_hits / max(_cache_hits + _cache_misses, 1) * 100, 1),
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
        "searches": {
            "total": len(_search_queries),
            "recent": list(reversed(_search_queries[-20:])),
        },
        "sse_clients": len(_epg_clients),
    }


@router.post("/api/admin/cache/clear")
async def admin_clear_cache():
    """Clear all in-memory cache entries. Triggers a fresh warm."""
    import main as m
    from state import _cache, epg_cache

    count = len(_cache)
    _cache.clear()
    epg_cache["data"] = None
    epg_cache["fetched"] = 0
    m.start_cache_warmer()
    return {"cleared": count, "message": f"Cleared {count} cache entries. Warming started."}


@router.post("/api/admin/cache/warm")
async def admin_warm_cache():
    """Force a cache warm cycle (no-op if already warming)."""
    import main as m

    if m._warm_task is not None and not m._warm_task.done():
        return {"message": "Cache warming already in progress."}
    m.start_cache_warmer()
    return {"message": "Cache warming started."}


@router.post("/api/admin/cache/warm-full")
async def admin_warm_full_cache():
    """Clear THEN warm the full cache."""
    import main as m
    from state import _cache, epg_cache

    count = len(_cache)
    _cache.clear()
    epg_cache["data"] = None
    epg_cache["fetched"] = 0
    m.start_cache_warmer()
    return {"message": f"Full re-warm started. Cleared {count} stale entries."}


@router.post("/api/admin/epg/refresh")
async def admin_epg_refresh():
    """Trigger an immediate EPG refresh in the background."""
    import main as m
    from state import epg_cache, _epg_refresh_task

    already_running = _epg_refresh_task is not None and not _epg_refresh_task.done()
    from routes.guide import _refresh_epg_background
    if not already_running:
        _epg_refresh_task = asyncio.create_task(_refresh_epg_background())

    last_fetch = epg_cache["fetched"]
    age = round(time.time() - last_fetch, 0) if last_fetch else None

    return {
        "refresh_started": not already_running,
        "already_running": already_running,
        "last_fetch_ts": last_fetch,
        "epg_age_s": age,
        "message": "EPG refresh triggered." if not already_running else "EPG refresh already in progress.",
    }
