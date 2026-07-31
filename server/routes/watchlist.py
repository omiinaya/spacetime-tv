"""Watchlist and progress sync routes.

Extracted from main.py during P1.1 Phase 6 decomposition.
"""

import logging
import time

from fastapi import APIRouter, HTTPException, Request

from state import _progress_store, _save_progress_store

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
    _progress_store[watch_key] = sorted(_progress_store[watch_key], key=lambda x: x["timestamp"], reverse=True)[:5]
    _save_progress_store()

    return {"status": "ok", "synced": True}


@router.get("/watchlist/progress")
async def get_progress():
    """Retrieve all stored watch progress entries.

    Returns progress synced from clients via background sync,
    grouped by watchKey with the most recent entries first.
    """
    return {"progress": _progress_store}


# ── Profile-aware watchlist/progress ─────────────────────────────


@router.post("/watchlist/profile/sync-progress")
async def profile_sync_progress(entry: dict, request: Request):
    """Synch progress for the currently authenticated profile.

    Uses X-Profile-Token header to identify the profile.
    Falls back to global progress store if no profile token.
    """
    from auth import _load_profiles, _save_profiles, verify_profile_token

    token = request.headers.get("X-Profile-Token", "")
    if not token:
        # Fall back to global progress store
        return await sync_progress(entry)

    result = verify_profile_token(token)
    if not result:
        raise HTTPException(401, "Invalid or expired profile token")

    profile_id = result["profile_id"]
    watch_key = entry.get("watchKey")
    pos = entry.get("position")

    if not watch_key or pos is None:
        raise HTTPException(400, "Missing watchKey or position")

    profiles = _load_profiles()
    if profile_id not in profiles:
        raise HTTPException(404, "Profile not found")

    if "progress" not in profiles[profile_id]:
        profiles[profile_id]["progress"] = {}

    profiles[profile_id]["progress"][watch_key] = {
        "position": pos,
        "timestamp": entry.get("timestamp", time.time()),
        "seriesData": entry.get("seriesData"),
        "movieData": entry.get("movieData"),
    }
    # Clean None keys
    for k in ("seriesData", "movieData"):
        if profiles[profile_id]["progress"][watch_key].get(k) is None:
            del profiles[profile_id]["progress"][watch_key][k]

    _save_profiles(profiles)
    return {"status": "ok", "profile_id": profile_id}


@router.get("/watchlist/profile/progress")
async def profile_get_progress(request: Request):
    """Get progress for the currently authenticated profile.

    Uses X-Profile-Token header to identify the profile.
    Falls back to global progress store if no profile token.
    """
    from auth import _load_profiles, verify_profile_token

    token = request.headers.get("X-Profile-Token", "")
    if not token:
        return await get_progress()

    result = verify_profile_token(token)
    if not result:
        raise HTTPException(401, "Invalid or expired profile token")

    profile_id = result["profile_id"]
    profiles = _load_profiles()
    if profile_id not in profiles:
        raise HTTPException(404, "Profile not found")

    return {"progress": profiles[profile_id].get("progress", {})}


# ── Watchlist ──────────────────────────────────────────────────────────────
#
# Server-side watchlist CRUD intentionally does not exist: the watchlist is
# client-side (localStorage, `stv_watchlist` / `stv_watchlist_series`) and is
# synced across devices via the cloud backup endpoints (routes/cloud_sync.py).
# Only watch *progress* is persisted server-side (see below).
