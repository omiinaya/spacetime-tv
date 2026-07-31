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

# Wipe persistent state files to prevent cross-session contamination
_state_dir = Path(__file__).resolve().parent.parent / "server" / "data"
_hits_file = _state_dir / "stream_hits.json"
if _hits_file.exists():
    _hits_file.unlink()

# Ensure static assets directory exists before importing main
_static_dir = Path(__file__).resolve().parent.parent.parent / "web" / "dist" / "assets"
_static_dir.mkdir(parents=True, exist_ok=True)

# Add server dir to Python path so `from main import ...` works
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import contextlib
from unittest.mock import AsyncMock
from unittest.mock import patch as _cached_fetch_patch

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
def _no_real_subprocesses():
    """Never spawn real subprocesses during tests.

    Streaming/conversion routes spawn curl/ffmpeg via
    ``asyncio.create_subprocess_exec`` (transcode pipes, HLS segmenter,
    MP4 conversion, media probing). A real spawn during a test creates a
    BaseSubprocessTransport bound to the TestClient's event loop; when the
    loop closes before GC collects the transport, pytest raises a flaky
    ``PytestUnraisableExceptionWarning: Event loop is closed`` — and, when
    GC timing is unlucky, a full INTERNALERROR that aborts the session
    mid-run. Route tests that need specific subprocess behavior mock
    ``asyncio.create_subprocess_exec`` themselves (inner patch wins).
    """
    mock_proc = AsyncMock()
    mock_proc.returncode = 1  # fast-fail: routes treat nonzero as failure
    mock_proc.communicate.return_value = (b"", b"mocked subprocess failure")
    # Closed-stream shape: `while proc.stdout:` / `while proc.stderr:`
    # loops exit immediately instead of awaiting MagicMock attributes.
    mock_proc.stdout = None
    mock_proc.stderr = None
    with _cached_fetch_patch("asyncio.create_subprocess_exec", return_value=mock_proc):
        yield


@pytest.fixture(autouse=True)
async def reset_shared_state():
    """Clear all shared mutable state between tests so ordering doesn't matter."""
    # Clear main cache so tests don't leak cached data between each other
    # (e.g. test_live_all_with_cache sets _cache["live_all"] which would
    #  otherwise contaminate test_live_info_empty_when_cache_empty)
    from state import _progress_store, epg_cache

    _cache.clear()
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
    from iptv_client import _provider_clients
    from iptv_client import client as _global_client

    for _k, c in list(_provider_clients.items()):
        with contextlib.suppress(Exception):
            await c.aclose()
    _provider_clients.clear()
    try:
        if _global_client and not _global_client.is_closed:
            await _global_client.aclose()
    except Exception:
        pass
    # Clear stream hit counters
    from state import _stream_hits

    _stream_hits.clear()
    # Also wipe stream_hits.json on disk to prevent stale loads
    from config import DATA_DIR

    _hits_file = DATA_DIR / "stream_hits.json"
    if _hits_file.exists():
        _hits_file.unlink()
    # Clear probe cache to prevent test ordering leaks
    from routes.stream_core import _probe_cache

    _probe_cache.clear()
    # Clear guide/EPG caches — tests in test_state.py modify these
    from state import _guide_cache as _guide_cache_ref
    from state import epg_cache as _epg_cache_ref

    _epg_cache_ref["data"] = None
    _epg_cache_ref["fetched"] = 0
    _guide_cache_ref.clear()
    _guide_cache_ref.update({"channel_groups": None, "total_channels": 0, "built_at": 0})
    # Reassign module-level vars that can't be modified in-place via import
    import state as _state_mod

    _state_mod._epg_clients.clear()
    _state_mod._error_log.clear()
    _state_mod._warm_task = None
    _state_mod._epg_refresh_task = None
    yield


@pytest.fixture
def client():
    """App TestClient — upstream IPTV calls are mocked to return empty data.

    Patches cached_fetch in iptv_client so ALL route modules see the mock.
    """

    async def mock_cached_fetch(key, action, **params):
        """Mock cached_fetch that:
        - Returns fresh cache data if available
        - Returns stale cache data as fallback (upstream always fails in tests)
        - Returns [] on cache miss (upstream unavailable)
        """
        import time

        from state import CACHE_TTL

        now = time.time()
        if key in _cache:
            ts, cached_data = _cache[key]
            if (now - ts) < CACHE_TTL:
                return cached_data  # fresh hit
            return cached_data  # stale fallback (upstream unavailable in tests)
        return []

    # Patch all route modules that import cached_fetch from iptv_client
    routes = ["live", "vod", "search", "guide", "guide_epg", "guide_routes"]
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
    """App TestClient with cached_fetch that respects pre-populated cache but prevents upstream calls."""

    async def mock_cached_fetch(key, action, **params):
        import time

        from state import CACHE_TTL

        now = time.time()
        if key in _cache:
            ts, cached_data = _cache[key]
            if (now - ts) < CACHE_TTL:
                return cached_data
            return cached_data  # stale fallback
        return []

    # Patch all route modules that import cached_fetch from iptv_client
    routes = ["live", "vod", "search", "guide", "guide_epg", "guide_routes"]
    patchers = []
    for r in routes:
        p = _cached_fetch_patch(f"routes.{r}.cached_fetch", mock_cached_fetch)
        p.start()
        patchers.append(p)
    p = _cached_fetch_patch("iptv_client.cached_fetch", mock_cached_fetch)
    p.start()
    patchers.append(p)

    with TestClient(app) as c:
        c.headers.setdefault("X-Admin-Key", "test-admin-key-insecure")
        yield c

    for p in patchers:
        p.stop()
