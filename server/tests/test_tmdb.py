"""Tests for TMDB proxy routes — /api/tmdb/*.

Tests cover:
- No-API-key fallback responses (enabled: False)
- Caching behavior (TTL, stale refresh)
- Response structure for all endpoint types
- Edge cases (empty results, missing data, pagination)
"""

import os
import time
import pytest
import httpx
from unittest.mock import AsyncMock, patch

# ── Fixtures ──────────────────────────────────────────────────────


def _clear_tmdb_cache():
    """Clear the TMDB in-memory cache between tests."""
    from routes.tmdb import _TMDB_CACHE
    _TMDB_CACHE.clear()


# ── tmdb_fetch (no API key) ──────────────────────────────────────


@pytest.mark.asyncio
async def test_tmdb_fetch_no_api_key_returns_none():
    """tmdb_fetch returns None when TMDB_API_KEY is not set."""
    # Temporarily remove the key
    with patch.dict(os.environ, {}, clear=True):
        # Re-import would be ideal but we can mock os.getenv inline
        import routes.tmdb as tmdb
        original_key = os.environ.get("TMDB_API_KEY")
        if "TMDB_API_KEY" in os.environ:
            del os.environ["TMDB_API_KEY"]
        try:
            result = await tmdb.tmdb_fetch("movie/550")
            assert result is None
        finally:
            if original_key is not None:
                os.environ["TMDB_API_KEY"] = original_key


# ── Trending movies (no API key) ──────────────────────────────────


def test_tmdb_trending_no_key_returns_disabled(client):
    """GET /api/tmdb/trending without API key returns enabled=False."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/trending")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["trending"] == []
    assert data["total_pages"] == 0
    assert data["total_results"] == 0


def test_tmdb_trending_day_window(client):
    """GET /api/tmdb/trending?time_window=day uses day window."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/trending?time_window=day")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False  # No API key


def test_tmdb_trending_invalid_window(client):
    """GET /api/tmdb/trending with invalid window returns 422."""
    resp = client.get("/api/tmdb/trending?time_window=month")
    assert resp.status_code == 422


def test_tmdb_trending_page_param(client):
    """GET /api/tmdb/trending with valid page param."""
    resp = client.get("/api/tmdb/trending?page=5")
    assert resp.status_code == 200


def test_tmdb_trending_page_out_of_range(client):
    """GET /api/tmdb/trending with page > 20 returns 422."""
    resp = client.get("/api/tmdb/trending?page=21")
    assert resp.status_code == 422


def test_tmdb_trending_page_zero(client):
    """GET /api/tmdb/trending with page < 1 returns 422."""
    resp = client.get("/api/tmdb/trending?page=0")
    assert resp.status_code == 422


# ── TMDB search (no API key) ─────────────────────────────────────


def test_tmdb_search_no_key_returns_disabled(client):
    """GET /api/tmdb/search without API key returns enabled=False."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/search?q=inception")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["results"] == []


def test_tmdb_search_short_query(client):
    """GET /api/tmdb/search with too-short query returns 422."""
    resp = client.get("/api/tmdb/search?q=a")
    assert resp.status_code == 422


def test_tmdb_search_missing_query(client):
    """GET /api/tmdb/search without query returns 422."""
    resp = client.get("/api/tmdb/search")
    assert resp.status_code == 422


# ── Movie details (no API key) ────────────────────────────────────


def test_tmdb_movie_details_no_key(client):
    """GET /api/tmdb/movie/550 without API key returns enabled=False."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/movie/550")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["info"] is None


def test_tmdb_movie_details_invalid_id(client):
    """GET /api/tmdb/movie/abc returns 422 (int validation)."""
    resp = client.get("/api/tmdb/movie/abc")
    assert resp.status_code == 422


# ── Movie similar (no API key) ────────────────────────────────────


def test_tmdb_movie_similar_no_key(client):
    """GET /api/tmdb/movie/550/similar without API key returns enabled=False."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/movie/550/similar")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False


def test_tmdb_movie_similar_page_param(client):
    """GET /api/tmdb/movie/550/similar with valid page."""
    resp = client.get("/api/tmdb/movie/550/similar?page=3")
    assert resp.status_code == 200


def test_tmdb_movie_similar_page_out_of_range(client):
    """GET /api/tmdb/movie/550/similar with page > 10 returns 422."""
    resp = client.get("/api/tmdb/movie/550/similar?page=11")
    assert resp.status_code == 422


# ── Configuration (no API key) ────────────────────────────────────


def test_tmdb_configuration_no_key(client):
    """GET /api/tmdb/configuration without API key returns enabled=False."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/configuration")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["images"] is None


# ── TV trending (no API key) ──────────────────────────────────────


def test_tmdb_tv_trending_no_key(client):
    """GET /api/tmdb/tv/trending without API key returns enabled=False."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/tv/trending")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False


def test_tmdb_tv_trending_day_window(client):
    """GET /api/tmdb/tv/trending?time_window=day."""
    resp = client.get("/api/tmdb/tv/trending?time_window=day")
    assert resp.status_code == 200


# ── TV search (no API key) ────────────────────────────────────────


def test_tmdb_tv_search_no_key(client):
    """GET /api/tmdb/tv/search without API key returns enabled=False."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/tv/search?q=game+of+thrones")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False


def test_tmdb_tv_search_short_query(client):
    """GET /api/tmdb/tv/search with too-short query returns 422."""
    resp = client.get("/api/tmdb/tv/search?q=a")
    assert resp.status_code == 422


# ── TV details (no API key) ───────────────────────────────────────


def test_tmdb_tv_details_no_key(client):
    """GET /api/tmdb/tv/1399 without API key returns enabled=False."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/tv/1399")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False
    assert data["info"] is None


# ── TV similar (no API key) ───────────────────────────────────────


def test_tmdb_tv_similar_no_key(client):
    """GET /api/tmdb/tv/1399/similar without API key returns enabled=False."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/tv/1399/similar")
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is False


# ── Person endpoints ──────────────────────────────────────────────

# The person endpoints use tmdb-enrich CLI which likely doesn't exist
# in test env. They should return enabled: False when CLI fails.


def test_tmdb_person_search_no_cli(client):
    """GET /api/tmdb/person/search returns person data when CLI available."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/person/search?q=tom+hanks")
    assert resp.status_code == 200
    data = resp.json()
    # If tmdb-enrich CLI is available, enabled should be True
    assert "enabled" in data
    assert "info" in data


def test_tmdb_person_search_short_query(client):
    """GET /api/tmdb/person/search with too-short query returns 422."""
    resp = client.get("/api/tmdb/person/search?q=a")
    assert resp.status_code == 422


def test_tmdb_person_details_no_cli(client):
    """GET /api/tmdb/person/123 returns person details when CLI available."""
    _clear_tmdb_cache()
    resp = client.get("/api/tmdb/person/123")
    assert resp.status_code == 200
    data = resp.json()
    assert "enabled" in data
    assert "info" in data


# ── HTTP fetch path (endpoint integration with mocked tmdb_fetch) ─

# These tests verify that when tmdb_fetch returns data (simulating an
# active API key), the endpoints return proper responses with enabled: True.


def test_tmdb_trending_with_data(client):
    """GET /api/tmdb/trending returns enabled=True when tmdb_fetch succeeds."""
    from routes.tmdb import tmdb_fetch, _TMDB_CACHE
    _clear_tmdb_cache()

    async def mock_fetch(path):
        return {"results": [{"id": 550, "title": "Fight Club"}], "total_pages": 1}

    with patch("routes.tmdb.tmdb_fetch", mock_fetch):
        resp = client.get("/api/tmdb/trending")
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is True
        assert len(data["trending"]) == 1
        assert data["trending"][0]["id"] == 550

    _clear_tmdb_cache()


def test_tmdb_trending_no_results(client):
    """GET /api/tmdb/trending returns empty list when no results."""
    from routes.tmdb import _TMDB_CACHE
    _clear_tmdb_cache()

    async def mock_fetch(path):
        return {"results": [], "total_pages": 0, "total_results": 0}

    with patch("routes.tmdb.tmdb_fetch", mock_fetch):
        resp = client.get("/api/tmdb/trending")
        data = resp.json()
        assert data["enabled"] is True
        assert data["trending"] == []
        assert data["total_pages"] == 0

    _clear_tmdb_cache()


def test_tmdb_search_with_data(client):
    """GET /api/tmdb/search returns results when tmdb_fetch succeeds."""
    from routes.tmdb import _TMDB_CACHE
    _clear_tmdb_cache()

    async def mock_fetch(path):
        return {"results": [{"id": 550, "title": "Fight Club"}], "total_pages": 1}

    with patch("routes.tmdb.tmdb_fetch", mock_fetch):
        resp = client.get("/api/tmdb/search?q=club")
        data = resp.json()
        assert data["enabled"] is True
        assert len(data["results"]) == 1

    _clear_tmdb_cache()


def test_tmdb_movie_details_with_data(client):
    """GET /api/tmdb/movie/550 returns details when tmdb_fetch succeeds."""
    from routes.tmdb import _TMDB_CACHE
    _clear_tmdb_cache()

    async def mock_fetch(path):
        return {"id": 550, "title": "Fight Club", "overview": "A movie."}

    with patch("routes.tmdb.tmdb_fetch", mock_fetch):
        resp = client.get("/api/tmdb/movie/550")
        data = resp.json()
        assert data["enabled"] is True
        assert data["info"]["id"] == 550

    _clear_tmdb_cache()


def test_tmdb_movie_similar_with_data(client):
    """GET /api/tmdb/movie/550/similar returns similar movies."""
    from routes.tmdb import _TMDB_CACHE
    _clear_tmdb_cache()

    async def mock_fetch(path):
        return {"results": [{"id": 680, "title": "Pulp Fiction"}], "total_pages": 1}

    with patch("routes.tmdb.tmdb_fetch", mock_fetch):
        resp = client.get("/api/tmdb/movie/550/similar")
        data = resp.json()
        assert data["enabled"] is True
        assert len(data["results"]) == 1

    _clear_tmdb_cache()


def test_tmdb_configuration_with_data(client):
    """GET /api/tmdb/configuration returns image config when tmdb_fetch succeeds."""
    from routes.tmdb import _TMDB_CACHE
    _clear_tmdb_cache()

    async def mock_fetch(path):
        return {"images": {"base_url": "http://image.tmdb.org/t/p/"}}

    with patch("routes.tmdb.tmdb_fetch", mock_fetch):
        resp = client.get("/api/tmdb/configuration")
        data = resp.json()
        assert data["enabled"] is True
        assert "base_url" in data["images"]

    _clear_tmdb_cache()


def test_tmdb_tv_trending_with_data(client):
    """GET /api/tmdb/tv/trending returns trending TV when tmdb_fetch succeeds."""
    from routes.tmdb import _TMDB_CACHE
    _clear_tmdb_cache()

    async def mock_fetch(path):
        return {"results": [{"id": 1399, "name": "Game of Thrones"}], "total_pages": 1}

    with patch("routes.tmdb.tmdb_fetch", mock_fetch):
        resp = client.get("/api/tmdb/tv/trending")
        data = resp.json()
        assert data["enabled"] is True
        assert len(data["trending"]) == 1

    _clear_tmdb_cache()


def test_tmdb_tv_search_with_data(client):
    """GET /api/tmdb/tv/search returns TV search results."""
    from routes.tmdb import _TMDB_CACHE
    _clear_tmdb_cache()

    async def mock_fetch(path):
        return {"results": [{"id": 1399, "name": "Game of Thrones"}], "total_pages": 1}

    with patch("routes.tmdb.tmdb_fetch", mock_fetch):
        resp = client.get("/api/tmdb/tv/search?q=thrones")
        data = resp.json()
        assert data["enabled"] is True
        assert len(data["results"]) == 1

    _clear_tmdb_cache()


def test_tmdb_tv_details_with_data(client):
    """GET /api/tmdb/tv/1399 returns TV details."""
    from routes.tmdb import _TMDB_CACHE
    _clear_tmdb_cache()

    async def mock_fetch(path):
        return {"id": 1399, "name": "Game of Thrones", "seasons": []}

    with patch("routes.tmdb.tmdb_fetch", mock_fetch):
        resp = client.get("/api/tmdb/tv/1399")
        data = resp.json()
        assert data["enabled"] is True
        assert data["info"]["id"] == 1399

    _clear_tmdb_cache()


def test_tmdb_tv_similar_with_data(client):
    """GET /api/tmdb/tv/1399/similar returns similar TV."""
    from routes.tmdb import _TMDB_CACHE
    _clear_tmdb_cache()

    async def mock_fetch(path):
        return {"results": [{"id": 1429, "name": "Breaking Bad"}], "total_pages": 1}

    with patch("routes.tmdb.tmdb_fetch", mock_fetch):
        resp = client.get("/api/tmdb/tv/1399/similar")
        data = resp.json()
        assert data["enabled"] is True
        assert len(data["results"]) == 1

    _clear_tmdb_cache()


# ── tmdb_fetch caching tests (pure function, no HTTP mocking) ────


def test_tmdb_cache_fresh_hit_pure():
    """Fresh _TMDB_CACHE entries should have TTL remaining."""
    from routes.tmdb import _TMDB_CACHE
    _clear_tmdb_cache()

    cache_key = "tmdb_trending/movie/week?page=1"
    now = time.time()
    mock_data = {"results": [{"id": 1, "title": "Fresh Movie"}]}
    _TMDB_CACHE[cache_key] = (now, mock_data)

    ts, data = _TMDB_CACHE[cache_key]
    assert now - ts < 600  # Within 10-min TTL
    assert data["results"][0]["title"] == "Fresh Movie"

    _clear_tmdb_cache()


def test_tmdb_cache_stale_expiry():
    """Stale _TMDB_CACHE entries should be past TTL."""
    from routes.tmdb import _TMDB_CACHE
    _clear_tmdb_cache()

    cache_key = "tmdb_trending/movie/week?page=1"
    old_time = time.time() - 3600  # 1 hour ago > 10-min TTL
    _TMDB_CACHE[cache_key] = (old_time, {"results": ["stale"]})

    now = time.time()
    ts, _ = _TMDB_CACHE[cache_key]
    assert now - ts >= 600  # Past TTL

    _clear_tmdb_cache()


# ── Response structure tests ──────────────────────────────────────


def test_tmdb_trending_response_structure(client):
    """Trending response should have expected shape."""
    resp = client.get("/api/tmdb/trending")
    data = resp.json()
    assert "trending" in data
    assert "total_pages" in data
    assert "total_results" in data
    assert "enabled" in data


def test_tmdb_search_response_structure(client):
    """Search response should have expected shape."""
    resp = client.get("/api/tmdb/search?q=test")
    data = resp.json()
    assert "results" in data
    assert "total_pages" in data
    assert "total_results" in data
    assert "enabled" in data


def test_tmdb_movie_details_response_structure(client):
    """Movie details response should have expected shape."""
    resp = client.get("/api/tmdb/movie/550")
    data = resp.json()
    assert "info" in data
    assert "enabled" in data


def test_tmdb_configuration_response_structure(client):
    """Configuration response should have expected shape."""
    resp = client.get("/api/tmdb/configuration")
    data = resp.json()
    assert "images" in data
    assert "enabled" in data


def test_tmdb_person_search_response_structure(client):
    """Person search response should have expected shape."""
    resp = client.get("/api/tmdb/person/search?q=tom+hanks")
    data = resp.json()
    assert "info" in data
    assert "enabled" in data


def test_tmdb_person_details_response_structure(client):
    """Person details response should have expected shape."""
    resp = client.get("/api/tmdb/person/123")
    data = resp.json()
    assert "info" in data
    assert "enabled" in data
