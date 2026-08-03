"""Cloud sync routes — backup/restore channel favorites, watchlist, settings.

Persisted to data directory so data survives server restarts.
Each backup is keyed by a device_id and a hashed device token for scoped auth.

Security (P0 fix — 2026-07-01):
  - Device-level auth: first upload registers a token. Subsequent reads/merges
    require the same X-Device-Token header. Token is SHA-256 hashed in storage.
  - Admin override: X-Admin-Key header bypasses device token checks.
  - ADMIN_API_KEY is auto-generated as a 64-char hex string on first startup
    if not configured in .env (config.py lines 36-39).
  - So even in dev mode, there's always a valid admin key — no true "open"
    state exists.

Endpoints:
  POST /api/cloud/backup — Upload a backup blob. Requires X-Device-Token.
  GET  /api/cloud/backup — Retrieve backup for a device. Requires X-Device-Token.
  POST /api/cloud/merge  — Upload and merge favorites. Requires X-Device-Token.
"""

import hashlib
import json
import logging
import time

from fastapi import APIRouter, Request

from config import DATA_DIR

# Reuse the admin auth dependency for admin-level access

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["cloud"])

BACKUP_FILE = DATA_DIR / "cloud_backup.json"


# ── Helpers ────────────────────────────────────────────────────────────────


def _read_backups() -> dict:
    """Read all stored backups from disk."""
    try:
        if BACKUP_FILE.exists():
            data = json.loads(BACKUP_FILE.read_text())
            if isinstance(data, dict):
                return data
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def _write_backups(data: dict):
    """Write all backups to disk."""
    try:
        BACKUP_FILE.write_text(json.dumps(data, indent=2))
    except OSError as e:
        log.warning(f"[CLOUD] Failed to write backup: {e}")


def _hash_token(token: str) -> str:
    """SHA-256 hash of a device token for secure storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _verify_device_access(
    request: Request,
    device_id: str,
) -> bool:
    """Check if the request has scoped device access or admin access.

    Three ways to pass:
      1. X-Admin-Key matches (admin overrides all)
      2. X-Device-Token matches the stored token for this device_id
      3. No backup exists for this device_id yet (first-time registration)

    Returns True if authorized, False otherwise.
    """
    backups = _read_backups()
    entry = backups.get(device_id)

    # No backup yet — first-time registration. Require an admin key or a real
    # device token (>= 8 chars). Accepting a tokenless write here would store
    # an empty _token_hash, permanently bricking the device_id — no future
    # token (including the owner's own) would ever match empty.
    if entry is None:
        from config import ADMIN_API_KEY

        admin_key = request.headers.get("X-Admin-Key", "")
        if admin_key and admin_key == ADMIN_API_KEY:
            return True
        token = request.headers.get("X-Device-Token", "")
        return len(token) >= 8

    # Check admin key first (bypasses device token check)
    from config import ADMIN_API_KEY

    admin_key = request.headers.get("X-Admin-Key", "")
    if admin_key and admin_key == ADMIN_API_KEY:
        return True

    # Check device token
    token = request.headers.get("X-Device-Token", "")
    if not token or len(token) < 8:
        return False

    # Verify hashed token
    stored_hash = entry.get("_token_hash", "")
    if not stored_hash:
        return False

    return _hash_token(token) == stored_hash


# ── Routes ─────────────────────────────────────────────────────────────────


@router.post("/cloud/backup")
async def upload_backup(payload: dict, request: Request):
    """Upload a backup blob for a device.

    Requires X-Device-Token header (or X-Admin-Key for admin override).

    Payload format:
    {
      "device_id": "uuid-here",
      "favorites": [123, 456, ...],           // optional — channel favorites
      "watchlist": [550, 551, ...],           // optional — movie watchlist IDs
      "series_watchlist": [900, 901, ...],    // optional — series watchlist IDs
      "settings": {...}                       // optional
      "timestamp": 1719000000                 // optional (auto-filled)
    }
    """
    device_id = payload.get("device_id")
    if not device_id or not isinstance(device_id, str) or len(device_id) < 8:
        return {"status": "error", "detail": "Missing or invalid device_id"}

    # Auth check — but the admin key dependency is NOT on this router,
    # so we do it inline. This allows admin key OR device token.
    if not _verify_device_access(request, device_id):
        return {
            "status": "error",
            "detail": "Unauthorized. Provide X-Device-Token or X-Admin-Key header.",
        }

    token = request.headers.get("X-Device-Token", "")
    token_hash = _hash_token(token) if token and len(token) >= 8 else ""

    backups = _read_backups()

    entry = {k: v for k, v in payload.items() if k != "device_id"}
    if "timestamp" not in entry:
        entry["timestamp"] = time.time()

    # Store the token hash for future verification
    if token_hash:
        entry["_token_hash"] = token_hash

    backups[device_id] = entry
    _write_backups(backups)

    # Prune old devices (keep last 50)
    if len(backups) > 50:
        sorted_ids = sorted(backups.keys(), key=lambda d: backups[d].get("timestamp", 0))
        for old_id in sorted_ids[:-50]:
            del backups[old_id]
        _write_backups(backups)

    return {"status": "ok", "device_id": device_id}


@router.get("/cloud/backup")
async def get_backup(device_id: str, request: Request):
    """Retrieve the most recent backup for a device.

    Requires X-Device-Token header (or X-Admin-Key for admin override).
    Returns empty data object when no backup exists for this device.
    """
    if not device_id or len(device_id) < 8:
        return {"status": "error", "detail": "Missing or invalid device_id"}

    if not _verify_device_access(request, device_id):
        return {
            "status": "error",
            "detail": "Unauthorized. Provide X-Device-Token or X-Admin-Key header.",
        }

    backups = _read_backups()
    entry = backups.get(device_id)

    if entry is None:
        return {
            "status": "ok",
            "data": {
                "favorites": [],
                "watchlist": [],
                "series_watchlist": [],
                "settings": {},
            },
        }

    # Strip internal fields before returning
    clean = {k: v for k, v in entry.items() if not k.startswith("_")}

    return {
        "status": "ok",
        "data": clean,
    }


@router.post("/cloud/merge")
async def merge_favorites(payload: dict, request: Request):
    """Upload favorites and merge them additively with any existing backup.

    Requires X-Device-Token header (or X-Admin-Key for admin override).

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

    if not _verify_device_access(request, device_id):
        return {
            "status": "error",
            "detail": "Unauthorized. Provide X-Device-Token or X-Admin-Key header.",
        }

    token = request.headers.get("X-Device-Token", "")
    token_hash = _hash_token(token) if token and len(token) >= 8 else ""

    incoming_favs = set(payload.get("favorites", []))

    backups = _read_backups()
    existing = backups.get(device_id, {})

    existing_favs = set(existing.get("favorites", []))
    merged = sorted(existing_favs | incoming_favs)

    existing["favorites"] = merged
    existing["timestamp"] = time.time()

    # Store token hash for future verification (in case this is a registration)
    if token_hash:
        existing["_token_hash"] = token_hash

    backups[device_id] = existing
    _write_backups(backups)

    return {"status": "ok", "favorites": merged}
