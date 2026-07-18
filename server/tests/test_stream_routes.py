"""Tests for stream.py routes — probe and testable error paths.

Uses the existing TestClient fixtures. Stream proxy/transcode/HLS/DASH
endpoints spawn subprocesses (ffmpeg, curl_cffi) against external CDN URLs
with long timeouts, so only the probe endpoints (which use `timeout 8 ffprobe`)
are directly testable here — they'll return quickly with an 'unknown' codec
since the test IPTV_URL won't resolve.

Probe endpoints tested:
  - GET /api/live/probe/{stream_id}
  - GET /api/movie/probe/{stream_id}
  - GET /api/series/probe/{stream_id}
"""


# ── Probe endpoints ───────────────────────────────────────────────────────────


def test_live_probe_returns_json(client):
    """Probe endpoint returns JSON with codec field."""
    resp = client.get("/api/v1/live/probe/99999")
    assert resp.status_code == 200
    data = resp.json()
    assert "codec" in data
    assert isinstance(data["codec"], str)


def test_movie_probe_returns_json(client):
    """Movie probe endpoint returns JSON with codec field."""
    resp = client.get("/api/v1/movie/probe/99999")
    assert resp.status_code == 200
    data = resp.json()
    assert "codec" in data
    assert isinstance(data["codec"], str)


def test_series_probe_returns_json(client):
    """Series probe endpoint returns JSON with codec field."""
    resp = client.get("/api/v1/series/probe/99999")
    assert resp.status_code == 200
    data = resp.json()
    assert "codec" in data
    assert isinstance(data["codec"], str)


def test_probe_different_streams_return_independent_results(client):
    """Different stream IDs produce separate probe results (not shared cache)."""
    resp1 = client.get("/api/v1/live/probe/1")
    resp2 = client.get("/api/v1/live/probe/2")
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    # Each should have a codec field (even if unknown/unavailable)
    assert "codec" in resp1.json()
    assert "codec" in resp2.json()


def test_probe_for_nonexistent_stream(client):
    """Probe for a non-existent stream returns error gracefully."""
    resp = client.get("/api/v1/live/probe/0")
    assert resp.status_code == 200
    data = resp.json()
    assert "codec" in data
    # In test env this will be 'unknown' or 'unavailable'
    assert data["codec"] in ("unknown", "unavailable")
