"""Tests for pure utility functions in stream.py.

Tests _mime_from_url, generate_live_mpd, generate_vod_mpd,
serve_cached_mp4, and related pure/isolatable helpers.
"""

import json
from pathlib import Path

import pytest


# ── _mime_from_url ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize("url,expected", [
    ("http://example.com/stream.ts", "video/mp2t"),
    ("http://example.com/video.mkv", "video/x-matroska"),
    ("http://example.com/movie.mp4", "video/mp4"),
    ("http://example.com/movie.m4v", "video/mp4"),
    ("http://example.com/clip.webm", "video/webm"),
    ("http://example.com/old.avi", "video/x-msvideo"),
    ("http://example.com/clip.mov", "video/quicktime"),
    ("http://example.com/noext", "video/mp2t"),  # default fallback
    ("http://example.com/unknown.xyz", "video/mp2t"),  # unknown ext → default
    ("http://example.com/UPPERCASE.TS", "video/mp2t"),  # case insensitive
    ("", "video/mp2t"),  # empty URL
])
def test_mime_from_url(url, expected):
    """_mime_from_url maps extensions to MIME types."""
    from routes.stream import _mime_from_url
    assert _mime_from_url(url) == expected


# ── generate_live_mpd ──────────────────────────────────────────────────────────


def test_generate_live_mpd_structure():
    """generate_live_mpd returns valid-looking MPD XML for live stream."""
    from routes.stream import generate_live_mpd
    xml = generate_live_mpd(12345, "http://cdn.example.com/live/12345.ts")
    assert '<?xml version="1.0" encoding="utf-8"?>' in xml
    assert "<MPD" in xml
    assert 'profiles="urn:mpeg:dash:profile:isoff-live:2011"' in xml
    assert 'type="dynamic"' in xml
    assert "<Period id=\"1\">" in xml
    assert "<AdaptationSet" in xml
    assert "<BaseURL>http://cdn.example.com/live/12345.ts</BaseURL>" in xml
    assert "<SegmentBase" in xml
    assert "</MPD>" in xml


def test_generate_live_mpd_contains_stream_id():
    """generate_live_mpd includes the stream_id in the MPD."""
    from routes.stream import generate_live_mpd
    xml = generate_live_mpd(42, "http://cdn.test/live/42.ts")
    assert "42" in xml


def test_generate_live_mpd_xml_escaping():
    """Special characters in stream URL are XML-escaped."""
    from routes.stream import generate_live_mpd
    url = "http://cdn.test/live/1.ts?token=a&b<c>d\"e"
    xml = generate_live_mpd(1, url)
    assert "&amp;" in xml
    assert "&lt;" in xml
    assert "&gt;" in xml
    assert "&quot;" in xml
    # Verify that raw XML-unsafe chars are not present outside entities
    assert "&amp;b" in xml  # "a&b" should be "a&amp;b"


def test_generate_live_mpd_has_timestamps():
    """Live MPD includes availabilityStartTime and publishTime."""
    from routes.stream import generate_live_mpd
    xml = generate_live_mpd(1, "http://test/stream.ts")
    assert "availabilityStartTime" in xml
    assert "publishTime" in xml


# ── generate_vod_mpd ───────────────────────────────────────────────────────────


def test_generate_vod_mpd_structure():
    """generate_vod_mpd returns valid-looking static MPD."""
    from routes.stream import generate_vod_mpd
    xml = generate_vod_mpd(100, "movie", "http://cdn.example.com/movie/100.mkv")
    assert '<?xml version="1.0" encoding="utf-8"?>' in xml
    assert "<MPD" in xml
    assert 'profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"' in xml
    assert 'type="static"' in xml
    assert "<BaseURL>http://cdn.example.com/movie/100.mkv</BaseURL>" in xml
    assert "</MPD>" in xml


def test_generate_vod_mpd_series_type():
    """VOD MPD generation works for series stream type."""
    from routes.stream import generate_vod_mpd
    xml = generate_vod_mpd(555, "series", "http://cdn.test/series/555.mp4")
    assert "<BaseURL>http://cdn.test/series/555.mp4</BaseURL>" in xml


def test_generate_vod_mpd_xml_escaping():
    """VOD MPD URL is XML-escaped like live MPD."""
    from routes.stream import generate_vod_mpd
    url = "http://test/stream?x=1&y=2"
    xml = generate_vod_mpd(1, "movie", url)
    assert "&amp;" in xml


# ── serve_cached_mp4 ───────────────────────────────────────────────────────────


def test_serve_cached_mp4_no_range(tmp_path, monkeypatch):
    """serve_cached_mp4 returns FileResponse with full file when no Range header."""
    from routes.stream import serve_cached_mp4
    from fastapi import Request
    from starlette.datastructures import Headers

    # Create a small test file
    test_file = tmp_path / "test.mp4"
    test_file.write_bytes(b"\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09")

    # Build a mock request without Range
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/test.mp4",
        "headers": [],
        "query_string": b"",
    }
    req = Request(scope)

    resp = serve_cached_mp4(Path(test_file), req)
    assert resp.status_code == 200
    assert resp.media_type == "video/mp4"
    assert resp.headers.get("accept-ranges") == "bytes"
    assert resp.headers.get("access-control-allow-origin") == "*"


def test_serve_cached_mp4_with_range(tmp_path, monkeypatch):
    """serve_cached_mp4 returns StreamingResponse with 206 when Range header present."""
    from routes.stream import serve_cached_mp4
    from fastapi import Request
    from starlette.datastructures import Headers

    test_file = tmp_path / "test.mp4"
    content = bytes(range(256))  # 256 bytes
    test_file.write_bytes(content)

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/test.mp4",
        "headers": [(b"range", b"bytes=10-19")],
        "query_string": b"",
    }
    req = Request(scope)

    resp = serve_cached_mp4(Path(test_file), req)
    assert resp.status_code == 206
    assert resp.media_type == "video/mp4"
    assert "content-range" in resp.headers
    assert "content-length" in resp.headers
    # 10 bytes requested (10-19 inclusive)
    assert int(resp.headers["content-length"]) == 10


def test_serve_cached_mp4_range_open_ended(tmp_path):
    """Range without end serves from start to end of file."""
    from routes.stream import serve_cached_mp4
    from fastapi import Request

    test_file = tmp_path / "test.mp4"
    content = bytes(range(100))
    test_file.write_bytes(content)

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/test.mp4",
        "headers": [(b"range", b"bytes=90-")],
        "query_string": b"",
    }
    req = Request(scope)

    resp = serve_cached_mp4(Path(test_file), req)
    assert resp.status_code == 206
    assert int(resp.headers["content-length"]) == 10  # bytes 90-99


# ── MP4 serve endpoints (error handling) ───────────────────────────────────────


def test_serve_movie_mp4_not_found(client):
    """serve_movie_mp4 returns 404 for unconverted movie."""
    resp = client.get("/api/stream/movie/999999/mp4")
    assert resp.status_code == 404
    assert "not yet converted" in resp.text.lower()


def test_serve_series_mp4_not_found(client):
    """serve_series_mp4 returns 404 for unconverted series episode."""
    resp = client.get("/api/stream/series/99999/88888/mp4")
    assert resp.status_code == 404
    assert "not yet converted" in resp.text.lower()


# ── MPD endpoints (smoke tests) ────────────────────────────────────────────────


def test_live_dash_manifest_returns_mpd(client):
    """GET /api/stream/live/{id}/manifest.mpd returns application/dash+xml."""
    resp = client.get("/api/stream/live/1/manifest.mpd")
    assert resp.status_code == 200
    assert resp.headers.get("content-type", "").startswith("application/dash+xml")
    assert b"<MPD" in resp.content


def test_movie_dash_manifest_returns_mpd(client):
    """GET /api/stream/movie/{id}/manifest.mpd returns valid MPD."""
    resp = client.get("/api/stream/movie/1/manifest.mpd")
    assert resp.status_code == 200
    assert resp.headers.get("content-type", "").startswith("application/dash+xml")
    assert b"<MPD" in resp.content
    assert b"on-demand" in resp.content
    assert b"type=\"static\"" in resp.content


def test_series_dash_manifest_returns_mpd(client):
    """GET /api/stream/series/{id}/{ep}/manifest.mpd returns valid MPD."""
    resp = client.get("/api/stream/series/1/2/manifest.mpd")
    assert resp.status_code == 200
    assert resp.headers.get("content-type", "").startswith("application/dash+xml")
    assert b"<MPD" in resp.content


# ── Convert endpoints (smoke tests) ────────────────────────────────────────────


def test_convert_movie_no_cache(client):
    """GET /api/movie/convert/{id} returns converting status for uncached movie."""
    resp = client.get("/api/movie/convert/99999")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("converting", "ready")
    assert "message" in data


def test_convert_series_no_cache(client):
    """GET /api/series/convert/{id}/{ep} returns status for uncached episode."""
    resp = client.get("/api/series/convert/99999/88888")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("converting", "ready")
    assert "message" in data
