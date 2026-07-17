"""Tests for guide_epg.py — EPG loading, background refresh, broadcast, and cache building.

Covers all uncovered paths identified by coverage analysis:
  - load_epg(): disk cache corruption, HTTP fetch, XMLTV parse, save
  - load_epg_background(): stale cache triggers background refresh task
  - _refresh_epg_background(): wraps load_epg with exception safety
  - _build_guide_cache(): stream mapping failure, programme filtering edge cases
  - _parse_ts(): valid/invalid timestamps
"""

import asyncio
import json
import time
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest


def _epg_timestamp(dt=None):
    """Format a datetime to EPG XMLTV timestamp format: YYYYMMDDhhmmss +0000"""
    if dt is None:
        dt = datetime.now(UTC)
    return dt.strftime("%Y%m%d%H%M%S") + " +0000"


# ── _parse_ts ─────────────────────────────────────────────────────────

class TestParseTs:
    """_parse_ts: XMLTV timestamp parsing."""

    def test_parse_ts_valid(self):
        """A well-formed XMLTV timestamp is parsed to datetime."""
        from routes.guide_epg import _parse_ts
        ts = "20260628123000 +0000"
        dt = _parse_ts(ts)
        assert dt.year == 2026
        assert dt.month == 6
        assert dt.day == 28
        assert dt.hour == 12
        assert dt.minute == 30
        assert dt.second == 0

    def test_parse_ts_specific(self):
        """Parse a timestamp with specific time."""
        from routes.guide_epg import _parse_ts
        ts = "20240704081530 +0000"
        dt = _parse_ts(ts)
        assert dt == datetime(2024, 7, 4, 8, 15, 30, tzinfo=UTC)

    def test_parse_ts_midnight(self):
        """Parse a midnight timestamp."""
        from routes.guide_epg import _parse_ts
        ts = "20250101000000 +0000"
        dt = _parse_ts(ts)
        assert dt.hour == 0
        assert dt.minute == 0


# ── load_epg ────────────────────────────────────────────────────────────

class TestLoadEpg:
    """load_epg(): EPG loading from cache, disk, or HTTP."""

    @patch("routes.guide_epg.client", new_callable=AsyncMock)
    @patch("routes.guide_epg.EPG_CACHE_FILE")
    @patch("routes.guide_epg.parse_xmltv")
    async def test_load_epg_fresh_memory_cache(self, mock_parse, mock_cache_file, mock_client):
        """When epg_cache has fresh data in memory, return it without any I/O."""
        from routes.guide_epg import load_epg
        from state import epg_cache

        data = {"channels": [], "programmes": []}
        epg_cache["data"] = data
        epg_cache["fetched"] = time.time()

        result = await load_epg()

        assert result == data
        mock_cache_file.exists.assert_not_called()
        mock_client.get.assert_not_called()

    @patch("routes.guide_epg.client", new_callable=AsyncMock)
    @patch("routes.guide_epg.EPG_CACHE_FILE")
    @patch("routes.guide_epg.parse_xmltv")
    async def test_load_epg_stale_memory_hits_disk_cache(self, mock_parse, mock_cache_file, mock_client):
        """When memory cache is stale but disk cache is fresh, load from disk."""
        from routes.guide_epg import load_epg
        from state import epg_cache

        old_time = time.time() - 99999  # way stale
        now = time.time()
        epg_cache["data"] = {"old": "data"}
        epg_cache["fetched"] = old_time

        cached_data = {"programmes": ["prog1"]}
        cache_payload = {"data": cached_data, "fetched": now}
        mock_cache_file.exists.return_value = True
        mock_cache_file.read_text.return_value = json.dumps(cache_payload)

        result = await load_epg()

        assert result == cached_data
        assert epg_cache["data"] == cached_data
        assert epg_cache["fetched"] == now
        mock_cache_file.read_text.assert_called_once()
        mock_client.get.assert_not_called()

    @patch("routes.guide_epg.client", new_callable=AsyncMock)
    @patch("routes.guide_epg.EPG_CACHE_FILE")
    @patch("routes.guide_epg.parse_xmltv")
    async def test_load_epg_disk_cache_corrupted(self, mock_parse, mock_cache_file, mock_client):
        """When disk cache is corrupted, log warning and fall through to HTTP fetch."""
        from routes.guide_epg import load_epg
        from routes.guide_epg import log as epg_log
        from state import epg_cache

        old_data = {"old": "stale"}
        epg_cache["data"] = old_data
        epg_cache["fetched"] = time.time() - 99999

        mock_cache_file.exists.return_value = True
        mock_cache_file.read_text.return_value = "not valid json{{{"

        # HTTP fetch succeeds
        mock_response = MagicMock()
        mock_response.text = "<tv></tv>"
        mock_response.raise_for_status = MagicMock()
        mock_client.get.return_value = mock_response

        # parse_xmltv returns empty structure
        mock_parse.return_value = {"channels": [], "programmes": []}

        with patch.object(epg_log, "warning") as mock_warn:
            result = await load_epg()

        mock_warn.assert_called_once()
        assert "corrupted" in mock_warn.call_args[0][0].lower()
        assert result == {"channels": [], "programmes": []}
        mock_client.get.assert_called_once()

    @patch("routes.guide_epg.client", new_callable=AsyncMock)
    @patch("routes.guide_epg.EPG_CACHE_FILE")
    @patch("routes.guide_epg.parse_xmltv")
    async def test_load_epg_http_fetch_success(self, mock_parse, mock_cache_file, mock_client):
        """Successful HTTP fetch parses XMLTV, saves to disk, invalidates guide cache."""
        from routes.guide_epg import load_epg
        from state import _guide_cache, epg_cache

        epg_cache["data"] = None
        epg_cache["fetched"] = 0
        mock_cache_file.exists.return_value = False

        mock_response = MagicMock()
        mock_response.text = '<?xml version="1.0"?><tv><channel id="C1"><display-name>Chan1</display-name></channel></tv>'
        mock_response.raise_for_status = MagicMock()
        mock_client.get.return_value = mock_response

        mock_parse.return_value = {
            "channels": [{"id": "C1", "name": "Chan1", "icon": ""}],
            "programmes": [],
        }

        result = await load_epg()

        assert len(result["channels"]) == 1
        assert epg_cache["data"] is not None
        # Guide cache should be invalidated
        assert _guide_cache["channel_groups"] is None
        # Should have saved to disk
        mock_cache_file.write_text.assert_called_once()

    @patch("routes.guide_epg.client", new_callable=AsyncMock)
    @patch("routes.guide_epg.EPG_CACHE_FILE")
    @patch("routes.guide_epg.parse_xmltv")
    async def test_load_epg_http_fetch_fails_with_stale_fallback(self, mock_parse, mock_cache_file, mock_client):
        """When HTTP fetch fails but stale cache exists, return stale cache."""
        from routes.guide_epg import load_epg
        from state import epg_cache

        stale_data = {"programmes": ["stale"], "channels": []}
        epg_cache["data"] = stale_data
        epg_cache["fetched"] = time.time() - 99999

        mock_cache_file.exists.return_value = False
        mock_client.get.side_effect = httpx.ConnectError("Connection refused")

        result = await load_epg()

        assert result == stale_data

    @patch("routes.guide_epg.client", new_callable=AsyncMock)
    @patch("routes.guide_epg.EPG_CACHE_FILE")
    @patch("routes.guide_epg.parse_xmltv")
    async def test_load_epg_http_fetch_fails_no_fallback(self, mock_parse, mock_cache_file, mock_client):
        """When HTTP fetch fails and no cache exists, return empty structure."""
        from routes.guide_epg import load_epg
        from state import epg_cache

        epg_cache["data"] = None
        epg_cache["fetched"] = 0

        mock_cache_file.exists.return_value = False
        mock_client.get.side_effect = httpx.ConnectError("Network error")

        result = await load_epg()

        assert result == {"channels": [], "programmes": []}

    @patch("routes.guide_epg.client", new_callable=AsyncMock)
    @patch("routes.guide_epg.EPG_CACHE_FILE")
    @patch("routes.guide_epg.parse_xmltv")
    async def test_load_epg_disk_cache_expired(self, mock_parse, mock_cache_file, mock_client):
        """When disk cache exists but is expired, fall through to HTTP fetch."""
        from routes.guide_epg import load_epg
        from state import epg_cache

        epg_cache["data"] = None
        epg_cache["fetched"] = 0

        old_time = time.time() - 99999
        cache_payload = {"data": {"programmes": ["old"]}, "fetched": old_time}
        mock_cache_file.exists.return_value = True
        mock_cache_file.read_text.return_value = json.dumps(cache_payload)

        mock_response = MagicMock()
        mock_response.text = "<tv></tv>"
        mock_response.raise_for_status = MagicMock()
        mock_client.get.return_value = mock_response
        mock_parse.return_value = {"channels": [], "programmes": []}

        result = await load_epg()

        assert result == {"channels": [], "programmes": []}


# ── load_epg_background ─────────────────────────────────────────────────

class TestLoadEpgBackground:
    """load_epg_background(): background refresh task management."""

    @patch("routes.guide_epg.load_epg")
    async def test_load_epg_background_fresh_data(self, mock_load_epg):
        """When data is fresh, return it and don't create background task."""
        from routes.guide_epg import load_epg_background
        from state import _epg_refresh_task, epg_cache

        now = time.time()
        epg_cache["data"] = {"channels": [], "programmes": []}
        epg_cache["fetched"] = now

        # Stop any existing refresh task so we can observe no new task
        if _epg_refresh_task is not None and not _epg_refresh_task.done():
            _epg_refresh_task.cancel()

        result = await load_epg_background()

        assert result == epg_cache["data"]
        mock_load_epg.assert_not_called()

    @patch("routes.guide_epg.load_epg")
    async def test_load_epg_background_stale_triggers_refresh(self, mock_load_epg):
        """When data is stale, return stale data immediately and start background refresh."""
        # Ensure clean state — force None so condition triggers
        import routes.guide_epg as _ge
        from routes.guide_epg import load_epg_background
        from state import epg_cache
        _ge._epg_refresh_task = None

        old_time = time.time() - 99999
        stale_data = {"channels": [], "programmes": ["stale"]}
        epg_cache["data"] = stale_data
        epg_cache["fetched"] = old_time

        result = await load_epg_background()

        assert result == stale_data
        # Should have created a background refresh task
        assert _ge._epg_refresh_task is not None

    @patch("routes.guide_epg.load_epg")
    async def test_load_epg_background_no_data(self, mock_load_epg):
        """When no data cached at all, load synchronously."""
        from routes.guide_epg import load_epg_background
        from state import epg_cache

        epg_cache["data"] = None
        epg_cache["fetched"] = 0

        mock_load_epg.return_value = {"channels": [], "programmes": []}

        result = await load_epg_background()

        mock_load_epg.assert_called_once()
        assert result == {"channels": [], "programmes": []}


# ── _refresh_epg_background ─────────────────────────────────────────────

class TestRefreshEpgBackground:
    """_refresh_epg_background(): wraps load_epg exception-free."""

    @patch("routes.guide_epg.load_epg")
    async def test_refresh_background_success(self, mock_load_epg):
        """Successful refresh just calls load_epg."""
        from routes.guide_epg import _refresh_epg_background

        mock_load_epg.return_value = {"channels": [], "programmes": []}

        await _refresh_epg_background()

        mock_load_epg.assert_called_once()

    @patch("routes.guide_epg.load_epg")
    async def test_refresh_background_exception(self, mock_load_epg):
        """Exception is caught and logged, never raised."""
        from routes.guide_epg import _refresh_epg_background
        from routes.guide_epg import log as epg_log

        mock_load_epg.side_effect = Exception("Refresh failed")

        with patch.object(epg_log, "warning") as mock_warn:
            await _refresh_epg_background()

        mock_warn.assert_called_once()
        assert "Refresh failed" in mock_warn.call_args[0][0]


# ── _build_guide_cache ──────────────────────────────────────────────────

class TestBuildGuideCache:
    """_build_guide_cache(): guide cache building edge cases."""

    @patch("routes.guide_epg.cached_fetch")
    @patch("routes.guide_epg.load_epg_background")
    async def test_build_guide_cache_stream_mapping_success(self, mock_load_bg, mock_cached_fetch):
        """When live_all has valid epg_channel_id mappings, stream_id is correctly populated."""
        from routes.guide_epg import _build_guide_cache

        now = datetime.now(UTC)
        epg_data = {
            "channels": [{"id": "BBC1.uk", "name": "BBC One", "icon": ""}],
            "programmes": [{
                "channel": "BBC1.uk",
                "start": _epg_timestamp(now - timedelta(hours=1)),
                "stop": _epg_timestamp(now + timedelta(hours=1)),
                "title": "Show1",
                "subtitle": "",
                "desc": "A show",
                "category": "",
            }],
        }
        mock_load_bg.return_value = epg_data

        # cached_fetch returns live_all with valid mappings
        mock_cached_fetch.return_value = [
            {"stream_id": 101, "name": "BBC One HD", "epg_channel_id": "BBC1.uk"},
            {"stream_id": 102, "name": "Other Channel", "epg_channel_id": "OTHER.uk"},
        ]

        channel_groups, total = await _build_guide_cache()

        assert total == 1
        assert channel_groups[0]["stream_id"] == 101  # mapped from epg_channel_id

    @patch("routes.guide_epg.cached_fetch")
    @patch("routes.guide_epg.load_epg_background")
    async def test_build_guide_cache_stream_mapping_duplicate_epg_id(self, mock_load_bg, mock_cached_fetch):
        """When multiple streams share the same epg_channel_id, only first mapping is kept."""
        from routes.guide_epg import _build_guide_cache

        now = datetime.now(UTC)
        epg_data = {
            "channels": [{"id": "BBC1.uk", "name": "BBC One", "icon": ""}],
            "programmes": [{
                "channel": "BBC1.uk",
                "start": _epg_timestamp(now - timedelta(hours=1)),
                "stop": _epg_timestamp(now + timedelta(hours=1)),
                "title": "Show1",
                "subtitle": "",
                "desc": "A show",
                "category": "",
            }],
        }
        mock_load_bg.return_value = epg_data

        # Two streams share the same epg_channel_id — first one should win
        mock_cached_fetch.return_value = [
            {"stream_id": 101, "name": "BBC One HD", "epg_channel_id": "BBC1.uk"},
            {"stream_id": 201, "name": "BBC One SD", "epg_channel_id": "BBC1.uk"},
        ]

        channel_groups, total = await _build_guide_cache()

        assert total == 1
        assert channel_groups[0]["stream_id"] == 101  # first mapping wins

    @patch("routes.guide_epg.cached_fetch")
    @patch("routes.guide_epg.load_epg_background")
    async def test_build_guide_cache_stream_mapping_failure(self, mock_load_bg, mock_cached_fetch):
        """When live_all fetch fails, stream_id mapping gracefully degrades."""
        from routes.guide_epg import _build_guide_cache

        now = datetime.now(UTC)
        epg_data = {
            "channels": [{"id": "C1", "name": "Chan1", "icon": ""}],
            "programmes": [{
                "channel": "C1",
                "start": _epg_timestamp(now - timedelta(hours=1)),
                "stop": _epg_timestamp(now + timedelta(hours=1)),
                "title": "Show1",
                "subtitle": "Ep1",
                "desc": "A show",
                "category": "entertainment",
            }],
        }
        mock_load_bg.return_value = epg_data

        # cached_fetch raises exception for stream mapping
        mock_cached_fetch.side_effect = httpx.HTTPError("API unavailable")

        channel_groups, total = await _build_guide_cache()

        assert total == 1
        assert channel_groups[0]["channel_id"] == "C1"
        assert channel_groups[0]["stream_id"] is None  # no mapping
        assert len(channel_groups[0]["programmes"]) == 1

    @patch("routes.guide_epg.cached_fetch")
    @patch("routes.guide_epg.load_epg_background")
    async def test_build_guide_cache_past_cutoff_filtered(self, mock_load_bg, mock_cached_fetch):
        """Programmes ending before cutoff_past should be filtered out."""
        from routes.guide_epg import _build_guide_cache

        now = datetime.now(UTC)
        epg_data = {
            "channels": [{"id": "C1", "name": "Chan1", "icon": ""}],
            "programmes": [
                {
                    "channel": "C1",
                    "start": _epg_timestamp(now - timedelta(hours=5)),
                    "stop": _epg_timestamp(now - timedelta(hours=4)),
                    "title": "Old Show",
                    "subtitle": "",
                    "desc": "Way past",
                    "category": "old",
                },
                {
                    "channel": "C1",
                    "start": _epg_timestamp(now - timedelta(minutes=15)),
                    "stop": _epg_timestamp(now + timedelta(hours=1)),
                    "title": "Current Show",
                    "subtitle": "",
                    "desc": "Now playing",
                    "category": "current",
                },
            ],
        }
        mock_load_bg.return_value = epg_data
        mock_cached_fetch.return_value = []

        channel_groups, total = await _build_guide_cache()

        assert total == 1
        programmes = channel_groups[0]["programmes"]
        assert len(programmes) == 1
        assert programmes[0]["title"] == "Current Show"

    @patch("routes.guide_epg.cached_fetch")
    @patch("routes.guide_epg.load_epg_background")
    async def test_build_guide_cache_future_cutoff_filtered(self, mock_load_bg, mock_cached_fetch):
        """Programmes starting after cutoff_future should be filtered out."""
        from routes.guide_epg import _build_guide_cache

        now = datetime.now(UTC)
        epg_data = {
            "channels": [{"id": "C1", "name": "Chan1", "icon": ""}],
            "programmes": [
                {
                    "channel": "C1",
                    "start": _epg_timestamp(now + timedelta(hours=48)),
                    "stop": _epg_timestamp(now + timedelta(hours=49)),
                    "title": "Far Future Show",
                    "subtitle": "",
                    "desc": "Too far ahead",
                    "category": "future",
                },
                {
                    "channel": "C1",
                    "start": _epg_timestamp(now - timedelta(minutes=15)),
                    "stop": _epg_timestamp(now + timedelta(hours=2)),
                    "title": "Near Show",
                    "subtitle": "",
                    "desc": "Now playing",
                    "category": "current",
                },
            ],
        }
        mock_load_bg.return_value = epg_data
        mock_cached_fetch.return_value = []

        channel_groups, total = await _build_guide_cache()

        assert total == 1
        programmes = channel_groups[0]["programmes"]
        assert len(programmes) == 1
        assert programmes[0]["title"] == "Near Show"

    @patch("routes.guide_epg.cached_fetch")
    @patch("routes.guide_epg.load_epg_background")
    async def test_build_guide_cache_malformed_programme(self, mock_load_bg, mock_cached_fetch):
        """Programmes with malformed timestamps are skipped."""
        from routes.guide_epg import _build_guide_cache

        now = datetime.now(UTC)
        epg_data = {
            "channels": [{"id": "C1", "name": "Chan1", "icon": ""}],
            "programmes": [
                {
                    "channel": "C1",
                    "start": "invalid_timestamp",
                    "stop": "also_invalid",
                    "title": "Broken",
                    "subtitle": "",
                    "desc": "Bad timestamps",
                    "category": "",
                },
                {
                    "channel": "C1",
                    "start": _epg_timestamp(now - timedelta(minutes=15)),
                    "stop": _epg_timestamp(now + timedelta(hours=1)),
                    "title": "Good Show",
                    "subtitle": "",
                    "desc": "Valid",
                    "category": "current",
                },
            ],
        }
        mock_load_bg.return_value = epg_data
        mock_cached_fetch.return_value = []

        channel_groups, total = await _build_guide_cache()

        assert total == 1
        programmes = channel_groups[0]["programmes"]
        assert len(programmes) == 1
        assert programmes[0]["title"] == "Good Show"

    @patch("routes.guide_epg.cached_fetch")
    @patch("routes.guide_epg.load_epg_background")
    async def test_build_guide_cache_empty_epg(self, mock_load_bg, mock_cached_fetch):
        """Empty EPG data returns empty groups, not a crash."""
        from routes.guide_epg import _build_guide_cache

        mock_load_bg.return_value = {"channels": [], "programmes": []}
        mock_cached_fetch.return_value = []

        channel_groups, total = await _build_guide_cache()

        assert total == 0
        assert channel_groups == []

    @patch("routes.guide_epg.cached_fetch")
    @patch("routes.guide_epg.load_epg_background")
    async def test_build_guide_cache_multiple_channels(self, mock_load_bg, mock_cached_fetch):
        """Multiple channels are sorted alphabetically."""
        from routes.guide_epg import _build_guide_cache

        now = datetime.now(UTC)
        epg_data = {
            "channels": [
                {"id": "Z.ch", "name": "Z Channel", "icon": ""},
                {"id": "A.ch", "name": "A Channel", "icon": ""},
            ],
            "programmes": [
                {
                    "channel": "Z.ch",
                    "start": _epg_timestamp(now - timedelta(minutes=15)),
                    "stop": _epg_timestamp(now + timedelta(hours=1)),
                    "title": "Z Show",
                    "subtitle": "",
                    "desc": "Last",
                    "category": "",
                },
                {
                    "channel": "A.ch",
                    "start": _epg_timestamp(now - timedelta(minutes=15)),
                    "stop": _epg_timestamp(now + timedelta(hours=1)),
                    "title": "A Show",
                    "subtitle": "",
                    "desc": "First",
                    "category": "",
                },
            ],
        }
        mock_load_bg.return_value = epg_data
        mock_cached_fetch.return_value = []

        channel_groups, total = await _build_guide_cache()

        assert total == 2
        assert channel_groups[0]["channel_id"] == "A.ch"
        assert channel_groups[1]["channel_id"] == "Z.ch"


# ── _epg_broadcast_loop ──────────────────────────────────────────────────

class TestEpgBroadcastLoop:
    """_epg_broadcast_loop(): SSE broadcast loop (tested via single iteration)."""

    @patch("routes.guide_epg.load_epg")
    @patch("routes.guide_epg.asyncio.sleep")
    async def test_broadcast_loop_notifies_clients(self, mock_sleep, mock_load_epg):
        """One iteration: refreshes EPG and notifies all connected clients."""
        from routes.guide_epg import _epg_broadcast_loop
        from state import _epg_clients

        mock_sleep.side_effect = [None, asyncio.CancelledError()]

        q1 = asyncio.Queue(maxsize=8)
        q2 = asyncio.Queue(maxsize=8)
        _epg_clients.append(q1)
        _epg_clients.append(q2)

        mock_load_epg.return_value = {"channels": [], "programmes": []}

        with pytest.raises(asyncio.CancelledError):
            await _epg_broadcast_loop()

        # Both queues should have received "update"
        msg1 = await asyncio.wait_for(q1.get(), timeout=1.0)
        msg2 = await asyncio.wait_for(q2.get(), timeout=1.0)
        assert msg1 == "update"
        assert msg2 == "update"

    @patch("routes.guide_epg.load_epg")
    @patch("routes.guide_epg.asyncio.sleep")
    async def test_broadcast_loop_handles_queue_full(self, mock_sleep, mock_load_epg):
        """When a client queue is full, it's removed and remaining clients still notified."""
        from routes.guide_epg import _epg_broadcast_loop
        from state import _epg_clients

        mock_sleep.side_effect = [None, asyncio.CancelledError()]

        # Create a full queue (maxsize=1, already has an item)
        full_q = asyncio.Queue(maxsize=1)
        await full_q.put("earlier_item")

        healthy_q = asyncio.Queue(maxsize=8)
        _epg_clients.append(full_q)
        _epg_clients.append(healthy_q)

        mock_load_epg.return_value = {"channels": [], "programmes": []}

        with pytest.raises(asyncio.CancelledError):
            await _epg_broadcast_loop()

        # full_q should have been removed
        assert full_q not in _epg_clients
        # healthy_q should have received the update
        msg = await asyncio.wait_for(healthy_q.get(), timeout=1.0)
        assert msg == "update"

    @patch("routes.guide_epg.load_epg")
    @patch("routes.guide_epg.asyncio.sleep")
    async def test_broadcast_loop_catches_exceptions(self, mock_sleep, mock_load_epg):
        """Exceptions during broadcast are caught and logged."""
        from routes.guide_epg import _epg_broadcast_loop
        from routes.guide_epg import log as epg_log

        mock_sleep.side_effect = [None, asyncio.CancelledError()]
        mock_load_epg.side_effect = RuntimeError("EPG refresh error")

        with patch.object(epg_log, "error") as mock_err:
            with pytest.raises(asyncio.CancelledError):
                await _epg_broadcast_loop()

        mock_err.assert_called_once()
        assert "EPG refresh error" in mock_err.call_args[0][0]
