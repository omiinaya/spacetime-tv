"""Tests for VOD routes — movies, series, download.

Relies on the client fixture (mocked cached_fetch → []) and the
client_with_cache fixture (real cached_fetch) from conftest.py.
"""
import time


# ── Movies: /api/movies/categories ────────────────────────────────
# (basic test lives in test_categories.py; here we confirm structure)


def test_movies_categories_empty_when_cache_empty(client):
    """/api/movies/categories should return empty list when cache is cold."""
    resp = client.get("/api/movies/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert "categories" in data
    assert isinstance(data["categories"], list)


def test_movies_categories_with_cache(client_with_cache):
    """Should return cached VOD categories."""
    from main import _cache

    test_cats = [
        {"category_id": 10, "category_name": "EN - Action", "parent_id": 0},
        {"category_id": 20, "category_name": "EN - Comedy", "parent_id": 0},
    ]
    _cache["vod_categories"] = (time.time() + 3600, test_cats)

    resp = client_with_cache.get("/api/movies/categories")
    assert resp.status_code == 200
    data = resp.json()["categories"]
    assert len(data) == 2
    names = [c["category_name"] for c in data]
    assert "EN - Action" in names
    assert "EN - Comedy" in names


# ── Movies: /api/movies/{stream_id} ───────────────────────────────


def test_movie_details_empty_when_cache_cold(client):
    """Movie details should return empty info when no cache."""
    resp = client.get("/api/movies/99999")
    assert resp.status_code == 200
    data = resp.json()
    assert "info" in data


def test_movie_details_with_cache(client_with_cache):
    """Movie details should return cached VOD info — inner info dict."""
    from main import _cache

    fake_info = {
        "stream_id": 42,
        "name": "EN - The Matrix (1999)",
        "info": {
            "plot": "A computer hacker learns about the true nature of reality.",
            "genre": ["Action", "Sci-Fi"],
            "rating": "8.7",
        },
    }
    _cache["vod_info_42"] = (time.time() + 3600, fake_info)

    resp = client_with_cache.get("/api/movies/42")
    assert resp.status_code == 200
    data = resp.json()
    # Endpoint unwraps: data.get("info", data) → inner "info" dict
    assert "rating" in data["info"]
    assert data["info"]["rating"] == "8.7"
    assert "plot" in data["info"]


# ── Movies: /api/movies/unified ───────────────────────────────────


def test_movies_unified_empty_when_no_vod_cache(client):
    """Unified movies should return empty when no VOD caches exist."""
    resp = client.get("/api/movies/unified")
    assert resp.status_code == 200
    data = resp.json()
    assert "movies" in data
    assert data["movies"] == []
    assert data["total"] == 0


def test_movies_unified_uses_cached_vod_data(client_with_cache):
    """Unified should merge streams from vod_* caches, grouped by TMDB."""
    from main import _cache

    _cache["vod_10"] = (time.time() + 3600, [
        {"stream_id": 101, "name": "EN - The Matrix (1999)", "tmdb": "tmdb603",
         "container_extension": "mkv"},
    ])
    _cache["vod_20"] = (time.time() + 3600, [
        {"stream_id": 201, "name": "EN - Inception (2010)", "tmdb": "tmdb27205",
         "container_extension": "mp4"},
    ])

    resp = client_with_cache.get("/api/movies/unified?limit=50")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    names = [m["base_name"] for m in data["movies"]]
    assert "The Matrix (1999)" in names
    assert "Inception (2010)" in names


def test_movies_unified_filters_by_query(client_with_cache):
    """Unified should filter by ?q= parameter."""
    from main import _cache

    _cache["vod_10"] = (time.time() + 3600, [
        {"stream_id": 101, "name": "EN - The Matrix (1999)", "tmdb": "tmdb603",
         "container_extension": "mkv"},
        {"stream_id": 102, "name": "EN - Inception (2010)", "tmdb": "tmdb27205",
         "container_extension": "mp4"},
    ])

    resp = client_with_cache.get("/api/movies/unified?q=matrix")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert "Matrix" in data["movies"][0]["base_name"]


def test_movies_unified_groups_languages(client_with_cache):
    """Unified should group multiple language entries under same TMDB."""
    from main import _cache

    _cache["vod_10"] = (time.time() + 3600, [
        {"stream_id": 101, "name": "EN - The Matrix (1999)", "tmdb": "tmdb603",
         "container_extension": "mkv"},
        {"stream_id": 102, "name": "FR - Matrix (1999)", "tmdb": "tmdb603",
         "container_extension": "mkv"},
    ])

    resp = client_with_cache.get("/api/movies/unified")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    movie = data["movies"][0]
    assert movie["language_count"] == 2
    codes = [l["code"] for l in movie["languages"]]
    # EN should come first (sorted by code, EN before FR)
    assert codes[0] == "EN"


# ── Series: /api/series/categories ─────────────────────────────────


def test_series_categories_empty_when_cache_empty(client):
    """/api/series/categories should return empty list when cache is cold."""
    resp = client.get("/api/series/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert "categories" in data


def test_series_categories_with_cache(client_with_cache):
    """Should return cached series categories."""
    from main import _cache

    test_cats = [
        {"category_id": 30, "category_name": "EN - Drama", "parent_id": 0},
    ]
    _cache["series_categories"] = (time.time() + 3600, test_cats)

    resp = client_with_cache.get("/api/series/categories")
    assert resp.status_code == 200
    data = resp.json()["categories"]
    assert len(data) == 1
    assert data[0]["category_name"] == "EN - Drama"


# ── Series: /api/series ───────────────────────────────────────────


def test_series_requires_category(client):
    """/api/series requires category_id param."""
    resp = client.get("/api/series")
    assert resp.status_code == 422


def test_series_returns_paginated(client):
    """Series endpoint should return paginated results."""
    resp = client.get("/api/series?category_id=30")
    assert resp.status_code == 200
    data = resp.json()
    assert "series" in data
    assert "total" in data
    assert "offset" in data
    assert "limit" in data


def test_series_with_cached_data(client_with_cache):
    """Series should return cached series data with pagination."""
    from main import _cache

    series_list = [{"id": i, "name": f"Series {i}"} for i in range(1, 11)]
    _cache["series_30"] = (time.time() + 3600, series_list)

    resp = client_with_cache.get("/api/series?category_id=30&limit=3")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["series"]) == 3
    assert data["total"] == 10


# ── Series: /api/series/{series_id} ───────────────────────────────


def test_series_details_empty_when_cache_cold(client):
    """Series details should return structure even when cache cold."""
    resp = client.get("/api/series/999")
    assert resp.status_code == 200
    data = resp.json()
    assert "info" in data or isinstance(data, dict)


def test_series_details_with_cache(client_with_cache):
    """Series details should return cached info."""
    from main import _cache

    fake_info = {
        "id": 42,
        "name": "Breaking Bad",
        "seasons": 5,
        "episodes": [{"id": 1, "title": "Pilot", "season": 1}],
    }
    _cache["series_info_42"] = (time.time() + 3600, fake_info)

    resp = client_with_cache.get("/api/series/42")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Breaking Bad"
    assert len(data["episodes"]) == 1


# ── Download: /api/download/{media_type}/{stream_id} ──────────────


def test_download_movie_redirects(client):
    """Movie download should redirect to provider URL."""
    resp = client.get("/api/download/movie/123", follow_redirects=False)
    assert resp.status_code == 302  # Redirect
    assert "movie" in resp.headers["location"]
    assert "123" in resp.headers["location"]
    assert ".mkv" in resp.headers["location"]


def test_download_series_redirects(client):
    """Series download should redirect with series path."""
    resp = client.get("/api/download/series/456", follow_redirects=False)
    assert resp.status_code == 302
    assert "series" in resp.headers["location"]
    assert "456" in resp.headers["location"]
    assert ".mkv" in resp.headers["location"]
