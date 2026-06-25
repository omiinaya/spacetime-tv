"""Tests for the /api/health endpoint — no upstream dependencies."""


def test_health_returns_healthy(client):
    """Health endpoint should return status healthy."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert isinstance(data["uptime"], (int, float))
    assert data["uptime"] >= 0


def test_health_includes_cached_categories(client):
    """Health should list cache keys (empty on fresh start)."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["cached_categories"], list)


def test_health_after_cache_populated(client_with_cache):
    """Pre-populated cache should show up in health stats."""
    from main import _cache
    # Directly populate cache (bypasses cached_fetch)
    test_data = [{"stream_id": 1, "name": "Test"}]
    _cache["vod_1"] = (1000.0, test_data)
    _cache["vod_categories"] = (1000.0, [{"category_id": 1, "category_name": "Movies"}])

    resp = client_with_cache.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "vod_1" in data["cached_categories"]
    assert "vod_categories" in data["cached_categories"]


def test_cors_headers_present(client):
    """All endpoints should include CORS headers (allow all origins)."""
    # TestClient doesn't send Origin by default — add it to trigger CORS
    resp = client.get("/api/health", headers={"Origin": "http://localhost:5180"})
    assert resp.headers.get("access-control-allow-origin") == "*"
