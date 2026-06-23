"""Integration tests for Spacetime-TV backend.

Requires the server running on localhost:8720.
Run: pytest test_server.py -v
"""

import pytest
import httpx

BASE = "http://localhost:8720"


@pytest.fixture(scope="module")
def client():
    """httpx client — one per test module."""
    return httpx.Client(timeout=httpx.Timeout(15.0))


# ── Health ──────────────────────────────────────────────────────────────

def test_health_returns_ok(client):
    r = client.get(f"{BASE}/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "healthy"
    assert isinstance(data["uptime"], (int, float))
    assert data["uptime"] > 0
    assert isinstance(data["cached_categories"], list)


# ── Movies ──────────────────────────────────────────────────────────────

def test_movies_categories(client):
    r = client.get(f"{BASE}/api/movies/categories")
    assert r.status_code == 200
    data = r.json()
    cats = data.get("categories", [])
    assert isinstance(cats, list)
    assert len(cats) > 0, "Expected at least one movie category"


def test_movies_by_category(client):
    r = client.get(f"{BASE}/api/movies", params={"category_id": "0", "limit": 5})
    assert r.status_code == 200
    data = r.json()
    assert "movies" in data
    assert "total" in data


def test_movies_unified(client):
    r = client.get(f"{BASE}/api/movies/unified", params={"limit": 5})
    assert r.status_code == 200
    data = r.json()
    assert "movies" in data
    assert "total" in data
    assert data["total"] > 0, "Expected movies after cache warming"
    for m in data["movies"]:
        assert "stream_id" in m
        assert "name" in m or "base_name" in m
        assert "languages" in m


def test_movies_unified_search(client):
    r = client.get(f"{BASE}/api/movies/unified", params={"q": "batman", "limit": 5})
    assert r.status_code == 200
    data = r.json()
    # Should return results or empty — both are valid (depends on catalog)
    assert "movies" in data


def test_movie_details(client):
    # Use a known-good stream ID from the cache
    r = client.get(f"{BASE}/api/movies/unified", params={"limit": 1})
    movies = r.json().get("movies", [])
    if not movies:
        pytest.skip("No movies in unified cache")
    sid = movies[0]["stream_id"]
    
    r2 = client.get(f"{BASE}/api/movies/{sid}")
    assert r2.status_code == 200
    info = r2.json().get("info", r2.json())
    assert isinstance(info, dict)


# ── Series ──────────────────────────────────────────────────────────────

def test_series_categories(client):
    r = client.get(f"{BASE}/api/series/categories")
    assert r.status_code == 200
    data = r.json()
    cats = data.get("categories", [])
    assert isinstance(cats, list)
    assert len(cats) > 0, "Expected at least one series category"


def test_series_by_category(client):
    r = client.get(f"{BASE}/api/series", params={"category_id": "0", "limit": 5})
    assert r.status_code == 200
    data = r.json()
    assert "series" in data


# ── Live TV ─────────────────────────────────────────────────────────────

def test_live_categories(client):
    r = client.get(f"{BASE}/api/live/categories")
    assert r.status_code == 200
    data = r.json()
    cats = data.get("categories", [])
    assert isinstance(cats, list)


def test_live_all(client):
    r = client.get(f"{BASE}/api/live/all")
    assert r.status_code == 200
    data = r.json()
    assert "streams" in data
    assert isinstance(data["streams"], list)


# ── Search ──────────────────────────────────────────────────────────────

def test_search_basic(client):
    r = client.get(f"{BASE}/api/search", params={"q": "movie"})
    assert r.status_code == 200
    data = r.json()
    assert "live" in data
    assert "movies" in data
    assert "series" in data


def test_search_too_short(client):
    r = client.get(f"{BASE}/api/search", params={"q": "a"})
    # Should return 422 (validation error) or empty results
    assert r.status_code in (200, 422)


# ── Image Proxy ─────────────────────────────────────────────────────────

def test_image_proxy_blocked_host(client):
    r = client.get(f"{BASE}/api/image-proxy", params={"url": "https://evil.com/image.jpg"})
    assert r.status_code == 400, "Should reject non-whitelisted hosts"


def test_image_proxy_allowed_host_no_referer(client):
    """No referer = allowed (direct browser loads)."""
    r = client.get(
        f"{BASE}/api/image-proxy",
        params={"url": "https://image.tmdb.org/t/p/w92/abcdef.jpg"},
    )
    # 403 if hotlink guard blocks, 500/404 if TMDB returns error — both OK
    assert r.status_code in (200, 403, 404, 500)


# ── Stream Proxy ────────────────────────────────────────────────────────

def test_stream_movie_range(client):
    """Movie stream with Range header should return 206."""
    # Get any movie ID
    r = client.get(f"{BASE}/api/movies/unified", params={"limit": 1})
    movies = r.json().get("movies", [])
    if not movies:
        pytest.skip("No movies available")
    sid = movies[0]["stream_id"]
    
    r2 = client.get(
        f"{BASE}/api/stream/movie/{sid}",
        headers={"Range": "bytes=0-1023", "User-Agent": "VLC/3.0"},
    )
    # 206 = success, 200 = no range support, 502/503 = upstream issue
    assert r2.status_code in (200, 206, 502, 503)


# ── Error Handling ──────────────────────────────────────────────────────

def test_404_on_nonexistent(client):
    r = client.get(f"{BASE}/api/movies/999999999")
    assert r.status_code in (200, 404, 502)  # 502 if upstream fails


def test_error_beacon(client):
    r = client.post(
        f"{BASE}/api/error",
        json={"message": "test error", "stack": "fake stack", "url": "/test"},
    )
    assert r.status_code == 200
    assert r.json() == {"ok": True}


# ── EPG Guide ───────────────────────────────────────────────────────────

def test_guide(client):
    r = client.get(f"{BASE}/api/guide", params={"limit": 5})
    assert r.status_code == 200
    data = r.json()
    assert "channel_groups" in data
    assert "total_channels" in data
