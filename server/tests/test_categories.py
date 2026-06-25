"""Tests for /api/categories endpoints — uses pre-populated cache to avoid upstream calls."""


def test_live_categories_empty_when_cache_empty(client):
    """/api/live/categories should return empty list when cache is cold."""
    resp = client.get("/api/live/categories")
    assert resp.status_code == 200
    data = resp.json()
    # Returns {"categories": data} — with mocked cached_fetch returning []
    assert "categories" in data
    assert isinstance(data["categories"], list)


def test_live_categories_with_cache(client_with_cache):
    """/api/live/categories should return cached categories."""
    from main import _cache

    test_cats = [
        {"category_id": 1, "category_name": "News", "parent_id": 0},
        {"category_id": 5, "category_name": "Sports", "parent_id": 0},
    ]
    _cache["live_cats"] = (1000.0, test_cats)  # key is "live_cats" per endpoint

    resp = client_with_cache.get("/api/live/categories")
    assert resp.status_code == 200
    data = resp.json()["categories"]
    assert len(data) == 2
    names = [c["category_name"] for c in data]
    assert "News" in names
    assert "Sports" in names


def test_movie_categories_with_cache(client_with_cache):
    """/api/movies/categories should return cached categories."""
    from main import _cache

    test_cats = [
        {"category_id": 10, "category_name": "EN - Action", "parent_id": 0},
        {"category_id": 20, "category_name": "EN - Comedy", "parent_id": 0},
    ]
    _cache["vod_categories"] = (1000.0, test_cats)  # key is "vod_categories" per endpoint

    resp = client_with_cache.get("/api/movies/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert "categories" in data
    assert len(data["categories"]) >= 2
