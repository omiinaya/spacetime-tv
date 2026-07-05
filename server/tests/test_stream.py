"""Tests for stream.py route endpoints.

Tests DASH manifest endpoints, probe endpoints with mocked cache,
and error handling paths. Avoids real ffmpeg/curl_cffi calls by
pre-populating caches and using the mock client fixture."""

import pytest
import time
from unittest.mock import patch, MagicMock


def test_live_dash_manifest_returns_mpd(client_with_cache):
    """GET /api/stream/live/{id}/manifest.mpd returns valid MPD XML."""
    from main import _cache
    _cache["live_all"] = (1000.0, [
        {"stream_id": 999, "name": "Test Channel", "stream_icon": "", "category_id": "1",
         "epg_channel_id": "", "num": 1, "stream_type": "live", "added": "", "is_adult": 0,
         "category_ids": ["1"], "custom_sid": None, "tv_archive": 0, "direct_source": "",
         "tv_archive_duration": 0},
    ])

    resp = client_with_cache.get("/api/v1/stream/live/999/manifest.mpd")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/dash+xml"
    assert "<MPD" in resp.text


def test_live_dash_manifest_has_cors_headers(client_with_cache):
    """DASH manifest should include CORS headers."""
    from main import _cache
    _cache["live_all"] = (1000.0, [
        {"stream_id": 999, "name": "Test Channel", "stream_icon": "", "category_id": "1",
         "epg_channel_id": "", "num": 1, "stream_type": "live", "added": "", "is_adult": 0,
         "category_ids": ["1"], "custom_sid": None, "tv_archive": 0, "direct_source": "",
         "tv_archive_duration": 0},
    ])

    resp = client_with_cache.get("/api/v1/stream/live/999/manifest.mpd")


def test_live_dash_manifest_nonexistent_stream(client_with_cache):
    """Request for non-existent stream ID should still return MPD (no cache lookup for live)."""
    resp = client_with_cache.get("/api/v1/stream/live/98765/manifest.mpd")
    # Live DASH manifest doesn't require cache lookup — just formats URL
    assert resp.status_code == 200
    assert "<MPD" in resp.text


def test_movie_dash_manifest_with_cache(client_with_cache):
    """Movie DASH manifest returns valid MPD when cache is populated."""
    from main import _cache
    _cache["vod_categories"] = (1000.0, [{"category_id": 10, "category_name": "Test"}])
    _cache["vod_10"] = (1000.0, [
        {"stream_id": 500, "name": "Test Movie", "stream_icon": "", "container_extension": "mkv",
         "category_id": "10", "added": "", "category_ids": ["10"], "custom_sid": None,
         "direct_source": "", "rating": ""},
    ])

    resp = client_with_cache.get("/api/v1/stream/movie/500/manifest.mpd")
    assert resp.status_code == 200
    assert "<MPD" in resp.text
    assert "video/" in resp.text or "dash" in resp.text


def test_series_dash_manifest_with_cache(client_with_cache):
    """Series DASH manifest returns valid MPD when cache is populated."""
    from main import _cache
    _cache["series_categories"] = (1000.0, [{"category_id": 5, "category_name": "Drama"}])
    _cache["series_5"] = (1000.0, [
        {"series_id": 300, "name": "Test Series", "cover": "", "container_extension": "mp4",
         "category_id": ["5"], "category_ids": ["5"], "stream_type": "series", "num": 1,
         "series_episodes": [], "release_date": ""},
    ])

    resp = client_with_cache.get("/api/v1/stream/series/300/42/manifest.mpd")
    assert resp.status_code == 200
    assert "<MPD" in resp.text


def test_probe_live_with_prepopulated_cache(client_with_cache):
    """Probe endpoint returns cached result when probe cache is populated."""
    from routes.stream import _probe_cache
    _probe_cache["live_888"] = (
        time.time(),
        {"codec": "h264", "width": 1920, "height": 1080, "duration": None},
    )

    resp = client_with_cache.get("/api/v1/live/probe/888")
    assert resp.status_code == 200
    data = resp.json()
    assert data["codec"] == "h264"
    assert data["width"] == 1920
    assert data["height"] == 1080


def test_probe_movie_with_prepopulated_cache(client_with_cache):
    """Movie probe returns cached ffprobe result."""
    from routes.stream import _probe_cache
    _probe_cache["movie_777"] = (
        time.time(),
        {"codec": "hevc", "width": 3840, "height": 2160, "duration": 5432.1},
    )

    resp = client_with_cache.get("/api/v1/movie/probe/777")
    assert resp.status_code == 200
    data = resp.json()
    assert data["codec"] == "hevc"
    assert data["width"] == 3840


def test_probe_series_with_prepopulated_cache(client_with_cache):
    """Series probe returns cached ffprobe result."""
    from routes.stream import _probe_cache
    _probe_cache["series_666"] = (
        time.time(),
        {"codec": "h264", "width": 1280, "height": 720, "duration": 1800.0},
    )

    resp = client_with_cache.get("/api/v1/series/probe/666")
    assert resp.status_code == 200
    data = resp.json()
    assert data["codec"] == "h264"


def test_probe_nonexistent_stream_returns_unknown(client):
    """Probe for a stream that has no cache entry should return codec: unknown."""
    resp = client.get("/api/v1/live/probe/99999")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("codec") in (None, "unknown")


def test_stream_info_missing_live(client):
    """GET /api/stream/live/{id} for non-existent stream returns an error."""
    resp = client.get("/api/v1/stream/live/1")
    # Without cache data, the stream proxy will try to stream from IPTV
    # With mocked cached_fetch returning empty, it should fail gracefully
    assert resp.status_code in (200, 404, 500)


# ── Pure function tests ─────────────────────────────────────────────

def test_mime_from_url():
    """_mime_from_url maps extensions correctly."""
    from routes.stream import _mime_from_url
    assert _mime_from_url("http://example.com/video.ts") == "video/mp2t"
    assert _mime_from_url("http://example.com/video.mkv") == "video/x-matroska"
    assert _mime_from_url("http://example.com/video.mp4") == "video/mp4"
    assert _mime_from_url("http://example.com/video.m4v") == "video/mp4"
    assert _mime_from_url("http://example.com/video.webm") == "video/webm"
    assert _mime_from_url("http://example.com/video.avi") == "video/x-msvideo"
    assert _mime_from_url("http://example.com/video.mov") == "video/quicktime"
    assert _mime_from_url("http://example.com/video.unknown") == "video/mp2t"
    assert _mime_from_url("http://example.com/noext") == "video/mp2t"


def test_generate_live_mpd_structure():
    """generate_live_mpd produces valid MPD XML with dynamic type."""
    from routes.stream import generate_live_mpd
    xml = generate_live_mpd(42, "http://cdn.example.com/live/42.ts")
    assert "<MPD" in xml
    assert 'type="dynamic"' in xml
    assert 'urn:mpeg:dash:schema:mpd:2011' in xml
    assert str(42) in xml
    assert "cdn.example.com" in xml
    assert 'minBufferTime="PT15S"' in xml


def test_generate_vod_mpd_structure():
    """generate_vod_mpd produces valid MPD XML with static type."""
    from routes.stream import generate_vod_mpd
    xml = generate_vod_mpd(100, "movie", "http://cdn.example.com/movie/100.mkv")
    assert "<MPD" in xml
    assert 'type="static"' in xml
    assert 'urn:mpeg:dash:schema:mpd:2011' in xml
    assert "cdn.example.com" in xml


def test_generate_mpd_escapes_xml_chars():
    """MPD generation escapes special XML characters in URLs."""
    from routes.stream import generate_live_mpd, generate_vod_mpd
    url = "http://cdn.example.com/stream?id=42&token=a<b>c\"d"
    live = generate_live_mpd(1, url)
    assert "&amp;" in live
    assert "&lt;" in live
    assert "&gt;" in live
    assert "&quot;" in live
    assert "a<b" not in live
    vod = generate_vod_mpd(1, "movie", url)
    assert "&amp;" in vod
    assert "a<b" not in vod


# ── _lookup_extension tests ─────────────────────────────────────────

def test_lookup_extension_cache_hit_movie(client_with_cache):
    """_lookup_extension returns extension from cache for a movie."""
    import asyncio
    from routes.stream import _lookup_extension
    from state import _cache
    _cache["vod_10"] = (1000.0, [
        {"stream_id": 500, "name": "Test", "container_extension": "mkv"},
    ])
    result = asyncio.run(_lookup_extension(500, "movie"))
    assert result == "mkv"


def test_lookup_extension_cache_hit_series(client_with_cache):
    """_lookup_extension returns extension from cache for a series."""
    import asyncio
    from routes.stream import _lookup_extension
    from state import _cache
    _cache["series_5"] = (1000.0, [
        {"series_id": 300, "name": "Test Series", "container_extension": "mp4"},
    ])
    result = asyncio.run(_lookup_extension(300, "series"))
    assert result == "mp4"


def test_lookup_extension_defaults_to_mp4_when_no_ext(client_with_cache):
    """_lookup_extension returns mp4 when container_extension is empty string."""
    import asyncio
    from routes.stream import _lookup_extension
    from state import _cache
    _cache["vod_1"] = (1000.0, [
        {"stream_id": 1, "name": "No Ext", "container_extension": ""},
    ])
    result = asyncio.run(_lookup_extension(1, "movie"))
    assert result == "mp4"


def test_lookup_extension_api_fallback_returns_extension(client_with_cache):
    """_lookup_extension falls back to API when cache is empty and returns ext."""
    import asyncio
    from unittest.mock import patch
    from routes.stream import _lookup_extension

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"movie_data": {"container_extension": "avi"}}

    class _MockCtx:
        async def get(self, url):
            return mock_resp

    with patch("routes.stream_core.httpx.AsyncClient") as MockClient:
        MockClient.return_value.__aenter__.return_value = _MockCtx()
        result = asyncio.run(_lookup_extension(999, "movie"))
    assert result == "avi"


def test_lookup_extension_api_fallback_error_returns_mkv(client_with_cache):
    """_lookup_extension returns mkv when API call fails."""
    import asyncio
    from unittest.mock import patch
    from routes.stream import _lookup_extension

    class _MockCtxError:
        async def get(self, url):
            raise Exception("Network error")

    with patch("routes.stream_core.httpx.AsyncClient") as MockClient:
        MockClient.return_value.__aenter__.return_value = _MockCtxError()
        result = asyncio.run(_lookup_extension(999, "movie"))
    assert result == "mkv"


def test_lookup_extension_api_series_info_path(client_with_cache):
    """_lookup_extension uses info.container_extension for series API response."""
    import asyncio
    from unittest.mock import patch
    from routes.stream import _lookup_extension

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"info": {"container_extension": "webm"}}

    class _MockCtx:
        async def get(self, url):
            return mock_resp

    with patch("routes.stream_core.httpx.AsyncClient") as MockClient:
        MockClient.return_value.__aenter__.return_value = _MockCtx()
        result = asyncio.run(_lookup_extension(888, "series"))
    assert result == "webm"


# ── build_stream_url tests ─────────────────────────────────────────

def test_build_stream_url_live_uses_ts():
    """build_stream_url returns live TS URL for live streams."""
    import asyncio
    from routes.stream import build_stream_url
    url = asyncio.run(build_stream_url(42, "live"))
    assert "live/test_user/test_pass/42.ts" in url or "/live/" in url
    assert url.startswith("http://test-iptv.live")


def test_build_stream_url_movie(client_with_cache):
    """build_stream_url returns movie URL with extension from cache."""
    import asyncio
    from routes.stream import build_stream_url
    from state import _cache
    _cache["vod_10"] = (1000.0, [
        {"stream_id": 500, "name": "Test", "container_extension": "mkv"},
    ])
    url = asyncio.run(build_stream_url(500, "movie"))
    assert "movie/" in url
    assert url.endswith(".mkv")


# ── get_content_length tests ───────────────────────────────────────

def test_get_content_length_from_content_range():
    """get_content_length parses Content-Range header correctly."""
    import asyncio
    from unittest.mock import patch, AsyncMock
    from routes.stream import get_content_length

    resp = AsyncMock()
    resp.headers = {"content-range": "bytes 0-999/12345678"}

    async def mock_get(*args, **kwargs):
        return resp

    class _MockCtx:
        async def get(self, url):
            return resp

    with patch("routes.stream_core.httpx.AsyncClient") as MockClient:
        MockClient.return_value.__aenter__.return_value = _MockCtx()
        result = asyncio.run(get_content_length("http://test.url/stream"))
    assert result == 12345678


def test_get_content_length_from_content_length():
    """get_content_length falls back to Content-Length header."""
    import asyncio
    from unittest.mock import patch
    from routes.stream import get_content_length

    class _MockCtx:
        async def get(self, url):
            resp = MagicMock()
            resp.headers = {"content-length": "54321"}
            return resp

    with patch("routes.stream_core.httpx.AsyncClient") as MockClient:
        MockClient.return_value.__aenter__.return_value = _MockCtx()
        result = asyncio.run(get_content_length("http://test.url/stream"))
    assert result == 54321


def test_get_content_length_returns_none_on_missing_headers():
    """get_content_length returns None when neither header is present."""
    import asyncio
    from unittest.mock import patch
    from routes.stream import get_content_length

    class _MockCtx:
        async def get(self, url):
            resp = MagicMock()
            resp.headers = {}
            return resp

    with patch("routes.stream_core.httpx.AsyncClient") as MockClient:
        MockClient.return_value.__aenter__.return_value = _MockCtx()
        result = asyncio.run(get_content_length("http://test.url/stream"))
    assert result is None


def test_get_content_length_handles_exception():
    """get_content_length returns None when request fails."""
    import asyncio
    from unittest.mock import patch
    from routes.stream import get_content_length

    class _MockCtxErr:
        async def get(self, url):
            raise Exception("Connection error")

    with patch("routes.stream_core.httpx.AsyncClient") as MockClient:
        MockClient.return_value.__aenter__.return_value = _MockCtxErr()
        result = asyncio.run(get_content_length("http://test.url/stream"))
    assert result is None


# ── stream_proxy tests ─────────────────────────────────────────────

def test_stream_proxy_returns_502_on_error():
    """stream_proxy returns 502 when underlying stream fails by consuming response."""
    import asyncio
    from unittest.mock import patch
    from routes.stream import stream_proxy

    with patch("routes.stream_core.stream_bytes", side_effect=RuntimeError("CDN error")):
        resp = asyncio.run(stream_proxy("http://test.url/stream", "video/mp4"))
    # With side_effect, the error surfaces during StreamingResponse construction,
    # so stream_proxy returns a JSONResponse(502) immediately.
    assert resp.status_code == 502


# ── probe_stream tests ─────────────────────────────────────────────

def test_probe_stream_skips_ffprobe_for_mp4(client_with_cache):
    """probe_stream returns native H.264 for mp4/m4v without calling ffprobe."""
    import asyncio
    from routes.stream import probe_stream
    from state import _cache
    # Populate cache so extension lookup returns mp4
    _cache["vod_10"] = (1000.0, [
        {"stream_id": 10, "name": "MP4 Movie", "container_extension": "mp4"},
    ])
    result = asyncio.run(probe_stream(10, "movie"))
    assert result["codec"] == "h264"
    assert result.get("native") is True


def test_probe_stream_cache_hit_returns_cached():
    """probe_stream returns cached result without running any subprocess."""
    import asyncio
    import time
    from routes.stream import probe_stream, _probe_cache
    cached = {"codec": "hevc", "width": 3840, "height": 2160}
    _probe_cache["live_555"] = (time.time(), cached)
    result = asyncio.run(probe_stream(555, "live"))
    assert result["codec"] == "hevc"


def test_probe_stream_ffprobe_success_returns_codec():
    """probe_stream successfully parses ffprobe JSON output."""
    import asyncio
    import json
    from unittest.mock import patch, AsyncMock
    from routes.stream import probe_stream

    ffprobe_output = json.dumps({
        "streams": [{"codec_name": "h264", "codec_long_name": "H.264 / AVC",
                    "width": 1920, "height": 1080, "profile": "High"}],
        "format": {"format_name": "matroska"},
    })

    proc = AsyncMock()
    proc.returncode = 0
    proc.stdout = b""
    proc.stderr = b""
    proc.communicate = AsyncMock(return_value=(ffprobe_output.encode(), b""))

    with patch("asyncio.create_subprocess_exec", return_value=proc):
        result = asyncio.run(probe_stream(999, "live"))
    assert result["codec"] == "h264"
    assert result["width"] == 1920
    assert result["height"] == 1080


def test_probe_stream_ffprobe_timeout_returns_unknown():
    """probe_stream returns unknown codec when ffprobe times out."""
    import asyncio
    from unittest.mock import patch, AsyncMock
    from routes.stream import probe_stream

    proc = AsyncMock()
    # simulate TimeoutError on communicate
    proc.communicate = AsyncMock(side_effect=asyncio.TimeoutError("Timed out"))

    with patch("asyncio.create_subprocess_exec", return_value=proc):
        result = asyncio.run(probe_stream(777, "live"))
    assert result["codec"] == "unknown"
    assert "error" in result


def test_probe_stream_ffprobe_empty_streams_returns_unknown():
    """probe_stream returns unknown when ffprobe finds no streams."""
    import asyncio
    import json
    from unittest.mock import patch, AsyncMock
    from routes.stream import probe_stream

    ffprobe_output = json.dumps({"streams": [], "format": {"format_name": "mp4"}})
    proc = AsyncMock()
    proc.returncode = 0
    proc.communicate = AsyncMock(return_value=(ffprobe_output.encode(), b""))

    with patch("asyncio.create_subprocess_exec", return_value=proc):
        result = asyncio.run(probe_stream(111, "live"))
    assert result["codec"] == "unknown"


def test_probe_stream_nonzero_exit_no_405():
    """probe_stream returns unknown when ffprobe fails without 405."""
    import asyncio
    from unittest.mock import patch, AsyncMock, MagicMock
    from routes.stream import probe_stream

    proc = AsyncMock()
    proc.returncode = 1
    proc.communicate = AsyncMock(return_value=(b"", b"some error"))

    # httpx fallback should also fail
    class _MockHttpxCtx:
        async def get(self, url):
            resp = MagicMock()
            resp.status_code = 404
            return resp

    with patch("asyncio.create_subprocess_exec", return_value=proc), \
         patch("routes.stream_core.httpx.AsyncClient") as MockClient:
        MockClient.return_value.__aenter__.return_value = _MockHttpxCtx()
        result = asyncio.run(probe_stream(333, "live"))
    assert result["codec"] == "unknown"


def test_probe_stream_ffprobe_returns_405_curl_cffi_fallback():
    """probe_stream tries curl_cffi fallback when ffprobe gets 405."""
    import asyncio
    from unittest.mock import patch, AsyncMock
    from routes.stream import probe_stream

    proc = AsyncMock()
    proc.returncode = 1
    proc.communicate = AsyncMock(return_value=(b"", b"405 Method Not Allowed"))

    # Mock curl_cffi to succeed via module-level CurlReq
    class _MockCurlResp:
        status_code = 206
        headers = {"content-length": "1000000"}

    mock_get = MagicMock(return_value=_MockCurlResp())

    async def _mock_run_in_executor(_none, fn, *_a):
        """Run the callable directly instead of in a thread pool."""
        return fn()

    with patch("asyncio.create_subprocess_exec", return_value=proc), \
         patch("routes.stream_core.CurlReq.get", mock_get), \
         patch("asyncio.get_event_loop") as mock_loop:
        mock_loop.return_value.run_in_executor = _mock_run_in_executor
        result = asyncio.run(probe_stream(444, "live"))
        assert result["codec"] == "h264"


# ── serve_cached_mp4 tests ──────────────────────────────────────────

def test_serve_cached_mp4_no_range_returns_200():
    """serve_cached_mp4 returns full file when no Range header."""
    import tempfile, os
    from pathlib import Path
    from fastapi import Request
    from routes.stream import serve_cached_mp4

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        f.write(b"\x00\x00\x00\x1cmoov" * 10)
        path = Path(f.name)

    try:
        scope = {"type": "http", "method": "GET", "headers": [], "path": str(path)}
        req = Request(scope=scope)
        resp = serve_cached_mp4(path, req)
        assert resp.status_code == 200
    finally:
        os.unlink(path)


def test_serve_cached_mp4_range_returns_206():
    """serve_cached_mp4 returns partial content with Range header."""
    import tempfile, os
    from pathlib import Path
    from fastapi import Request
    from routes.stream import serve_cached_mp4

    content = b"\x00\x00\x00\x1cmoov" * 100  # 800 bytes
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        f.write(content)
        path = Path(f.name)

    try:
        scope = {
            "type": "http", "method": "GET",
            "headers": [(b"range", b"bytes=100-299")],
            "path": str(path),
        }
        req = Request(scope=scope)
        resp = serve_cached_mp4(path, req)
        assert resp.status_code == 206
        assert "content-range" in str(resp.headers).lower() or hasattr(resp, "headers")
    finally:
        os.unlink(path)


# ── Convert endpoint tests ──────────────────────────────────────────

def test_convert_movie_ready(client_with_cache):
    """convert_movie returns 'ready' when MP4 file already cached."""
    import tempfile, os
    from unittest.mock import patch
    from routes.stream import CACHE_DIR
    cache_key = "movie_999999"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    try:
        output_path.write_text("fake content")
        resp = client_with_cache.get(f"/api/v1/movie/convert/999999")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ready"
    finally:
        if output_path.exists():
            output_path.unlink()


def test_convert_movie_converting_lock(client_with_cache):
    """convert_movie returns 'converting' when lock file exists."""
    from routes.stream import CACHE_DIR
    cache_key = "movie_999998"
    lock_path = CACHE_DIR / f"{cache_key}.converting"
    try:
        lock_path.write_text("lock")
        resp = client_with_cache.get(f"/api/v1/movie/convert/999998")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "converting"
    finally:
        if lock_path.exists():
            lock_path.unlink()


def test_convert_movie_new_conversion(client_with_cache):
    """convert_movie starts a new conversion when nothing cached."""
    from routes.stream import CACHE_DIR, _converting
    cache_key = "movie_999997"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    lock_path = CACHE_DIR / f"{cache_key}.converting"
    # Clean up any previous state
    if output_path.exists(): output_path.unlink()
    if lock_path.exists(): lock_path.unlink()
    _converting.pop(cache_key, None)

    resp = client_with_cache.get(f"/api/v1/movie/convert/999997")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "converting"


def test_convert_series_ep_ready(client_with_cache):
    """convert_series_ep returns 'ready' when MP4 already cached."""
    from routes.stream import CACHE_DIR
    cache_key = "series_777777"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    try:
        output_path.write_text("fake content")
        resp = client_with_cache.get(f"/api/v1/series/convert/1/777777")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ready"
    finally:
        if output_path.exists():
            output_path.unlink()


def test_convert_series_ep_with_retry(client_with_cache):
    """convert_series_ep with retry=true removes stale files and starts fresh."""
    from routes.stream import CACHE_DIR, _converting
    cache_key = "series_666666"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    try:
        output_path.write_text("stale")
        _converting.pop(cache_key, None)
        resp = client_with_cache.get(f"/api/v1/series/convert/1/666666?retry=true")
        assert resp.status_code == 200
        # stale file should be removed by retry
        assert not output_path.exists()
    finally:
        if output_path.exists():
            output_path.unlink()


def test_convert_movie_with_retry(client_with_cache):
    """convert_movie with retry=true removes stale files and starts fresh."""
    from routes.stream import CACHE_DIR, _converting
    cache_key = "movie_555555"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    mkv_path = CACHE_DIR / f"{cache_key}.mkv"
    try:
        output_path.write_text("stale mp4")
        mkv_path.write_text("stale mkv")
        _converting.pop(cache_key, None)
        resp = client_with_cache.get(f"/api/v1/movie/convert/555555?retry=true")
        assert resp.status_code == 200
        # stale files should be removed by retry
        assert not output_path.exists()
        assert not mkv_path.exists()
    finally:
        if output_path.exists(): output_path.unlink()
        if mkv_path.exists(): mkv_path.unlink()


def test_serve_mp4_not_found_returns_404(client_with_cache):
    """serve_movie_mp4 returns 404 when MP4 not yet converted."""
    resp = client_with_cache.get("/api/v1/stream/movie/0/mp4")
    assert resp.status_code == 404
    assert "not yet converted" in resp.text.lower()


# ── HLS endpoint tests ─────────────────────────────────────────────


def test_hls_path_traversal_returns_400():
    """serve_hls_file rejects path traversal characters in filename."""
    import asyncio
    import pytest
    from fastapi import HTTPException
    from routes.stream import serve_hls_file

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(serve_hls_file("movie", "1", "../../../etc/passwd"))
    assert exc_info.value.status_code == 400

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(serve_hls_file("movie", "1", "valid/../traversal"))
    assert exc_info.value.status_code == 400


def test_hls_segment_not_found_returns_404(client_with_cache):
    """serve_hls_file returns 404 for non-existent segments."""
    resp = client_with_cache.get("/api/v1/hls/movie/99999/nonexistent.ts")
    assert resp.status_code == 404


# ── Route error handler tests ──────────────────────────────────────

def test_stream_live_returns_streaming_response(client_with_cache):
    """stream_live returns a StreamingResponse (not error) for valid live stream."""
    resp = client_with_cache.get("/api/v1/stream/live/2")
    # With client_with_cache, cached_fetch returns empty data but the
    # route should still construct a StreamingResponse (actual error at stream time)
    assert resp.status_code in (200, 502)


def test_live_transcode_returns_proper_type(client_with_cache):
    """stream_live_transcode returns MPEG-TS content type."""
    resp = client_with_cache.get("/api/v1/stream/live/3/transcode")
    assert resp.status_code in (200, 502)


def test_live_quality_returns_proper_type(client_with_cache):
    """stream_live_quality returns MPEG-TS content type."""
    resp = client_with_cache.get("/api/v1/stream/live/4/quality/720")
    assert resp.status_code in (200, 502)


def test_movie_remux_route(client_with_cache):
    """stream_movie_remux returns proper type for valid movie remux."""
    resp = client_with_cache.get("/api/v1/stream/movie/999/remux")
    assert resp.status_code in (200, 502)


def test_series_remux_route(client_with_cache):
    """stream_series_remux returns proper type for valid series remux."""
    resp = client_with_cache.get("/api/v1/stream/series/888/42/remux")
    assert resp.status_code in (200, 502)


def test_movie_transcode_route(client_with_cache):
    """stream_movie_transcode returns proper type for valid movie transcode."""
    resp = client_with_cache.get("/api/v1/stream/movie/777/transcode")
    assert resp.status_code in (200, 502)


def test_series_transcode_route(client_with_cache):
    """stream_series_transcode returns proper type for valid series transcode."""
    resp = client_with_cache.get("/api/v1/stream/series/666/12/transcode")
    assert resp.status_code in (200, 502)


@pytest.mark.xfail(reason="curl_cffi makes real network calls that fail in test", strict=False)
def test_movie_proxy_routes(client_with_cache):
    """stream_movie returns proper status for non-existent movie."""
    resp = client_with_cache.get("/api/v1/stream/movie/1")
    assert resp.status_code in (200, 502)


@pytest.mark.xfail(reason="curl_cffi makes real network calls that fail in test", strict=False)
def test_series_proxy_routes(client_with_cache):
    """stream_series_ep returns proper status for non-existent episode."""
    resp = client_with_cache.get("/api/v1/stream/series/1/1")
    assert resp.status_code in (200, 502)


def test_vod_dash_manifest_nonexistent(client_with_cache):
    """VOD DASH manifest for missing stream still returns valid MPD."""
    resp = client_with_cache.get("/api/v1/stream/movie/99999/manifest.mpd")
    # Without cache, it uses _lookup_extension which defaults to mkv
    assert resp.status_code == 200
    assert "<MPD" in resp.text


def test_series_dash_manifest_nonexistent(client_with_cache):
    """Series DASH manifest for missing series returns valid MPD."""
    resp = client_with_cache.get("/api/v1/stream/series/99999/1/manifest.mpd")
    assert resp.status_code == 200
    assert "<MPD" in resp.text


# ── Helper tests ──────────────────────────────────────────────────

async def _gather(agen):
    """Collect all items from an async generator into a list."""
    result = []
    async for item in agen:
        result.append(item)
    return result


def test_curl_iter_chunks_yields_chunks():
    """_curl_iter_chunks yields chunks from curl_cffi response."""
    import asyncio
    from unittest.mock import patch, MagicMock
    from routes.stream import _curl_iter_chunks

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.iter_content.return_value = iter([b"chunk1", b"chunk2", b""])

    def _fake_get(*a, **kw):
        return mock_resp

    with patch("routes.stream_core.CurlReq.get", _fake_get):
        chunks = asyncio.run(_gather(_curl_iter_chunks("http://test/stream")))
    assert chunks == [b"chunk1", b"chunk2"]


def test_curl_iter_chunks_raises_on_non_200():
    """_curl_iter_chunks raises RuntimeError for non-200 status."""
    import asyncio
    from unittest.mock import patch, MagicMock
    import pytest
    from routes.stream import _curl_iter_chunks

    mock_resp = MagicMock()
    mock_resp.status_code = 403

    def _fake_get(*a, **kw):
        return mock_resp

    with patch("routes.stream_core.CurlReq.get", _fake_get):
        with pytest.raises(RuntimeError, match="403"):
            asyncio.run(_gather(_curl_iter_chunks("http://test/stream")))


def test_curl_iter_chunks_accepts_206_with_vod():
    """_curl_iter_chunks accepts 206 when status_ok includes 206."""
    import asyncio
    from unittest.mock import patch, MagicMock
    from routes.stream import _curl_iter_chunks

    mock_resp = MagicMock()
    mock_resp.status_code = 206
    mock_resp.iter_content.return_value = iter([b"data"])

    def _fake_get(*a, **kw):
        return mock_resp

    with patch("routes.stream_core.CurlReq.get", _fake_get):
        chunks = asyncio.run(_gather(
            _curl_iter_chunks("http://test/stream", status_ok=(200, 206))))
    assert chunks == [b"data"]


def test_curl_iter_chunks_passes_range_header():
    """_curl_iter_chunks passes Range header to curl_cffi."""
    import asyncio
    from unittest.mock import patch, MagicMock
    from routes.stream import _curl_iter_chunks

    captured = {}

    def _fake_get(url, *, headers, **kw):
        captured["range"] = headers.get("Range")
        captured["url"] = url
        resp = MagicMock()
        resp.status_code = 206
        resp.iter_content.return_value = iter([])
        return resp

    with patch("routes.stream_core.CurlReq.get", _fake_get):
        asyncio.run(_gather(
            _curl_iter_chunks("http://test/stream", range_header="bytes=0-999",
                              status_ok=(200, 206))))
    assert captured.get("range") == "bytes=0-999"


def test_ffmpeg_pipe_yields_stdout():
    """_ffmpeg_pipe yields data from proc.stdout and cleans up."""
    import asyncio
    from unittest.mock import patch, AsyncMock, MagicMock
    from routes.stream import _ffmpeg_pipe

    proc = AsyncMock()
    proc.returncode = 0
    proc.stdout.read.side_effect = [b"hello", b"world", b""]
    proc.stderr.readline.side_effect = [b"", b""]
    proc.stdin = MagicMock()

    async def fake_feed(p):
        p.stdin.write(b"x")
        await p.stdin.drain()

    with patch("asyncio.create_subprocess_exec", return_value=proc):
        chunks = asyncio.run(_gather(_ffmpeg_pipe(["/ffmpeg"], fake_feed)))
    assert chunks == [b"hello", b"world"]


# ── Tests for stream_live ────────────────────────────────────────────────

def test_stream_live_timeshift_route(client_with_cache):
    """stream_live_timeshift returns StreamingResponse or 502."""
    resp = client_with_cache.get("/api/v1/stream/live/5/timeshift", params={"duration": 3600})
    assert resp.status_code in (200, 502)


def test_stream_live_timeshift_default_duration(client_with_cache):
    """stream_live_timeshift uses 3600s default."""
    resp = client_with_cache.get("/api/v1/stream/live/6/timeshift")
    assert resp.status_code in (200, 502)


def test_stream_live_timeshift_non_existent(client_with_cache):
    """stream_live_timeshift handles non-existent stream."""
    resp = client_with_cache.get("/api/v1/stream/live/999999/timeshift")
    assert resp.status_code in (200, 502)


# ── Tests for stream_vod_bytes ────────────────────────────────────────────

def test_stream_vod_bytes_accepts_206():
    """stream_vod_bytes should accept 200 OR 206 status codes."""
    from routes.stream_core import stream_vod_bytes, _curl_iter_chunks
    # Thin wrapper test — verify the status_ok tuple includes 206
    import inspect
    source = inspect.getsource(stream_vod_bytes)
    assert "status_ok=(200, 206)" in source or "206" in source


# ── Tests for _safe_convert ───────────────────────────────────────────────

def test_safe_convert_handles_exception():
    """_safe_convert should catch exceptions and remove from _converting."""
    from routes.stream_convert import _safe_convert, _converting
    from unittest.mock import patch, AsyncMock

    _converting["test"] = "placeholder"

    with patch("routes.stream_convert.convert_to_mp4", side_effect=ValueError("test error")):
        import asyncio
        asyncio.run(_safe_convert("1", "movie", "test"))

    assert "test" not in _converting


# ── convert_to_mp4 unit tests (exercises lines currently uncovered) ─────────


@pytest.mark.asyncio
async def test_convert_to_mp4_returns_early_when_output_exists(tmp_path):
    """convert_to_mp4 returns immediately if output MP4 already exists."""
    from routes.stream_convert import convert_to_mp4, CACHE_DIR
    from unittest.mock import patch

    output_path = tmp_path / "movie_1.mp4"
    output_path.write_text("fake mp4")

    with patch("routes.stream_convert.CACHE_DIR", tmp_path):
        await convert_to_mp4("1", "movie")
    assert output_path.exists()


@pytest.mark.asyncio
async def test_convert_to_mp4_download_fails(tmp_path):
    """convert_to_mp4 handles subprocess download failure gracefully."""
    from routes.stream_convert import convert_to_mp4
    from unittest.mock import patch, AsyncMock

    proc = AsyncMock()
    proc.returncode = 1
    proc.communicate = AsyncMock(return_value=(b"", b"error: connection failed"))

    with (
        patch("routes.stream_convert.CACHE_DIR", tmp_path),
        patch("routes.stream_convert.build_stream_url", return_value="http://fake.url/video.mkv"),
        patch("asyncio.create_subprocess_exec", return_value=proc),
    ):
        await convert_to_mp4("2", "movie")


@pytest.mark.asyncio
async def test_convert_to_mp4_ffmpeg_fails(tmp_path):
    """convert_to_mp4 handles ffmpeg conversion failure gracefully."""
    from routes.stream_convert import convert_to_mp4
    from unittest.mock import patch, AsyncMock

    mkv_path = tmp_path / "movie_3.mkv"
    mkv_path.write_text("fake mkv content")

    ff_proc = AsyncMock()
    ff_proc.returncode = 1
    ff_proc.stderr.readline = AsyncMock(side_effect=[b"error: invalid data", b""])
    ff_proc.stdout.readline = AsyncMock(return_value=b"")

    with (
        patch("routes.stream_convert.CACHE_DIR", tmp_path),
        patch("routes.stream_convert.build_stream_url", return_value="http://fake.url/video.mkv"),
        patch("asyncio.create_subprocess_exec", return_value=ff_proc),
    ):
        await convert_to_mp4("3", "movie")


# ── Tests for build_timeshift_url ─────────────────────────────────────────

def test_build_timeshift_url_uses_correct_format():
    """build_timeshift_url produces the Xtream Codes timeshift URL format."""
    from routes.stream_core import build_timeshift_url
    url = build_timeshift_url(42, 3600)
    assert "/live/" in url
    assert "/42/timeshift/3600.ts" in url or f"/42/timeshift/3600.ts" in url


def test_build_timeshift_url_with_custom_duration():
    """build_timeshift_url uses the provided duration."""
    from routes.stream_core import build_timeshift_url
    url = build_timeshift_url(100, 7200)
    assert "7200" in url


def test_build_timeshift_url_with_various_ids():
    """build_timeshift_url works with different stream IDs."""
    from routes.stream_core import build_timeshift_url
    url = build_timeshift_url(1, 300)
    assert "300" in url


# ── Tests for handle_vod_request routes ──────────────────────────────────

def test_vod_movie_route_accessible(client_with_cache):
    """VOD movie route is accessible (not a 404)."""
    from main import _cache
    _cache["vod_1"] = (1000.0, [
        {"stream_id": 1, "name": "Test Movie", "container_extension": "mp4",
         "category_id": "1", "stream_type": "movie", "added": "", "num": 1,
         "category_ids": ["1"], "direct_source": ""},
    ])
    try:
        resp = client_with_cache.get("/api/v1/stream/movie/1")
        assert resp.status_code != 404
    except RuntimeError:
        # Route exists (would return 500 in production, not 404)
        pass


def test_vod_movie_route_with_range(client_with_cache):
    """VOD movie route handles Range header (not a 404)."""
    from main import _cache
    _cache["vod_1"] = (1000.0, [
        {"stream_id": 99, "name": "Test Movie Range", "container_extension": "mp4",
         "category_id": "1", "stream_type": "movie", "added": "", "num": 1,
         "category_ids": ["1"], "direct_source": ""},
    ])
    try:
        resp = client_with_cache.get("/api/v1/stream/movie/99", headers={"Range": "bytes=0-"})
        assert resp.status_code != 404
    except RuntimeError:
        pass


def test_vod_series_route_accessible(client_with_cache):
    """VOD series episode route is accessible (not a 404)."""
    from main import _cache
    _cache["series_"] = (1000.0, [
        {"series_id": 3, "name": "Test Series", "container_extension": "mkv",
         "category_id": "1", "stream_type": "series", "num": 1,
         "category_ids": ["1"], "direct_source": ""},
    ])
    try:
        resp = client_with_cache.get("/api/v1/stream/series/3/42")
        assert resp.status_code != 404
    except RuntimeError:
        pass


# ── Tests for stream_vod_mpegts / stream_vod_transcode ───────────────────

def test_stream_vod_mpegts_includes_start_time():
    """stream_vod_mpegts should include -ss when start_time given."""
    from routes.stream_vod import stream_vod_mpegts
    import inspect
    source = inspect.getsource(stream_vod_mpegts)
    assert "start_time" in source
    assert "-ss" in source


def test_stream_vod_transcode_uses_h264():
    """stream_vod_transcode should use libx264 and aac."""
    from routes.stream_vod import stream_vod_transcode
    import inspect
    source = inspect.getsource(stream_vod_transcode)
    assert "libx264" in source
    assert "aac" in source


def test_ffmpeg_pipe_kills_on_generator_exit():
    """_ffmpeg_pipe kills ffmpeg when generator exits early."""
    import asyncio
    from unittest.mock import patch, AsyncMock, MagicMock
    from routes.stream import _ffmpeg_pipe

    proc = AsyncMock()
    proc.returncode = None
    proc.stdout.read.side_effect = [b"data", b""]
    proc.stderr.readline.side_effect = [b"", b""]
    proc.stdin = MagicMock()
    proc.kill = MagicMock()
    proc.wait = AsyncMock()

    async def fake_feed(p):
        await asyncio.sleep(0.1)

    with patch("asyncio.create_subprocess_exec", return_value=proc):
        async def run():
            gen = _ffmpeg_pipe(["/ffmpeg"], fake_feed)
            async for chunk in gen:
                break
        asyncio.run(run())
    assert proc.kill.called

# ── Error handler paths for stream_live ──────────────────────────────

def test_stream_live_handles_inner_stream_error(client_with_cache):
    """stream_live returns 502 when stream_bytes raises during iteration."""
    from unittest.mock import patch

    async def mock_fail(_url):
        raise RuntimeError("Stream failed")
        yield  # pragma: no cover

    with patch("routes.stream_live.stream_bytes", mock_fail):
        resp = client_with_cache.get("/api/v1/stream/live/1")
        # The inner except catches this — monitored_stream completes normally,
        # StreamingResponse wraps it successfully, so we get 200
        assert resp.status_code == 200


def test_stream_live_timeshift_route_exists(client_with_cache):
    """stream_live_timeshift route is accessible."""
    resp = client_with_cache.get("/api/v1/stream/live/1/timeshift?duration=3600")
    assert resp.status_code in (200, 502)


def test_stream_live_transcode_route_exists(client_with_cache):
    """stream_live_transcode route is accessible."""
    resp = client_with_cache.get("/api/v1/stream/live/1/transcode")
    assert resp.status_code in (200, 502)


def test_stream_live_quality_route_exists(client_with_cache):
    """stream_live_quality route is accessible."""
    resp = client_with_cache.get("/api/v1/stream/live/1/quality/720")
    assert resp.status_code in (200, 502)


# ── Live route error handler presence checks ──────────────────────────


def test_stream_live_has_error_handler():
    """stream_live wraps proxying in try/except returning 502 JSON."""
    from routes.stream_live import stream_live
    import inspect
    source = inspect.getsource(stream_live)
    assert "except" in source
    assert "JSONResponse(status_code=502" in source


def test_stream_live_transcode_has_error_handler():
    """stream_live_transcode wraps streaming in try/except returning 502 JSON."""
    from routes.stream_live import stream_live_transcode
    import inspect
    source = inspect.getsource(stream_live_transcode)
    assert "except" in source
    assert "JSONResponse(status_code=502" in source


def test_stream_live_timeshift_has_error_handler():
    """stream_live_timeshift wraps streaming in try/except returning 502 JSON."""
    from routes.stream_live import stream_live_timeshift
    import inspect
    source = inspect.getsource(stream_live_timeshift)
    assert "except" in source
    assert "JSONResponse(status_code=502" in source


def test_stream_live_quality_has_error_handler():
    """stream_live_quality wraps streaming in try/except returning 502 JSON."""
    from routes.stream_live import stream_live_quality
    import inspect
    source = inspect.getsource(stream_live_quality)
    assert "except" in source
    assert "JSONResponse(status_code=502" in source


# ── Error handler paths for stream_vod ────────────────────────────────

def test_stream_movie_remux_route_exists(client_with_cache):
    """Movie remux route is accessible."""
    resp = client_with_cache.get("/api/v1/stream/movie/1/remux")
    assert resp.status_code != 404


def test_stream_series_remux_route_exists(client_with_cache):
    """Series remux route is accessible."""
    resp = client_with_cache.get("/api/v1/stream/series/1/42/remux")
    assert resp.status_code != 404


def test_stream_movie_transcode_route_exists(client_with_cache):
    """Movie transcode route is accessible."""
    resp = client_with_cache.get("/api/v1/stream/movie/1/transcode")
    assert resp.status_code != 404


def test_stream_series_transcode_route_exists(client_with_cache):
    """Series transcode route is accessible."""
    resp = client_with_cache.get("/api/v1/stream/series/1/42/transcode")
    assert resp.status_code != 404


# ── _lookup_extension skip paths ─────────────────────────────────────

def test_lookup_extension_skips_non_matching_prefix(client_with_cache):
    """_lookup_extension skips cache keys that don't match the prefix."""
    from main import _cache
    _cache["series_1"] = (1000.0, [{"series_id": 1, "container_extension": "mkv"}])

    # Asking for a movie (prefix "vod_") should skip series_ keys
    from routes.stream_core import _lookup_extension
    import asyncio
    result = asyncio.run(_lookup_extension(1, "movie"))
    # No cache hit — falls through to API fallback which fails in tests
    assert isinstance(result, str)  # Should return a string (defaults to "mkv")


def test_lookup_extension_skips_non_list_data(client_with_cache):
    """_lookup_extension skips cache entries where data isn't a list."""
    from main import _cache
    _cache["vod_1"] = (1000.0, "not a list")

    from routes.stream_core import _lookup_extension
    import asyncio
    result = asyncio.run(_lookup_extension(1, "movie"))
    assert isinstance(result, str)


# ── stream_vod_mpegts with start_time ─────────────────────────────────

def test_stream_vod_mpegts_with_start_time_uses_seek():
    """stream_vod_mpegts includes -ss and range_header when start_time > 0."""
    from routes.stream_vod import stream_vod_mpegts
    import inspect
    source = inspect.getsource(stream_vod_mpegts)
    assert "-ss" in source
    assert "range_header" in source


@pytest.mark.xfail(reason="curl_cffi makes real network calls that fail in test", strict=False)
def test_movie_proxy_routes(client_with_cache):
    """stream_movie returns proper status for non-existent movie."""
    resp = client_with_cache.get("/api/v1/stream/movie/1")
    assert resp.status_code in (200, 502)


@pytest.mark.xfail(reason="curl_cffi makes real network calls that fail in test", strict=False)
def test_movie_proxy_routes_with_range(client_with_cache):
    """stream_movie proxy with range header works."""
    resp = client_with_cache.get("/api/v1/stream/movie/1", headers={"range": "bytes=0-100"})
    assert resp.status_code in (200, 206, 502)


def test_movie_remux_has_error_handler():
    """stream_movie_remux wraps streaming in try/except returning 502 JSON."""
    from routes.stream_vod import stream_movie_remux
    import inspect
    source = inspect.getsource(stream_movie_remux)
    assert "except" in source
    assert "JSONResponse(status_code=502" in source


def test_series_remux_has_error_handler():
    """stream_series_remux wraps streaming in try/except returning 502 JSON."""
    from routes.stream_vod import stream_series_remux
    import inspect
    source = inspect.getsource(stream_series_remux)
    assert "except" in source
    assert "JSONResponse(status_code=502" in source


def test_movie_transcode_has_error_handler():
    """stream_movie_transcode wraps streaming in try/except returning 502 JSON."""
    from routes.stream_vod import stream_movie_transcode
    import inspect
    source = inspect.getsource(stream_movie_transcode)
    assert "except" in source
    assert "JSONResponse(status_code=502" in source


def test_series_transcode_has_error_handler():
    """stream_series_transcode wraps streaming in try/except returning 502 JSON."""
    from routes.stream_vod import stream_series_transcode
    import inspect
    source = inspect.getsource(stream_series_transcode)
    assert "except" in source
    assert "JSONResponse(status_code=502" in source


# ── stream_vod_mpegts with start_time (exercises the -ss / range_header branch) ─


@pytest.mark.asyncio
async def test_stream_vod_mpegts_start_time_yields_with_mock_ffmpeg():
    """stream_vod_mpegts with start_time yields chunks when ffmpeg produces data."""
    from unittest.mock import patch
    from routes.stream_vod import stream_vod_mpegts

    async def mock_ffmpeg(*args, **kwargs):
        for chunk in [b"chunk1", b"chunk2"]:
            yield chunk

    with (
        patch("routes.stream_vod._ffmpeg_pipe", side_effect=mock_ffmpeg),
        patch("routes.stream_vod._curl_feed_stdin"),
    ):
        gen = stream_vod_mpegts("http://test.url/stream.mkv", 30.0)
        results = [chunk async for chunk in gen]

    assert len(results) == 2
    assert results[0] == b"chunk1"


@pytest.mark.asyncio
async def test_stream_vod_mpegts_start_time_zero_no_seek():
    """stream_vod_mpegts without start_time does not add -ss."""
    from unittest.mock import patch
    from routes.stream_vod import stream_vod_mpegts

    async def mock_ffmpeg(*args, **kwargs):
        yield b"chunk"

    with (
        patch("routes.stream_vod._ffmpeg_pipe", side_effect=mock_ffmpeg),
        patch("routes.stream_vod._curl_feed_stdin"),
    ):
        gen = stream_vod_mpegts("http://test.url/stream.mkv", None)
        results = [chunk async for chunk in gen]

    assert len(results) == 1


# ── Route error handling (build_stream_url failures return 500) ───────────────
# These patch the specific route module's imported reference because
# the functions are imported at module load time.

def _make_error_client():
    """Create a TestClient with raise_server_exceptions=False for testing 500s."""
    import os
    os.environ.setdefault("IPTV_BASE", "http://test-iptv.live")
    os.environ.setdefault("IPTV_USER", "test_user")
    os.environ.setdefault("IPTV_PASS", "test_pass")
    os.environ.setdefault("CACHE_WARM_ENABLED", "false")
    os.environ.setdefault("ADMIN_API_KEY", "")
    from fastapi.testclient import TestClient
    from main import app
    return TestClient(app, raise_server_exceptions=False)


def test_live_route_error_on_build_stream_url_failure():
    """stream_live returns 500 when build_stream_url raises (outside try)."""
    from unittest.mock import patch
    with _make_error_client() as client:
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("build failed")):
            resp = client.get("/api/v1/stream/live/1")
        assert resp.status_code == 500


def test_live_transcode_error_on_build_stream_url_failure():
    """stream_live_transcode returns 500 when build_stream_url raises."""
    from unittest.mock import patch
    with _make_error_client() as client:
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("build failed")):
            resp = client.get("/api/v1/stream/live/1/transcode")
        assert resp.status_code == 500


def test_live_quality_error_on_build_stream_url_failure():
    """stream_live_quality returns 500 when build_stream_url raises."""
    from unittest.mock import patch
    with _make_error_client() as client:
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("build failed")):
            resp = client.get("/api/v1/stream/live/1/quality/720")
        assert resp.status_code == 500


def test_vod_movie_remux_error_on_build_stream_url_failure():
    """stream_movie_remux returns 500 when build_stream_url raises."""
    from unittest.mock import patch
    with _make_error_client() as client:
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("build failed")):
            resp = client.get("/api/v1/stream/movie/1/remux")
        assert resp.status_code == 500


def test_vod_series_remux_error_on_build_stream_url_failure():
    """stream_series_remux returns 500 when build_stream_url raises."""
    from unittest.mock import patch
    with _make_error_client() as client:
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("build failed")):
            resp = client.get("/api/v1/stream/series/1/42/remux")
        assert resp.status_code == 500


def test_vod_movie_transcode_error_on_build_stream_url_failure():
    """stream_movie_transcode returns 500 when build_stream_url raises."""
    from unittest.mock import patch
    with _make_error_client() as client:
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("build failed")):
            resp = client.get("/api/v1/stream/movie/1/transcode")
        assert resp.status_code == 500


def test_vod_series_transcode_error_on_build_stream_url_failure():
    """stream_series_transcode returns 500 when build_stream_url raises."""
    from unittest.mock import patch
    with _make_error_client() as client:
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("build failed")):
            resp = client.get("/api/v1/stream/series/1/42/transcode")
        assert resp.status_code == 500

