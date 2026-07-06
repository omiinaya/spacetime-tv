"""Tests for live TV routes — /api/live/categories, /api/live/all,
/api/live/streams, /api/live/info.

Uses the same pattern as other backend tests: mocked cached_fetch returns []
by default (client fixture), or pre-populated _cache with client_with_cache.
"""

import time


# ── /api/live/categories ──────────────────────────────────────────────

def test_live_categories_empty_when_cache_empty(client):
    """GET /api/live/categories should return empty when cache is cold."""
    resp = client.get("/api/v1/live/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert "categories" in data
    assert data["categories"] == []


def test_live_categories_with_cache(client_with_cache):
    """GET /api/live/categories should return cached categories."""
    from state import _cache

    test_cats = [
        {"category_id": 1, "category_name": "General", "parent_id": 0},
        {"category_id": 2, "category_name": "Sports", "parent_id": 0},
    ]
    _cache["live_cats"] = (time.time() + 3600, test_cats)

    resp = client_with_cache.get("/api/v1/live/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["categories"]) == 2
    names = [c["category_name"] for c in data["categories"]]
    assert "General" in names
    assert "Sports" in names


# ── /api/live/all ──────────────────────────────────────────────────────

def test_live_all_empty_when_cache_empty(client):
    """GET /api/live/all should return empty when cache is cold."""
    resp = client.get("/api/v1/live/all")
    assert resp.status_code == 200
    data = resp.json()
    assert "streams" in data
    assert data["streams"] == []


def test_live_all_with_cache(client_with_cache):
    """GET /api/live/all should return cached live streams."""
    from state import _cache

    test_streams = [
        {"stream_id": 1, "name": "BBC News", "stream_icon": "", "category_id": "1"},
        {"stream_id": 2, "name": "Sky Sports", "stream_icon": "", "category_id": "2"},
    ]
    _cache["live_all"] = (time.time() + 3600, test_streams)

    resp = client_with_cache.get("/api/v1/live/all")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["streams"]) == 2
    assert data["streams"][0]["name"] == "BBC News"


# ── /api/live/streams ─────────────────────────────────────────────────

def test_live_streams_requires_category(client):
    """GET /api/live/streams requires category_id param."""
    resp = client.get("/api/v1/live/streams")
    assert resp.status_code == 422  # FastAPI validation — missing required param


def test_live_streams_empty_when_cache_empty(client):
    """GET /api/live/streams should return empty when cache is cold."""
    resp = client.get("/api/v1/live/streams?category_id=1")
    assert resp.status_code == 200
    data = resp.json()
    assert "streams" in data
    assert data["streams"] == []


def test_live_streams_with_cache(client_with_cache):
    """GET /api/live/streams should return cached streams for a category."""
    from state import _cache

    test_streams = [
        {"stream_id": 10, "name": "BBC One", "stream_icon": "", "category_id": "1"},
        {"stream_id": 11, "name": "BBC Two", "stream_icon": "", "category_id": "1"},
    ]
    _cache["live_1"] = (time.time() + 3600, test_streams)

    resp = client_with_cache.get("/api/v1/live/streams?category_id=1")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["streams"]) == 2
    assert data["streams"][0]["name"] == "BBC One"


# ── /api/live/info ─────────────────────────────────────────────────────

def test_live_info_empty_ids(client):
    """GET /api/live/info with empty ids returns empty."""
    resp = client.get("/api/v1/live/info?ids=")
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"streams": []}


def test_live_info_no_numeric_ids(client):
    """GET /api/live/info with non-numeric ids returns empty."""
    resp = client.get("/api/v1/live/info?ids=abc,def,xyz")
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"streams": []}


def test_live_info_empty_when_cache_empty(client):
    """GET /api/live/info should return empty when live_all cache is cold."""
    resp = client.get("/api/v1/live/info?ids=1,2,3")
    assert resp.status_code == 200
    data = resp.json()
    assert "streams" in data
    assert data["streams"] == []


def test_live_info_with_cache(client_with_cache):
    """GET /api/live/info should return info for matching stream IDs."""
    from state import _cache

    _cache["live_all"] = (time.time() + 3600, [
        {"stream_id": 101, "name": "BBC One HD", "stream_icon": "http://example.com/bbc1.png", "category_id": "1"},
        {"stream_id": 201, "name": "BBC Two HD", "stream_icon": "", "category_id": "1"},
        {"stream_id": 301, "name": "ITV 1 HD", "stream_icon": "http://example.com/itv1.png", "category_id": "2"},
    ])

    # Query for specific IDs
    resp = client_with_cache.get("/api/v1/live/info?ids=101,301")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["streams"]) == 2
    names = [s["name"] for s in data["streams"]]
    assert "BBC One HD" in names
    assert "ITV 1 HD" in names

    # Should NOT include 201
    ids = [s["stream_id"] for s in data["streams"]]
    assert 201 not in ids


def test_live_info_mixed_valid_invalid_ids(client_with_cache):
    """GET /api/live/info should handle mix of valid and invalid IDs."""
    from state import _cache

    _cache["live_all"] = (time.time() + 3600, [
        {"stream_id": 1, "name": "Channel 1", "stream_icon": "", "category_id": "1"},
    ])

    resp = client_with_cache.get("/api/v1/live/info?ids=1,abc,999")
    assert resp.status_code == 200
    data = resp.json()
    # Only stream_id 1 should match
    assert len(data["streams"]) == 1
    assert data["streams"][0]["stream_id"] == 1


def test_live_info_stream_icon_included(client_with_cache):
    """GET /api/live/info should include stream_icon in response."""
    from state import _cache

    _cache["live_all"] = (time.time() + 3600, [
        {"stream_id": 42, "name": "Test Channel", "stream_icon": "http://example.com/icon.png", "category_id": "1"},
    ])

    resp = client_with_cache.get("/api/v1/live/info?ids=42")
    assert resp.status_code == 200
    data = resp.json()
    assert data["streams"][0]["stream_icon"] == "http://example.com/icon.png"
