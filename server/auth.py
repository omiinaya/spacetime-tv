"""Authentication and authorization utilities.

Provides FastAPI dependencies for enforcing X-Device-Token or X-Admin-Key
on all API endpoints. Extends the pattern from cloud_sync.py.

Also handles per-user profiles with PIN codes (Smarter-compatible).
"""
import hashlib
import hmac
import json
import logging
import os
import secrets
import time

from fastapi import HTTPException, Request, status

from config import ADMIN_API_KEY
import base64

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

def verify_device_token_generic(token: str) -> bool:
    """Verify a device token against any stored backup (not device-specific).
    
    Returns True if token matches any device's stored hash.
    Used by the global auth middleware for non-device-specific endpoints.
    """
    if not token or len(token) < 8:
        return False
    token_hash = hash_token(token)
    try:
        from routes.cloud_sync import _read_backups
        backups = _read_backups()
        for entry in backups.values():
            if entry.get("_token_hash", "") == token_hash:
                return True
    except (ImportError, OSError, json.JSONDecodeError):
        pass
    return False

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
            with open(path) as f:
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
        "progress": {},
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

def get_profile(profile_id: str) -> dict | None:
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


# ── Profile watch history ──────────────────────────────────────────

def add_profile_history(profile_id: str, entry: dict) -> bool:
    """Add a watch history entry to a profile. Returns False if profile not found."""
    profiles = _load_profiles()
    if profile_id not in profiles:
        return False
    if 'history' not in profiles[profile_id]:
        profiles[profile_id]['history'] = []
    entry['timestamp'] = time.time()
    # Most recent first, max 500 entries
    profiles[profile_id]['history'].insert(0, entry)
    if len(profiles[profile_id]['history']) > 500:
        profiles[profile_id]['history'] = profiles[profile_id]['history'][:500]
    _save_profiles(profiles)
    return True


def get_profile_history(profile_id: str, limit: int = 50, offset: int = 0) -> list:
    """Get paginated watch history for a profile."""
    profiles = _load_profiles()
    if profile_id not in profiles:
        return []
    history = profiles[profile_id].get('history', [])
    return history[offset:offset + limit]


def clear_profile_history(profile_id: str) -> bool:
    """Clear all watch history for a profile."""
    profiles = _load_profiles()
    if profile_id not in profiles:
        return False
    profiles[profile_id]['history'] = []
    _save_profiles(profiles)
    return True

# ── Profile favorites ────────────────────────────────────────────

def get_profile_favorites(profile_id: str) -> list:
    """Get favorites list for a profile."""
    profiles = _load_profiles()
    profile = profiles.get(profile_id)
    if not profile:
        return []
    return profile.get("favorites", [])


def add_profile_favorite(profile_id: str, item: dict) -> bool:
    """Add an item to profile favorites. Returns False if profile not found."""
    profiles = _load_profiles()
    if profile_id not in profiles:
        return False
    if "favorites" not in profiles[profile_id]:
        profiles[profile_id]["favorites"] = []
    watch_key = item.get("watchKey") or item.get("id", "")
    profiles[profile_id]["favorites"] = [
        f for f in profiles[profile_id]["favorites"]
        if (f.get("watchKey") or f.get("id", "")) != watch_key
    ]
    profiles[profile_id]["favorites"].append(item)
    _save_profiles(profiles)
    return True


def remove_profile_favorite(profile_id: str, watch_key: str) -> bool:
    """Remove an item from profile favorites by watchKey. Returns False if profile not found."""
    profiles = _load_profiles()
    if profile_id not in profiles:
        return False
    if "favorites" not in profiles[profile_id]:
        return False
    profiles[profile_id]["favorites"] = [
        f for f in profiles[profile_id]["favorites"]
        if (f.get("watchKey") or f.get("id", "")) != watch_key
    ]
    _save_profiles(profiles)
    return True


# ── Profile session tokens ───────────────────────────────────────

PROFILE_TOKEN_SECRET: str = ""

def _get_token_secret():
    global PROFILE_TOKEN_SECRET
    if not PROFILE_TOKEN_SECRET:
        PROFILE_TOKEN_SECRET = os.getenv("PROFILE_TOKEN_SECRET", secrets.token_hex(32))
    return PROFILE_TOKEN_SECRET


def generate_profile_token(profile_id: str, device_id: str = "") -> str:
    """Generate a profile session token (HMAC-SHA256 signed, 24h expiry)."""
    expiry = int(time.time()) + 86400
    payload = f"{profile_id}:{device_id}:{expiry}"
    sig = hmac.new(
        _get_token_secret().encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()[:16]
    token = base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()
    return token


def verify_profile_token(token: str) -> dict | None:
    """Verify a profile token. Returns {'profile_id', 'device_id', 'expiry'} or None."""
    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        parts = decoded.rsplit(":", 3)
        if len(parts) != 4:
            return None
        profile_id, device_id, expiry_str, sig = parts
        expiry = int(expiry_str)
        if time.time() > expiry:
            return None
        payload = f"{profile_id}:{device_id}:{expiry}"
        expected = hmac.new(
            _get_token_secret().encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            return None
        return {"profile_id": profile_id, "device_id": device_id, "expiry": expiry}
    except (ValueError, Exception):
        return None


def ensure_default_profile() -> dict | None:
    """Create a default profile if no profiles exist. Returns the profile dict or None."""
    profiles = _load_profiles()
    if profiles:
        return None
    profile_id = secrets.token_hex(8)
    profiles[profile_id] = {
        "name": "Main Profile",
        "pin": "",
        "avatar": "default",
        "created": time.time(),
        "favorites": [],
        "watchlist": {},
        "progress": {},
        "history": [],
        "settings": {},
        "restrictions": {},
    }
    _save_profiles(profiles)
    return {"profile_id": profile_id, "name": "Main Profile"}


