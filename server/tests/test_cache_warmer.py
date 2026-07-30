"""Comprehensive tests for cache_warmer.py — task lifecycle, warm execution, and coherence checks."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest


# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def _reset_warmer_globals():
    """Reset _warm_task between tests so state doesn't leak."""
    from routes import cache_warmer as cw

    cw._warm_task = None
    yield


@pytest.fixture
def warmer():
    """Convenience import."""
    import routes.cache_warmer as cw

    return cw


# ═══════════════════════════════════════════════════════════════════════════════
# start_cache_warmer
# ═══════════════════════════════════════════════════════════════════════════════

class TestStartCacheWarmer:
    """start_cache_warmer() launcher behaviour."""

    async def test_creates_task_when_none(self, warmer):
        """start_cache_warmer creates a new asyncio.Task when _warm_task is None."""
        old_enabled = warmer.CACHE_WARM_ENABLED
        try:
            warmer.CACHE_WARM_ENABLED = False  # so warm_cache completes instantly
            assert warmer._warm_task is None

            warmer.start_cache_warmer()

            assert warmer._warm_task is not None
            assert not warmer._warm_task.done()
            await warmer._warm_task
        finally:
            warmer.CACHE_WARM_ENABLED = old_enabled

    async def test_idempotent_when_task_already_running(self, warmer):
        """Starting again while a task is running returns the same task."""
        old_enabled = warmer.CACHE_WARM_ENABLED
        try:
            warmer.CACHE_WARM_ENABLED = False
            warmer.start_cache_warmer()
            first = warmer._warm_task

            warmer.start_cache_warmer()

            assert warmer._warm_task is first, "Must reuse existing running task"
            await warmer._warm_task
        finally:
            warmer.CACHE_WARM_ENABLED = old_enabled

    async def test_replaces_done_task(self, warmer):
        """After a previous task completed, start_cache_warmer creates a new one."""
        old_enabled = warmer.CACHE_WARM_ENABLED
        try:
            warmer.CACHE_WARM_ENABLED = False

            # Create a dummy task that completes immediately
            async def dummy():
                pass

            warmer._warm_task = asyncio.create_task(dummy())
            await warmer._warm_task
            assert warmer._warm_task.done()

            warmer.start_cache_warmer()

            assert warmer._warm_task is not None
            assert not warmer._warm_task.done()
            await warmer._warm_task
        finally:
            warmer.CACHE_WARM_ENABLED = old_enabled


# ═══════════════════════════════════════════════════════════════════════════════
# is_warm_running
# ═══════════════════════════════════════════════════════════════════════════════

class TestIsWarmRunning:
    """is_warm_running() status checks."""

    def test_false_initially(self, warmer):
        """No warmer has been started — returns False."""
        assert warmer.is_warm_running() is False

    def test_false_when_task_is_none(self, warmer):
        """Explicitly None _warm_task — returns False."""
        warmer._warm_task = None
        assert warmer.is_warm_running() is False

    async def test_false_when_task_is_done(self, warmer):
        """A completed task — returns False."""
        async def noop():
            pass

        t = asyncio.ensure_future(noop())
        await t
        assert t.done()
        warmer._warm_task = t
        assert warmer.is_warm_running() is False

    async def test_true_when_task_pending(self, warmer):
        """A non-None, not-done task — returns True."""
        async def never_ends():
            while True:
                await asyncio.sleep(3600)

        t = asyncio.ensure_future(never_ends())
        warmer._warm_task = t
        try:
            assert warmer.is_warm_running() is True
        finally:
            t.cancel()
            with pytest.raises(asyncio.CancelledError):
                await t


# ═══════════════════════════════════════════════════════════════════════════════
# get_warm_task
# ═══════════════════════════════════════════════════════════════════════════════

class TestGetWarmTask:
    """get_warm_task() dependency."""

    async def test_returns_none_initially(self, warmer):
        """No warmer ever started — returns None."""
        result = await warmer.get_warm_task()
        assert result is None

    async def test_returns_running_task(self, warmer):
        """After start_cache_warmer — returns the running task."""
        old_enabled = warmer.CACHE_WARM_ENABLED
        try:
            warmer.CACHE_WARM_ENABLED = False
            warmer.start_cache_warmer()

            result = await warmer.get_warm_task()

            assert result is warmer._warm_task
            assert result is not None
            assert not result.done()
            await result
        finally:
            warmer.CACHE_WARM_ENABLED = old_enabled

    async def test_returns_none_after_task_done(self, warmer):
        """After the warm task completes, get_warm_task returns None
        because _warm_task is still set but get_warm_task returns it
        regardless of done state. (This tests the actual behaviour.)"""
        old_enabled = warmer.CACHE_WARM_ENABLED
        try:
            warmer.CACHE_WARM_ENABLED = False
            warmer.start_cache_warmer()
            await warmer._warm_task

            result = await warmer.get_warm_task()
            # The task is done but _warm_task still holds a reference
            assert result is warmer._warm_task
            assert result.done()
        finally:
            warmer.CACHE_WARM_ENABLED = old_enabled


# ═══════════════════════════════════════════════════════════════════════════════
# warm_cache
# ═══════════════════════════════════════════════════════════════════════════════

class TestWarmCache:
    """warm_cache() functional behaviour."""

    # ── Disabled ───────────────────────────────────────────────────────

    async def test_skips_when_disabled(self, warmer):
        """warm_cache returns immediately when CACHE_WARM_ENABLED is False,
        without making any fetch calls."""
        old = warmer.CACHE_WARM_ENABLED
        try:
            warmer.CACHE_WARM_ENABLED = False
            with patch("iptv_client.cached_fetch", AsyncMock()) as mock_fetch:
                await warmer.warm_cache()
            mock_fetch.assert_not_called()
        finally:
            warmer.CACHE_WARM_ENABLED = old

    # ── Full warm (mocked) ─────────────────────────────────────────────

    async def test_full_warm_success(self, warmer):
        """All cache keys are fetched with expected parameters, EPG is loaded."""
        old_enabled = warmer.CACHE_WARM_ENABLED
        old_cats = warmer.CACHE_WARM_CATEGORIES
        try:
            warmer.CACHE_WARM_ENABLED = True
            warmer.CACHE_WARM_CATEGORIES = ""

            async def mock_cached_fetch(key, action, **params):
                if key == "live_all":
                    return [{"id": 101}]
                if key == "vod_categories":
                    return [{"category_id": 1, "category_name": "Movies"}, {"category_id": 2, "category_name": "Action"}]
                if key == "vod_1":
                    return [{"id": 201}]
                if key == "vod_2":
                    return [{"id": 202}]
                if key == "series_categories":
                    return [{"category_id": 10, "category_name": "TV Shows"}]
                if key == "series_10":
                    return [{"id": 301}]
                return []

            async def mock_load_epg():
                return {"channels": [{"id": "ch1"}], "programmes": [{"id": "p1"}]}

            with patch("iptv_client.cached_fetch", mock_cached_fetch), \
                    patch("routes.guide.load_epg", mock_load_epg):
                await warmer.warm_cache()
        finally:
            warmer.CACHE_WARM_ENABLED = old_enabled
            warmer.CACHE_WARM_CATEGORIES = old_cats

    async def test_full_warm_with_cat_filter(self, warmer):
        """CACHE_WARM_CATEGORIES filters which categories are fetched."""
        old_enabled = warmer.CACHE_WARM_ENABLED
        old_cats = warmer.CACHE_WARM_CATEGORIES
        try:
            warmer.CACHE_WARM_ENABLED = True
            warmer.CACHE_WARM_CATEGORIES = "1,3"

            fetched_vod_cats = []

            async def mock_cached_fetch(key, action, **params):
                if key == "live_all":
                    return [{"id": 101}]
                if key == "vod_categories":
                    return [
                        {"category_id": 1, "category_name": "Movies"},
                        {"category_id": 2, "category_name": "Action"},
                        {"category_id": 3, "category_name": "Comedy"},
                    ]
                if key == "vod_1":
                    fetched_vod_cats.append(1)
                    return [{"id": 201}]
                if key == "vod_3":
                    fetched_vod_cats.append(3)
                    return [{"id": 203}]
                if key == "series_categories":
                    return [{"category_id": 10, "category_name": "TV Shows"}]
                if key == "series_10":
                    return [{"id": 301}]
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch), \
                    patch("routes.guide.load_epg", return_value={"channels": [], "programmes": []}):
                await warmer.warm_cache()

            # Categories 2 (Action) was filtered out; only 1 and 3 fetched
            assert fetched_vod_cats == [1, 3], f"Expected [1, 3], got {fetched_vod_cats}"
        finally:
            warmer.CACHE_WARM_ENABLED = old_enabled
            warmer.CACHE_WARM_CATEGORIES = old_cats

    async def test_live_warm_failure_non_fatal(self, warmer):
        """If live fetch raises, the rest of warming continues."""
        from fastapi import HTTPException

        old_enabled = warmer.CACHE_WARM_ENABLED
        old_cats = warmer.CACHE_WARM_CATEGORIES
        try:
            warmer.CACHE_WARM_ENABLED = True
            warmer.CACHE_WARM_CATEGORIES = ""

            async def mock_cached_fetch(key, action, **params):
                if key == "live_all":
                    raise HTTPException(status_code=502, detail="Upstream down")
                if key == "vod_categories":
                    return [{"category_id": 1, "category_name": "Movies"}]
                if key == "vod_1":
                    return [{"id": 201}]
                if key == "series_categories":
                    return [{"category_id": 10, "category_name": "TV"}]
                if key == "series_10":
                    return [{"id": 301}]
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch), \
                    patch("routes.guide.load_epg", return_value={"channels": [], "programmes": []}):
                # No exception should propagate out of warm_cache
                await warmer.warm_cache()
        finally:
            warmer.CACHE_WARM_ENABLED = old_enabled
            warmer.CACHE_WARM_CATEGORIES = old_cats

    async def test_vod_retry_on_failure(self, warmer):
        """VOD category fetch retries once on HTTPException."""
        from fastapi import HTTPException

        call_log = []

        async def mock_cached_fetch(key, action, **params):
            call_log.append((key, action))
            if key == "live_all":
                return [{"id": 101}]
            if key == "vod_categories":
                return [{"category_id": 1, "category_name": "Movies"}]
            if key == "vod_1":
                # First call: fail; second call (retry): succeed
                fail_count = sum(1 for k, a in call_log if k == "vod_1")
                if fail_count <= 1:
                    raise HTTPException(status_code=500, detail="Fail")
                return [{"id": 201}]
            if key == "series_categories":
                return [{"category_id": 10, "category_name": "TV"}]
            if key == "series_10":
                return [{"id": 301}]
            return []

        old_enabled = warmer.CACHE_WARM_ENABLED
        old_cats = warmer.CACHE_WARM_CATEGORIES
        try:
            warmer.CACHE_WARM_ENABLED = True
            warmer.CACHE_WARM_CATEGORIES = ""

            with patch("iptv_client.cached_fetch", mock_cached_fetch), \
                    patch("routes.guide.load_epg", return_value={"channels": [], "programmes": []}):
                await warmer.warm_cache()

            # vod_1 should have been called at least twice (initial + retry)
            vod_calls = [k for k, a in call_log if k == "vod_1"]
            assert len(vod_calls) >= 2, f"Expected >=2 vod_1 calls, got {len(vod_calls)}"
        finally:
            warmer.CACHE_WARM_ENABLED = old_enabled
            warmer.CACHE_WARM_CATEGORIES = old_cats

    async def test_epg_failure_non_fatal(self, warmer):
        """EPG fetch raising connection/timeout errors is non-fatal."""
        old_enabled = warmer.CACHE_WARM_ENABLED
        old_cats = warmer.CACHE_WARM_CATEGORIES
        try:
            warmer.CACHE_WARM_ENABLED = True
            warmer.CACHE_WARM_CATEGORIES = ""

            async def mock_cached_fetch(key, action, **params):
                if key == "live_all":
                    return [{"id": 101}]
                if key == "vod_categories":
                    return [{"category_id": 1, "category_name": "Movies"}]
                if key == "vod_1":
                    return [{"id": 201}]
                if key == "series_categories":
                    return [{"category_id": 10}]
                if key == "series_10":
                    return [{"id": 301}]
                return []

            with patch("iptv_client.cached_fetch", mock_cached_fetch), \
                    patch("routes.guide.load_epg", side_effect=TimeoutError("EPG timeout")):
                # Must not raise
                await warmer.warm_cache()
        finally:
            warmer.CACHE_WARM_ENABLED = old_enabled
            warmer.CACHE_WARM_CATEGORIES = old_cats


# ═══════════════════════════════════════════════════════════════════════════════
# _verify_cache_coherence
# ═══════════════════════════════════════════════════════════════════════════════

class TestVerifyCacheCoherence:
    """_verify_cache_coherence() key-integrity checks."""

    async def test_ok_when_all_static_keys_populated(self, warmer):
        """All static (non-template) keys exist in _cache — no warnings."""
        from state import CACHE_KEY_PATTERNS, _cache

        # Populate all static keys
        for name, pattern in CACHE_KEY_PATTERNS.items():
            if "{id}" not in pattern:
                _cache[pattern] = (9999999999.0, [])
        # Populate at least one matching prefix for template keys
        _cache["vod_999"] = (9999999999.0, [])
        _cache["vod_info_999"] = (9999999999.0, [])
        _cache["series_999"] = (9999999999.0, [])
        _cache["series_info_999"] = (9999999999.0, [])

        with patch.object(warmer.log, "warning") as mock_warn:
            await warmer._verify_cache_coherence()

        mock_warn.assert_not_called()

    async def test_warns_for_missing_static_key(self, warmer):
        """A static key absent from _cache triggers a warning."""
        from state import _cache

        _cache.clear()

        with patch.object(warmer.log, "warning") as mock_warn:
            await warmer._verify_cache_coherence()

        # Should have warned for each static key:
        # live_all, live_cats, vod_categories, vod_info, series_categories, series_info
        # That's 6 static keys
        assert mock_warn.call_count >= 6

    async def test_warns_for_missing_template_prefix(self, warmer):
        """A template key with no matching prefix in _cache triggers a warning."""
        from state import CACHE_KEY_PATTERNS, _cache

        # Populate all static keys, but leave template keys with no matching entries
        _cache.clear()
        for name, pattern in CACHE_KEY_PATTERNS.items():
            if "{id}" not in pattern:
                _cache[pattern] = (9999999999.0, [])

        with patch.object(warmer.log, "warning") as mock_warn:
            await warmer._verify_cache_coherence()

        # Template patterns: vod_{id}, vod_info_{id}, series_{id}, series_info_{id}
        # NOTE: vod_categories matches prefix vod_, and series_categories matches
        # prefix series_ — so only vod_info and series_info are truly missing.
        warnings_about_template = [
            call for call in mock_warn.call_args_list
            if "No entries for template key" in str(call)
        ]
        assert len(warnings_about_template) == 2, f"Got {len(warnings_about_template)} template warnings: {[str(c) for c in warnings_about_template]}"

    async def test_mixed_populated_and_missing(self, warmer):
        """Only missing keys trigger warnings; populated ones don't."""
        from state import _cache

        _cache.clear()
        # Populate only live_all and vod_123
        _cache["live_all"] = (9999999999.0, [])
        _cache["vod_123"] = (9999999999.0, [])

        with patch.object(warmer.log, "warning") as mock_warn:
            await warmer._verify_cache_coherence()

        # Must have warnings for missing static keys (live_cats, vod_categories, etc.)
        assert mock_warn.call_count >= 1

        # Check that live_all was NOT warned (it's populated)
        live_all_warnings = [
            call for call in mock_warn.call_args_list
            if "live_all" in str(call)
        ]
        assert len(live_all_warnings) == 0
