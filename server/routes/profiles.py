"""Per-user profiles with PIN parity (Smarter-compatible).

Extends the x-device-token auth pattern to support multiple user profiles
per device, each with their own PIN for access control.
"""

import logging
import time

from fastapi import APIRouter, HTTPException, Request

from auth import (
    _load_profiles,
    _save_profiles,
    add_profile_favorite,
    add_profile_history,
    clear_profile_history,
    create_profile,
    delete_profile,
    generate_profile_token,
    get_profile,
    get_profile_favorites,
    get_profile_history,
    list_profiles,
    remove_profile_favorite,
    verify_profile_pin,
    verify_profile_token,
)


def _require_profile_access(profile_id: str, request: Request):
    """Check that X-Profile-Token matches the requested profile_id, or admin key."""
    admin_key = request.headers.get("X-Admin-Key", "")
    from config import ADMIN_API_KEY

    if admin_key and admin_key == ADMIN_API_KEY:
        return {"profile_id": profile_id, "admin": True}
    token = request.headers.get("X-Profile-Token", "")
    if not token:
        raise HTTPException(401, "Missing X-Profile-Token or X-Admin-Key header")
    result = verify_profile_token(token)
    if not result:
        raise HTTPException(401, "Invalid or expired profile token")
    if result["profile_id"] != profile_id:
        raise HTTPException(403, "Token does not match requested profile")
    return result


log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["profiles"])


@router.get("/profiles")
async def api_list_profiles(request: Request):
    """List all profiles (without PINs). Requires admin or device auth."""
    # Auth is handled by middleware in main.py
    return {"profiles": list_profiles()}


@router.post("/profiles")
async def api_create_profile(payload: dict, request: Request):
    """Create a new profile.

    Requires X-Admin-Key or X-Device-Token.

    Payload:
    {
        "name": "Profile Name",
        "pin": "1234",
        "avatar": "default"  // optional
    }
    """
    name = payload.get("name", "").strip()
    pin = payload.get("pin", "").strip()
    avatar = payload.get("avatar", "")

    if not name or len(name) < 1 or len(name) > 50:
        raise HTTPException(400, "Name must be 1-50 characters")
    if not pin or not pin.isdigit() or len(pin) < 4 or len(pin) > 6:
        raise HTTPException(400, "PIN must be 4-6 digits")

    try:
        result = create_profile(name, pin, avatar)
        return {"status": "ok", "profile": result}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/profiles/{profile_id}/verify")
async def api_verify_profile_pin(profile_id: str, payload: dict):
    """Verify a profile PIN. Returns success/failure.

    Empty pin is allowed: for a profile with no PIN set, an empty pin
    verifies as valid (the profile is unlocked). Profiles with a PIN
    require the matching pin.
    """
    pin = payload.get("pin", "").strip()
    valid = verify_profile_pin(profile_id, pin)
    return {"valid": valid}


@router.get("/profiles/me")
async def api_get_current_profile(request: Request):
    """Get current profile from X-Profile-Token header."""
    token = request.headers.get("X-Profile-Token", "")
    if not token:
        raise HTTPException(401, "Missing X-Profile-Token header")
    result = verify_profile_token(token)
    if not result:
        raise HTTPException(401, "Invalid or expired profile token")
    profile = get_profile(result["profile_id"])
    if not profile:
        raise HTTPException(404, "Profile not found")
    return {"profile": profile}


@router.get("/profiles/{profile_id}")
async def api_get_profile(profile_id: str):
    """Get a profile by ID (without PIN)."""
    profile = get_profile(profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    return {"profile": profile}


@router.delete("/profiles/{profile_id}")
async def api_delete_profile(profile_id: str, request: Request):
    """Delete a profile. Requires admin key or own profile token."""
    _require_profile_access(profile_id, request)
    if not delete_profile(profile_id):
        raise HTTPException(404, "Profile not found")
    return {"status": "ok", "detail": "Profile deleted"}


@router.get("/profiles/{profile_id}/progress")
async def api_get_profile_progress(profile_id: str, request: Request):
    """Get watch progress for a profile."""
    _require_profile_access(profile_id, request)
    profiles = _load_profiles()
    p = profiles.get(profile_id)
    if not p:
        raise HTTPException(404, "Profile not found")
    return {"progress": p.get("progress", {})}


@router.put("/profiles/{profile_id}/progress")
async def api_put_profile_progress(profile_id: str, payload: dict):
    """Set watch progress for a profile. Merges with existing progress."""
    profiles = _load_profiles()
    if profile_id not in profiles:
        raise HTTPException(404, "Profile not found")
    watch_key = payload.get("watchKey")
    pos = payload.get("position")
    if not watch_key or pos is None:
        raise HTTPException(400, "Missing watchKey or position")
    if "progress" not in profiles[profile_id]:
        profiles[profile_id]["progress"] = {}
    profiles[profile_id]["progress"][watch_key] = {
        "position": pos,
        "timestamp": time.time(),
        "seriesData": payload.get("seriesData"),
        "movieData": payload.get("movieData"),
    }
    # Remove None keys
    for k in ("seriesData", "movieData"):
        if profiles[profile_id]["progress"][watch_key].get(k) is None:
            del profiles[profile_id]["progress"][watch_key][k]
    _save_profiles(profiles)
    return {"status": "ok"}


@router.post("/profiles/{profile_id}/history")
async def api_add_profile_history(profile_id: str, payload: dict):
    """Add a watch history entry for a profile."""
    watch_key = payload.get("watchKey")
    title = payload.get("title", "")
    content_type = payload.get("contentType", "")
    position = payload.get("position", 0)
    duration = payload.get("duration", 0)
    metadata = payload.get("metadata", {})

    if not watch_key:
        raise HTTPException(400, "Missing watchKey")

    entry = {
        "watchKey": watch_key,
        "title": title,
        "contentType": content_type,
        "position": position,
        "duration": duration,
        "metadata": metadata,
    }
    if not add_profile_history(profile_id, entry):
        raise HTTPException(404, "Profile not found")
    return {"status": "ok"}


@router.get("/profiles/{profile_id}/history")
async def api_get_profile_history(profile_id: str, request: Request, limit: int = 50, offset: int = 0):
    """Get watch history for a profile."""
    _require_profile_access(profile_id, request)
    history = get_profile_history(profile_id, limit, offset)
    return {"history": history}


@router.delete("/profiles/{profile_id}/history")
async def api_clear_profile_history(profile_id: str):
    """Clear all watch history for a profile."""
    if not clear_profile_history(profile_id):
        raise HTTPException(404, "Profile not found")
    return {"status": "ok"}


# ── Profile favorites ───────────────────────────────────────────


@router.get("/profiles/{profile_id}/favorites")
async def api_get_profile_favorites(profile_id: str, request: Request):
    """Get favorites for a profile."""
    _require_profile_access(profile_id, request)
    favorites = get_profile_favorites(profile_id)
    return {"favorites": favorites}


@router.post("/profiles/{profile_id}/favorites")
async def api_add_profile_favorite(profile_id: str, payload: dict):
    """Add an item to profile favorites."""
    watch_key = payload.get("watchKey") or payload.get("id", "")
    if not watch_key:
        raise HTTPException(400, "Missing watchKey or id")
    if not add_profile_favorite(profile_id, payload):
        raise HTTPException(404, "Profile not found")
    return {"status": "ok"}


@router.delete("/profiles/{profile_id}/favorites/{watch_key}")
async def api_remove_profile_favorite(profile_id: str, watch_key: str):
    """Remove an item from profile favorites."""
    if not remove_profile_favorite(profile_id, watch_key):
        raise HTTPException(404, "Profile or favorite not found")
    return {"status": "ok"}


# ── Profile authentication / session ────────────────────────────


@router.post("/profiles/{profile_id}/auth")
async def api_profile_auth(profile_id: str, payload: dict, request: Request):
    """Verify profile PIN and return a profile session token.

    Body: {"pin": "1234"}
    Returns: {"token": "...", "profile": {...}}
    """
    pin = payload.get("pin", "").strip()
    if not pin:
        raise HTTPException(400, "PIN is required")

    if not verify_profile_pin(profile_id, pin):
        raise HTTPException(403, "Invalid PIN")

    device_id = request.headers.get("X-Device-Token", "device")
    token = generate_profile_token(profile_id, device_id)
    profile = get_profile(profile_id)

    return {"token": token, "profile": profile}


@router.post("/profiles/session")
async def api_switch_profile(payload: dict, request: Request):
    """Switch active profile by verifying PIN. Returns new session token.

    Body: {"profile_id": "...", "pin": "1234"}
    Empty pin is allowed for profiles with no PIN set (unlocked profiles).
    """
    profile_id = payload.get("profile_id", "")
    pin = payload.get("pin", "").strip()
    if not profile_id:
        raise HTTPException(400, "profile_id is required")
    if not verify_profile_pin(profile_id, pin):
        raise HTTPException(403, "Invalid PIN")

    device_id = request.headers.get("X-Device-Token", "device")
    token = generate_profile_token(profile_id, device_id)
    profile = get_profile(profile_id)

    return {"token": token, "profile": profile}


@router.post("/profiles/session/refresh")
async def api_refresh_profile_token(request: Request):
    """Refresh an existing profile token (extend expiry)."""
    token = request.headers.get("X-Profile-Token", "")
    if not token:
        raise HTTPException(401, "Missing X-Profile-Token header")
    result = verify_profile_token(token)
    if not result:
        raise HTTPException(401, "Invalid or expired profile token")

    new_token = generate_profile_token(result["profile_id"], result["device_id"])
    profile = get_profile(result["profile_id"])

    return {"token": new_token, "profile": profile}


# ── Profile settings ────────────────────────────────────────────────


@router.get("/profiles/{profile_id}/settings")
async def api_get_profile_settings(profile_id: str, request: Request):
    """Get settings for a profile."""
    _require_profile_access(profile_id, request)
    profiles = _load_profiles()
    profile = profiles.get(profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    return {"settings": profile.get("settings", {})}


@router.put("/profiles/{profile_id}/settings")
async def api_update_profile_settings(profile_id: str, payload: dict, request: Request):
    """Update settings for a profile."""
    _require_profile_access(profile_id, request)
    profiles = _load_profiles()
    if profile_id not in profiles:
        raise HTTPException(404, "Profile not found")
    if "settings" not in profiles[profile_id]:
        profiles[profile_id]["settings"] = {}
    profiles[profile_id]["settings"].update(payload)
    _save_profiles(profiles)
    return {"status": "ok", "settings": profiles[profile_id]["settings"]}


@router.delete("/profiles/{profile_id}/settings")
async def api_clear_profile_settings(profile_id: str, request: Request):
    """Clear all settings for a profile."""
    _require_profile_access(profile_id, request)
    profiles = _load_profiles()
    if profile_id not in profiles:
        raise HTTPException(404, "Profile not found")
    profiles[profile_id]["settings"] = {}
    _save_profiles(profiles)
    return {"status": "ok", "detail": "Settings cleared"}
