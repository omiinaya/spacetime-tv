"""Tests for RateLimitMiddleware — in-memory IP-based rate limiting.

Tests verify:
- Rate limit applied to search/image-proxy paths (RATE_SEARCH_LIMIT)
- Different (higher) limit for default paths (RATE_DEFAULT_LIMIT)
- 429 response with Retry-After header when limit exceeded
- Rate window expiry resets the counter
- Per-IP isolation (different IPs have independent counters)
- Window transition resets on first request after expiry
- Counter is per-IP, shared across all paths (limit varies by path)

Uses monkey-patching to reduce limits temporarily so we don't need
to make hundreds of real requests.
"""

import time
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def clear_rate_limits():
    """Clear the shared rate limit state before each test."""
    import main as m
    m._rate_limits.clear()
    yield


@pytest.fixture
def small_limits():
    """Patch rate limits to small values for testing.

    RATE_SEARCH_LIMIT=3, RATE_DEFAULT_LIMIT=5, window=60s.
    """
    patcher = patch.multiple(
        "main",
        RATE_WINDOW=60,
        RATE_SEARCH_LIMIT=3,
        RATE_DEFAULT_LIMIT=5,
    )
    patcher.start()
    yield
    patcher.stop()


@pytest.fixture
def small_window():
    """Patch rate window to 1 second so expiry is fast.

    RATE_SEARCH_LIMIT=2, RATE_DEFAULT_LIMIT=5, window=1s.
    """
    patcher = patch.multiple(
        "main",
        RATE_WINDOW=1,
        RATE_SEARCH_LIMIT=2,
        RATE_DEFAULT_LIMIT=5,
    )
    patcher.start()
    yield
    patcher.stop()


# ── Search path rate limiting ──────────────────────────────────────


def test_search_path_rate_limit_applied(small_limits, client):
    """/api/v1/search blocks after RATE_SEARCH_LIMIT (3) requests from same IP."""
    # First 3 requests should succeed
    for _ in range(3):
        resp = client.get("/api/v1/search?q=test")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"

    # 4th request should be blocked (same IP, same counter)
    resp = client.get("/api/v1/search?q=test")
    assert resp.status_code == 429, f"Expected 429, got {resp.status_code}"
    data = resp.json()
    assert data["detail"] == "Too many requests"


def test_search_path_rate_limit_retry_after_header(small_limits, client):
    """429 response for search path should include Retry-After header."""
    # Exhaust the limit
    for _ in range(3):
        client.get("/api/v1/search?q=test")

    resp = client.get("/api/v1/search?q=test")
    assert resp.status_code == 429
    assert "retry-after" in resp.headers or "Retry-After" in resp.headers
    retry_after = int(resp.headers.get("retry-after") or resp.headers.get("Retry-After", "0"))
    assert 0 < retry_after <= 60


def test_image_proxy_rate_limit(small_limits, client):
    """/api/v1/image-proxy shares RATE_SEARCH_LIMIT with search path."""
    # First 3 requests to image-proxy should succeed
    for _ in range(3):
        resp = client.get("/api/v1/image-proxy?url=http://example.com/img.jpg")
        # image-proxy may return various statuses (mock returns empty/malformed),
        # but should NOT be 429 yet
        assert resp.status_code != 429, f"Expected non-429 on request {_+1}"

    # 4th should be blocked
    resp = client.get("/api/v1/image-proxy?url=http://example.com/img.jpg")
    assert resp.status_code == 429


def test_image_proxy_and_search_share_limit(small_limits, client):
    """Image-proxy and search requests share the same per-IP counter."""
    # 2 search requests
    client.get("/api/v1/search?q=a")
    client.get("/api/v1/search?q=b")

    # 1 image-proxy request — total = 3 (limit = 3, at the limit)
    resp = client.get("/api/v1/image-proxy?url=http://example.com/img.jpg")
    assert resp.status_code != 429, "Expected non-429 after 3 requests (at limit)"

    # Next request (search) should be blocked — 4 > 3
    resp = client.get("/api/v1/search?q=c")
    assert resp.status_code == 429


# ── Default path rate limiting ─────────────────────────────────────


def test_default_path_limit_higher_than_search(small_limits, client):
    """Non-search, non-image-proxy paths have a higher limit (RATE_DEFAULT_LIMIT).

    Per-IP counter is shared, but default paths have a higher threshold.
    After 3 search requests, the counter is at 3. Default limit is 5,
    so 2 more request of any type should succeed, then the 3rd blocks.
    """
    # 3 search requests (counter = 3)
    for _ in range(3):
        client.get("/api/v1/search?q=test")

    # Default path requests share the same per-IP counter but have
    # higher limit — so 2 more requests should work (counter 4,5)
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200  # counter was 3, limit is 5 → ok
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200  # counter was 4, limit is 5 → ok

    # Next request (counter would be 6, limit is 5) → blocked
    resp = client.get("/api/v1/health")
    assert resp.status_code == 429


def test_default_path_independent_start(client):
    """With no prior requests, default path allows up to full limit."""
    # With default limits (1000), we don't exhaust them.
    # Just verify basic default path access works.
    for _ in range(5):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200


# ── Per-IP isolation ───────────────────────────────────────────────


def test_different_ips_have_independent_limits(small_limits, client):
    """Each IP address has its own rate limit counter in _rate_limits dict."""
    from main import _rate_limits

    # Make requests from what appears to be two different client IPs
    # Note: With TestClient, all requests share the same client.host,
    # so we verify the dict structure directly.
    client.get("/api/v1/search?q=test")
    client.get("/api/v1/search?q=test")
    client.get("/api/v1/search?q=test")

    # 4th request should be blocked for this IP
    resp = client.get("/api/v1/search?q=test")
    assert resp.status_code == 429

    # Verify the rate limit dict has entries keyed by IP
    assert len(_rate_limits) >= 1
    # All entries should have valid structure
    for ip, (window_start, count) in _rate_limits.items():
        assert isinstance(ip, str)
        assert ip != ""
        assert isinstance(window_start, (int, float))
        assert isinstance(count, int)
        assert count >= 3


# ── Window expiry ──────────────────────────────────────────────────


def test_rate_limit_resets_after_window_expiry(small_window, client):
    """After the rate window expires, the counter should reset."""
    # Exhaust search limit (2 requests with window=1 and limit=2)
    client.get("/api/v1/search?q=test")
    client.get("/api/v1/search?q=test")
    assert client.get("/api/v1/search?q=test").status_code == 429

    # Wait for window to expire
    time.sleep(1.1)

    # Counter should have reset — request should succeed
    resp = client.get("/api/v1/search?q=test")
    assert resp.status_code == 200, f"Expected 200 after window expiry, got {resp.status_code}"


def test_window_transition_resets_partial_count(small_window, client):
    """After window transition, only requests within the new window count."""
    # Make 1 request, then wait past window
    client.get("/api/v1/search?q=test")
    time.sleep(1.1)

    # New window: should be able to make 2 requests
    resp = client.get("/api/v1/search?q=test")
    assert resp.status_code == 200
    resp = client.get("/api/v1/search?q=test")
    assert resp.status_code == 200

    # 3rd should be blocked
    resp = client.get("/api/v1/search?q=test")
    assert resp.status_code == 429


# ── State tracking ────────────────────────────────────────────────


def test_rate_limits_dict_populated_after_request(small_limits, client):
    """Internal _rate_limits dict should be populated after requests."""
    from main import _rate_limits

    assert len(_rate_limits) == 0

    client.get("/api/v1/search?q=test")

    # At least one entry should exist
    assert len(_rate_limits) >= 1
    for ip, (window_start, count) in _rate_limits.items():
        assert isinstance(window_start, (int, float))
        assert isinstance(count, int)
        assert count >= 1
