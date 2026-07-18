"""Tests for /api/search and /api/live/streams endpoints — uses pre-populated cache."""


def test_search_requires_min_length(client):
    """/api/v1/search requires query >= 2 chars."""
    resp = client.get("/api/v1/search?q=a")
    assert resp.status_code == 422  # FastAPI validation (min_length=2)


def test_search_returns_all_sections(client):
    """Search response should contain live, movies, and series sections."""
    resp = client.get("/api/v1/search?q=test")
    assert resp.status_code == 200
    data = resp.json()
    assert "live" in data
    assert "movies" in data
    assert "series" in data
    assert "totals" in data
    assert "live" in data["totals"]
    assert "movies" in data["totals"]
    assert "series" in data["totals"]


def test_search_filters_live(client_with_cache):
    """Search should filter live streams by name."""
    from state import _cache

    _cache["live_all"] = (
        1000.0,
        [
            {"stream_id": 1, "name": "BBC News", "stream_icon": "", "category_id": "1"},
            {"stream_id": 2, "name": "ESPN Sports", "stream_icon": "", "category_id": "2"},
            {"stream_id": 3, "name": "Sky News HD", "stream_icon": "", "category_id": "1"},
        ],
    )

    resp = client_with_cache.get("/api/v1/search?q=news")
    assert resp.status_code == 200
    data = resp.json()
    names = [s["name"] for s in data["live"]]
    assert "BBC News" in names
    assert "Sky News HD" in names
    assert "ESPN Sports" not in names


def test_search_filters_movies_from_cache(client_with_cache):
    """Search should find movies in pre-populated VOD caches."""
    from state import _cache

    _cache["vod_categories"] = (1000.0, [{"category_id": 10, "category_name": "EN - Action"}])
    _cache["vod_10"] = (
        1000.0,
        [
            {"stream_id": 100, "name": "EN - The Dark Knight (2008)", "stream_icon": "", "container_extension": "mkv"},
            {"stream_id": 101, "name": "EN - Inception (2010)", "stream_icon": "", "container_extension": "mp4"},
        ],
    )

    resp = client_with_cache.get("/api/v1/search?q=knight")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["movies"]) >= 1
    assert "Dark Knight" in data["movies"][0]["name"]


def test_search_empty_query_returns_empty(client):
    """Search with non-matching query returns empty lists."""
    resp = client.get("/api/v1/search?q=zzzznotfound")
    assert resp.status_code == 200
    data = resp.json()
    assert data["live"] == []
    assert data["movies"] == []
    assert data["series"] == []
    assert data["totals"] == {"live": 0, "movies": 0, "series": 0}


def test_search_pagination_limit_offset_section(client_with_cache):
    """Search with limit, offset, and section params should return sliced results."""
    from state import _cache

    _cache["live_all"] = (
        1000.0,
        [
            {"stream_id": 101, "name": "Channel One", "stream_icon": "", "category_id": "1"},
            {"stream_id": 102, "name": "Channel Two", "stream_icon": "", "category_id": "1"},
            {"stream_id": 103, "name": "Channel Three", "stream_icon": "", "category_id": "1"},
            {"stream_id": 104, "name": "Channel Four", "stream_icon": "", "category_id": "1"},
        ],
    )

    # Default limit=20 should return all 4 matching channels
    resp = client_with_cache.get("/api/v1/search?q=channel")
    data = resp.json()
    assert len(data["live"]) == 4
    assert data["live"][0]["name"] == "Channel One"
    assert data["totals"] == {"live": 4, "movies": 0, "series": 0}

    # limit=2 should return first 2
    resp = client_with_cache.get("/api/v1/search?q=channel&limit=2&offset=0")
    data = resp.json()
    assert len(data["live"]) == 2
    assert data["live"][0]["name"] == "Channel One"

    # offset=2 should return last 2
    resp = client_with_cache.get("/api/v1/search?q=channel&limit=2&offset=2")
    data = resp.json()
    assert len(data["live"]) == 2
    assert data["live"][0]["name"] == "Channel Three"
    assert data["live"][1]["name"] == "Channel Four"

    # section=live should only return live section
    resp = client_with_cache.get("/api/v1/search?q=channel&section=live")
    data = resp.json()
    assert len(data["live"]) == 4
    assert data["movies"] == []
    assert data["series"] == []

    # limit max 50
    resp = client_with_cache.get("/api/v1/search?q=channel&limit=100")
    assert resp.status_code == 422  # FastAPI validation


def test_search_enrich_empty_body(client):
    """POST /api/search/enrich with empty body returns empty dicts."""
    resp = client.post("/api/v1/search/enrich", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"movies": {}, "series": {}}


def test_search_enrich_no_tmdb_key(client):
    """POST /api/search/enrich should skip items when no TMDB data available."""
    resp = client.post(
        "/api/v1/search/enrich",
        json={
            "movies": [{"stream_id": 1, "tmdb_id": "550"}],
            "series": [{"series_id": 2, "tmdb_id": "1399"}],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # Without TMDB_API_KEY or tmdb-enrich, items that fail enrichment
    # are simply omitted from the result (not None)
    assert data["movies"] == {}
    assert data["series"] == {}
