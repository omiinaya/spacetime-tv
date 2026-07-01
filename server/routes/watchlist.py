"""Watchlist and progress sync routes.

Extracted from main.py during P1.1 Phase 6 decomposition.
"""
import logging
import time

from fastapi import APIRouter, HTTPException

from state import _progress_store, _load_progress_store, _save_progress_store

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["watchlist"])


@router.post("/watchlist/sync-progress")
async def sync_progress(entry: dict):
    """Accept a queued progress update from the PWA background sync.

    Persists the progress entry keyed by watchKey so clients can
    retrieve it on reconnect via GET /api/watchlist/progress.
    """
    watch_key = entry.get("watchKey")
    pos = entry.get("position")
    if not watch_key or pos is None:
        raise HTTPException(status_code=400, detail="Missing watchKey or position")
    log.info("sync-progress: key=%s pos=%.1f", watch_key, pos)

    progress_entry = {
        "watchKey": watch_key,
        "position": pos,
        "timestamp": entry.get("timestamp", time.time()),
        "seriesData": entry.get("seriesData"),
        "movieData": entry.get("movieData"),
    }
    if progress_entry.get("seriesData") is None:
        del progress_entry["seriesData"]
    if progress_entry.get("movieData") is None:
        del progress_entry["movieData"]

    if watch_key not in _progress_store:
        _progress_store[watch_key] = []
    _progress_store[watch_key].append(progress_entry)
    _progress_store[watch_key] = sorted(
        _progress_store[watch_key], key=lambda x: x["timestamp"], reverse=True
    )[:5]
    _save_progress_store()

    return {"status": "ok", "synced": True}


@router.get("/watchlist/progress")
async def get_progress():
    """Retrieve all stored watch progress entries.

    Returns progress synced from clients via background sync,
    grouped by watchKey with the most recent entries first.
    """
    return {"progress": _progress_store}
