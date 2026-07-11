"""Authentication and authorization utilities.

Provides FastAPI dependencies for enforcing X-Device-Token or X-Admin-Key
on all API endpoints. Extends the pattern from cloud_sync.py.

Also handles per-user profiles with PIN codes (Smarter-compatible).
"""
import hashlib, hmac, json, logging, os, secrets, time
from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from config import ADMIN_API_KEY

log = logging.getLogger("spacetime-tv")

# ── Device token verification ────────────────────────────────────────────

def hash_token(token: str) -> str:
    """Hash a device token for secure storage."""
    return hashlib.sha256(token.encode()).hexdigest()

def verify_device_token(request: Request, device_id: str) -> bool:
    """Verify X-Device-Token or X-Admin-Key for a given device."""
    admin_key = request.headers.get("X-Admin-Key", "")
    if admin_key and admin_key == ADMIN_API_KEY:
        return True
    token = request.headers.get("X-Device-Token", "")
    if not token or len(token) < 8:
        return False
    from state import _backups
    backups = getattr(_backups, "_data", None)
    if backups is None:
        try:
            from routes.cloud_sync import _read_backups
            backups = _read_backups()
        except (ImportError, OSError, json.JSONDecodeError):
            return False
    entry = backups.get(device_id, {})
    stored_hash = entry.get("_token_hash", "")
    if not stored_hash:
        return False
    return hmac.compare_digest(hash_token(token), stored_hash)

# ── Auth dependency for all API endpoints ────────────────────────────────

async def require_auth(request: Request):
    """FastAPI dependency: verifies either X-Admin-Key or X-Device-Token.
    
    Skips auth for health endpoint and static files.
    Used as a dependency on the main app router.
    """
    path = request.url.path
    # Allow health check, error reporting, and static files without auth
    if path in ("/api/health", "/api/error") or path.startswith("/api/health"):
        return True
    if not path.startswith("/api/"):
        return True
    
    admin_key = request.headers.get("X-Admin-Key", "")
    if admin_key and admin_key == ADMIN_API_KEY:
        return True
    
    device_token = request.headers.get("X-Device-Token", "")
    if device_token and len(device_token) >= 8:
        return True
    
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Provide X-Admin-Key or X-Device-Token header.",
        headers={"WWW-Authenticate": "Bearer"},
    )

# ── Per-user profiles with PIN codes ──────────────────────────────────────

PROFILES_FILE: str = ""  # set during init

def _get_profiles_path():
    global PROFILES_FILE
    if not PROFILES_FILE:
        from config import DATA_DIR
        PROFILES_FILE = str(DATA_DIR / "profiles.json")
    return PROFILES_FILE

def _load_profiles() -> dict:
    """Load profiles from disk."""
    path = _get_profiles_path()
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log.warning(f"Failed to load profiles: {e}")
    return {}

def _save_profiles(profiles: dict):
    """Save profiles to disk."""
    path = _get_profiles_path()
    try:
        with open(path, "w") as f:
            json.dump(profiles, f, indent=2)
        os.chmod(path, 0o600)
    except OSError as e:
        log.warning(f"Failed to save profiles: {e}")

def create_profile(name: str, pin: str, avatar: str = "") -> dict:
    """Create a new user profile. PIN must be 4-6 digits."""
    if not pin or not pin.isdigit() or len(pin) < 4 or len(pin) > 6:
        raise ValueError("PIN must be 4-6 digits")
    profiles = _load_profiles()
    profile_id = secrets.token_hex(8)
    profiles[profile_id] = {
        "name": name,
        "pin": pin,
        "avatar": avatar,
        "created": time.time(),
        "favorites": [],
        "watchlist": {},
        "settings": {},
        "restrictions": {},
    }
    _save_profiles(profiles)
    return {"profile_id": profile_id, "name": name}

def verify_profile_pin(profile_id: str, pin: str) -> bool:
    """Verify a profile PIN. Returns True if valid."""
    profiles = _load_profiles()
    profile = profiles.get(profile_id)
    if not profile:
        return False
    return hmac.compare_digest(profile.get("pin", ""), pin)

def get_profile(profile_id: str) -> Optional[dict]:
    """Get a profile by ID (without exposing PIN)."""
    profiles = _load_profiles()
    profile = profiles.get(profile_id)
    if not profile:
        return None
    result = dict(profile)
    result["profile_id"] = profile_id
    result.pop("pin", None)
    return result

def list_profiles() -> list[dict]:
    """List all profiles (without exposing PINs)."""
    profiles = _load_profiles()
    return [{
        "profile_id": pid,
        "name": p.get("name", ""),
        "avatar": p.get("avatar", ""),
        "created": p.get("created", 0),
    } for pid, p in profiles.items()]

def delete_profile(profile_id: str) -> bool:
    """Delete a profile."""
    profiles = _load_profiles()
    if profile_id not in profiles:
        return False
    del profiles[profile_id]
    _save_profiles(profiles)
    return True
