"""Pytest configuration for Spacetime-TV backend tests.

Sets environment variables BEFORE importing the app module so that
os.getenv() calls in main.py pick up test values instead of production .env.

Overrides lifespan to skip background tasks (cache warmer, cleanup).
Provides a TestClient fixture with mocked upstream IPTV provider calls.
"""

import os
import sys
from pathlib import Path

# ── Test environment ───────────────────────────────────────────
# These must be set BEFORE importing main.py so os.getenv sees them
os.environ.setdefault("IPTV_BASE", "http://test-iptv.live")
os.environ.setdefault("IPTV_USER", "test_user")
os.environ.setdefault("IPTV_PASS", "test_pass")
os.environ.setdefault("CACHE_WARM_ENABLED", "false")
os.environ.setdefault("CACHE_WARM_CATEGORIES", "")
os.environ.setdefault("CLEANUP_INTERVAL", "3600")
os.environ.setdefault("CACHE_TTL_HOURS", "0")
os.environ.setdefault("ADMIN_API_KEY", "")  # Dev mode — no auth required in tests

# Add server dir to Python path so `from main import ...` works
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from unittest.mock import AsyncMock
import pytest
from fastapi.testclient import TestClient

# ══════════════════════════════════════════════════════════════════════════
# Test configuration and fixtures
# ══════════════════════════════════════════════════════════════════════════

from unittest.mock import AsyncMock, patch as _cached_fetch_patch

# Import main AFTER env vars are set
from main import app, _cache

# ── Lifespan override ──────────────────────────────────────────
# Prevent background tasks (cache warmer, cleanup) from running during tests.
from contextlib import asynccontextmanager


@asynccontextmanager
async def noop_lifespan(_app):
    yield


app.router.lifespan_context = noop_lifespan


# ── Fixtures ───────────────────────────────────────────────────
@pytest.fixture(autouse=True)
def clear_cache():
    """Clear all caches before each test so state doesn't leak."""
    _cache.clear()
    # Also clear the module-level probe caches
    import main as m
    # _probe_cache moved to routes/stream.py during P1.1 Phase 3 extraction
    from routes.stream import _probe_cache as stream_probe_cache
    stream_probe_cache.clear()
    from state import epg_cache, _progress_store
    epg_cache["data"] = None
    epg_cache["fetched"] = 0
    # Clear progress store
    _progress_store.clear()
    # Clear rate limiter state — otherwise test ordering can cause 429s
    # on image-proxy tests that run later in the suite
    from main import _rate_limits
    _rate_limits.clear()
    # Clear search query log so admin stats test doesn't leak
    from state import _search_queries
    _search_queries.clear()
    yield


@pytest.fixture
def client():
    """App TestClient — upstream IPTV calls are mocked to return empty data.
    
    Patches cached_fetch in iptv_client so ALL route modules see the mock.
    """
    async def mock_cached_fetch(key, action, **params):
        """Default stub: return empty list for any upstream call.
        Respects pre-populated cache so cache-hit tests still work.
        """
        from state import _cache, CACHE_TTL
        import time
        now = time.time()
        if key in _cache and (now - _cache[key][0]) < CACHE_TTL:
            return _cache[key][1]
        return []

    # Patch all route modules that import cached_fetch from iptv_client
    routes = ["live", "vod", "search", "guide"]
    patchers = []
    for r in routes:
        p = _cached_fetch_patch(f"routes.{r}.cached_fetch", mock_cached_fetch)
        p.start()
        patchers.append(p)
    # Also patch in iptv_client itself (for main.py cache warmer etc.)
    p = _cached_fetch_patch("iptv_client.cached_fetch", mock_cached_fetch)
    p.start()
    patchers.append(p)

    with TestClient(app) as c:
        yield c

    for p in patchers:
        p.stop()


@pytest.fixture
def client_with_cache():
    """App TestClient with real cached_fetch — for tests that pre-populate _cache."""
    with TestClient(app) as c:
        yield c
