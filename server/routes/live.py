"""Live TV routes — categories, streams, info.

Extracted from main.py during P1.1 Phase 6 decomposition.
"""
import logging

from fastapi import APIRouter, Query

from iptv_client import cached_fetch
from state import CACHE_LIVE_ALL, CACHE_LIVE_CATS
# live_{category_id} is fetched on-demand (not pre-warmed), so no constant needed for it

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["live"])


@router.get("/live/categories")
async def live_categories():
    """All live TV categories."""
    data = await cached_fetch(CACHE_LIVE_CATS, "get_live_categories")
    return {"categories": data}


@router.get("/live/all")
async def live_all_streams():
    """All live TV streams (cached, for cross-category search)."""
    data = await cached_fetch("live_all", "get_live_streams")
    return {"streams": data}


@router.get("/live/all-slim")
async def live_all_streams_slim():
    """Slim live TV streams — only fields needed for the channel grid.
    Reduces payload from ~19 MB to ~6 MB for the 48k-channel list view.
    """
    data = await cached_fetch("live_all", "get_live_streams")
    return {
        "streams": [
            {
                "stream_id": s["stream_id"],
                "name": s["name"],
                "stream_icon": s.get("stream_icon", ""),
                "category_id": s["category_id"],
                "num": s.get("num", 0),
                "tv_archive": s.get("tv_archive", 0),
                "tv_archive_duration": s.get("tv_archive_duration", 0),
            }
            for s in data
        ]
    }


@router.get("/live/streams")
async def live_streams(category_id: str = Query(...)):
    """Live streams for a category."""
    data = await cached_fetch(f"live_{category_id}", "get_live_streams", category_id=category_id)
    return {"streams": data}


@router.get("/live/info")
async def live_info(
    ids: str = Query(..., description="Comma-separated stream IDs"),
):
    """Batch stream info: name + icon for given IDs. Reads from cached live_all."""
    requested = set()
    for part in ids.split(","):
        part = part.strip()
        if part.isdigit():
            requested.add(int(part))
    if not requested:
        return {"streams": []}
    try:
        live_all = await cached_fetch("live_all", "get_live_streams")
        results = [{"stream_id": s["stream_id"], "name": s.get("name", ""), "stream_icon": s.get("stream_icon", "")}
                    for s in live_all if s["stream_id"] in requested]
        return {"streams": results}
    except Exception as e:
        log.warning(f"[LIVE/INFO] Failed: {e}")
        return {"streams": []}
