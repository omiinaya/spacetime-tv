"""Comprehensive tests for services/search_service.py — enrichment, VOD, series, cache scan, live channels."""

import json
import time
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest

from services.search_service import (
    _SEARCH_ENRICH_CACHE,
    enrich_tmdb_item,
    search_all_vod,
    search_all_series,
    search_from_cache,
    search_live_channels,
)


# ══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════════════════


@pytest.fixture(autouse=True)
def clear_enrich_cache():
    """Clear the module-level TMDB enrichment cache before each test."""
    _SEARCH_ENRICH_CACHE.clear()
    yield


@pytest.fixture
def sample_movie_data():
    """Sample TMDB API response for a movie."""
    return {
        "genres": [{"name": "Action"}, {"name": "Sci-Fi"}],
        "vote_average": 8.5,
        "poster_path": "/poster123.jpg",
        "overview": "A thrilling adventure through space.",
    }


@pytest.fixture
def sample_tv_data():
    """Sample TMDB API response for a TV show."""
    return {
        "genres": [{"name": "Drama"}, {"name": "Mystery"}],
        "vote_average": 9.1,
        "poster_path": "/tvposter456.jpg",
        "overview": "A mysterious drama series.",
    }


@pytest.fixture
def mock_providers():
    """Return two fake enabled provider configs."""
    from config import ProviderConfig

    return [
        ProviderConfig(name="Alpha", base_url="http://alpha.test", username="u1", password="p1", enabled=True, order=0),
        ProviderConfig(name="Beta", base_url="http://beta.test", username="u2", password="p2", enabled=True, order=1),
    ]


@pytest.fixture
def mock_vod_categories():
    """Sample VOD category list."""
    return [
        {"category_id": "1", "category_name": "Action"},
        {"category_id": "2", "category_name": "Comedy"},
    ]


@pytest.fixture
def mock_vod_streams():
    """Sample VOD streams across categories."""
    return [
        {"stream_id": 101, "name": "The Matrix Reloaded", "category_id": "1"},
        {"stream_id": 102, "name": "matrix revisited", "category_id": "1"},
        {"stream_id": 201, "name": "Funny Movie", "category_id": "2"},
        {"stream_id": 202, "name": "Another Comedy", "category_id": "2"},
    ]


@pytest.fixture
def mock_series_categories():
    """Sample series category list."""
    return [
        {"category_id": "10", "category_name": "TV Drama"},
        {"category_id": "20", "category_name": "Reality"},
    ]


@pytest.fixture
def mock_series_list():
    """Sample series list across categories."""
    return [
        {"series_id": 1001, "name": "Breaking Bad", "plot": "A chemistry teacher turns meth chef."},
        {"series_id": 1002, "name": "Better Call Saul", "plot": "A prequel spin-off series."},
        {"series_id": 2001, "name": "Survivor", "plot": "Reality competition series."},
    ]


# ══════════════════════════════════════════════════════════════════════════════
# 1. enrich_tmdb_item — TMDB API path, CLI fallback, caching, errors
# ══════════════════════════════════════════════════════════════════════════════


class TestEnrichTmdbItem:
    """Tests for enrich_tmdb_item()."""

    @patch("services.search_service.TMDB_API_KEY", "fake-key")
    async def test_movie_enrich_with_api_key(self, sample_movie_data):
        """Movie enrichment via TMDB API key returns enriched dict."""
        with patch("routes.tmdb.tmdb_fetch", new_callable=AsyncMock) as mock_tmdb:
            mock_tmdb.return_value = sample_movie_data
            result = await enrich_tmdb_item("movie", "123")
        assert result is not None
        assert result["genres"] == ["Action", "Sci-Fi"]
        assert result["rating"] == 8.5
        assert result["poster"] == "/poster123.jpg"
        assert result["overview"] == "A thrilling adventure through space."
        mock_tmdb.assert_awaited_once_with("movie/123")

    @patch("services.search_service.TMDB_API_KEY", "fake-key")
    async def test_tv_enrich_with_api_key(self, sample_tv_data):
        """TV series enrichment via TMDB API key returns enriched dict."""
        with patch("routes.tmdb.tmdb_fetch", new_callable=AsyncMock) as mock_tmdb:
            mock_tmdb.return_value = sample_tv_data
            result = await enrich_tmdb_item("tv", "456")
        assert result is not None
        assert result["genres"] == ["Drama", "Mystery"]
        assert result["rating"] == 9.1
        assert result["poster"] == "/tvposter456.jpg"
        assert result["overview"] == "A mysterious drama series."
        mock_tmdb.assert_awaited_once_with("tv/456")

    @patch("services.search_service.TMDB_API_KEY", "fake-key")
    async def test_enrich_api_returns_none(self):
        """When tmdb_fetch returns None, enrich returns None."""
        with patch("routes.tmdb.tmdb_fetch", new_callable=AsyncMock) as mock_tmdb:
            mock_tmdb.return_value = None
            result = await enrich_tmdb_item("movie", "999")
        assert result is None
        mock_tmdb.assert_awaited_once_with("movie/999")

    @patch("services.search_service.TMDB_API_KEY", "fake-key")
    async def test_enrich_empty_genres(self):
        """Missing genres are gracefully handled as empty list."""
        with patch("routes.tmdb.tmdb_fetch", new_callable=AsyncMock) as mock_tmdb:
            mock_tmdb.return_value = {"vote_average": 6.0, "poster_path": "/p.jpg", "overview": "No genres."}
            result = await enrich_tmdb_item("movie", "1")
        assert result is not None
        assert result["genres"] == []
        assert result["rating"] == 6.0

    @patch("services.search_service.TMDB_API_KEY", "fake-key")
    async def test_enrich_missing_fields(self):
        """Enrich still returns dict even when TMDB response lacks expected fields."""
        with patch("routes.tmdb.tmdb_fetch", new_callable=AsyncMock) as mock_tmdb:
            mock_tmdb.return_value = {"id": 1}  # truthy dict but missing enrichment fields
            result = await enrich_tmdb_item("movie", "1")
        assert result is not None
        assert result["genres"] == []
        assert result["rating"] is None
        assert result["poster"] is None
        assert result["overview"] is None

    @patch("services.search_service.TMDB_API_KEY", "")
    async def test_enrich_cli_fallback_success(self):
        """When TMDB_API_KEY is empty, falls back to tmdb-enrich CLI."""
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b'{"genres": [{"name":"Action"}], "vote_average": 7.0}', b""))

        with patch("services.search_service._TMDB_ENRICH", "/usr/bin/tmdb-enrich"), patch(
            "asyncio.create_subprocess_exec", new_callable=AsyncMock
        ) as mock_subprocess:
            mock_subprocess.return_value = mock_proc
            result = await enrich_tmdb_item("movie", "789")
        assert result is not None
        assert result["genres"] == ["Action"]
        assert result["rating"] == 7.0
        mock_subprocess.assert_awaited_once()

    @patch("services.search_service.TMDB_API_KEY", "")
    async def test_enrich_cli_returns_nonzero(self):
        """When CLI returns non-zero exit code, enrich returns None."""
        mock_proc = MagicMock()
        mock_proc.returncode = 1
        mock_proc.communicate = AsyncMock(return_value=(b"", b"error"))

        with patch("services.search_service._TMDB_ENRICH", "/usr/bin/tmdb-enrich"), patch(
            "asyncio.create_subprocess_exec", new_callable=AsyncMock
        ) as mock_subprocess:
            mock_subprocess.return_value = mock_proc
            result = await enrich_tmdb_item("movie", "789")
        assert result is None

    @patch("services.search_service.TMDB_API_KEY", "")
    async def test_enrich_cli_invalid_json(self):
        """When CLI returns invalid JSON, enrich returns None."""
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"not json", b""))

        with patch("services.search_service._TMDB_ENRICH", "/usr/bin/tmdb-enrich"), patch(
            "asyncio.create_subprocess_exec", new_callable=AsyncMock
        ) as mock_subprocess:
            mock_subprocess.return_value = mock_proc
            result = await enrich_tmdb_item("movie", "789")
        assert result is None

    @patch("services.search_service.TMDB_API_KEY", "")
    async def test_enrich_cli_timeout(self):
        """When CLI times out, enrich returns None."""
        with patch("services.search_service._TMDB_ENRICH", "/usr/bin/tmdb-enrich"), patch(
            "asyncio.create_subprocess_exec", new_callable=AsyncMock
        ) as mock_subprocess:
            mock_subprocess.side_effect = TimeoutError("timed out")
            result = await enrich_tmdb_item("movie", "789")
        assert result is None

    @patch("services.search_service.TMDB_API_KEY", "")
    async def test_enrich_cli_not_found(self):
        """When CLI binary not found, enrich returns None."""
        with patch("services.search_service._TMDB_ENRICH", "/usr/bin/tmdb-enrich"), patch(
            "asyncio.create_subprocess_exec", new_callable=AsyncMock
        ) as mock_subprocess:
            mock_subprocess.side_effect = FileNotFoundError("not found")
            result = await enrich_tmdb_item("movie", "789")
        assert result is None

    @patch("services.search_service.TMDB_API_KEY", "")
    async def test_enrich_cli_path_empty(self):
        """When _TMDB_ENRICH is falsy, return None immediately without CLI call."""
        with patch("services.search_service._TMDB_ENRICH", ""), patch(
            "asyncio.create_subprocess_exec", new_callable=AsyncMock
        ) as mock_subprocess:
            result = await enrich_tmdb_item("movie", "789")
        assert result is None
        mock_subprocess.assert_not_called()

    @patch("services.search_service.TMDB_API_KEY", "fake-key")
    async def test_enrich_caching(self, sample_movie_data):
        """Enrich results are cached for the TTL duration."""
        with patch("routes.tmdb.tmdb_fetch", new_callable=AsyncMock) as mock_tmdb:
            mock_tmdb.return_value = sample_movie_data
            # First call — should fetch
            result1 = await enrich_tmdb_item("movie", "123")
            assert result1 is not None
            assert mock_tmdb.await_count == 1
            # Second call — should use cache
            result2 = await enrich_tmdb_item("movie", "123")
            assert result2 is not None
            assert mock_tmdb.await_count == 1  # not called again

    @patch("services.search_service.TMDB_API_KEY", "fake-key")
    async def test_enrich_cache_expiry(self, sample_movie_data):
        """Expired cache should re-fetch."""
        with patch("routes.tmdb.tmdb_fetch", new_callable=AsyncMock) as mock_tmdb:
            mock_tmdb.return_value = sample_movie_data
            # First call populates cache
            await enrich_tmdb_item("movie", "123")
            # Manually expire the cache entry
            cache_key = "tmdb_enrich_movie_123"
            _SEARCH_ENRICH_CACHE[cache_key] = (time.time() - 1000, _SEARCH_ENRICH_CACHE[cache_key][1])
            # Second call — cache expired, should re-fetch
            await enrich_tmdb_item("movie", "123")
            assert mock_tmdb.await_count == 2

    @patch("services.search_service.TMDB_API_KEY", "fake-key")
    async def test_enrich_cache_none_result(self):
        """When API returns None, None is cached and not re-fetched within TTL."""
        cache_key = "tmdb_enrich_movie_999"
        with patch("routes.tmdb.tmdb_fetch", new_callable=AsyncMock) as mock_tmdb:
            mock_tmdb.return_value = None
            # First call
            result = await enrich_tmdb_item("movie", "999")
            assert result is None
            assert mock_tmdb.await_count == 1
            # Second call within TTL — should not call again
            result = await enrich_tmdb_item("movie", "999")
            assert result is None
            assert mock_tmdb.await_count == 1

    @patch("services.search_service.TMDB_API_KEY", "")
    @patch("services.search_service._TMDB_ENRICH", "")
    async def test_enrich_no_api_key_no_cli(self):
        """When both API key and CLI path are unset, return None."""
        result = await enrich_tmdb_item("movie", "123")
        assert result is None
        # Should be cached as None
        assert "tmdb_enrich_movie_123" in _SEARCH_ENRICH_CACHE
        ts, cached = _SEARCH_ENRICH_CACHE["tmdb_enrich_movie_123"]
        assert cached is None

    @patch("services.search_service.TMDB_API_KEY", "fake-key")
    async def test_enrich_skip_api_for_unknown_type(self):
        """Unknown item_type skips TMDB API and goes to CLI or None."""
        with patch("routes.tmdb.tmdb_fetch", new_callable=AsyncMock) as mock_tmdb:
            with patch("services.search_service._TMDB_ENRICH", ""):
                result = await enrich_tmdb_item("person", "123")
                assert result is None
                mock_tmdb.assert_not_called()


# ══════════════════════════════════════════════════════════════════════════════
# 2. search_all_vod — single, multi, dedup, errors
# ══════════════════════════════════════════════════════════════════════════════


class TestSearchAllVod:
    """Tests for search_all_vod()."""

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_single_provider_low_level(
        self, mock_get_providers, mock_cached_fetch, mock_vod_categories, mock_vod_streams
    ):
        """Single provider path (< 2 providers) uses cached_fetch per category."""
        mock_get_providers.return_value = [
            MagicMock(name="Solo", base_url="http://solo.test", username="u", password="p", enabled=True)
        ]
        # cached_fetch returns categories on first call, streams on subsequent
        mock_cached_fetch.side_effect = [mock_vod_categories, mock_vod_streams]

        results = await search_all_vod("matrix")
        assert len(results) == 2  # both "The Matrix Reloaded" and "matrix revisited"
        assert results[0]["stream_id"] == 101
        assert results[1]["stream_id"] == 102

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_single_provider_no_match(
        self, mock_get_providers, mock_cached_fetch, mock_vod_categories, mock_vod_streams
    ):
        """No match returns empty list."""
        mock_get_providers.return_value = [
            MagicMock(name="Solo", base_url="http://solo.test", username="u", password="p", enabled=True)
        ]
        mock_cached_fetch.side_effect = [mock_vod_categories, mock_vod_streams]

        results = await search_all_vod("nonexistent")
        assert results == []

    @patch("iptv_client.fetch_all_providers", new_callable=AsyncMock)
    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_multi_provider_path(
        self, mock_get_providers, mock_cached_fetch, mock_fetch_all, mock_vod_categories, mock_vod_streams
    ):
        """More than 1 provider uses fetch_all_providers path."""
        mock_get_providers.return_value = [
            MagicMock(name="A", base_url="http://a.test", username="u", password="p", enabled=True),
            MagicMock(name="B", base_url="http://b.test", username="u", password="p", enabled=True),
        ]
        mock_cached_fetch.return_value = mock_vod_categories
        mock_fetch_all.return_value = mock_vod_streams

        results = await search_all_vod("matrix")
        assert len(results) == 2
        mock_fetch_all.assert_called()
        # fetch_all_providers should have been called for each category
        assert mock_fetch_all.await_count == 2

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_specific_provider_path(
        self, mock_get_providers, mock_cached_fetch, mock_vod_categories, mock_vod_streams
    ):
        """provider_idx >= 0 uses _fetch_single_provider path."""
        mock_provider = MagicMock(name="Alpha", base_url="http://a.test", username="u", password="p", enabled=True)
        mock_get_providers.return_value = [mock_provider]
        mock_cached_fetch.return_value = mock_vod_categories

        with patch("iptv_client._fetch_single_provider", new_callable=AsyncMock) as mock_single:
            mock_single.return_value = mock_vod_streams
            results = await search_all_vod("matrix", provider_idx=0)

        assert len(results) == 2
        mock_single.assert_called()
        assert mock_single.await_count == 2  # called for each category

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_dedup_by_stream_id(
        self, mock_get_providers, mock_cached_fetch, mock_vod_categories
    ):
        """Duplicate stream_ids are deduplicated, returning only unique matches."""
        mock_get_providers.return_value = [
            MagicMock(name="Solo", base_url="http://solo.test", username="u", password="p", enabled=True)
        ]
        # Return the same stream in both categories to test dedup
        dup_streams = [
            {"stream_id": 101, "name": "The Matrix", "category_id": "1"},
            {"stream_id": 101, "name": "The Matrix", "category_id": "2"},
        ]
        mock_cached_fetch.side_effect = [mock_vod_categories, dup_streams]

        results = await search_all_vod("matrix")
        assert len(results) == 1  # dedup'd
        assert results[0]["stream_id"] == 101

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_exception_in_stream_fetch_is_skipped(
        self, mock_get_providers, mock_cached_fetch, mock_vod_categories
    ):
        """If a per-category fetch raises, it is skipped (gather with return_exceptions)."""
        mock_get_providers.return_value = [
            MagicMock(name="Solo", base_url="http://solo.test", username="u", password="p", enabled=True)
        ]
        good_streams = [{"stream_id": 201, "name": "The Matrix Two", "category_id": "2"}]
        # categories list, then exception, then good data
        mock_cached_fetch.side_effect = [mock_vod_categories, ValueError("fail"), good_streams]

        results = await search_all_vod("matrix")
        assert len(results) == 1
        assert results[0]["stream_id"] == 201

    @patch("iptv_client.get_enabled_providers")
    async def test_timeout_error_returns_empty(self, mock_get_providers):
        """TimeoutError in VOD search returns []."""
        mock_get_providers.side_effect = TimeoutError("timed out")
        results = await search_all_vod("matrix")
        assert results == []

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_case_insensitive_search(
        self, mock_get_providers, mock_cached_fetch, mock_vod_categories
    ):
        """Query matching is case-insensitive."""
        mock_get_providers.return_value = [
            MagicMock(name="Solo", base_url="http://solo.test", username="u", password="p", enabled=True)
        ]
        streams = [
            {"stream_id": 101, "name": "The MATRIX Reloaded"},
        ]
        mock_cached_fetch.side_effect = [mock_vod_categories, streams]

        results = await search_all_vod("matrix")
        assert len(results) == 1
        # Case insensitivity is already proven: lowercase query "matrix" matched
        # uppercase name "The MATRIX Reloaded"


# ══════════════════════════════════════════════════════════════════════════════
# 3. search_all_series — single, multi, errors
# ══════════════════════════════════════════════════════════════════════════════


class TestSearchAllSeries:
    """Tests for search_all_series()."""

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_single_provider_low_level(
        self, mock_get_providers, mock_cached_fetch, mock_series_categories, mock_series_list
    ):
        """Single provider path (< 2 providers) uses cached_fetch per category."""
        mock_get_providers.return_value = [
            MagicMock(name="Solo", base_url="http://solo.test", username="u", password="p", enabled=True)
        ]
        mock_cached_fetch.side_effect = [mock_series_categories, mock_series_list]

        results = await search_all_series("breaking")
        assert len(results) == 1
        assert results[0]["series_id"] == 1001

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_single_provider_search_in_name_and_plot(
        self, mock_get_providers, mock_cached_fetch, mock_series_categories, mock_series_list
    ):
        """Series search checks both name and plot fields."""
        mock_get_providers.return_value = [
            MagicMock(name="Solo", base_url="http://solo.test", username="u", password="p", enabled=True)
        ]
        mock_cached_fetch.side_effect = [mock_series_categories, mock_series_list]

        # Search by plot keyword
        results = await search_all_series("chef")
        assert len(results) == 1
        assert results[0]["series_id"] == 1001

        # Search by plot keyword in a different series
        mock_cached_fetch.side_effect = [mock_series_categories, mock_series_list]
        results2 = await search_all_series("prequel")
        assert len(results2) == 1
        assert results2[0]["series_id"] == 1002

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_single_provider_no_match(
        self, mock_get_providers, mock_cached_fetch, mock_series_categories, mock_series_list
    ):
        """No match returns empty list."""
        mock_get_providers.return_value = [
            MagicMock(name="Solo", base_url="http://solo.test", username="u", password="p", enabled=True)
        ]
        mock_cached_fetch.side_effect = [mock_series_categories, mock_series_list]

        results = await search_all_series("nonexistent")
        assert results == []

    @patch("iptv_client.fetch_all_providers", new_callable=AsyncMock)
    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_multi_provider_path(
        self, mock_get_providers, mock_cached_fetch, mock_fetch_all, mock_series_categories, mock_series_list
    ):
        """More than 1 provider uses fetch_all_providers path."""
        mock_get_providers.return_value = [
            MagicMock(name="A", base_url="http://a.test", username="u", password="p", enabled=True),
            MagicMock(name="B", base_url="http://b.test", username="u", password="p", enabled=True),
        ]
        mock_cached_fetch.return_value = mock_series_categories
        mock_fetch_all.return_value = mock_series_list

        results = await search_all_series("breaking")
        assert len(results) == 1
        assert mock_fetch_all.await_count == 2  # per category

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_specific_provider_path(
        self, mock_get_providers, mock_cached_fetch, mock_series_categories, mock_series_list
    ):
        """provider_idx >= 0 uses _fetch_single_provider path."""
        mock_provider = MagicMock(name="Alpha", base_url="http://a.test", username="u", password="p", enabled=True)
        mock_get_providers.return_value = [mock_provider]
        mock_cached_fetch.return_value = mock_series_categories

        with patch("iptv_client._fetch_single_provider", new_callable=AsyncMock) as mock_single:
            mock_single.return_value = mock_series_list
            results = await search_all_series("breaking", provider_idx=0)

        assert len(results) == 1
        assert mock_single.await_count == 2

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_dedup_by_series_id(
        self, mock_get_providers, mock_cached_fetch, mock_series_categories
    ):
        """Duplicate series_ids across categories are deduplicated."""
        mock_get_providers.return_value = [
            MagicMock(name="Solo", base_url="http://solo.test", username="u", password="p", enabled=True)
        ]
        # Duplicate series_id in different categories — dedup should work
        cat1_series = [
            {"series_id": 1001, "name": "Breaking Bad", "plot": "Chem teacher."},
        ]
        cat2_series = [
            {"series_id": 1001, "name": "Breaking Bad", "plot": "Chem teacher."},  # duplicate from cat2
        ]
        mock_cached_fetch.side_effect = [mock_series_categories, cat1_series, cat2_series]

        results = await search_all_series("breaking")
        assert len(results) == 1
        assert results[0]["series_id"] == 1001

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_exception_in_fetch_skipped(
        self, mock_get_providers, mock_cached_fetch, mock_series_categories
    ):
        """Exceptions in per-category fetches are skipped."""
        mock_get_providers.return_value = [
            MagicMock(name="Solo", base_url="http://solo.test", username="u", password="p", enabled=True)
        ]
        good = [{"series_id": 2001, "name": "Survivor", "plot": "Reality show."}]
        mock_cached_fetch.side_effect = [mock_series_categories, RuntimeError("fail"), good]

        results = await search_all_series("survivor")
        assert len(results) == 1
        assert results[0]["series_id"] == 2001

    @patch("iptv_client.get_enabled_providers")
    async def test_exception_returns_empty(self, mock_get_providers):
        """TimeoutError in series search returns []."""
        mock_get_providers.side_effect = TimeoutError("timed out")
        results = await search_all_series("breaking")
        assert results == []

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    @patch("iptv_client.get_enabled_providers")
    async def test_case_insensitive_name_and_plot(
        self, mock_get_providers, mock_cached_fetch, mock_series_categories
    ):
        """Series search is case-insensitive for both name and plot."""
        mock_get_providers.return_value = [
            MagicMock(name="Solo", base_url="http://solo.test", username="u", password="p", enabled=True)
        ]
        series = [
            {"series_id": 1001, "name": "BREAKING BAD", "plot": "A chemistry teacher."},
        ]
        mock_cached_fetch.side_effect = [mock_series_categories, series]

        results = await search_all_series("breaking")
        assert len(results) == 1
        # Case insensitivity proven: lowercase query "breaking" matched
        # uppercase name "BREAKING BAD"

        mock_cached_fetch.side_effect = [mock_series_categories, series]
        results2 = await search_all_series("CHEMISTRY")
        assert len(results2) == 1
        # Also proven: query "CHEMISTRY" matches lowercase "chemistry" in plot


# ══════════════════════════════════════════════════════════════════════════════
# 4. search_from_cache — prefix filtering, matching, dedup
# ══════════════════════════════════════════════════════════════════════════════


class TestSearchFromCache:
    """Tests for search_from_cache()."""

    def make_cache_entry(self, ts_offset=0, ttl=300):
        """Build a cache dict with one list entry matching 'matrix'."""
        now = time.time()
        return {
            "vod_1": (now - ts_offset, [{"stream_id": 101, "name": "The Matrix"}]),
            "vod_2": (now - ts_offset, [{"stream_id": 102, "name": "Funny Movie"}]),
            "live_all": (now - ts_offset, [{"stream_id": 201, "name": "News Channel"}]),
        }

    async def test_basic_match(self):
        """Matching by name field returns correct items."""
        cache = self.make_cache_entry()
        results = await search_from_cache("matrix", "vod_", "stream_id", ("name",), cache)
        assert len(results) == 1
        assert results[0]["stream_id"] == 101

    async def test_no_match(self):
        """No match returns empty list."""
        cache = self.make_cache_entry()
        results = await search_from_cache("nonexistent", "vod_", "stream_id", ("name",), cache)
        assert results == []

    async def test_prefix_filtering(self):
        """Only cache keys with the given prefix are scanned."""
        cache = self.make_cache_entry()
        results = await search_from_cache("news", "vod_", "stream_id", ("name",), cache)
        # "news" only exists in live_all prefix, not vod_
        assert results == []

    async def test_multiple_name_fields(self):
        """Searching across multiple name fields."""
        cache = {
            "vod_1": (time.time(), [{"stream_id": 101, "name": "Movie", "title": "Matrix Revisited"}]),
        }
        results = await search_from_cache("matrix", "vod_", "stream_id", ("name", "title"), cache)
        assert len(results) == 1
        assert results[0]["stream_id"] == 101

    async def test_dedup_by_id_field(self):
        """Duplicate entries by id_field are deduplicated."""
        cache = {
            "vod_1": (time.time(), [{"stream_id": 101, "name": "The Matrix"}]),
            "vod_2": (time.time(), [{"stream_id": 101, "name": "The Matrix"}]),
        }
        results = await search_from_cache("matrix", "vod_", "stream_id", ("name",), cache)
        assert len(results) == 1

    async def test_empty_list_data_is_skipped(self):
        """Entries with empty list data are skipped."""
        cache = {
            "vod_1": (time.time(), []),
        }
        results = await search_from_cache("anything", "vod_", "stream_id", ("name",), cache)
        assert results == []

    async def test_non_list_data_is_skipped(self):
        """Entries with non-list data (e.g., dict) are skipped."""
        cache = {
            "vod_1": (time.time(), {"stream_id": 101, "name": "The Matrix"}),
        }
        results = await search_from_cache("matrix", "vod_", "stream_id", ("name",), cache)
        assert results == []

    async def test_missing_id_field_is_skipped(self):
        """Entries without the id_field are skipped."""
        cache = {
            "vod_1": (time.time(), [{"no_id": 1, "name": "The Matrix"}]),
        }
        results = await search_from_cache("matrix", "vod_", "stream_id", ("name",), cache)
        assert results == []

    async def test_none_id_field_is_skipped(self):
        """Entries with None id_field are skipped."""
        cache = {
            "vod_1": (time.time(), [{"stream_id": None, "name": "The Matrix"}]),
        }
        results = await search_from_cache("matrix", "vod_", "stream_id", ("name",), cache)
        assert results == []

    async def test_default_cache_is_state_cache(self):
        """When cache is None, falls back to state._cache."""
        import state

        state._cache.clear()
        state._cache["vod_1"] = (time.time(), [{"stream_id": 101, "name": "The Matrix"}])
        results = await search_from_cache("matrix", "vod_", "stream_id")
        assert len(results) == 1
        assert results[0]["stream_id"] == 101
        state._cache.clear()

    async def test_multiple_matches(self):
        """Multiple matching items across categories are all returned."""
        cache = {
            "vod_1": (
                time.time(),
                [{"stream_id": 101, "name": "The Matrix"}, {"stream_id": 102, "name": "Matrix Reloaded"}],
            ),
            "vod_2": (time.time(), [{"stream_id": 103, "name": "Matrix Revolutions"}]),
        }
        results = await search_from_cache("matrix", "vod_", "stream_id", ("name",), cache)
        assert len(results) == 3

    async def test_empty_cache(self):
        """Empty cache returns empty list."""
        results = await search_from_cache("matrix", "vod_", "stream_id", ("name",), {})
        assert results == []

    async def test_partial_field_in_name_fields(self):
        """Missing name field doesn't crash — empty string is used in join."""
        cache = {
            "vod_1": (time.time(), [{"stream_id": 101}]),  # no 'name' key
        }
        results = await search_from_cache("any", "vod_", "stream_id", ("name",), cache)
        # name is None, treated as "", join produces "", query not in ""
        assert results == []


# ══════════════════════════════════════════════════════════════════════════════
# 5. search_live_channels — success and error paths
# ══════════════════════════════════════════════════════════════════════════════


class TestSearchLiveChannels:
    """Tests for search_live_channels()."""

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    async def test_returns_matching_channels(self, mock_cached_fetch):
        """Returns channels whose name contains the query (case-insensitive)."""
        mock_cached_fetch.return_value = [
            {"stream_id": 1, "name": "CNN News"},
            {"stream_id": 2, "name": "BBC World"},
            {"stream_id": 3, "name": "Fox News"},
            {"stream_id": 4, "name": "Movie Channel HD"},
        ]
        results = await search_live_channels("news")
        assert len(results) == 2
        ids = {r["stream_id"] for r in results}
        assert ids == {1, 3}

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    async def test_case_insensitive(self, mock_cached_fetch):
        """Channel search is case-insensitive."""
        mock_cached_fetch.return_value = [
            {"stream_id": 1, "name": "CNN NEWS"},
        ]
        results = await search_live_channels("news")
        assert len(results) == 1
        results2 = await search_live_channels("CNN")
        assert len(results2) == 1

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    async def test_no_match(self, mock_cached_fetch):
        """No match returns empty list."""
        mock_cached_fetch.return_value = [
            {"stream_id": 1, "name": "CNN News"},
        ]
        results = await search_live_channels("sports")
        assert results == []

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    async def test_empty_list_on_exception(self, mock_cached_fetch):
        """When cached_fetch raises, returns []."""
        mock_cached_fetch.side_effect = RuntimeError("network error")
        results = await search_live_channels("news")
        assert results == []

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    async def test_exception_in_filter(self, mock_cached_fetch):
        """Even if data contains corrupt items, non-string name handled gracefully."""
        mock_cached_fetch.return_value = [
            {"stream_id": 1, "name": "CNN News"},
            {"stream_id": 2},  # missing name key
            {"stream_id": 3, "name": 123},  # non-string name
        ]
        results = await search_live_channels("news")
        assert len(results) == 1
        assert results[0]["stream_id"] == 1

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    async def test_all_channels_match(self, mock_cached_fetch):
        """Empty query (empty string) matches all channels."""
        mock_cached_fetch.return_value = [
            {"stream_id": 1, "name": "CNN News"},
            {"stream_id": 2, "name": "BBC"},
        ]
        results = await search_live_channels("")
        assert len(results) == 2

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    async def test_timeout_returns_empty(self, mock_cached_fetch):
        """TimeoutError returns empty list."""
        mock_cached_fetch.side_effect = TimeoutError("timed out")
        results = await search_live_channels("news")
        assert results == []

    @patch("services.search_service.cached_fetch", new_callable=AsyncMock)
    async def test_httpexception_returns_empty(self, mock_cached_fetch):
        """HTTPException raises but is caught by broad Exception handler."""
        from fastapi import HTTPException

        mock_cached_fetch.side_effect = HTTPException(502, "bad gateway")
        results = await search_live_channels("news")
        assert results == []
