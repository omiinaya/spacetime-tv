"""Live TV routes — categories, streams, info.

Extracted from main.py during P1.1 Phase 6 decomposition.
"""
import logging

from fastapi import APIRouter, Query

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["live"])


@router.get("/api/live/categories")
async def live_categories():
    """All live TV categories."""
    import main as _main
    data = await _main.cached_fetch("live_cats", "get_live_categories")
    return {"categories": data}


@router.get("/api/live/all")
async def live_all_streams():
    """All live TV streams (cached, for cross-category search)."""
    import main as _main
    data = await _main.cached_fetch("live_all", "get_live_streams")
    return {"streams": data}


@router.get("/api/live/streams")
async def live_streams(category_id: str = Query(...)):
    """Live streams for a category."""
    import main as _main
    data = await _main.cached_fetch(f"live_{category_id}", "get_live_streams", category_id=category_id)
    return {"streams": data}


@router.get("/api/live/info")
async def live_info(
    ids: str = Query(..., description="Comma-separated stream IDs"),
):
    """Batch stream info: name + icon for given IDs. Reads from cached live_all."""
    import main as _main

    requested = set()
    for part in ids.split(","):
        part = part.strip()
        if part.isdigit():
            requested.add(int(part))
    if not requested:
        return {"streams": []}
    try:
        live_all = await _main.cached_fetch("live_all", "get_live_streams")
        results = [{"stream_id": s["stream_id"], "name": s.get("name", ""), "stream_icon": s.get("stream_icon", "")}
                    for s in live_all if s["stream_id"] in requested]
        return {"streams": results}
    except Exception as e:
        log.warning(f"[LIVE/INFO] Failed: {e}")
        return {"streams": []}
