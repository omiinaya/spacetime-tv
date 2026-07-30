"""Tests for state.py — shared mutable state, cache keys, monitoring, and persistence."""

import json
import time
from pathlib import Path

import pytest

import state


# ══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════════════════


@pytest.fixture(autouse=True)
def reset_global_state():
    """Reset all mutable state between tests so ordering doesn't matter."""
    state._stream_hits.clear()
    state._error_log.clear()
    state._search_queries.clear()
    state._progress_store.clear()


@pytest.fixture
def tmp_state_paths(monkeypatch, tmp_path):
    """Redirect STREAM_HITS_FILE and PROGRESS_FILE into tmp_path."""
    hits = tmp_path / "stream_hits.json"
    prog = tmp_path / "watch_progress.json"
    monkeypatch.setattr(state, "STREAM_HITS_FILE", str(hits))
    monkeypatch.setattr(state, "PROGRESS_FILE", prog)
    return hits, prog


# ══════════════════════════════════════════════════════════════════════════════
# 1. Cache key constants
# ══════════════════════════════════════════════════════════════════════════════


class TestCacheKeyConstants:
    """Every cache-key constant must exist and be a non-empty string."""

    KEY_NAMES = [
        "CACHE_LIVE_ALL",
        "CACHE_LIVE_CATS",
        "CACHE_VOD_CATEGORIES",
        "CACHE_VOD_CAT",
        "CACHE_VOD_INFO",
        "CACHE_SERIES_CATEGORIES",
        "CACHE_SERIES_CAT",
        "CACHE_SERIES_INFO",
        "CACHE_TMDB_ENRICH",
    ]

    @pytest.mark.parametrize("name", KEY_NAMES)
    def test_constant_exists_and_is_string(self, name):
        val = getattr(state, name, None)
        assert val is not None, f"{name} is not defined in state"
        assert isinstance(val, str), f"{name} must be a string, got {type(val)}"
        assert len(val) > 0, f"{name} must be non-empty"

    def test_cache_key_patterns_has_all_expected_entries(self):
        """CACHE_KEY_PATTERNS must contain every non-TMDB cache-key alias."""
        expected = {
            "live_all",
            "live_cats",
            "vod_categories",
            "vod_cat",
            "vod_info",
            "series_categories",
            "series_cat",
            "series_info",
        }
        actual = set(state.CACHE_KEY_PATTERNS)
        missing = expected - actual
        extra = actual - expected
        assert not missing, f"Missing CACHE_KEY_PATTERNS entries: {missing}"
        assert not extra, f"Unexpected CACHE_KEY_PATTERNS entries: {extra}"

    def test_cache_key_patterns_values_are_strings(self):
        for alias, pattern in state.CACHE_KEY_PATTERNS.items():
            assert isinstance(pattern, str), (
                f"Pattern for '{alias}' must be a string, got {type(pattern)}"
            )

    def test_cache_key_patterns_match_constants(self):
        """Each CACHE_KEY_PATTERNS value should equal the corresponding constant."""
        mapping = {
            "live_all": state.CACHE_LIVE_ALL,
            "live_cats": state.CACHE_LIVE_CATS,
            "vod_categories": state.CACHE_VOD_CATEGORIES,
            "vod_cat": state.CACHE_VOD_CAT,
            "vod_info": state.CACHE_VOD_INFO,
            "series_categories": state.CACHE_SERIES_CATEGORIES,
            "series_cat": state.CACHE_SERIES_CAT,
            "series_info": state.CACHE_SERIES_INFO,
        }
        for alias, expected in mapping.items():
            actual = state.CACHE_KEY_PATTERNS[alias]
            assert actual == expected, (
                f"CACHE_KEY_PATTERNS['{alias}'] is '{actual}', "
                f"expected '{expected}' (check constant match)"
            )

    def test_tmdb_enrich_not_in_patterns(self):
        """CACHE_TMDB_ENRICH is intentionally excluded from CACHE_KEY_PATTERNS."""
        assert "tmdb_enrich" not in state.CACHE_KEY_PATTERNS


# ══════════════════════════════════════════════════════════════════════════════
# 2. CACHE_TTL default
# ══════════════════════════════════════════════════════════════════════════════


class TestCacheTTL:
    def test_default_value(self):
        """CACHE_TTL should be 300 (5 minutes)."""
        assert state.CACHE_TTL == 300


# ══════════════════════════════════════════════════════════════════════════════
# 3. DISK_CACHE_TTL and DISK_CACHE_BUDGET defaults
# ══════════════════════════════════════════════════════════════════════════════


class TestDiskCacheDefaults:
    def test_disk_cache_ttl_default(self):
        """DISK_CACHE_TTL should be 86400 * 7 (7 days)."""
        assert state.DISK_CACHE_TTL == 86400 * 7

    def test_disk_cache_budget_default(self):
        """DISK_CACHE_BUDGET should be 500 MB."""
        assert state.DISK_CACHE_BUDGET == 500 * 1024 * 1024


# ══════════════════════════════════════════════════════════════════════════════
# 4. SERVER_START_TIME
# ══════════════════════════════════════════════════════════════════════════════


class TestServerStartTime:
    def test_is_float_timestamp(self):
        assert isinstance(state.SERVER_START_TIME, float)
        assert state.SERVER_START_TIME > 0


# ══════════════════════════════════════════════════════════════════════════════
# 5. track_hit()
# ══════════════════════════════════════════════════════════════════════════════


class TestTrackHit:
    def test_increments_in_memory(self, tmp_state_paths):
        """track_hit should increment the in-memory counter."""
        state.track_hit("live", 42)
        assert state._stream_hits.get("live:42") == 1

        state.track_hit("live", 42)
        assert state._stream_hits.get("live:42") == 2

    def test_uses_string_id(self, tmp_state_paths):
        """track_hit should accept string IDs."""
        state.track_hit("vod", "abc-123")
        assert state._stream_hits.get("vod:abc-123") == 1

    def test_persists_to_disk(self, tmp_state_paths):
        """After track_hit, the JSON file should contain current data."""
        state.track_hit("series", 7)
        hits_file, _ = tmp_state_paths
        assert hits_file.exists()
        data = json.loads(hits_file.read_text())
        assert data == {"series:7": 1}

    def test_multiple_hits_accumulate(self, tmp_state_paths):
        """Multiple hits across different streams all persist."""
        state.track_hit("live", 1)
        state.track_hit("live", 2)
        state.track_hit("vod", 99)
        state.track_hit("live", 1)  # increment existing

        hits_file, _ = tmp_state_paths
        data = json.loads(hits_file.read_text())
        assert data == {"live:1": 2, "live:2": 1, "vod:99": 1}

    def test_handles_disk_write_error_gracefully(self, monkeypatch, tmp_state_paths):
        """If the disk write fails, track_hit should not crash."""
        import builtins

        original_open = builtins.open

        def failing_open(*args, **kwargs):
            if "stream_hits" in str(args[0]):
                raise OSError("Permission denied")
            return original_open(*args, **kwargs)

        monkeypatch.setattr(builtins, "open", failing_open)

        state.track_hit("live", 1)
        # In-memory still updated
        assert state._stream_hits["live:1"] == 1

    def test_load_merges_with_existing(self, tmp_state_paths):
        """_load_stream_hits should merge disk values with existing in-memory."""
        hits_file, _ = tmp_state_paths
        # Pre-populate disk
        hits_file.write_text(json.dumps({"live:1": 5, "vod:2": 3}))
        # Pre-populate memory
        state._stream_hits["live:1"] = 2
        state._stream_hits["series:3"] = 1

        state._load_stream_hits()

        # live:1 should take max(2, 5) = 5
        assert state._stream_hits["live:1"] == 5
        # vod:2 loaded from disk
        assert state._stream_hits["vod:2"] == 3
        # series:3 stayed from memory
        assert state._stream_hits["series:3"] == 1


# ══════════════════════════════════════════════════════════════════════════════
# 6. _save_stream_hits() / _load_stream_hits()
# ══════════════════════════════════════════════════════════════════════════════


class TestStreamHitsPersistence:
    def test_save_writes_to_disk(self, tmp_state_paths):
        hits_file, _ = tmp_state_paths
        state._stream_hits["test:1"] = 99
        state._save_stream_hits()

        assert hits_file.exists()
        data = json.loads(hits_file.read_text())
        assert data == {"test:1": 99}

    def test_load_reads_from_disk(self, tmp_state_paths):
        hits_file, _ = tmp_state_paths
        hits_file.write_text(json.dumps({"abc:1": 7, "def:2": 14}))

        state._stream_hits.clear()
        state._load_stream_hits()

        assert state._stream_hits == {"abc:1": 7, "def:2": 14}

    def test_load_handles_missing_file_gracefully(self, tmp_state_paths):
        """No crash when file doesn't exist."""
        state._stream_hits["existing:1"] = 1
        state._load_stream_hits()
        assert state._stream_hits["existing:1"] == 1  # untouched

    def test_load_handles_corrupt_json(self, tmp_state_paths):
        hits_file, _ = tmp_state_paths
        hits_file.write_text("not valid json")

        state._stream_hits.clear()
        state._load_stream_hits()
        assert state._stream_hits == {}  # empty, no crash

    def test_save_handles_oserror_gracefully(self, monkeypatch, tmp_state_paths):
        hits_file, _ = tmp_state_paths
        state._stream_hits["k"] = 1

        import builtins

        original_open = builtins.open

        def failing_open(*args, **kwargs):
            if "stream_hits" in str(args[0]):
                raise OSError("read-only filesystem")
            return original_open(*args, **kwargs)

        monkeypatch.setattr(builtins, "open", failing_open)
        state._save_stream_hits()  # must not raise


# ══════════════════════════════════════════════════════════════════════════════
# 7. log_error()
# ══════════════════════════════════════════════════════════════════════════════


class TestLogError:
    def test_adds_entry(self):
        """log_error should append a dict with ts, message, and path."""
        state.log_error("something broke", "/api/v1/test")
        assert len(state._error_log) == 1
        entry = state._error_log[0]
        assert "ts" in entry
        assert isinstance(entry["ts"], float)
        assert entry["message"] == "something broke"
        assert entry["path"] == "/api/v1/test"

    def test_default_path_is_empty_string(self):
        state.log_error("no path")
        assert state._error_log[0]["path"] == ""

    def test_respects_100_entry_limit(self):
        """log_error should keep at most 100 entries (oldest removed)."""
        for i in range(105):
            state.log_error(f"error {i}")

        assert len(state._error_log) == 100
        # The first 5 should have been removed
        assert state._error_log[0]["message"] == "error 5"
        assert state._error_log[-1]["message"] == "error 104"

    def test_entries_have_timestamps(self):
        """Each entry should have a plausible timestamp."""
        before = time.time()
        state.log_error("timely")
        after = time.time()
        ts = state._error_log[0]["ts"]
        assert before <= ts <= after, "Timestamp not in expected range"


# ══════════════════════════════════════════════════════════════════════════════
# 8. record_search()
# ══════════════════════════════════════════════════════════════════════════════


class TestRecordSearch:
    def test_adds_entry(self):
        """record_search should append a dict with ts and query."""
        state.record_search("doctor who")
        assert len(state._search_queries) == 1
        entry = state._search_queries[0]
        assert "ts" in entry
        assert isinstance(entry["ts"], float)
        assert entry["query"] == "doctor who"

    def test_truncates_long_query(self):
        """Queries longer than 80 characters should be truncated."""
        long_q = "x" * 200
        state.record_search(long_q)
        assert len(state._search_queries[0]["query"]) == 80

    def test_respects_1000_entry_limit(self):
        """record_search should keep at most 1000 entries."""
        for i in range(1010):
            state.record_search(f"query {i}")

        assert len(state._search_queries) == 1000
        assert state._search_queries[0]["query"] == "query 10"
        assert state._search_queries[-1]["query"] == "query 1009"

    def test_entries_have_timestamps(self):
        """Each entry should have a plausible timestamp."""
        before = time.time()
        state.record_search("hello")
        after = time.time()
        ts = state._search_queries[0]["ts"]
        assert before <= ts <= after
        assert ts > 0


# ══════════════════════════════════════════════════════════════════════════════
# 9. _save_progress_store() / _load_progress_store()
# ══════════════════════════════════════════════════════════════════════════════


class TestProgressStorePersistence:
    def test_save_writes_to_disk(self, tmp_state_paths):
        _, prog_file = tmp_state_paths
        state._progress_store["user:show"] = {"progress": 0.75}
        state._save_progress_store()

        assert prog_file.exists()
        data = json.loads(prog_file.read_text())
        assert data == {"user:show": {"progress": 0.75}}

    def test_load_reads_from_disk(self, tmp_state_paths):
        _, prog_file = tmp_state_paths
        prog_file.write_text(json.dumps({"user:movie": {"progress": 0.5}}))

        state._progress_store.clear()
        state._load_progress_store()

        assert state._progress_store == {"user:movie": {"progress": 0.5}}

    def test_load_merges_with_existing(self, tmp_state_paths):
        _, prog_file = tmp_state_paths
        prog_file.write_text(json.dumps({"a": {"progress": 0.1}, "b": {"progress": 0.2}}))
        state._progress_store["a"] = {"progress": 0.9}  # pre-existing
        state._progress_store["c"] = {"progress": 0.3}

        state._load_progress_store()

        # _load_progress_store replaces the entire dict, not merge
        assert state._progress_store == {"a": {"progress": 0.1}, "b": {"progress": 0.2}}

    def test_load_handles_missing_file(self, tmp_state_paths):
        """No crash when file doesn't exist — store is cleared."""
        state._progress_store["existing"] = True
        state._load_progress_store()
        assert state._progress_store == {}

    def test_load_handles_corrupt_json(self, tmp_state_paths):
        _, prog_file = tmp_state_paths
        prog_file.write_text("{bad json")
        state._progress_store.clear()
        state._load_progress_store()
        assert state._progress_store == {}

    def test_save_handles_oserror_gracefully(self, monkeypatch, tmp_state_paths):
        """_save_progress_store uses contextlib.suppress, no crash."""
        _, prog_file = tmp_state_paths
        state._progress_store["key"] = "val"

        import builtins

        original_open = builtins.open

        def failing_open(*args, **kwargs):
            if "watch_progress" in str(args[0]):
                raise OSError("read-only")
            return original_open(*args, **kwargs)

        monkeypatch.setattr(builtins, "open", failing_open)
        state._save_progress_store()  # must not raise

    def test_save_overwrites_existing_file(self, tmp_state_paths):
        """Saving should replace file contents, not append."""
        _, prog_file = tmp_state_paths
        prog_file.write_text(json.dumps({"old": "data"}))
        state._progress_store["new"] = "data"
        state._save_progress_store()
        data = json.loads(prog_file.read_text())
        assert data == {"new": "data"}


# ══════════════════════════════════════════════════════════════════════════════
# 10. EPG / Guide cache structures
# ══════════════════════════════════════════════════════════════════════════════


class TestEpgCache:
    def test_epg_cache_initial_structure(self):
        assert state.epg_cache == {"data": None, "fetched": 0}
        assert state.epg_cache["data"] is None
        assert state.epg_cache["fetched"] == 0

    def test_guide_cache_initial_structure(self):
        expected = {"channel_groups": None, "total_channels": 0, "built_at": 0}
        assert state._guide_cache == expected


# ══════════════════════════════════════════════════════════════════════════════
# 11. Internal data structures
# ══════════════════════════════════════════════════════════════════════════════


class TestInternalStructures:
    def test_cache_is_dict(self):
        assert isinstance(state._cache, dict)

    def test_cache_hits_misses_are_ints(self):
        assert isinstance(state._cache_hits, int)
        assert isinstance(state._cache_misses, int)

    def test_img_cache_is_dict(self):
        assert isinstance(state._img_cache, dict)

    def test_provider_health_is_dict(self):
        assert isinstance(state._provider_health, dict)

    def test_epg_clients_is_list(self):
        assert isinstance(state._epg_clients, list)
        assert state._epg_clients == []

    def test_warm_task_is_none_initially(self):
        assert state._warm_task is None

    def test_epg_refresh_task_is_none_initially(self):
        assert state._epg_refresh_task is None

    def test_error_log_starts_empty(self):
        assert state._error_log == []

    def test_search_queries_starts_empty(self):
        assert state._search_queries == []

    def test_stream_hits_starts_empty(self):
        assert state._stream_hits == {}

    def test_progress_store_starts_empty(self):
        assert state._progress_store == {}
