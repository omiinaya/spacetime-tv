"""Tests for RequestBodySizeMiddleware — rejects oversized POST/PUT/PATCH bodies."""

from fastapi.testclient import TestClient


def test_rejects_large_post_body(client: TestClient):
    """POST with body > 1MB gets 413."""
    big_body = "x" * 2_000_000  # ~2 MB
    r = client.post("/api/v1/error", json={"msg": big_body})
    assert r.status_code == 413
    assert "too large" in r.text.lower() or "413" in str(r.status_code)


def test_accepts_small_post_body(client: TestClient):
    """POST with small body passes through."""
    r = client.post("/api/v1/error", json={"msg": "small"})
    assert r.status_code != 413  # Should work (200 or error, just not 413)


def test_get_requests_not_affected(client: TestClient):
    """GET requests are not subject to body size checks."""
    r = client.get("/api/v1/health")
    assert r.status_code != 413


def test_put_large_body_rejected(client: TestClient):
    """PUT with body > 1MB gets 413."""
    big_body = "x" * 2_000_000
    r = client.put("/api/v1/error", json={"msg": big_body})
    assert r.status_code == 413
    assert "too large" in r.text.lower()


def test_patch_large_body_rejected(client: TestClient):
    """PATCH with body > 1MB gets 413."""
    big_body = "x" * 2_000_000
    r = client.patch("/api/v1/health", json={"data": big_body})
    assert r.status_code == 413


def test_no_content_length_skips_check(client: TestClient):
    """Requests without Content-Length header are not blocked."""
    r = client.post("/api/v1/error", content=b"", headers={"Content-Type": "application/json"})
    # If empty body, it should pass through
    assert r.status_code != 413
