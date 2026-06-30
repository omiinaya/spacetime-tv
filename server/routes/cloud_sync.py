"""Cloud sync routes — backup/restore channel favorites, watchlist, settings.

Persisted to /tmp/stv_cloud_backup.json so data survives server restarts.
Each backup is keyed by a simple device_id (UUID generated on first use).

Endpoints:
  POST /api/cloud/backup — Upload a backup blob (favorites, watchlist, settings)
  GET  /api/cloud/backup — Retrieve the most recent backup for this device
  POST /api/cloud/merge  — Upload and merge favorites (additive — never removes)
"""

import json
import logging
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter

from config import TMDB_ENRICH_PATH as _ignored

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["cloud"])

BACKUP_FILE = Path("/tmp/stv_cloud_backup.json")

# ── Helpers ────────────────────────────────────────────────────────────────


def _read_backups() -> dict:
    """Read all stored backups from disk."""
    try:
        if BACKUP_FILE.exists():
            data = json.loads(BACKUP_FILE.read_text())
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


def _write_backups(data: dict):
    """Write all backups to disk."""
    try:
        BACKUP_FILE.write_text(json.dumps(data, indent=2))
    except Exception as e:
        log.warning(f"[CLOUD] Failed to write backup: {e}")


# ── Routes ─────────────────────────────────────────────────────────────────


@router.post("/api/cloud/backup")
async def upload_backup(payload: dict):
    """Upload a backup blob for a device.

    Payload format:
    {
      "device_id": "uuid-here",
      "favorites": [123, 456, ...],       // optional
      "watchlist": {"movie_550": true},    // optional
      "settings": {...}                    // optional
      "timestamp": 1719000000              // optional (auto-filled)
    }
    """
    device_id = payload.get("device_id")
    if not device_id or not isinstance(device_id, str) or len(device_id) < 8:
        return {"status": "error", "detail": "Missing or invalid device_id"}

    backups = _read_backups()

    entry = {k: v for k, v in payload.items() if k != "device_id"}
    if "timestamp" not in entry:
        entry["timestamp"] = time.time()

    backups[device_id] = entry
    _write_backups(backups)

    # Prune old devices (keep last 50)
    if len(backups) > 50:
        sorted_ids = sorted(backups.keys(), key=lambda d: backups[d].get("timestamp", 0))
        for old_id in sorted_ids[:-50]:
            del backups[old_id]
        _write_backups(backups)

    return {"status": "ok", "device_id": device_id}


@router.get("/api/cloud/backup")
async def get_backup(device_id: str):
    """Retrieve the most recent backup for a device.

    Returns empty data object when no backup exists for this device.
    """
    if not device_id or len(device_id) < 8:
        return {"status": "error", "detail": "Missing or invalid device_id"}

    backups = _read_backups()
    entry = backups.get(device_id)

    if entry is None:
        return {
            "status": "ok",
            "data": {
                "favorites": [],
                "watchlist": {},
                "settings": {},
            },
        }

    return {
        "status": "ok",
        "data": entry,
    }


@router.post("/api/cloud/merge")
async def merge_favorites(payload: dict):
    """Upload favorites and merge them additively with any existing backup.

    Merges favorites arrays (union), never removes entries.
    Useful for additive sync from second device.

    Payload format:
    {
      "device_id": "uuid-here",
      "favorites": [789]
    }
    """
    device_id = payload.get("device_id")
    if not device_id or not isinstance(device_id, str) or len(device_id) < 8:
        return {"status": "error", "detail": "Missing or invalid device_id"}

    incoming_favs = set(payload.get("favorites", []))

    backups = _read_backups()
    existing = backups.get(device_id, {})

    existing_favs = set(existing.get("favorites", []))
    merged = sorted(existing_favs | incoming_favs)

    existing["favorites"] = merged
    existing["timestamp"] = time.time()
    backups[device_id] = existing
    _write_backups(backups)

    return {"status": "ok", "favorites": merged}
