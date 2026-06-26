"""Tests for /api/search and /api/live/streams endpoints — uses pre-populated cache."""


def test_search_requires_min_length(client):
    """/api/search requires query >= 2 chars."""
    resp = client.get("/api/search?q=a")
    assert resp.status_code == 422  # FastAPI validation (min_length=2)


def test_search_returns_all_sections(client):
    """Search response should contain live, movies, and series sections."""
    resp = client.get("/api/search?q=test")
    assert resp.status_code == 200
    data = resp.json()
    assert "live" in data
    assert "movies" in data
    assert "series" in data


def test_search_filters_live(client_with_cache):
    """Search should filter live streams by name."""
    from main import _cache

    _cache["live_all"] = (1000.0, [
        {"stream_id": 1, "name": "BBC News", "stream_icon": "", "category_id": "1"},
        {"stream_id": 2, "name": "ESPN Sports", "stream_icon": "", "category_id": "2"},
        {"stream_id": 3, "name": "Sky News HD", "stream_icon": "", "category_id": "1"},
    ])

    resp = client_with_cache.get("/api/search?q=news")
    assert resp.status_code == 200
    data = resp.json()
    names = [s["name"] for s in data["live"]]
    assert "BBC News" in names
    assert "Sky News HD" in names
    assert "ESPN Sports" not in names


def test_search_filters_movies_from_cache(client_with_cache):
    """Search should find movies in pre-populated VOD caches."""
    from main import _cache

    _cache["vod_categories"] = (1000.0, [{"category_id": 10, "category_name": "EN - Action"}])
    _cache["vod_10"] = (1000.0, [
        {"stream_id": 100, "name": "EN - The Dark Knight (2008)", "stream_icon": "", "container_extension": "mkv"},
        {"stream_id": 101, "name": "EN - Inception (2010)", "stream_icon": "", "container_extension": "mp4"},
    ])

    resp = client_with_cache.get("/api/search?q=knight")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["movies"]) >= 1
    assert "Dark Knight" in data["movies"][0]["name"]


def test_search_empty_query_returns_empty(client):
    """Search with non-matching query returns empty lists."""
    resp = client.get("/api/search?q=zzzznotfound")
    assert resp.status_code == 200
    data = resp.json()
    assert data["live"] == []
    assert data["movies"] == []
    assert data["series"] == []


def test_search_enrich_empty_body(client):
    """POST /api/search/enrich with empty body returns empty dicts."""
    resp = client.post("/api/search/enrich", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"movies": {}, "series": {}}


def test_search_enrich_no_tmdb_key(client):
    """POST /api/search/enrich should skip items when no TMDB data available."""
    resp = client.post("/api/search/enrich", json={
        "movies": [{"stream_id": 1, "tmdb_id": "550"}],
        "series": [{"series_id": 2, "tmdb_id": "1399"}],
    })
    assert resp.status_code == 200
    data = resp.json()
    # Without TMDB_API_KEY or tmdb-enrich, items that fail enrichment
    # are simply omitted from the result (not None)
    assert data["movies"] == {}
    assert data["series"] == {}
