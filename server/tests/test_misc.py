"""Tests for misc routes — IPTV raw proxy, image proxy, SPA fallback.

These routes involve HTTP calls to external services, so we mock
the `main.client` httpx.AsyncClient where needed.
"""
from unittest.mock import AsyncMock, MagicMock, patch
# ── SPA fallback: /{full_path:path} ───────────────────────────────────

def test_spa_fallback_serves_index(client):
    """The catch-all route should serve index.html for unknown paths."""
    resp = client.get("/some/random/path")
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "").lower()


def test_spa_fallback_serves_index_for_root(client):
    """Root path '/' should also serve index.html (if no other route matches)."""
    resp = client.get("/")
    assert resp.status_code == 200
    assert "text/html" in resp.headers.get("content-type", "").lower() or resp.text


# ── Image Proxy helpers ──────────────────────────────────────────────

def test_img_cache_key_consistency(client):
    """_img_cache_key should produce consistent, deterministic keys."""
    from routes.misc import _img_cache_key

    key1 = _img_cache_key("http://example.com/image.jpg")
    key2 = _img_cache_key("http://example.com/image.jpg")
    assert key1 == key2
    assert isinstance(key1, str)
    assert len(key1) == 32  # MD5 hex digest


def test_img_cache_key_different_urls(client):
    """Different URLs should produce different cache keys."""
    from routes.misc import _img_cache_key

    key1 = _img_cache_key("http://example.com/image1.jpg")
    key2 = _img_cache_key("http://example.com/image2.jpg")
    assert key1 != key2


def test_img_cache_path_and_meta_path(client):
    """_img_cache_path and _img_meta_path should return Path objects."""
    from routes.misc import _img_cache_path, _img_meta_path, _img_cache_key

    key = _img_cache_key("test")
    path = _img_cache_path(key)
    meta = _img_meta_path(key)
    assert str(key) in str(path)
    assert str(key) in str(meta)
    assert ".meta" in str(meta)


# ── Image Proxy: /api/image-proxy (validation layer tests) ───────────

def test_image_proxy_rejects_direct_access(client):
    """Image proxy should reject requests with external referer."""
    resp = client.get(
        "/api/image-proxy?url=http://image.tmdb.org/t/p/original/test.jpg",
        headers={"Referer": "http://evil.com/steal"},
    )
    assert resp.status_code == 403
    assert "Direct access not allowed" in resp.text


def test_image_proxy_rejects_unauthorized_host(client):
    """Image proxy should reject URLs from non-allowed hosts."""
    resp = client.get(
        "/api/image-proxy?url=http://evil.com/hack.jpg",
        headers={"Referer": "http://localhost:5180/movies"},
    )
    assert resp.status_code == 400
    assert "Host not allowed" in resp.text


def test_image_proxy_rejects_invalid_url(client):
    """Image proxy should reject invalid URLs."""
    resp = client.get(
        "/api/image-proxy?url=not-a-url",
        headers={"Referer": "http://localhost:5180/movies"},
    )
    assert resp.status_code == 400


def _mock_http_image(content: bytes = b"fake-image", content_type: str = "image/jpeg"):
    """Helper: patch main.client.get to return a mock image response."""
    mock_response = AsyncMock()
    mock_response.content = content
    mock_response.headers = {"content-type": content_type}
    mock_response.raise_for_status = MagicMock()
    return patch("main.client.get", return_value=mock_response)


def test_image_proxy_allows_tmdb_host(client):
    """Image proxy should allow image.tmdb.org URLs with proper referer."""
    with _mock_http_image(b"tmdb-image", "image/jpeg"):
        resp = client.get(
            "/api/image-proxy?url=http://image.tmdb.org/t/p/original/test.jpg",
            headers={"Referer": "http://localhost:5180/movies"},
        )
    assert resp.status_code == 200
    assert resp.content == b"tmdb-image"
    assert "image/jpeg" in resp.headers.get("content-type", "")


def test_image_proxy_allows_cmc_exchange_cdn(client):
    """Image proxy should allow cmc.exchange-cdn.com URLs."""
    with _mock_http_image(b"cdn-image", "image/png"):
        resp = client.get(
            "/api/image-proxy?url=http://cmc.exchange-cdn.com/images/logo.png",
            headers={"Referer": "http://localhost:5180/"},
        )
    assert resp.status_code == 200
    assert resp.content == b"cdn-image"


def test_image_proxy_subdomain_allowed(client):
    """Image proxy should allow subdomains of allowed hosts."""
    with _mock_http_image(b"subdomain-image", "image/webp"):
        resp = client.get(
            "/api/image-proxy?url=http://sub.cmc.exchange-cdn.com/img.webp",
            headers={"Referer": "http://localhost:5180/"},
        )
    assert resp.status_code == 200


def test_image_proxy_uses_in_memory_cache(client):
    """Second request for same URL should use in-memory cache."""
    from routes.misc import _img_cache
    _img_cache.clear()

    # Also mock disk cache to avoid pollution from previous test runs
    with patch("routes.misc._img_read_disk", return_value=None):
        with _mock_http_image(b"cached-image", "image/jpeg") as mock_get:
            # First request — should hit the network
            resp1 = client.get(
                "/api/image-proxy?url=http://image.tmdb.org/t/p/original/cached-test.jpg",
                headers={"Referer": "http://localhost:5180/"},
            )
            assert resp1.status_code == 200
            assert mock_get.call_count == 1

            # Second request — should use in-memory cache
            resp2 = client.get(
                "/api/image-proxy?url=http://image.tmdb.org/t/p/original/cached-test.jpg",
                headers={"Referer": "http://localhost:5180/"},
            )
            assert resp2.status_code == 200
            assert mock_get.call_count == 1  # still 1 — second request used cache


def test_image_proxy_with_localhost_referer_allows_access(client):
    """Localhost referer should be accepted."""
    with _mock_http_image(b"local-image", "image/jpeg"):
        resp = client.get(
            "/api/image-proxy?url=http://image.tmdb.org/t/p/original/local-test.jpg",
            headers={"Referer": "http://127.0.0.1:5180/"},
        )
    assert resp.status_code == 200


# ── IPTV Raw Proxy: /api/iptv/{path:path} ────────────────────────────

def test_iptv_raw_proxy_proxies_request(client):
    """IPTV raw proxy should forward requests and return upstream content."""
    with patch("main.client.get") as mock_get:
        mock_resp = AsyncMock()
        mock_resp.content = b"upstream response content"
        mock_resp.headers = {"content-type": "text/plain"}
        mock_get.return_value = mock_resp

        resp = client.get("/api/iptv/some/path")
        assert resp.status_code == 200
        assert resp.content == b"upstream response content"
        assert "text/plain" in resp.headers.get("content-type", "")


def test_iptv_raw_proxy_failure_returns_502(client):
    """IPTV raw proxy should return 502 when upstream fails."""
    with patch("main.client.get", side_effect=Exception("Connection refused")):
        resp = client.get("/api/iptv/some/path")
        assert resp.status_code == 502
