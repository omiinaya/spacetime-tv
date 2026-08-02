"""Spacetime-TV Backend — IPTV proxy + EPG parser."""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("spacetime-tv")

# ── Config (imported from config.py to avoid duplication) ─────────────────
from config import (
    CORS_ORIGINS,
    ENFORCE_HTTPS,
    RATE_DEFAULT_LIMIT,
    RATE_SEARCH_LIMIT,
    RATE_WINDOW,
    STATIC_DIR,
)
from state import _load_stream_hits  # re-exported for tests


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_stream_hits()
    from config import _AUTO_GEN_KEY, ADMIN_API_KEY

    if _AUTO_GEN_KEY:
        log.info(f"🔑 Admin API key auto-generated: {ADMIN_API_KEY}")
        log.info("   Set ADMIN_API_KEY in server/.env to use a fixed key")
    start_cleanup_task()
    # ── Ensure default profile on startup ────────────────────────────
    try:
        from auth import ensure_default_profile

        result = ensure_default_profile()
        if result:
            log.info(f"[PROFILES] Created default profile: {result['name']} ({result['profile_id']})")
        else:
            log.debug("[PROFILES] Profiles exist, no default needed")
    except Exception as e:
        log.warning(f"[PROFILES] Could not ensure default profile: {e}")
    start_cache_warmer()
    task = asyncio.create_task(_epg_broadcast_loop())

    def _on_epg_task_done(t: asyncio.Task):
        if t.cancelled():
            return
        exc = t.exception()
        if exc is not None:
            # _epg_broadcast_loop catches Exception internally, but a
            # BaseException (CancelledError, KeyboardInterrupt) or a re-raise
            # still lands here — log it so an unexpected death is visible
            # rather than a silent 'Task exception was never retrieved'.
            log.error(f"[EPG-SSE] Broadcast task died unexpectedly: {exc}")

    task.add_done_callback(_on_epg_task_done)
    yield


app = FastAPI(title="Spacetime-TV", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    # Expose correlation + throttling headers so cross-origin clients (dev
    # frontend on :5183, LAN host) can read them just like same-origin ones.
    expose_headers=["X-Request-ID", "Retry-After", "X-RateLimit-Remaining"],
)

# hermes-id agent authentication (env: HERMES_AUTH_SERVER_URL / HERMES_AUTH_PROJECT / HERMES_AUTH_VERIFY)
from hermes_id.fastapi_plugin import install_agent_auth

install_agent_auth(app)
# GZip compression for API responses — JSON payloads compress 5-10x
from fastapi.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── Route modules ─────────────────────────────────────────────────────────
from routes.admin import router as admin_router
from routes.cloud_sync import router as cloud_sync_router
from routes.guide import _epg_broadcast_loop
from routes.guide import router as guide_router
from routes.health import router as health_router
from routes.live import router as live_router
from routes.media import router as media_router
from routes.misc import router as misc_router
from routes.profiles import router as profiles_router
from routes.record import router as record_router
from routes.search import router as search_router
from routes.stream import router as stream_router
from routes.tmdb import router as tmdb_router
from routes.vod import router as vod_router
from routes.watchlist import router as watchlist_router

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
app.include_router(profiles_router, prefix="/api/v1")
app.include_router(misc_router)


# ── Cache-control middleware: never let browsers hold stale builds ──────
# index.html (the SPA shell) is served WITHOUT a versioned URL, so browsers
# must revalidate it on every load (no-cache). Hashed /assets/* files are
# content-addressed and safe to cache aggressively (immutable).
@app.middleware("http")
async def cache_control_middleware(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/assets/"):
        response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
    elif path == "/" or path.endswith(".html"):
        response.headers.setdefault("Cache-Control", "no-cache, no-store, must-revalidate")
    return response


# ── Auth middleware: enforce X-Device-Token or X-Admin-Key ───────
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """Check auth for all /api/ endpoints except health/error.

    Verifies X-Admin-Key or X-Device-Token. Device tokens are verified
    against stored SHA-256 hashes (same pattern as cloud_sync).
    """
    path = request.url.path

    # CORS preflight: pass OPTIONS through to CORSMiddleware (which is mounted
    # INNER to this middleware). Browsers never send auth headers on preflight,
    # so authing it here returns 401 with no Access-Control-Allow-Origin and
    # the browser blocks the real request. This was a real bug: external-origin
    # clients got 401 on OPTIONS instead of the CORS 200 + ACAO response.
    if request.method == "OPTIONS":
        return await call_next(request)

    # Dev/bypass: allow all localhost and internal network requests.
    # Gated by ALLOW_LAN_BYPASS — set to "false" in .env for hardened
    # deployments where every request (including LAN) must authenticate.
    from config import ALLOW_LAN_BYPASS

    client_host = request.client.host if request.client else ""
    if ALLOW_LAN_BYPASS and (
        client_host in ("127.0.0.1", "::1", "localhost", "192.0.2.10") or client_host.startswith("192.168.")
    ):
        return await call_next(request)

    # Allow health, error reporting, and non-API paths
    if (
        path in ("/api/health", "/api/error")
        or path.startswith("/api/health")
        or path.startswith("/api/v1/cloud/backup")
        or path.startswith("/api/v1/profiles")
    ):
        return await call_next(request)
    if not path.startswith("/api/"):
        return await call_next(request)
    # Check admin key first (fast path)
    admin_key = request.headers.get("X-Admin-Key", "")
    from config import ADMIN_API_KEY

    if admin_key and admin_key == ADMIN_API_KEY:
        return await call_next(request)
    # Check device token
    device_token = request.headers.get("X-Device-Token", "")
    if device_token and len(device_token) >= 8:
        # Extract device_id from path or query params (typically /api/v1/cloud/backup/{device_id})
        # For generic endpoints, verify token exists in any known backup
        from auth import verify_device_token_generic

        if verify_device_token_generic(device_token):
            return await call_next(request)
        # Device token provided but invalid — 403
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=403,
            content={"detail": "Invalid device token."},
        )
    # Auth credential provided but wrong — 403
    if admin_key or device_token:
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=403,
            content={"detail": "Invalid authentication credentials."},
        )
    # No auth provided at all — 401
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=401,
        content={"detail": "Authentication required. Provide X-Admin-Key or X-Device-Token header."},
    )


# ── HTTPS redirect middleware (when ENFORCE_HTTPS=true) ──────────
@app.middleware("http")
async def https_redirect_middleware(request: Request, call_next):
    """Redirect HTTP to HTTPS when ENFORCE_HTTPS is enabled.
    Uses X-Forwarded-Proto header (set by nginx proxy) to detect original scheme,
    because behind proxy the backend sees HTTP internally.
    If no X-Forwarded-Proto, assume direct internal connection (no redirect).
    """
    from config import ENFORCE_HTTPS

    if ENFORCE_HTTPS:
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "")
        if forwarded_proto:
            if forwarded_proto == "http":
                from fastapi.responses import RedirectResponse

                url = request.url.replace(scheme="https", port=443)
                return RedirectResponse(url, status_code=301)
        elif request.url.scheme == "http":
            from fastapi.responses import RedirectResponse

            url = request.url.replace(scheme="https", port=443)
            return RedirectResponse(url, status_code=301)
    return await call_next(request)


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
_rate_limits_last_cleanup: float = 0.0

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
        now = time.time()
        path = request.url.path
        # Key by device token when available, fallback to IP
        # This ensures shared-NAT users with different device tokens
        # each have their own rate-limit bucket.
        device_token = request.headers.get("X-Device-Token", "")
        if device_token:
            key = device_token
        else:
            key = request.client.host if request.client else "unknown"
        limit = RATE_SEARCH_LIMIT if "/api/v1/search" in path or "/api/v1/image-proxy" in path else RATE_DEFAULT_LIMIT
        window_start, count = _rate_limits.get(key, (0, 0))
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
        _rate_limits[key] = (window_start, count + 1)
        # Opportunistic eviction: every unique device-token / IP ever seen
        # would otherwise live in _rate_limits forever (unbounded memory on a
        # long-running server). Sweep at most once per window, dropping any
        # bucket whose window has already lapsed — a re-request simply
        # re-creates it from (now, 0), so eviction is lossless.
        global _rate_limits_last_cleanup
        if now - _rate_limits_last_cleanup > RATE_WINDOW:
            _rate_limits_last_cleanup = now
            stale = [k for k, (ws, _) in _rate_limits.items() if now - ws > RATE_WINDOW]
            for k in stale:
                del _rate_limits[k]
        response = await call_next(request)
        # Quota visibility: clients (incl. cross-origin via CORS expose_headers)
        # can read how many requests remain in this window instead of guessing.
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - (count + 1)))
        return response


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
    - Permissions-Policy: deny camera/mic/geolocation/etc. (IPTV app needs none)
    """

    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Permissions-Policy — this app uses none of the sensitive browser
        # capabilities; deny them all so a compromised asset or XSS cannot
        # drift into camera/mic/geolocation/USB. Mirrors web/nginx.conf.
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), interest-cohort=(), "
            "browsing-topics=(), usb=(), bluetooth=(), serial=()"
        )
        # CSP — no inline scripts (SW registration moved to the bundle) and no
        # eval: mpegts.js's global-this polyfill (new Function("return this"))
        # catches the CSP violation and falls back to window, so the player
        # works without unsafe-eval. Verify at runtime: console must show no
        # CSP violations when playing live TV. hls.js/shaka do not eval.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
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
        if os.getenv("ADMIN_API_KEY") or ENFORCE_HTTPS:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# ── Request-ID tracking: correlate logs/errors across the pipeline ──────
# (SECURITY_AUDIT finding 13.) Accepts a caller-supplied X-Request-ID, else
# generates a UUID, echoes it back on the response and attaches it to the
# access-log line so a failing span can be traced end-to-end.
import uuid as _uuid


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        rid = request.headers.get("X-Request-ID") or _uuid.uuid4().hex
        log.info(
            "REQ rid=%s %s %s",
            rid,
            request.method,
            request.url.path,
        )
        response = await call_next(request)
        response.headers.setdefault("X-Request-ID", rid)
        request.state.request_id = rid
        return response


app.add_middleware(RequestIdMiddleware)

# ── Cache Warming ───────────────────────────────────────────────────────────
# warm_cache() moved to routes/cache_warmer.py -- admin.py and routes import
# from there directly, eliminating circular import of main.py.
# ── Disk Cache (for VOD MP4, HLS, DASH — persistent across restarts) ────
from config import CACHE_DIR
from routes.cache_warmer import (  # noqa: F401 — re-exported for tests
    CACHE_WARM_CATEGORIES,
    CACHE_WARM_ENABLED,
    start_cache_warmer,
)

CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ── Cache TTL / Auto-cleanup ────────────────────────────────────────────────
# NOTE: hardcoded — the CACHE_TTL_HOURS / CLEANUP_INTERVAL env vars are only
# honored in tests (conftest sets sentinels). Wiring them here would change
# runtime behavior; kept constant deliberately until a config review.
CLEANUP_TTL_HOURS = 2
CLEANUP_INTERVAL = 600
_cleanup_task: asyncio.Task | None = None


def touch_access(cache_key: str):
    stamp_path = CACHE_DIR / f".{cache_key}.accessed"
    stamp_path.write_text(str(time.time()))


def get_last_access(cache_key: str) -> float | None:
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
        except (OSError, ValueError, KeyError) as e:
            # Background loop guard: cleanup_stale_cache() may raise OSError (file ops),
            # ValueError (malformed timestamps), KeyError (corrupt index), etc.
            # Must never crash the loop — catch specific expected exceptions.
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
