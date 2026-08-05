"""Provider configuration routes — user-facing settings surface.

Single-user IPTV semantics: the dashboard manages one or more Xtream
providers (the ones that feed live TV / VOD / EPG). These endpoints let the
Settings page read and update them without an admin key:

  GET   /api/v1/provider        — active (first) provider (password NEVER returned)
  PUT   /api/v1/provider        — create/update the primary provider, persist
  POST  /api/v1/provider/test   — validate creds against upstream (no save)
  GET   /api/v1/providers       — list all providers
  POST  /api/v1/providers       — add a new provider
  PUT   /api/v1/providers/{idx} — update provider at index
  DELETE /api/v1/providers/{idx} — delete provider at index
  POST  /api/v1/providers/{idx}/toggle — enable/disable provider

Unlike /admin/providers*, this router is NOT admin-key gated: it sits
behind the global auth middleware (LAN/localhost bypass, plus admin key
or device token for external clients) so the Settings page can manage
providers directly — matching how live/VOD/search routes behave.

Every mutation persists to BOTH server/data/providers.json AND the .env
file (PROVIDERS_JSON) so creds/endpoints are not lost on data-dir wipes.
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


def _invalidate_cache() -> None:
    """Clear the provider-scoped cache AND trigger a re-warm.

    The VOD/Series/EPG endpoints (esp. movies/unified, series/unified) read
    ONLY from the in-memory cache — they have no cold-cache fallback. If a
    provider edit (update/add/delete/toggle) cleared the cache WITHOUT
    re-warming, the Movies page would go empty for minutes (until the next
    restart's warmer). So clearing must kick off a fresh warm, exactly like
    admin/cache/clear does. start_cache_warmer() is a no-op if one is already
    running.
    """
    from state import _cache

    _cache.clear()
    try:
        from routes.cache_warmer import start_cache_warmer

        start_cache_warmer()
    except Exception:  # noqa: BLE001 — never fail the mutation on warm failure
        pass


@router.get("/provider")
async def get_provider():
    """Return the active (first) provider config (password masked)."""
    from config import PROVIDERS

    if not PROVIDERS:
        return {"configured": False, "provider": None}
    return {"configured": True, "provider": _public_provider(PROVIDERS[0], 0)}


@router.get("/providers")
async def list_providers():
    """List all configured providers (password masked, with health)."""
    from config import PROVIDERS

    return {"providers": [{**_public_provider(p, i), "index": i, "order": p.order} for i, p in enumerate(PROVIDERS)]}


@router.put("/provider")
async def update_provider(body: dict):
    """Create or update the primary (first) provider and persist it.

    password is optional: when omitted/empty the existing password is
    kept (so the UI can change base_url/username without re-entering
    credentials). Passing a new password replaces it.
    """
    from config import (
        PROVIDERS,
        ProviderConfig,
        _maybe_encrypt,
        _persist_providers,
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

    _persist_providers(PROVIDERS)

    # Invalidate the whole cache so new creds take effect immediately
    _invalidate_cache()

    return {
        "message": f"Provider '{name}' saved",
        "provider": _public_provider(PROVIDERS[0], 0),
    }


@router.post("/providers")
async def add_provider(body: dict):
    """Add a new provider (any Xtream service)."""
    from config import (
        PROVIDERS,
        ProviderConfig,
        _maybe_encrypt,
        _persist_providers,
    )

    base_url = body.get("base_url", "").rstrip("/")
    if not base_url:
        raise HTTPException(400, "base_url is required")
    username = body.get("username", "")
    if not username:
        raise HTTPException(400, "username is required")

    password = body.get("password", "")
    name = (body.get("name") or f"Provider {len(PROVIDERS) + 1}").strip()
    enabled = bool(body.get("enabled", True))

    PROVIDERS.append(
        ProviderConfig(
            name=name,
            base_url=base_url,
            username=username,
            password=_maybe_encrypt(password) if password else "",
            enabled=enabled,
            order=len(PROVIDERS),
        )
    )
    # Re-index
    for i, p in enumerate(PROVIDERS):
        p.order = i

    _persist_providers(PROVIDERS)
    _invalidate_cache()

    idx = len(PROVIDERS) - 1
    return {
        "message": f"Provider '{name}' added",
        "index": idx,
        "provider": _public_provider(PROVIDERS[idx], idx),
    }


@router.put("/providers/{idx}")
async def update_provider_at(idx: int, body: dict):
    """Update a provider at a given index (blank password keeps existing)."""
    from config import PROVIDERS, _maybe_encrypt, _persist_providers

    if idx < 0 or idx >= len(PROVIDERS):
        raise HTTPException(404, f"Provider index {idx} not found")

    p = PROVIDERS[idx]
    if "name" in body and body["name"]:
        p.name = body["name"].strip()
    if "base_url" in body and body["base_url"]:
        p.base_url = body["base_url"].rstrip("/")
    if "username" in body and body["username"]:
        p.username = body["username"]
    if "password" in body and body["password"]:
        p.password = _maybe_encrypt(body["password"])
    if "enabled" in body:
        p.enabled = bool(body["enabled"])

    _persist_providers(PROVIDERS)
    _invalidate_cache()

    return {
        "message": f"Provider '{p.name}' updated",
        "index": idx,
        "provider": _public_provider(p, idx),
    }


@router.delete("/providers/{idx}")
async def delete_provider(idx: int):
    """Delete a provider by index."""
    from config import PROVIDERS, _persist_providers

    if idx < 0 or idx >= len(PROVIDERS):
        raise HTTPException(404, f"Provider index {idx} not found")

    name = PROVIDERS[idx].name
    del PROVIDERS[idx]
    for i, p in enumerate(PROVIDERS):
        p.order = i

    _persist_providers(PROVIDERS)
    _invalidate_cache()

    return {"message": f"Provider '{name}' deleted"}


@router.post("/providers/{idx}/toggle")
async def toggle_provider(idx: int):
    """Enable/disable a provider."""
    from config import PROVIDERS, _persist_providers

    if idx < 0 or idx >= len(PROVIDERS):
        raise HTTPException(404, f"Provider index {idx} not found")

    PROVIDERS[idx].enabled = not PROVIDERS[idx].enabled
    _persist_providers(PROVIDERS)
    _invalidate_cache()

    return {
        "message": f"Provider '{PROVIDERS[idx].name}' {'enabled' if PROVIDERS[idx].enabled else 'disabled'}",
        "index": idx,
        "enabled": PROVIDERS[idx].enabled,
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
