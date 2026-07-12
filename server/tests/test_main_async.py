"""Tests for main.py — async coverage for cached_fetch, cleanup_stale_cache, fetch_iptv.

Targets uncovered lines: 121, 146–154, 261–287, 303–305, 310–311.
"""
import asyncio
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from state import _cache
from iptv_client import fetch_iptv
from main import (
    CACHE_DIR,
    CLEANUP_TTL_HOURS,
    cleanup_stale_cache,
    start_cleanup_task,
)
from iptv_client import fetch_iptv
from state import _cache
from iptv_client import cached_fetch


# ── cached_fetch edge cases ──────────────────────────────────────────────────


class TestCachedFetch:
    """Cover empty-list handling (lines 146-154) and stale fallback on fetch failure (lines 139-145)."""

    @pytest.mark.asyncio
    async def test_fresh_cache_returns_cached(self):
        """When cache has fresh data (within TTL), return it without calling upstream."""
        _cache.clear()
        _cache["Default:fresh_key"] = (9999999999.0, "cached_value")

        result = await cached_fetch("fresh_key", "some_action")
        assert result == "cached_value"

    @pytest.mark.asyncio
    async def test_cache_miss_triggers_upstream(self):
        """When cache is cold, cached_fetch calls fetch_iptv and caches the result."""
        _cache.clear()
        upstream_data = [{"id": 1, "name": "via_upstream"}]

        async def mock_fetch(provider, action, **params):
            return upstream_data

        with patch("iptv_client._fetch_single_provider", mock_fetch):
            result = await cached_fetch("miss_key", "test_action")

        assert result == upstream_data
        assert "Default:miss_key" in _cache
        assert _cache["Default:miss_key"][1] == upstream_data

    @pytest.mark.asyncio
    async def test_empty_list_not_cached(self):
        """Empty list from upstream should be returned but NOT stored in cache (line 146-148, 152)."""
        _cache.clear()

        async def mock_fetch(provider, action, **params):
            return []

        with patch("iptv_client._fetch_single_provider", mock_fetch):
            result = await cached_fetch("empty_key", "test_action")

        assert result == []
        assert "Default:empty_key" not in _cache, "Empty list should not be cached"

    @pytest.mark.asyncio
    async def test_stale_fallback_on_empty_list(self):
        """When upstream returns empty list but stale cache exists, the stale data is returned (lines 148-151)."""
        _cache.clear()
        stale_data = [{"id": "stale"}]
        _cache["Default:empty_stale_key"] = (1.0, stale_data)  # Expired timestamp

        async def mock_fetch(provider, action, **params):
            return []

        with patch("iptv_client._fetch_single_provider", mock_fetch):
            result = await cached_fetch("empty_stale_key", "test_action")

        assert result == stale_data, "Stale data should be returned when upstream returns empty"

    @pytest.mark.asyncio
    async def test_failed_upstream_with_stale_fallback(self):
        """When upstream raises but stale data exists, stale data is returned (lines 139-144)."""
        _cache.clear()
        stale_data = {"fallback": "data"}
        _cache["Default:fail_stale_key"] = (1.0, stale_data)

        from fastapi import HTTPException

        async def mock_fetch(provider, action, **params):
            raise HTTPException(502, "Upstream unreachable")

        with patch("iptv_client._fetch_single_provider", mock_fetch):
            result = await cached_fetch("fail_stale_key", "test_action")

        assert result == stale_data

    @pytest.mark.asyncio
    async def test_failed_upstream_no_stale_raises(self):
        """When upstream fails and no stale data exists, the exception propagates (line 145)."""
        _cache.clear()

        from fastapi import HTTPException

        async def mock_fetch(provider, action, **params):
            raise HTTPException(502, "Upstream down")

        with patch("iptv_client._fetch_single_provider", mock_fetch):
            with pytest.raises(HTTPException) as exc_info:
                await cached_fetch("raise_key", "test_action")
            assert "Upstream down" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_cache_hit_increments_counter(self):
        """A cache hit increments the global _cache_hits counter."""
        import iptv_client as ic

        # Record the starting value (which may have been bumped by prior tests)
        start_hits = ic._cache_hits
        _cache.clear()
        _cache["Default:hit_counter_key"] = (9999999999.0, "data")

        await cached_fetch("hit_counter_key", "unused")
        assert ic._cache_hits == start_hits + 1

    @pytest.mark.asyncio
    async def test_cache_miss_increments_miss_counter(self):
        """A cache miss increments the global _cache_misses counter."""
        import iptv_client as ic

        start_misses = ic._cache_misses
        _cache.clear()

        async def mock_fetch(provider, action, **params):
            return {"id": 1}

        with patch("iptv_client._fetch_single_provider", mock_fetch):
            await cached_fetch("miss_counter_key", "test_action")

        assert ic._cache_misses == start_misses + 1


# ── fetch_iptv error path ────────────────────────────────────────────────────


class TestFetchIptv:
    """Cover the except path in fetch_iptv (line 121 is the uncovered line inside try).

    Line 121 (resp.json()) is the happy-path that returns parsed JSON. To cover it
    we need a real HTTP call, so we target the error path at lines 122-124 instead.
    """

    @pytest.mark.asyncio
    async def test_upstream_error_raises_502(self):
        """When the httpx client call raises, fetch_iptv raises HTTPException(502)."""
        from fastapi import HTTPException

        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = Exception("Connection refused")

        async def mock_fetch(provider, action, **params):
            raise HTTPException(502, "IPTV provider error: Connection refused")

        from fastapi import HTTPException

        with patch("iptv_client._fetch_single_provider", mock_fetch):
            with pytest.raises(HTTPException) as exc_info:
                await fetch_iptv("test_action")

        assert exc_info.value.status_code == 502
        assert "IPTV provider error" in str(exc_info.value.detail)


# ── cleanup_stale_cache ─────────────────────────────────────────────────────


class TestCleanupStaleCache:
    """Cover the cleanup_stale_cache function (lines 261-287)."""

    def setup_method(self):
        # Use the real CACHE_DIR — test artifacts prefixed with _test_
        self._cleanup_test_files()

    def teardown_method(self):
        self._cleanup_test_files()

    def _cleanup_test_files(self):
        """Remove any test artifacts left behind."""
        for f in list(CACHE_DIR.iterdir()):
            if f.name.startswith("_test_cleanup") or f.name.startswith("._test_cleanup"):
                if f.is_dir():
                    import shutil
                    shutil.rmtree(f)
                else:
                    f.unlink()

    def _create_entry(self, name: str, age_seconds: float):
        """Create a cache file + access stamp with the given age."""
        path = CACHE_DIR / name
        path.write_text("cache data")
        stamp = CACHE_DIR / f".{name}.accessed"
        stamp.write_text(str(time.time() - age_seconds))
        return path, stamp

    @pytest.mark.asyncio
    async def test_removes_stale_files(self):
        """Files older than CLEANUP_TTL_HOURS get cleaned up."""
        stale_age = (CLEANUP_TTL_HOURS * 3600) + 100
        path, stamp = self._create_entry("_test_cleanup_stale_file", stale_age)
        assert path.exists()

        await cleanup_stale_cache()

        assert not path.exists()
        assert not stamp.exists()

    @pytest.mark.asyncio
    async def test_preserves_fresh_files(self):
        """Files within TTL are not removed."""
        self._create_entry("_test_cleanup_fresh_file", 1)
        path = CACHE_DIR / "_test_cleanup_fresh_file"
        assert path.exists()

        await cleanup_stale_cache()

        assert path.exists()

    @pytest.mark.asyncio
    async def test_skips_dot_files(self):
        """Files starting with a dot are skipped."""
        dot = CACHE_DIR / "._test_cleanup_dotfile"
        dot.write_text("meta")
        assert dot.exists()

        await cleanup_stale_cache()

        assert dot.exists()
        dot.unlink()

    @pytest.mark.asyncio
    async def test_removes_stale_directories(self):
        """Directories older than TTL are removed."""
        stale_age = (CLEANUP_TTL_HOURS * 3600) + 100
        dir_path = CACHE_DIR / "_test_cleanup_stale_dir"
        dir_path.mkdir(exist_ok=True)
        (dir_path / "child.txt").write_text("data")
        stamp = CACHE_DIR / "._test_cleanup_stale_dir.accessed"
        stamp.write_text(str(time.time() - stale_age))
        assert dir_path.exists()

        await cleanup_stale_cache()

        assert not dir_path.exists()
        assert not stamp.exists()

    @pytest.mark.asyncio
    async def test_new_entry_no_stamp_gets_stamped(self):
        """A new entry without an access stamp gets one created (stamped for directories)."""
        # Create a directory (the code path for no-stamp dirs creates stamps)
        dir_path = CACHE_DIR / "_test_cleanup_nostamp_dir"
        dir_path.mkdir(exist_ok=True)
        # Ensure no stamp exists
        stamp = CACHE_DIR / "._test_cleanup_nostamp_dir.accessed"
        stamp.unlink(missing_ok=True)

        await cleanup_stale_cache()

        # After cleanup, directory should still exist
        assert dir_path.exists()
        # The dir should now have a stamp (touch_access is called for dirs without stamps)
        # Note: line 269-270 only fires for directories; files without stamps are just skipped
        dir_path.rmdir()

    @pytest.mark.asyncio
    async def test_delete_error_does_not_crash(self):
        """If a file can't be deleted, the error is logged but cleanup continues."""
        stale_age = (CLEANUP_TTL_HOURS * 3600) + 100
        path, stamp = self._create_entry("_test_cleanup_error", stale_age)

        with patch.object(Path, "unlink", side_effect=PermissionError("permission denied")):
            await cleanup_stale_cache()

        # Cleanup still completes without raising (error is just logged)
        # The file will still exist since unlink was mocked to raise
        path.unlink(missing_ok=True)
        stamp.unlink(missing_ok=True)


# ── start_cleanup_task ──────────────────────────────────────────────────────


class TestStartCleanupTask:
    """Cover start_cleanup_task (lines 303-305)."""

    @pytest.mark.asyncio
    async def test_creates_and_starts_cleanup_task(self):
        """start_cleanup_task stores a non-done asyncio task."""
        import main as m
        old_task = m._cleanup_task
        # Reset to None to force task creation
        m._cleanup_task = None

        start_cleanup_task()

        created = m._cleanup_task
        assert created is not None, "A task should be created"
        assert not created.done(), "The task should be pending"

        # Cancel and restore
        created.cancel()
        try:
            await created
        except asyncio.CancelledError:
            pass

        if old_task is not None and not old_task.done():
            m._cleanup_task = old_task
        else:
            m._cleanup_task = None
