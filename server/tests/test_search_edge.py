"""Tests for /api/search — special characters, fallback paths, enrichment edge cases."""

import json
import os
from unittest.mock import patch, MagicMock, AsyncMock


def test_search_special_chars(client_with_cache):
    """Search with special characters should not crash."""
    resp = client_with_cache.get("/api/search?q=star+%26+wars")
    assert resp.status_code == 200
    data = resp.json()
    assert "live" in data
    assert "movies" in data
    assert "series" in data


def test_search_section_filter_movies(client_with_cache):
    """section=movies returns only movies section."""
    from main import _cache
    _cache["vod_categories"] = (1000.0, [{"category_id": 10, "category_name": "EN - Action"}])
    _cache["vod_10"] = (1000.0, [
        {"stream_id": 100, "name": "The Dark Knight", "stream_icon": "", "container_extension": "mkv"},
    ])

    resp = client_with_cache.get("/api/search?q=knight&section=movies")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["movies"]) >= 1
    assert data["live"] == []
    assert data["series"] == []
    assert "The Dark Knight" in data["movies"][0]["name"]


def test_search_section_filter_series(client_with_cache):
    """section=series returns only series section."""
    from main import _cache
    _cache["series_categories"] = (1000.0, [{"category_id": 5, "category_name": "EN - Drama"}])
    _cache["series_5"] = (1000.0, [
        {"series_id": 50, "name": "Breaking Bad", "cover": "", "plot": ""},
    ])

    resp = client_with_cache.get("/api/search?q=breaking&section=series")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["series"]) >= 1
    assert data["live"] == []
    assert data["movies"] == []


def test_search_series_plot_match(client_with_cache):
    """Series should match on plot field when name doesn't match."""
    from main import _cache
    _cache["series_categories"] = (1000.0, [{"category_id": 5, "category_name": "EN - Drama"}])
    _cache["series_5"] = (1000.0, [
        {"series_id": 50, "name": "BB", "cover": "", "plot": "A chemistry teacher turns to cooking methamphetamine"},
    ])

    resp = client_with_cache.get("/api/search?q=chemistry")
    assert resp.status_code == 200
    data = resp.json()
    names = [s["name"] for s in data["series"]]
    assert "BB" in names


def test_search_unicode(client_with_cache):
    """Search with unicode characters should work."""
    from main import _cache
    _cache["live_all"] = (1000.0, [
        {"stream_id": 1, "name": "Café Français", "stream_icon": "", "category_id": "1"},
        {"stream_id": 2, "name": "日本語チャンネル", "stream_icon": "", "category_id": "1"},
    ])

    resp = client_with_cache.get("/api/search?q=caf%C3%A9")
    assert resp.status_code == 200
    data = resp.json()
    names = [s["name"] for s in data["live"]]
    assert "Café Français" in names

    resp2 = client_with_cache.get("/api/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E")
    assert resp2.status_code == 200
    data2 = resp2.json()
    names2 = [s["name"] for s in data2["live"]]
    assert "日本語チャンネル" in names2


def test_search_vod_fallback_path(client):
    """When VOD caches aren't warm, search falls back to cached_fetch."""
    import main as m
    original = m.cached_fetch

    async def mock_vod_fetch(key, action, **params):
        if key == "vod_categories":
            return [{"category_id": 10, "category_name": "Action"}]
        if key == "vod_10":
            return [{"stream_id": 100, "name": "Die Hard", "stream_icon": "", "container_extension": "mp4"}]
        if key == "series_categories":
            return []
        return []

    m.cached_fetch = mock_vod_fetch

    try:
        resp = client.get("/api/search?q=die")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["movies"]) >= 1
        assert "Die Hard" in data["movies"][0]["name"]
    finally:
        m.cached_fetch = original


def test_search_vod_fallback_with_exception(client):
    """VOD fallback should handle exceptions gracefully."""
    import main as m
    original = m.cached_fetch

    async def failing_fetch(key, action, **params):
        if key == "vod_categories":
            return [{"category_id": 10, "category_name": "Action"}]
        if key == "vod_10":
            raise Exception("IPTV provider unreachable")
        return []

    m.cached_fetch = failing_fetch

    try:
        resp = client.get("/api/search?q=test")
        assert resp.status_code == 200
        data = resp.json()
        assert data["movies"] == []
    finally:
        m.cached_fetch = original


def test_enrich_with_tmdb_cache(client):
    """Enrichment endpoint should cache results."""
    resp = client.post("/api/search/enrich", json={
        "movies": [{"stream_id": 1, "tmdb_id": "550"}],
        "series": [{"series_id": 2, "tmdb_id": "1399"}],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "movies" in data
    assert "series" in data
