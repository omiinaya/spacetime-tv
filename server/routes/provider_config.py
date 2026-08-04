"""Provider configuration routes — user-facing settings surface.

Single-user IPTV semantics: the dashboard manages exactly ONE provider
(the one that feeds live TV / VOD / EPG). These endpoints let the
Settings page read and update it without an admin key:

  GET  /api/v1/provider       — current provider (password NEVER returned)
  PUT  /api/v1/provider       — create/update the single provider, persist
  POST /api/v1/provider/test  — validate creds against upstream (no save)

Unlike /admin/providers*, this router is NOT admin-key gated: it sits
behind the global auth middleware (LAN/localhost bypass, plus admin key
or device token for external clients) so the Settings page can manage
the provider directly — matching how live/VOD/search routes behave.
"""

import logging

from fastapi import APIRouter, HTTPException

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["provider"])


def _public_provider(p, idx: int) -> dict:
    """Provider dict safe for clients — never includes the password."""
    from state import _provider_health

    health = _provider_health.get(idx, {})
    return {
        "name": p.name,
        "base_url": p.base_url,
        "username": p.username,
        "enabled": p.enabled,
        "has_password": bool(p.password),
        "health": {
            "last_ok": health.get("last_ok"),
            "last_error": health.get("last_error"),
            "error_count": health.get("error_count", 0),
            "ok_count": health.get("ok_count", 0),
        },
    }


def _find_index() -> int:
    """Return the index of the single provider (0) or -1 if none."""
    from config import PROVIDERS

    return 0 if PROVIDERS else -1


@router.get("/provider")
async def get_provider():
    """Return the current provider config (password masked)."""
    from config import PROVIDERS

    if not PROVIDERS:
        return {"configured": False, "provider": None}
    return {"configured": True, "provider": _public_provider(PROVIDERS[0], 0)}


@router.put("/provider")
async def update_provider(body: dict):
    """Create or update the single provider and persist it.

    password is optional: when omitted/empty the existing password is
    kept (so the UI can change base_url/username without re-entering
    credentials). Passing a new password replaces it.
    """
    from config import (
        PROVIDERS,
        ProviderConfig,
        _maybe_encrypt,
        _save_providers_to_file,
    )

    base_url = body.get("base_url", "").rstrip("/")
    if not base_url:
        raise HTTPException(400, "base_url is required")
    username = body.get("username", "")
    if not username:
        raise HTTPException(400, "username is required")

    name = (body.get("name") or "Default").strip()
    enabled = bool(body.get("enabled", True))
    password = body.get("password", "")

    if PROVIDERS:
        p = PROVIDERS[0]
        p.name = name
        p.base_url = base_url
        p.username = username
        p.enabled = enabled
        if password:
            p.password = _maybe_encrypt(password)
    else:
        PROVIDERS.append(
            ProviderConfig(
                name=name,
                base_url=base_url,
                username=username,
                password=_maybe_encrypt(password) if password else "",
                enabled=enabled,
                order=0,
            )
        )

    _save_providers_to_file(PROVIDERS)

    # Invalidate the whole cache so new creds take effect immediately
    # (provider-scoped cache keys would otherwise serve stale data).
    from state import _cache

    _cache.clear()

    return {
        "message": f"Provider '{name}' saved",
        "provider": _public_provider(PROVIDERS[0], 0),
    }


@router.post("/provider/test")
async def test_provider(body: dict):
    """Validate provider credentials against the upstream API (no save).

    Returns {ok: true, categories: N} on success or {ok: false, error}
    on failure. When password is omitted, the currently stored password
    (decrypted) is used so the UI can re-test existing creds.
    """
    import httpx

    from config import PROVIDERS, ProviderConfig
    from iptv_client import iptv_url

    base_url = body.get("base_url", "").rstrip("/")
    username = body.get("username", "")
    if not base_url or not username:
        raise HTTPException(400, "base_url and username are required")

    password = body.get("password", "")
    if not password and PROVIDERS:
        stored = PROVIDERS[0].password
        if stored.startswith("enc:"):
            try:
                from crypto_utils import decrypt

                stored = decrypt(stored)
            except Exception as e:  # noqa: BLE001 — never fail the test on decrypt
                return {"ok": False, "error": f"failed to decrypt stored password: {e}"}
        password = stored

    probe = ProviderConfig(
        name="__probe__",
        base_url=base_url,
        username=username,
        password=password,
        enabled=True,
        order=0,
    )
    url = iptv_url("get_live_categories", provider=probe)

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as c:
            resp = await c.get(url)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:  # noqa: BLE001 — report upstream failure to the UI
        log.warning("provider test failed for %s: %s", base_url, e)
        return {"ok": False, "error": str(e)}

    # Xtream returns a bare list of categories, but some panels wrap it.
    if isinstance(data, list):
        return {"ok": True, "categories": len(data)}
    if isinstance(data, dict) and isinstance(data.get("categories"), list):
        return {"ok": True, "categories": len(data["categories"])}
    return {"ok": True, "categories": 0}
