"""Tests for the /api/health endpoint — no upstream dependencies."""


def test_health_returns_healthy(client):
    """Health endpoint should return status healthy."""
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert isinstance(data["uptime"], (int, float))
    assert data["uptime"] >= 0


def test_health_includes_cached_categories(client):
    """Health should list cache keys (empty on fresh start)."""
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["cached_categories"], list)


def test_health_after_cache_populated(client_with_cache):
    """Pre-populated cache should show up in health stats."""
    from state import _cache

    test_data = [{"stream_id": 1, "name": "Test"}]
    _cache["vod_1"] = (1000.0, test_data)
    _cache["vod_categories"] = (1000.0, [{"category_id": 1, "category_name": "Movies"}])

    resp = client_with_cache.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "vod_1" in data["cached_categories"]
    assert "vod_categories" in data["cached_categories"]


def test_health_with_dict_cache_values(client_with_cache):
    """Health should handle dict cache values (not just lists)."""
    from state import _cache

    _cache["some_dict"] = (1000.0, {"key1": "val1", "key2": "val2"})
    _cache["empty_dict"] = (1000.0, {})

    resp = client_with_cache.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "some_dict" in data["cached_categories"]
    assert "empty_dict" in data["cached_categories"]


def test_cors_known_origin_allowed(client):
    """Known origins should get access-control-allow-origin header."""
    known = "http://localhost:5180"
    resp = client.get("/api/v1/health", headers={"Origin": known})
    assert resp.headers.get("access-control-allow-origin") == known


def test_cors_unknown_origin_rejected(client):
    """Unknown origins should NOT get access-control-allow-origin."""
    resp = client.get("/api/v1/health", headers={"Origin": "https://evil.com"})
    # No CORS header means the browser blocks it
    assert "access-control-allow-origin" not in resp.headers


def test_cors_preflight_not_blocked_by_auth(client):
    """OPTIONS preflight must not be 401'd by the auth middleware.

    Regression: auth_middleware runs OUTSIDE CORSMiddleware, so a preflight
    (which carries no auth headers by spec) used to get 401 with no
    Access-Control-Allow-Origin — the browser then blocked the real request.
    Auth middleware must pass OPTIONS through so CORS can answer it.
    """
    resp = client.options(
        "/api/v1/live/categories",
        headers={
            "Origin": "http://localhost:5180",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5180"
    assert resp.headers.get("access-control-allow-methods") is not None


# ── /api/error (POST) ─────────────────────────────────────────────────


def test_error_endpoint_accepts_body(client):
    """POST /api/error should accept a JSON error report and return ok."""
    resp = client.post(
        "/api/v1/error",
        json={
            "message": "Test error",
            "stack": "Error: test\n    at Component (file.tsx:10:5)",
            "componentStack": "div > Button > Component",
            "url": "http://localhost:5180/movies",
        },
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_error_endpoint_empty_body(client):
    """POST /api/error with empty body should still return ok."""
    resp = client.post("/api/v1/error", json={})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_error_endpoint_invalid_json(client):
    """POST /api/error with invalid JSON should be handled gracefully."""
    resp = client.post("/api/v1/error", content=b"not valid json", headers={"Content-Type": "application/json"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_error_endpoint_no_body(client):
    """POST /api/error with no body should return ok."""
    resp = client.post("/api/v1/error", content=b"", headers={"Content-Type": "application/json"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
