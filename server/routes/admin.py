"""Admin routes: cache controls, EPG refresh, stats."""

import asyncio
import logging
import os
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

import state
from config import ProviderConfig

log = logging.getLogger("spacetime-tv")


def require_admin_key(request: Request) -> None:
    """Dependency: check X-Admin-Key header against configured key.
    Key is set from ADMIN_API_KEY env var, or auto-generated on first startup.
    """
    from config import ADMIN_API_KEY

    key = request.headers.get("X-Admin-Key", "")
    if key != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing admin key")


router = APIRouter(tags=["admin"], dependencies=[Depends(require_admin_key)])


@router.get("/admin/stats")
async def admin_stats():
    """Admin dashboard: cache stats, popular content, error trends."""
    from state import (
        SERVER_START_TIME,
        _cache,
        _cache_hits,
        _cache_misses,
        _epg_clients,
        _error_log,
        _search_queries,
        _stream_hits,
        epg_cache,
    )

    uptime = time.time() - SERVER_START_TIME
    popular = sorted(_stream_hits.items(), key=lambda x: -x[1])[:20]
    popular_list = [{"stream": k, "hits": v} for k, v in popular]

    cache_entries = len(_cache)
    vod_cached = sum(1 for k in _cache if k.startswith("vod_"))
    series_cached = sum(1 for k in _cache if k.startswith("series_"))
    recent_errors = list(reversed(_error_log[-20:]))

    return {
        "uptime": round(uptime, 1),
        "cache": {
            "total_entries": cache_entries,
            "hits": _cache_hits,
            "misses": _cache_misses,
            "hit_rate": round(_cache_hits / max(_cache_hits + _cache_misses, 1) * 100, 1),
            "vod_categories": vod_cached,
            "series_categories": series_cached,
            "epg_age": round(time.time() - epg_cache["fetched"], 0) if epg_cache["fetched"] else None,
        },
        "streams": {
            "total_hits": sum(_stream_hits.values()),
            "unique_streams": len(_stream_hits),
            "popular": popular_list,
        },
        "errors": {
            "total": len(_error_log),
            "recent": recent_errors,
        },
        "searches": {
            "total": len(_search_queries),
            "recent": list(reversed(_search_queries[-20:])),
        },
        "sse_clients": len(_epg_clients),
    }


@router.get("/admin/stream-health")
async def admin_stream_health():
    """Stream health dashboard: probe cache stats and sampled results."""
    try:
        from routes.stream import _probe_cache
    except ImportError:
        return {"enabled": False, "error": "probe cache not available"}

    now = time.time()
    total = len(_probe_cache)
    by_codec: dict[str, int] = {}
    by_resolution: dict[str, int] = {}
    by_type: dict[str, int] = {}
    cached_recent: list[dict] = []
    stale_count = 0

    for key, (ts, data) in _probe_cache.items():
        age = round(now - ts, 0)
        if age > 3600:
            stale_count += 1

        codec = data.get("codec", "unknown")
        by_codec[codec] = by_codec.get(codec, 0) + 1

        w = data.get("width", 0)
        h = data.get("height", 0)
        if w > 0 and h > 0:
            if h >= 2160:
                res = "4K"
            elif h >= 1440:
                res = "1440p"
            elif h >= 1080:
                res = "1080p"
            elif h >= 720:
                res = "720p"
            elif h >= 480:
                res = "480p"
            else:
                res = f"{h}p"
            by_resolution[res] = by_resolution.get(res, 0) + 1
        else:
            by_resolution["unknown"] = by_resolution.get("unknown", 0) + 1

        stream_type = key.split("_")[0] if "_" in key else "?"
        by_type[stream_type] = by_type.get(stream_type, 0) + 1

        if len(cached_recent) < 20:
            err = data.get("error", "")
            cached_recent.append(
                {
                    "key": key,
                    "age_s": age,
                    "codec": codec,
                    "width": w,
                    "height": h,
                    "error": err if err else None,
                }
            )

    return {
        "enabled": True,
        "total_probed": total,
        "stale_count": stale_count,
        "by_codec": dict(sorted(by_codec.items(), key=lambda x: -x[1])),
        "by_resolution": dict(sorted(by_resolution.items(), key=lambda x: -x[1])),
        "by_type": dict(sorted(by_type.items(), key=lambda x: -x[1])),
        "recent": cached_recent,
    }


@router.post("/admin/cache/clear")
async def admin_clear_cache():
    """Clear all in-memory cache entries. Triggers a fresh warm."""
    from routes.cache_warmer import start_cache_warmer
    from state import _cache, epg_cache

    count = len(_cache)
    _cache.clear()
    epg_cache["data"] = None
    epg_cache["fetched"] = 0
    start_cache_warmer()
    return {"cleared": count, "message": f"Cleared {count} cache entries. Warming started."}


@router.post("/admin/cache/warm")
async def admin_warm_cache():
    """Force a warm cache cycle (no-op if already warming)."""
    from routes.cache_warmer import is_warm_running, start_cache_warmer

    if is_warm_running():
        return {"message": "Cache warming already in progress."}
    start_cache_warmer()
    return {"message": "Cache warming started."}


@router.post("/admin/cache/warm-full")
async def admin_warm_full_cache():
    """Clear THEN warm the full cache.

    Shares the real logic with /admin/cache/clear, but respects the
    is-warm-running guard (clear's precedence was to re-warm unconditionally;
    both end at the same "cleared + warming" state). No-op if already warming.
    """
    from routes.cache_warmer import is_warm_running, start_cache_warmer
    from state import _cache, epg_cache

    if is_warm_running():
        return {"message": "Cache warming already in progress."}

    count = len(_cache)
    _cache.clear()
    epg_cache["data"] = None
    epg_cache["fetched"] = 0
    start_cache_warmer()
    return {"message": f"Full re-warm started. Cleared {count} stale entries."}


@router.post("/admin/epg/refresh")
async def admin_epg_refresh():
    """Trigger an immediate EPG refresh in the background."""
    from state import epg_cache

    # Read the task from the shared state module so we dedup against refreshes
    # started by guide_epg.load_epg_background() — a local import copy would
    # always read None and spawn duplicate concurrent refreshes.
    already_running = state._epg_refresh_task is not None and not state._epg_refresh_task.done()
    from routes.guide import _refresh_epg_background

    if not already_running:
        state._epg_refresh_task = asyncio.create_task(_refresh_epg_background())

    last_fetch = epg_cache["fetched"]
    age = round(time.time() - last_fetch, 0) if last_fetch else None

    return {
        "refresh_started": not already_running,
        "already_running": already_running,
        "last_fetch_ts": last_fetch,
        "epg_age_s": age,
        "message": "EPG refresh triggered." if not already_running else "EPG refresh already in progress.",
    }


# ── Provider Management ──────────────────────────────────────────────────


@router.get("/admin/providers")
async def admin_get_providers():
    """List all configured IPTV providers with health status."""
    from config import PROVIDERS
    from state import _provider_health

    result = []
    for i, p in enumerate(PROVIDERS):
        health = _provider_health.get(i, {})
        result.append(
            {
                "index": i,
                "name": p.name,
                "base_url": p.base_url,
                "username": p.username,
                "enabled": p.enabled,
                "order": p.order,
                "health": {
                    "last_ok": health.get("last_ok"),
                    "last_error": health.get("last_error"),
                    "error_count": health.get("error_count", 0),
                    "ok_count": health.get("ok_count", 0),
                },
            }
        )
    return {"providers": result}


@router.post("/admin/providers/{idx}/toggle")
async def admin_toggle_provider(idx: int):
    """Enable/disable a provider."""
    from config import PROVIDERS, _persist_providers

    if idx < 0 or idx >= len(PROVIDERS):
        raise HTTPException(404, f"Provider index {idx} not found")
    PROVIDERS[idx].enabled = not PROVIDERS[idx].enabled
    _persist_providers(PROVIDERS)
    return {"index": idx, "name": PROVIDERS[idx].name, "enabled": PROVIDERS[idx].enabled}


@router.post("/admin/providers/{idx}/reorder")
async def admin_reorder_provider(idx: int, new_order: int):
    """Change provider priority order."""
    from config import PROVIDERS, _persist_providers

    if idx < 0 or idx >= len(PROVIDERS):
        raise HTTPException(404, f"Provider index {idx} not found")
    # Pop-and-insert: move the provider to the target position, then re-index.
    # (Setting order + stable sort is a no-op when the target slot is already
    # occupied by another provider with the same order value.)
    p = PROVIDERS.pop(idx)
    new_order = max(0, min(new_order, len(PROVIDERS)))
    PROVIDERS.insert(new_order, p)
    for i, pp in enumerate(PROVIDERS):
        pp.order = i
    _persist_providers(PROVIDERS)
    return {"message": f"Provider '{p.name}' reordered to position {new_order}"}


@router.post("/admin/providers/reset-health")
async def admin_reset_provider_health():
    """Reset all provider health counters."""
    from state import _provider_health

    _provider_health.clear()
    return {"message": "Provider health counters reset"}


@router.get("/admin/providers/active")
async def admin_get_active_provider():
    """Get the currently active (highest-priority enabled) provider."""
    from iptv_client import get_active_provider

    p = get_active_provider()
    if not p:
        return {"active": None}
    return {"active": {"name": p.name, "base_url": p.base_url}}


@router.post("/admin/providers")
async def admin_add_provider(body: dict):
    """Add a new provider."""
    from config import PROVIDERS, _persist_providers

    base_url = body.get("base_url", "").rstrip("/")
    if not base_url:
        raise HTTPException(400, "base_url is required")
    username = body.get("username", "")
    if not username:
        raise HTTPException(400, "username is required")
    password = body.get("password", "")
    name = body.get("name", f"Provider {len(PROVIDERS) + 1}")
    enabled = body.get("enabled", True)

    from config import _maybe_encrypt

    PROVIDERS.append(
        ProviderConfig(
            name=name,
            base_url=base_url,
            username=username,
            password=_maybe_encrypt(password),
            enabled=enabled,
            order=len(PROVIDERS),
        )
    )
    PROVIDERS.sort(key=lambda x: x.order)
    # Re-index
    for i, p in enumerate(PROVIDERS):
        p.order = i

    _persist_providers(PROVIDERS)
    return {"message": f"Provider '{name}' added", "index": len(PROVIDERS) - 1}


@router.delete("/admin/providers/{idx}")
async def admin_delete_provider(idx: int):
    """Delete a provider by index."""
    from config import PROVIDERS, _persist_providers

    if idx < 0 or idx >= len(PROVIDERS):
        raise HTTPException(404, f"Provider index {idx} not found")

    name = PROVIDERS[idx].name
    del PROVIDERS[idx]
    # Re-index
    for i, p in enumerate(PROVIDERS):
        p.order = i

    _persist_providers(PROVIDERS)
    return {"message": f"Provider '{name}' deleted"}


@router.put("/admin/providers/{idx}")
async def admin_update_provider(idx: int, body: dict):
    """Update a provider's configuration."""
    from config import PROVIDERS, _maybe_encrypt, _persist_providers

    if idx < 0 or idx >= len(PROVIDERS):
        raise HTTPException(404, f"Provider index {idx} not found")

    p = PROVIDERS[idx]

    if "name" in body and body["name"]:
        p.name = body["name"]
    if "base_url" in body and body["base_url"]:
        p.base_url = body["base_url"].rstrip("/")
    if "username" in body and body["username"]:
        p.username = body["username"]
    if "password" in body and body["password"]:
        p.password = _maybe_encrypt(body["password"])
    if "enabled" in body:
        p.enabled = bool(body["enabled"])
    if "order" in body:
        # Pop-and-insert so the provider actually moves to the requested slot
        # (stable sort + equal order values is a no-op for occupied targets).
        PROVIDERS.pop(idx)
        target = max(0, min(int(body["order"]), len(PROVIDERS)))
        PROVIDERS.insert(target, p)
        for i, pp in enumerate(PROVIDERS):
            pp.order = i

    _persist_providers(PROVIDERS)
    return {"message": f"Provider '{p.name}' updated"}


# ── Hermes-ID Agent Access ─────────────────────────────────────────────
# Proxy endpoints for the Agent Access page: list/approve/deny hermes-id
# agents requesting access to this project. The auth server env vars are
# set via the systemd EnvironmentFile:
#   HERMES_AUTH_SERVER_URL, HERMES_AUTH_PROJECT, HERMES_ID_ADMIN_KEY,
#   HERMES_AUTH_VERIFY (optional CA bundle path).


async def _hermes_id_request(method: str, path: str, params: dict | None = None) -> JSONResponse:
    """Proxy a request to the hermes-id auth server admin API.

    Authenticates with the per-app scoped admin key (HERMES_ID_ADMIN_KEY)
    so the proxy can only touch this project's agents. Returns the auth
    server's JSON body directly; on upstream errors returns a JSONResponse
    carrying the upstream status code and detail.
    """
    import httpx

    server_url = os.environ.get("HERMES_AUTH_SERVER_URL", "").rstrip("/")
    project = os.environ.get("HERMES_AUTH_PROJECT", "")
    admin_key = os.environ.get("HERMES_ID_ADMIN_KEY", "")

    if not server_url or not project or not admin_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "Hermes-ID auth server not configured — set HERMES_AUTH_SERVER_URL, "
                "HERMES_AUTH_PROJECT and HERMES_ID_ADMIN_KEY"
            ),
        )

    url = f"{server_url}{path}"
    query = dict(params or {})
    query.setdefault("project", project)
    headers = {"X-Admin-Key": admin_key}
    # HERMES_AUTH_VERIFY is documented as an optional CA-bundle path, but
    # deployments/conftest also use the literal string "false" to disable
    # verification. `verify="false"` is truthy and gets treated as a CA
    # bundle path → SSL error → 502. Normalize the boolean spellings.
    _verify_raw = os.environ.get("HERMES_AUTH_VERIFY", "")
    if _verify_raw.lower() in ("false", "0", "no", "off"):
        verify: str | bool = False
    else:
        verify = _verify_raw or True

    try:
        async with httpx.AsyncClient(verify=verify, timeout=30.0) as client:
            resp = await client.request(method, url, params=query, headers=headers)
    except httpx.HTTPError as e:
        log.error(f"[HERMES-ID] auth server request failed: {e}")
        return JSONResponse(status_code=502, content={"detail": f"Auth server unreachable: {e}"})

    if resp.status_code >= 400:
        detail: str = resp.text
        try:
            body = resp.json()
            if isinstance(body, dict) and "detail" in body:
                detail = str(body["detail"])
        except ValueError:
            pass
        log.warning(f"[HERMES-ID] auth server returned {resp.status_code}: {detail}")
        return JSONResponse(status_code=resp.status_code, content={"detail": detail})

    try:
        body = resp.json()
    except ValueError:
        body = {"raw": resp.text}
    return JSONResponse(status_code=resp.status_code, content=body)


@router.get("/admin/hermes-id/agents")
async def admin_hermes_id_agents(status: str = "pending", page: int = 1, page_size: int = 50):
    """List hermes-id agents for this project (default: pending)."""
    return await _hermes_id_request("GET", "/agents", {"status": status, "page": page, "page_size": page_size})


@router.post("/admin/hermes-id/agents/{did}/approve")
async def admin_hermes_id_approve(did: str):
    """Approve a pending hermes-id agent for this project."""
    return await _hermes_id_request("POST", f"/agents/{did}/approve")


@router.post("/admin/hermes-id/agents/{did}/deny")
async def admin_hermes_id_deny(did: str):
    """Deny a pending hermes-id agent for this project."""
    return await _hermes_id_request("POST", f"/agents/{did}/deny")
