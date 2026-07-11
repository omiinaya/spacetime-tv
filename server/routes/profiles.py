"""Per-user profiles with PIN parity (Smarter-compatible).

Extends the x-device-token auth pattern to support multiple user profiles
per device, each with their own PIN for access control.
"""
import logging
import time
from fastapi import APIRouter, HTTPException, Request
from auth import (
    create_profile, verify_profile_pin, get_profile,
    list_profiles, delete_profile,
)

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
    """Verify a profile PIN. Returns success/failure."""
    pin = payload.get("pin", "").strip()
    if not pin:
        raise HTTPException(400, "PIN is required")
    valid = verify_profile_pin(profile_id, pin)
    return {"valid": valid}


@router.get("/profiles/{profile_id}")
async def api_get_profile(profile_id: str):
    """Get a profile by ID (without PIN)."""
    profile = get_profile(profile_id)
    if not profile:
        raise HTTPException(404, "Profile not found")
    return {"profile": profile}


@router.delete("/profiles/{profile_id}")
async def api_delete_profile(profile_id: str, request: Request):
    """Delete a profile. Admin or device auth required."""
    # Auth handled by middleware
    if not delete_profile(profile_id):
        raise HTTPException(404, "Profile not found")
    return {"status": "ok", "detail": "Profile deleted"}
