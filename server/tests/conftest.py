"""
conftest.py — test configuration for spacetime-tv backend.

Sets test environment variables before importing main module so that
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
os.environ.setdefault("ENFORCE_HTTPS", "false")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key-insecure")
os.environ.setdefault("ENCRYPT_CREDENTIALS", "false")
os.environ.setdefault("TMDB_API_KEY", "test-tmdb-key")
os.environ.setdefault("TMDB_BASE", "https://api.themoviedb.org/3")
os.environ.setdefault("ENCRYPT_CREDENTIALS", "false")
os.environ.setdefault("TMDB_API_KEY", "test-tmdb-key")
os.environ.setdefault("TMDB_BASE", "https://api.themoviedb.org/3")
os.environ.setdefault("TMDB_API_KEY", "test-tmdb-key")
os.environ.setdefault("TMDB_BASE", "https://api.themoviedb.org/3")

# Add server dir to Python path so `from main import ...` works
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from unittest.mock import AsyncMock, patch as _cached_fetch_patch
import asyncio
import asyncio
import pytest
from fastapi.testclient import TestClient

# ══════════════════════════════════════════════════════════════════════════
# Test configuration and fixtures
# ══════════════════════════════════════════════════════════════════════════

# Import main AFTER env vars are set
from main import app
from state import _cache

# ── Lifespan override ──────────────────────────────────────────
# Override the lifespan context manager to skip background tasks
# (cache warmer, cleanup) that would otherwise use an unpatched iptv_client.
@pytest.fixture(autouse=True)
def override_lifespan():
    """Replace app.lifespan_context with a no-op to prevent background tasks."""
    import contextlib
    app.lifespan_context = contextlib.nullcontext
    yield


@pytest.fixture(autouse=True)
def reset_shared_state():
    """Clear all shared mutable state between tests so ordering doesn't matter."""
    # Clear EPG cache
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
    from state import _search_queries, _stream_hits
    _search_queries.clear()
    _stream_hits.clear()
    # Clear provider HTTP clients to avoid stale loop references
    from iptv_client import _provider_clients, client as _global_client
    for k, c in list(_provider_clients.items()):
        import asyncio
        try:
            c.aclose()
        except Exception:
            pass
    _provider_clients.clear()
    try:
        import asyncio
        if _global_client and not _global_client.is_closed:
            _global_client.aclose()
    except Exception:
        pass
    # Clear stream hit counters
    from state import _stream_hits
    _stream_hits.clear()
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
    routes = ["live", "vod", "search", "guide", "stream_core", "stream_probe", "guide_epg", "cache_warmer"]
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
        # Auth is always enforced (admin key always set in tests)
        c.headers.setdefault("X-Admin-Key", "test-admin-key-insecure")
        yield c

    for p in patchers:
        p.stop()


@pytest.fixture
def client_with_cache():
    """App TestClient with real cached_fetch — for tests that pre-populate _cache."""
    with TestClient(app) as c:
        c.headers.setdefault("X-Admin-Key", "test-admin-key-insecure")
        yield c
