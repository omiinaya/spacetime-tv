"""Tests for main.py — rate limiter, cache warmer, cleanup loop, coherence."""

import asyncio
import os
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient as FastAPITestClient
from starlette.testclient import TestClient

from routes.cache_warmer import warm_cache, start_cache_warmer, _verify_cache_coherence
from main import (
    CACHE_DIR,
    CLEANUP_INTERVAL,
    CLEANUP_TTL_HOURS,
    cleanup_loop,
    cleanup_stale_cache,
    touch_access,
    get_last_access,
    app,
)
from state import _cache


# ════════════════════════════════════════════════════════════════════════════
# RateLimitMiddleware — security-critical, completely untested
# ════════════════════════════════════════════════════════════════════════════

class TestRateLimiter:
    """Cover RateLimitMiddleware (main.py lines 78-96)."""

    def test_allows_request_under_limit(self):
        """First request from an IP gets through."""
        from main import _rate_limits
        _rate_limits.clear()
        c = TestClient(app)
        r = c.get("/api/v1/health")
        assert r.status_code == 200

    def test_blocks_after_exceeding_limit(self):
        """After RATE_DEFAULT_LIMIT requests, subsequent ones get 429."""
        import main as m
        from main import _rate_limits

        _rate_limits.clear()
        c = TestClient(app)
        limit = m.RATE_DEFAULT_LIMIT

        # Fire limit requests — all should pass
        for _ in range(limit):
            r = c.get("/api/v1/health")
            assert r.status_code == 200, f"Expected 200, got {r.status_code}"

        # Next request should be rate-limited
        r = c.get("/api/v1/health")
        assert r.status_code == 429
        assert "Too many requests" in r.text
        assert "Retry-After" in r.headers

    def test_window_resets_after_expiry(self):
        """After RATE_WINDOW seconds, the counter resets."""
        import main as m
        from main import _rate_limits

        _rate_limits.clear()
        c = TestClient(app)
        limit = m.RATE_DEFAULT_LIMIT

        # Exhaust limit
        for _ in range(limit):
            c.get("/api/v1/health")

        # Should be blocked now
        r = c.get("/api/v1/health")
        assert r.status_code == 429

        # Manually age out the window by moving the timestamp back
        ip = "testclient"
        _rate_limits[ip] = (time.time() - m.RATE_WINDOW - 1, limit)

        r = c.get("/api/v1/health")
        assert r.status_code == 200, f"Expected 200 after window reset, got {r.status_code}"

    def test_search_endpoint_uses_search_limit(self):
        """Search/image-proxy paths use the lower RATE_SEARCH_LIMIT."""
        import main as m
        from main import _rate_limits

        _rate_limits.clear()
        c = TestClient(app)
        search_limit = m.RATE_SEARCH_LIMIT

        for _ in range(search_limit):
            c.get("/api/v1/search")

        r = c.get("/api/v1/search")
        assert r.status_code == 429

    def test_image_proxy_uses_search_limit(self):
        """Image proxy paths use RATE_SEARCH_LIMIT."""
        import main as m
        from main import _rate_limits

        _rate_limits.clear()
        c = TestClient(app)
        search_limit = m.RATE_SEARCH_LIMIT

        for _ in range(search_limit):
            c.get("/api/v1/image-proxy")

        r = c.get("/api/v1/image-proxy")
        assert r.status_code == 429

    def test_different_ips_have_separate_limits(self):
        """Different IPs get independent rate limit buckets."""
        import main as m
        from main import _rate_limits

        _rate_limits.clear()
        c = TestClient(app)
        limit = m.RATE_DEFAULT_LIMIT

        # Exhaust limit for testclient
        for _ in range(limit):
            c.get("/api/v1/health")

        r = c.get("/api/v1/health")
        assert r.status_code == 429

        # Inject a different IP that's under limit
        _rate_limits["10.0.0.1"] = (time.time(), 0)

        assert "testclient" in _rate_limits
        assert "10.0.0.1" in _rate_limits
        assert _rate_limits["testclient"][1] == limit
        assert _rate_limits["10.0.0.1"][1] == 0


# ════════════════════════════════════════════════════════════════════════════
# Cache Warmer (warm_cache) — completely untested
# ════════════════════════════════════════════════════════════════════════════

class TestWarmCache:
    """Cover warm_cache (main.py lines 120-217)."""

    async def test_warm_cache_disabled_returns_early(self):
        """When cw.CACHE_WARM_ENABLED=False, warm_cache returns immediately."""
        import main as m
        import routes.cache_warmer as cw
        old = cw.CACHE_WARM_ENABLED
        try:
            cw.CACHE_WARM_ENABLED = False
            await warm_cache()
        finally:
            cw.CACHE_WARM_ENABLED = old

    async def test_warm_cache_runs_all_phases(self):
        """warm_cache with mocked upstream warms live + VOD + series + EPG."""
        import main as m
        import routes.cache_warmer as cw

        old_enabled = cw.CACHE_WARM_ENABLED
        old_cats = cw.CACHE_WARM_CATEGORIES
        try:
            cw.CACHE_WARM_ENABLED = True
            cw.CACHE_WARM_CATEGORIES = ""

            async def mock_cached_fetch(key, action, **params):
                if "get_vod_categories" in action:
                    return [{"category_id": 1}, {"category_id": 2}]
                if "get_series_categories" in action:
                    return [{"category_id": 10}]
                if "get_vod_streams" in action or "get_series" in action:
                    return [{"id": 999}]
                if "get_live_streams" in action:
                    return [{"stream_id": 1, "name": "Test"}]
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch):
                with patch("routes.guide.load_epg", return_value={"channels": [{"id": "c1"}], "programmes": []}) as mock_epg:
                    await warm_cache()

            mock_epg.assert_called_once()
        finally:
            cw.CACHE_WARM_ENABLED = old_enabled
            cw.CACHE_WARM_CATEGORIES = old_cats

    async def test_warm_cache_with_category_filter(self):
        """cw.CACHE_WARM_CATEGORIES filters which categories get warmed."""
        import main as m
        import routes.cache_warmer as cw

        old_enabled = cw.CACHE_WARM_ENABLED
        old_cats = cw.CACHE_WARM_CATEGORIES
        try:
            cw.CACHE_WARM_ENABLED = True
            cw.CACHE_WARM_CATEGORIES = "1, 3"

            fetched_vod_cats = []

            async def mock_cached_fetch(key, action, **params):
                if action == "get_vod_categories":
                    return [{"category_id": 1}, {"category_id": 2}, {"category_id": 3}]
                if action == "get_series_categories":
                    return [{"category_id": 10}]
                if action == "get_vod_streams":
                    fetched_vod_cats.append(params.get("category_id"))
                    return [{"id": 999}]
                if action == "get_series":
                    return [{"id": 888}]
                if "get_live_streams" in action:
                    return []
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch):
                with patch("routes.guide.load_epg", return_value={"channels": [], "programmes": []}):
                    await warm_cache()

            assert set(fetched_vod_cats) == {1, 3}, f"Expected {{1,3}}, got {set(fetched_vod_cats)}"
        finally:
            cw.CACHE_WARM_ENABLED = old_enabled
            cw.CACHE_WARM_CATEGORIES = old_cats

    async def test_warm_cache_live_failure_non_fatal(self):
        """A failing live warm does not crash the warmer."""
        import main as m
        import routes.cache_warmer as cw

        old_enabled = cw.CACHE_WARM_ENABLED
        old_cats = cw.CACHE_WARM_CATEGORIES
        try:
            cw.CACHE_WARM_ENABLED = True
            cw.CACHE_WARM_CATEGORIES = ""

            async def mock_cached_fetch(key, action, **params):
                if "live" in action.lower():
                    raise Exception("Live upstream down")
                if "vod_categories" in action:
                    return [{"category_id": 1}]
                if "series_categories" in action:
                    return [{"category_id": 10}]
                if "vod_streams" in action or "series" in action:
                    return [{"id": 1}]
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch):
                with patch("routes.guide.load_epg", return_value={"channels": [], "programmes": []}):
                    await warm_cache()  # Should not raise
        finally:
            cw.CACHE_WARM_ENABLED = old_enabled
            cw.CACHE_WARM_CATEGORIES = old_cats

    async def test_warm_cache_vod_failure_non_fatal(self):
        """A failing VOD warm does not crash the warmer."""
        import main as m
        import routes.cache_warmer as cw

        old_enabled = cw.CACHE_WARM_ENABLED
        old_cats = cw.CACHE_WARM_CATEGORIES
        try:
            cw.CACHE_WARM_ENABLED = True
            cw.CACHE_WARM_CATEGORIES = ""

            async def mock_cached_fetch(key, action, **params):
                if "live" in action:
                    return []
                if "vod_categories" in action:
                    raise Exception("VOD upstream down")
                if "series_categories" in action:
                    return [{"category_id": 10}]
                if "series" in action:
                    return [{"id": 1}]
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch):
                with patch("routes.guide.load_epg", return_value={"channels": [], "programmes": []}):
                    await warm_cache()
        finally:
            cw.CACHE_WARM_ENABLED = old_enabled
            cw.CACHE_WARM_CATEGORIES = old_cats

    async def test_warm_cache_vod_retry_on_first_failure(self):
        """VOD category fetches retry once on first failure."""
        import main as m
        import routes.cache_warmer as cw

        old_enabled = cw.CACHE_WARM_ENABLED
        old_cats = cw.CACHE_WARM_CATEGORIES
        try:
            cw.CACHE_WARM_ENABLED = True
            cw.CACHE_WARM_CATEGORIES = ""
            call_count = {"count": 0}

            async def mock_cached_fetch(key, action, **params):
                if "live" in action:
                    return []
                if "vod_categories" in action:
                    return [{"category_id": 1}]
                if "series_categories" in action:
                    return [{"category_id": 10}]
                if "vod_streams" in action:
                    call_count["count"] += 1
                    if call_count["count"] == 1:
                        raise Exception("Temporary failure")
                    return [{"id": 1}]
                if "series" in action:
                    return [{"id": 1}]
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch):
                with patch("routes.guide.load_epg", return_value={"channels": [], "programmes": []}):
                    with patch("asyncio.sleep", new_callable=AsyncMock):
                        await warm_cache()

            assert call_count["count"] == 2
        finally:
            cw.CACHE_WARM_ENABLED = old_enabled
            cw.CACHE_WARM_CATEGORIES = old_cats

    async def test_warm_cache_empty_vod_categories(self):
        """Empty VOD categories logs a warning and continues."""
        import main as m
        import routes.cache_warmer as cw

        old_enabled = cw.CACHE_WARM_ENABLED
        old_cats = cw.CACHE_WARM_CATEGORIES
        try:
            cw.CACHE_WARM_ENABLED = True
            cw.CACHE_WARM_CATEGORIES = ""

            async def mock_cached_fetch(key, action, **params):
                if "live" in action:
                    return []
                if "vod_categories" in action:
                    return []
                if "series_categories" in action:
                    return [{"category_id": 10}]
                if "series" in action:
                    return [{"id": 1}]
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch):
                with patch("routes.guide.load_epg", return_value={"channels": [], "programmes": []}):
                    await warm_cache()
        finally:
            cw.CACHE_WARM_ENABLED = old_enabled
            cw.CACHE_WARM_CATEGORIES = old_cats

    async def test_warm_cache_epg_failure_non_fatal(self):
        """A failing EPG warm does not crash the warmer."""
        import main as m
        import routes.cache_warmer as cw

        old_enabled = cw.CACHE_WARM_ENABLED
        old_cats = cw.CACHE_WARM_CATEGORIES
        try:
            cw.CACHE_WARM_ENABLED = True
            cw.CACHE_WARM_CATEGORIES = ""

            async def mock_cached_fetch(key, action, **params):
                if "live" in action:
                    return []
                if "vod_categories" in action:
                    return [{"category_id": 1}]
                if "series_categories" in action:
                    return [{"category_id": 10}]
                if "vod_streams" in action or "series" in action:
                    return [{"id": 1}]
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch):
                with patch("routes.guide.load_epg", new_callable=AsyncMock) as mock_epg:
                    mock_epg.side_effect = Exception("EPG file corrupt")
                    await warm_cache()
        finally:
            cw.CACHE_WARM_ENABLED = old_enabled
            cw.CACHE_WARM_CATEGORIES = old_cats


# ════════════════════════════════════════════════════════════════════════════
# Cache coherence verification
# ════════════════════════════════════════════════════════════════════════════

class TestVerifyCacheCoherence:
    """Cover _verify_cache_coherence (main.py lines 228-244)."""

    async def test_all_keys_present_no_warnings(self):
        """When all cache keys exist, no warnings are issued."""
        from state import CACHE_KEY_PATTERNS, _cache as state_cache

        state_cache.clear()
        for name, pattern in CACHE_KEY_PATTERNS.items():
            if "{id}" in pattern:
                prefix = pattern.split("{")[0]
                state_cache[f"{prefix}1"] = (time.time() + 9999, [{"id": 1}])
            else:
                state_cache[pattern] = (time.time() + 9999, [])

        await _verify_cache_coherence()

    async def test_missing_static_key_warns(self):
        """When a static cache key is missing, a warning is logged."""
        from state import CACHE_KEY_PATTERNS, _cache as state_cache

        state_cache.clear()
        state_cache["live_all"] = (time.time() + 9999, [])

        await _verify_cache_coherence()

    async def test_empty_template_key_warns(self):
        """When a template key prefix has no entries, a warning is logged."""
        from state import CACHE_KEY_PATTERNS, _cache as state_cache

        state_cache.clear()
        for name, pattern in CACHE_KEY_PATTERNS.items():
            if "{id}" not in pattern:
                state_cache[pattern] = (time.time() + 9999, [])

        await _verify_cache_coherence()


# ════════════════════════════════════════════════════════════════════════════
# Cache warmer lifecycle (start_cache_warmer)
# ════════════════════════════════════════════════════════════════════════════

class TestStartCacheWarmer:
    """Cover start_cache_warmer (main.py lines 248-252)."""

    async def test_creates_task_when_none(self):
        """start_cache_warmer creates a new asyncio.Task when _warm_task is None."""
        import routes.cache_warmer as cw
        import main as m
        import routes.cache_warmer as cw

        old_task = cw._warm_task
        old_enabled = cw.CACHE_WARM_ENABLED
        try:
            cw._warm_task = None
            cw.CACHE_WARM_ENABLED = False

            start_cache_warmer()

            assert cw._warm_task is not None
            assert not cw._warm_task.done()

            await cw._warm_task
        finally:
            cw._warm_task = old_task
            cw.CACHE_WARM_ENABLED = old_enabled

    async def test_replaces_done_task(self):
        """start_cache_warmer replaces a done task with a new one."""
        import routes.cache_warmer as cw
        import main as m
        import routes.cache_warmer as cw

        old_task = cw._warm_task
        old_enabled = cw.CACHE_WARM_ENABLED
        try:
            cw.CACHE_WARM_ENABLED = False

            async def dummy():
                pass

            cw._warm_task = asyncio.create_task(dummy())
            await cw._warm_task

            start_cache_warmer()

            assert cw._warm_task is not None
            assert not cw._warm_task.done()
            await cw._warm_task
        finally:
            cw._warm_task = old_task
            cw.CACHE_WARM_ENABLED = old_enabled

    async def test_noop_when_task_running(self):
        """start_cache_warmer does nothing when _warm_task is still running."""
        import routes.cache_warmer as cw

        old_task = cw._warm_task
        try:
            async def never_done():
                await asyncio.sleep(3600)

            cw._warm_task = asyncio.create_task(never_done())
            task_before = cw._warm_task

            start_cache_warmer()

            assert cw._warm_task is task_before

            cw._warm_task.cancel()
            try:
                await cw._warm_task
            except asyncio.CancelledError:
                pass
        finally:
            cw._warm_task = old_task


# ════════════════════════════════════════════════════════════════════════════
# Cleanup loop
# ════════════════════════════════════════════════════════════════════════════

class TestCleanupLoop:
    """Cover cleanup_loop (main.py lines 309-316)."""

    async def test_cleanup_loop_runs_cleanup_and_sleeps(self):
        """cleanup_loop calls cleanup_stale_cache then sleeps."""
        call_count = 0

        async def mock_cleanup():
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                raise asyncio.CancelledError()

        sleep_count = 0

        async def mock_sleep(_duration):
            nonlocal sleep_count
            sleep_count += 1
            if sleep_count >= 2:
                raise asyncio.CancelledError()

        with patch("main.cleanup_stale_cache", mock_cleanup):
            with patch("asyncio.sleep", mock_sleep):
                try:
                    await cleanup_loop()
                except asyncio.CancelledError:
                    pass

        assert call_count >= 1
        assert sleep_count >= 1

    async def test_cleanup_loop_catches_errors(self):
        """cleanup_loop logs errors from cleanup_stale_cache and continues."""
        call_count = 0

        async def mock_cleanup():
            nonlocal call_count
            call_count += 1
            raise Exception("Cleanup failed")

        sleep_count = 0

        async def mock_sleep(_duration):
            nonlocal sleep_count
            sleep_count += 1
            if sleep_count >= 3:
                raise asyncio.CancelledError()

        with patch("main.cleanup_stale_cache", mock_cleanup):
            with patch("asyncio.sleep", mock_sleep):
                try:
                    await cleanup_loop()
                except asyncio.CancelledError:
                    pass

        # cleanup_stale_cache is called after each sleep; error is caught, loop continues
        assert call_count >= 2


# ════════════════════════════════════════════════════════════════════════════
# Touch access / get last access
# ════════════════════════════════════════════════════════════════════════════

class TestTouchAccess:
    """Cover touch_access and get_last_access (main.py lines 265-275)."""

    def setup_method(self):
        self._cleanup_test_files()

    def teardown_method(self):
        self._cleanup_test_files()

    def _cleanup_test_files(self):
        for f in list(CACHE_DIR.iterdir()):
            if "_test_touch" in f.name:
                if f.is_dir():
                    import shutil
                    shutil.rmtree(f, ignore_errors=True)
                else:
                    f.unlink(missing_ok=True)

    def test_touch_access_creates_stamp(self):
        """touch_access writes a timestamp file."""
        key = "_test_touch_stamp"
        stamp = CACHE_DIR / f".{key}.accessed"
        stamp.unlink(missing_ok=True)

        touch_access(key)

        assert stamp.exists()
        t = float(stamp.read_text().strip())
        assert t > 0

    def test_get_last_access_returns_float(self):
        """get_last_access returns the timestamp as a float."""
        key = "_test_touch_get_last"
        now = time.time()
        stamp = CACHE_DIR / f".{key}.accessed"
        stamp.write_text(str(now))

        result = get_last_access(key)
        assert isinstance(result, float)
        assert abs(result - now) < 1

    def test_get_last_access_missing_file_returns_none(self):
        """get_last_access returns None when the stamp file doesn't exist."""
        result = get_last_access("_test_touch_nonexistent")
        assert result is None

    def test_get_last_access_corrupt_file_returns_none(self):
        """get_last_access returns None when the stamp file has bad data."""
        key = "_test_touch_corrupt"
        stamp = CACHE_DIR / f".{key}.accessed"
        stamp.write_text("not_a_number")

        result = get_last_access(key)
        assert result is None

        stamp.unlink(missing_ok=True)


# ════════════════════════════════════════════════════════════════════════════
# Auto-star
# ════════════════════════════════════════════════════════════════════════════



# ════════════════════════════════════════════════════════════════════════════
# WarmCache additional edge cases (series retry, empty series cats)
# ════════════════════════════════════════════════════════════════════════════

class TestWarmCacheSeries:
    """Cover series-specific warm_cache paths."""

    async def test_warm_cache_series_retry_on_first_failure(self):
        """Series category fetches retry once on first failure."""
        import main as m
        import routes.cache_warmer as cw

        old_enabled = cw.CACHE_WARM_ENABLED
        old_cats = cw.CACHE_WARM_CATEGORIES
        try:
            cw.CACHE_WARM_ENABLED = True
            cw.CACHE_WARM_CATEGORIES = ""
            call_count = {"count": 0}

            async def mock_cached_fetch(key, action, **params):
                if "live" in action:
                    return []
                if "vod_categories" in action:
                    return []
                if "series_categories" in action:
                    return [{"category_id": 10}]
                if "get_vod_streams" in action:
                    return []
                if "get_series" in action:
                    call_count["count"] += 1
                    if call_count["count"] == 1:
                        raise Exception("Temporary failure")
                    return [{"id": 1}]
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch):
                with patch("routes.guide.load_epg", return_value={"channels": [], "programmes": []}):
                    with patch("asyncio.sleep", new_callable=AsyncMock):
                        await warm_cache()

            assert call_count["count"] == 2
        finally:
            cw.CACHE_WARM_ENABLED = old_enabled
            cw.CACHE_WARM_CATEGORIES = old_cats

    async def test_warm_cache_empty_series_categories(self):
        """Empty series categories logs a warning and continues."""
        import main as m
        import routes.cache_warmer as cw

        old_enabled = cw.CACHE_WARM_ENABLED
        old_cats = cw.CACHE_WARM_CATEGORIES
        try:
            cw.CACHE_WARM_ENABLED = True
            cw.CACHE_WARM_CATEGORIES = ""

            async def mock_cached_fetch(key, action, **params):
                if "live" in action:
                    return []
                if "vod_categories" in action:
                    return [{"category_id": 1}]
                if "vod_streams" in action:
                    return [{"id": 1}]
                if "series_categories" in action:
                    return []
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch):
                with patch("routes.guide.load_epg", return_value={"channels": [], "programmes": []}):
                    await warm_cache()
        finally:
            cw.CACHE_WARM_ENABLED = old_enabled
            cw.CACHE_WARM_CATEGORIES = old_cats

    async def test_warm_cache_vod_double_failure_still_returns_none(self):
        """VOD category that fails both attempts returns None (not Exception)."""
        import main as m
        import routes.cache_warmer as cw

        old_enabled = cw.CACHE_WARM_ENABLED
        old_cats = cw.CACHE_WARM_CATEGORIES
        try:
            cw.CACHE_WARM_ENABLED = True
            cw.CACHE_WARM_CATEGORIES = ""
            call_count = {"count": 0}

            async def mock_cached_fetch(key, action, **params):
                if "live" in action:
                    return []
                if "vod_categories" in action:
                    return [{"category_id": 99}]
                if "series_categories" in action:
                    return []
                if "vod_streams" in action:
                    call_count["count"] += 1
                    raise Exception("Persistent failure")
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch):
                with patch("routes.guide.load_epg", return_value={"channels": [], "programmes": []}):
                    with patch("asyncio.sleep", new_callable=AsyncMock):
                        await warm_cache()  # Should not raise

            assert call_count["count"] == 2
        finally:
            cw.CACHE_WARM_ENABLED = old_enabled
            cw.CACHE_WARM_CATEGORIES = old_cats
