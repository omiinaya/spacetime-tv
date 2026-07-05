"""Spacetime-TV Backend — IPTV proxy + EPG parser."""
import asyncio
import json
import logging
import os
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("spacetime-tv")

# ── Config (imported from config.py to avoid duplication) ─────────────────
from config import (
    IPTV_BASE, IPTV_USER, IPTV_PASS, EPG_CACHE_FILE, EPG_CACHE_TTL,
    ROOT, STATIC_DIR, TMDB_API_KEY, TMDB_BASE, UA_STR,
    CORS_ORIGINS,
    RATE_WINDOW, RATE_SEARCH_LIMIT, RATE_DEFAULT_LIMIT,
)
from state import SERVER_START_TIME, _load_stream_hits


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_stream_hits()
    from config import ADMIN_API_KEY, _AUTO_GEN_KEY
    if _AUTO_GEN_KEY:
        log.info(f"🔑 Admin API key auto-generated: {ADMIN_API_KEY}")
        log.info("   Set ADMIN_API_KEY in server/.env to use a fixed key")
    start_cleanup_task()
    start_cache_warmer()
    from routes.guide import _epg_broadcast_loop
    _epg_broadcast_task = asyncio.create_task(_epg_broadcast_loop())
    yield


app = FastAPI(title="Spacetime-TV", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
# GZip compression for API responses — JSON payloads compress 5-10x
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── Route modules ─────────────────────────────────────────────────────────
from routes.health import router as health_router
from routes.admin import router as admin_router
from routes.tmdb import router as tmdb_router
from routes.stream import router as stream_router
from routes.search import router as search_router
from routes.guide import router as guide_router, _epg_broadcast_loop
from routes.watchlist import router as watchlist_router
from routes.live import router as live_router
from routes.vod import router as vod_router
from routes.media import router as media_router
from routes.record import router as record_router
from routes.cloud_sync import router as cloud_sync_router
from routes.misc import router as misc_router
app.include_router(health_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(tmdb_router, prefix="/api/v1")
app.include_router(stream_router, prefix="/api/v1")
app.include_router(search_router, prefix="/api/v1")
app.include_router(guide_router, prefix="/api/v1")
app.include_router(watchlist_router, prefix="/api/v1")
app.include_router(live_router, prefix="/api/v1")
app.include_router(vod_router, prefix="/api/v1")
app.include_router(media_router, prefix="/api/v1")
app.include_router(record_router, prefix="/api/v1")
app.include_router(cloud_sync_router, prefix="/api/v1")
# Static files mount MUST come before catch-all misc router
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")
app.include_router(misc_router)

# ── Backward compatibility redirect: /api/... → /api/v1/... ─────────────
# NOTE: This is done as a middleware rather than a catch-all route because
# Starlette matches catch-all patterns before included-router partial matches,
# which would shadow all /api/v1/... routes. A middleware runs after route
# resolution — it only triggers for paths that hit 404 at /api/... but exist
# under /api/v1/... (or any /api/... path that needs redirecting).
from fastapi.responses import RedirectResponse

@app.middleware("http")
async def api_redirect_middleware(request: Request, call_next):
    path = request.url.path
    # Only intercept paths starting with /api/ but not /api/v1/
    if path.startswith("/api/") and not path.startswith("/api/v1/"):
        query = request.url.query
        url = f"/api/v1/{path.removeprefix('/api/')}"
        if query:
            url += f"?{query}"
        return RedirectResponse(url=url)
    return await call_next(request)

# ── Rate Limiting (in-memory fixed window) ──────────────────────────────────
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

_rate_limits: dict[str, tuple[float, int]] = {}

MAX_CONTENT_LENGTH = 1_048_576  # 1 MB default for request bodies

class RequestBodySizeMiddleware(BaseHTTPMiddleware):
    """Reject requests with body content exceeding MAX_CONTENT_LENGTH.

    Handles both Content-Length headers and chunked transfer encoding.
    """
    async def dispatch(self, request: StarletteRequest, call_next):
        if request.method in ("POST", "PUT", "PATCH"):
            content_length = request.headers.get("content-length")
            if content_length:
                if int(content_length) > MAX_CONTENT_LENGTH:
                    return Response(
                        content='{"detail":"Request body too large"}',
                        status_code=413,
                        media_type="application/json",
                    )
            else:
                # Chunked transfer encoding — read up to limit + 1 to detect overflow
                body = await request.body()
                if len(body) > MAX_CONTENT_LENGTH:
                    return Response(
                        content='{"detail":"Request body too large"}',
                        status_code=413,
                        media_type="application/json",
                    )
        return await call_next(request)

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        path = request.url.path
        limit = RATE_SEARCH_LIMIT if "/api/v1/search" in path or "/api/v1/image-proxy" in path else RATE_DEFAULT_LIMIT
        window_start, count = _rate_limits.get(ip, (0, 0))
        if now - window_start > RATE_WINDOW:
            window_start = now
            count = 0
        if count >= limit:
            return Response(
                content='{"detail":"Too many requests"}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(int(RATE_WINDOW - (now - window_start)))},
            )
        _rate_limits[ip] = (window_start, count + 1)
        return await call_next(request)

app.add_middleware(RequestBodySizeMiddleware)
app.add_middleware(RateLimitMiddleware)

# ── Security Headers (CSP, HSTS, XFO, XCTO, Referrer-Policy) ──────────────

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses.

    - Content-Security-Policy: restrict script/style sources, disallow plugins
    - Strict-Transport-Security: force HTTPS (production only)
    - X-Content-Type-Options: prevent MIME sniffing
    - X-Frame-Options: prevent clickjacking
    - Referrer-Policy: limit referrer leakage
    """

    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # CSP — allow inline styles/scripts (React hydration), self for assets,
        # blob/data for media streams (HLS/mpegts), TMDB for poster images.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https://image.tmdb.org https://*.tmdb.org http://photo-tmdb.com https://photo-tmdb.com; "
            "media-src 'self' blob: data: https: http:; "
            "font-src 'self' data:; "
            "connect-src 'self' https: http:; "
            "frame-src 'none'; "
            "object-src 'none'; "
            "base-uri 'self'"
        )
        # HSTS — only in production (ADMIN_API_KEY set is a reasonable proxy)
        if os.getenv("ADMIN_API_KEY"):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ── Cache Warming ───────────────────────────────────────────────────────────
# warm_cache() moved to routes/cache_warmer.py -- admin.py and routes import
# from there directly, eliminating circular import of main.py.
from routes.cache_warmer import is_warm_running, start_cache_warmer, warm_cache

# ── Disk Cache (for VOD MP4, HLS, DASH — persistent across restarts) ────
from config import CACHE_DIR
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ── Cache TTL / Auto-cleanup ────────────────────────────────────────────────
CLEANUP_TTL_HOURS = 2  # Delete stale cache entries older than this (env: CACHE_TTL_HOURS for backward compat)
CLEANUP_INTERVAL = 600
_cleanup_task: Optional[asyncio.Task] = None


def touch_access(cache_key: str):
    stamp_path = CACHE_DIR / f".{cache_key}.accessed"
    stamp_path.write_text(str(time.time()))


def get_last_access(cache_key: str) -> Optional[float]:
    stamp_path = CACHE_DIR / f".{cache_key}.accessed"
    try:
        return float(stamp_path.read_text().strip())
    except (FileNotFoundError, ValueError, PermissionError):
        return None


async def cleanup_stale_cache():
    """Delete cache entries not accessed in CACHE_TTL_HOURS."""
    cutoff = time.time() - (CLEANUP_TTL_HOURS * 3600)
    deleted_total = 0
    for entry in list(CACHE_DIR.iterdir()):
        if entry.name.startswith("."):
            continue
        cache_key = entry.stem
        last = get_last_access(cache_key)
        if last is None:
            if entry.is_dir():
                touch_access(cache_key)
            continue
        if last < cutoff:
            log.info(f"[CLEANUP] Removing stale: {cache_key} (last access {time.time() - last:.0f}s ago)")
            try:
                if entry.is_dir():
                    import shutil
                    shutil.rmtree(entry)
                else:
                    entry.unlink()
                stamp = CACHE_DIR / f".{cache_key}.accessed"
                if stamp.exists():
                    stamp.unlink()
                deleted_total += 1
            except OSError as e:
                log.warning(f"[CLEANUP] Failed to remove {cache_key}: {e}")
    if deleted_total:
        log.info(f"[CLEANUP] Removed {deleted_total} stale entries")


async def cleanup_loop():
    """Periodic background task that runs cleanup."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        try:
            await cleanup_stale_cache()
        except Exception as e:
            # Background loop guard: cleanup_stale_cache() may raise OSError (file ops),
            # ValueError (malformed timestamps), KeyError (corrupt index), etc.
            # Must never crash the loop — catch all expected + unexpected exceptions.
            # Uses `except Exception`, not bare `except`, so asyncio.CancelledError
            # (subclass of BaseException) propagates for clean shutdown.
            log.error(f"[CLEANUP] Error: {e}")


def start_cleanup_task():
    """Start the periodic cleanup background task."""
    global _cleanup_task
    if _cleanup_task is None or _cleanup_task.done():
        _cleanup_task = asyncio.create_task(cleanup_loop())
        log.info(f"[CLEANUP] Started — TTL={CLEANUP_TTL_HOURS}h, interval={CLEANUP_INTERVAL}s")

# ─── Static file mount (after all routes are registered) ───────────────────

# Serve the built frontend at /
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
