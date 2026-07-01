"""Admin routes: cache controls, EPG refresh, stats."""
import asyncio
import logging
import time
from fastapi import APIRouter, Depends, HTTPException, Request

log = logging.getLogger("spacetime-tv")


def require_admin_key(request: Request) -> None:
    """Dependency: check X-Admin-Key header against configured key.
    Key is set from ADMIN_API_KEY env var, or auto-generated on first startup.
    """
    from config import ADMIN_API_KEY
    key = request.headers.get("X-Admin-Key", "")
    if key != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing admin key")


router = APIRouter(tags=["admin"], dependencies=[Depends(require_admin_key)])


@router.get("/admin/stats")
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


@router.get("/admin/stream-health")
async def admin_stream_health():
    """Stream health dashboard: probe cache stats and sampled results."""
    try:
        from routes.stream import _probe_cache
    except ImportError:
        return {"enabled": False, "error": "probe cache not available"}

    now = time.time()
    total = len(_probe_cache)
    by_codec: dict[str, int] = {}
    by_resolution: dict[str, int] = {}
    by_type: dict[str, int] = {}
    cached_recent: list[dict] = []
    stale_count = 0

    for key, (ts, data) in _probe_cache.items():
        age = round(now - ts, 0)
        if age > 3600:
            stale_count += 1

        codec = data.get("codec", "unknown")
        by_codec[codec] = by_codec.get(codec, 0) + 1

        w = data.get("width", 0)
        h = data.get("height", 0)
        if w > 0 and h > 0:
            if h >= 2160: res = "4K"
            elif h >= 1440: res = "1440p"
            elif h >= 1080: res = "1080p"
            elif h >= 720: res = "720p"
            elif h >= 480: res = "480p"
            else: res = f"{h}p"
            by_resolution[res] = by_resolution.get(res, 0) + 1
        else:
            by_resolution["unknown"] = by_resolution.get("unknown", 0) + 1

        stream_type = key.split("_")[0] if "_" in key else "?"
        by_type[stream_type] = by_type.get(stream_type, 0) + 1

        if len(cached_recent) < 20:
            err = data.get("error", "")
            cached_recent.append({
                "key": key,
                "age_s": age,
                "codec": codec,
                "width": w,
                "height": h,
                "error": err if err else None,
            })

    return {
        "enabled": True,
        "total_probed": total,
        "stale_count": stale_count,
        "by_codec": dict(sorted(by_codec.items(), key=lambda x: -x[1])),
        "by_resolution": dict(sorted(by_resolution.items(), key=lambda x: -x[1])),
        "by_type": dict(sorted(by_type.items(), key=lambda x: -x[1])),
        "recent": cached_recent,
    }


@router.post("/admin/cache/clear")
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


@router.post("/admin/cache/warm")
async def admin_warm_cache():
    """Force a cache warm cycle (no-op if already warming)."""
    import main as m

    if m._warm_task is not None and not m._warm_task.done():
        return {"message": "Cache warming already in progress."}
    m.start_cache_warmer()
    return {"message": "Cache warming started."}


@router.post("/admin/cache/warm-full")
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


@router.post("/admin/epg/refresh")
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
