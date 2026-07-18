"""Health & monitoring routes."""

import json
import logging
import time

from fastapi import APIRouter, Request

from state import (
    SERVER_START_TIME,
    _cache,
    epg_cache,
)

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Server health: status, uptime, cache stats."""
    uptime = time.time() - SERVER_START_TIME
    cache_stats = {}
    for key, (_ts, val) in _cache.items():
        if isinstance(val, list):
            cache_stats[key] = len(val)
        elif isinstance(val, dict):
            cache_stats[key] = list(val.keys())[:5] if val else []
    return {
        "status": "healthy",
        "uptime": round(uptime, 1),
        "epg_age": round(time.time() - epg_cache["fetched"], 0) if epg_cache["fetched"] else None,
        "cached_categories": list(cache_stats.keys()),
    }


@router.post("/error")
async def report_error(request: Request):
    """Frontend error beacon: log client-side errors server-side."""
    try:
        body = await request.json()
        msg = body.get("message", "unknown")
        stack = body.get("stack", "")
        component_stack = body.get("componentStack", "")
        url = body.get("url", "")
        user_agent = request.headers.get("user-agent", "")
        log.error(
            f"[CLIENT ERROR] {msg} | URL: {url} | UA: {user_agent[:80]}\n"
            f"  stack: {(stack or 'none')[:300]}\n"
            f"  component: {(component_stack or 'none')[:200]}"
        )
    except json.JSONDecodeError as e:
        log.warning(f"[CLIENT ERROR] Failed to parse error body: {e}")
    return {"ok": True}
