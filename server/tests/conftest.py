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

# Add server dir to Python path so `from main import ...` works
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from unittest.mock import AsyncMock
import pytest
from fastapi.testclient import TestClient

# Import AFTER env vars are set
from main import app, _cache, cached_fetch

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
    yield


@pytest.fixture
def client():
    """App TestClient — upstream IPTV calls are mocked to return empty data."""
    original = cached_fetch

    async def mock_cached_fetch(key, action, **params):
        """Default stub: return empty list for any upstream call."""
        return []

    import main as m
    m.cached_fetch = mock_cached_fetch

    with TestClient(app) as c:
        yield c

    m.cached_fetch = original


@pytest.fixture
def client_with_cache():
    """App TestClient with cached_fetch restored — for tests that pre-populate _cache."""
    with TestClient(app) as c:
        yield c
