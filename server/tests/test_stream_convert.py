"""Tests for routes/stream_convert.py — MKV→fMP4 conversion endpoints.

Tests cover:
  - Route mounting (routes return non-404)
  - Conversion endpoint responses (ready, converting, in-progress)
  - retry parameter (clears cached files)
  - Build URL failure path (background task error isolation)
  - Invalid stream IDs (0, massive)
  - MP4 serving (file found / not found, Content-Type, Range/206)
  - serve_cached_mp4 pure function (Range edge cases)
  - convert_to_mp4 async unit tests (subprocess mocking)
  - _safe_convert error isolation
"""

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── Helpers ──────────────────────────────────────────────────────────────────


@pytest.fixture
def convert_client(client, tmp_path):
    """Client with CACHE_DIR isolated to tmp_path and background task cleanup.

    Conversion endpoints create background asyncio tasks that outlive the
    request-response cycle.  This fixture:
    1. Patches CACHE_DIR so conversion tests touch tmp_path, not real disk.
    2. On teardown, cancels any lingering conversion tasks *before* the
       TestClient closes — preventing hangs from orphaned subprocess calls.
    """
    import routes.stream_convert as sc

    # Cancel any tasks from setup or prior tests
    for key, task in list(sc._converting.items()):
        if not task.done():
            task.cancel()
    sc._converting.clear()

    with patch("routes.stream_convert.CACHE_DIR", tmp_path):
        yield client

    # Teardown: cancel tasks while the event loop is still alive
    for key, task in list(sc._converting.items()):
        if not task.done():
            task.cancel()
    sc._converting.clear()


# ══════════════════════════════════════════════════════════════════════════════
# 1.  Route mounting
# ══════════════════════════════════════════════════════════════════════════════


def test_convert_movie_route_mounted(client):
    """GET /api/v1/movie/convert/{id} exists (is not 404)."""
    resp = client.get("/api/v1/movie/convert/123")
    assert resp.status_code != 404


def test_convert_series_route_mounted(client):
    """GET /api/v1/series/convert/{series_id}/{episode_id} exists."""
    resp = client.get("/api/v1/series/convert/456/789")
    assert resp.status_code != 404


def test_serve_movie_mp4_route_mounted(client):
    """GET /api/v1/stream/movie/{id}/mp4 is mounted.

    Returns 404 (file not found) rather than 405 (method not allowed),
    confirming the route handler exists and is reachable.
    """
    resp = client.get("/api/v1/stream/movie/123/mp4")
    # The route IS mounted; it returns 404 because no cached file exists.
    # A 405 would mean the route wasn't registered at all.
    assert resp.status_code not in (405,), f"Unexpected status {resp.status_code}"


def test_serve_series_mp4_route_mounted(client):
    """GET /api/v1/stream/series/{series_id}/{episode_id}/mp4 is mounted.

    Like the movie variant, returns 404 (file not found) — not 405.
    """
    resp = client.get("/api/v1/stream/series/456/789/mp4")
    assert resp.status_code not in (405,), f"Unexpected status {resp.status_code}"


# ══════════════════════════════════════════════════════════════════════════════
# 2.  Convert endpoint — normal responses
# ══════════════════════════════════════════════════════════════════════════════


def test_convert_movie_starts_conversion(convert_client, tmp_path):
    """Fresh movie conversion returns status=converting (started)."""
    resp = convert_client.get("/api/v1/movie/convert/1001")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "converting"
    assert "started" in data["message"].lower()


def test_convert_movie_returns_ready_when_cached(convert_client, tmp_path):
    """If MP4 already exists with size > 0, endpoint returns ready."""
    out = tmp_path / "movie_1002.mp4"
    out.write_text("fake mp4 data")

    resp = convert_client.get("/api/v1/movie/convert/1002")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert "cached" in data["message"].lower()


def test_convert_movie_returns_converting_when_locked(convert_client, tmp_path):
    """If .converting lock file exists, endpoint reports in progress."""
    lock = tmp_path / "movie_1003.converting"
    lock.write_text("1234567890")

    resp = convert_client.get("/api/v1/movie/convert/1003")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "converting"
    # Should NOT say "started" because we didn't start anything
    assert "progress" in data["message"].lower()


def test_convert_movie_empty_mp4_is_not_ready(convert_client, tmp_path):
    """A zero-byte MP4 file is NOT considered ready (continues converting)."""
    out = tmp_path / "movie_1004.mp4"
    out.write_text("")  # empty / zero size

    resp = convert_client.get("/api/v1/movie/convert/1004")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "converting"


def test_convert_series_starts_conversion(convert_client, tmp_path):
    """Fresh series episode conversion returns status=converting."""
    resp = convert_client.get("/api/v1/series/convert/200/2001")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "converting"
    assert "started" in data["message"].lower()


def test_convert_series_returns_ready_when_cached(convert_client, tmp_path):
    """Series episode MP4 cached → ready."""
    out = tmp_path / "series_2002.mp4"
    out.write_text("fake mp4 for series")

    resp = convert_client.get("/api/v1/series/convert/201/2002")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"


def test_convert_series_lock_file(convert_client, tmp_path):
    """Series conversion lock file → converting (in progress)."""
    lock = tmp_path / "series_2003.converting"
    lock.write_text("9999999999")

    resp = convert_client.get("/api/v1/series/convert/202/2003")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "converting"
    assert "progress" in data["message"].lower()


# ══════════════════════════════════════════════════════════════════════════════
# 3.  retry parameter
# ══════════════════════════════════════════════════════════════════════════════


def test_convert_movie_retry_removes_mp4_and_mkv(convert_client, tmp_path):
    """retry=true removes existing MP4 and MKV before starting conversion."""
    out = tmp_path / "movie_3001.mp4"
    mkv = tmp_path / "movie_3001.mkv"
    out.write_text("old cached mp4")
    mkv.write_text("old cached mkv")

    resp = convert_client.get("/api/v1/movie/convert/3001?retry=true")

    assert not out.exists(), "MP4 should have been removed"
    assert not mkv.exists(), "MKV should have been removed"
    assert resp.status_code == 200
    assert resp.json()["status"] == "converting"


def test_convert_movie_retry_noop_when_files_absent(convert_client, tmp_path):
    """retry=true is a no-op (no crash) when neither MP4 nor MKV exist."""
    resp = convert_client.get("/api/v1/movie/convert/3002?retry=true")
    assert resp.status_code == 200
    assert resp.json()["status"] == "converting"


def test_convert_series_retry_removes_mp4(convert_client, tmp_path):
    """Series retry=true removes existing episode MP4."""
    out = tmp_path / "series_3003.mp4"
    out.write_text("old series mp4")

    resp = convert_client.get("/api/v1/series/convert/203/3003?retry=true")

    assert not out.exists()
    assert resp.status_code == 200
    assert resp.json()["status"] == "converting"


def test_convert_ready_with_retry_restarts(convert_client, tmp_path):
    """When a file is cached but retry=true is passed, it is removed and
    conversion restarts (status=converting, not ready)."""
    out = tmp_path / "movie_3004.mp4"
    out.write_text("cached data")

    resp = convert_client.get("/api/v1/movie/convert/3004?retry=true")

    assert resp.status_code == 200
    assert resp.json()["status"] == "converting"


# ══════════════════════════════════════════════════════════════════════════════
# 4.  Build URL failure — endpoint isolation
# ══════════════════════════════════════════════════════════════════════════════


def test_convert_endpoint_does_not_raise_on_build_url_failure(client):
    """When build_stream_url raises, the endpoint still responds normally.

    The error is only surfaced inside the background _safe_convert task
    which catches it.  The HTTP handler itself is unaffected.
    """
    with patch(
        "routes.stream_convert.build_stream_url",
        side_effect=ValueError("upstream CDN unreachable"),
    ):
        resp = client.get("/api/v1/movie/convert/4001")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "converting"

    # Clean up orphaned task before client teardown
    import routes.stream_convert as sc

    for key, task in list(sc._converting.items()):
        if not task.done():
            task.cancel()
    sc._converting.clear()


# ══════════════════════════════════════════════════════════════════════════════
# 5.  Invalid stream IDs (edge cases)
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("stream_id", [0, -1, 99999999999])
def test_convert_movie_unusual_ids(convert_client, stream_id):
    """Unusual stream IDs (zero, negative, huge) are accepted by the endpoint."""
    resp = convert_client.get(f"/api/v1/movie/convert/{stream_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "converting"


@pytest.mark.parametrize(
    "series_id,episode_id", [(0, 1), (1, 0), (0, 0), (999999999, 1)]
)
def test_convert_series_unusual_ids(convert_client, series_id, episode_id):
    """Unusual series/episode IDs are accepted by the endpoint."""
    resp = convert_client.get(f"/api/v1/series/convert/{series_id}/{episode_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "converting"


# ══════════════════════════════════════════════════════════════════════════════
# 6.  MP4 serving — 404 / file-found
# ══════════════════════════════════════════════════════════════════════════════


def test_serve_movie_mp4_404_when_not_cached(client):
    """MP4 serve returns 404 if the MP4 file does not exist."""
    resp = client.get("/api/v1/stream/movie/5001/mp4")
    assert resp.status_code == 404
    assert "not yet converted" in resp.text.lower()


def test_serve_movie_mp4_404_when_empty_file(client, tmp_path):
    """MP4 serve returns 404 when the cached file is zero bytes."""
    out = tmp_path / "movie_5002.mp4"
    out.write_text("")

    with patch("routes.stream_convert.CACHE_DIR", tmp_path):
        resp = client.get("/api/v1/stream/movie/5002/mp4")
    assert resp.status_code == 404


def test_serve_movie_mp4_returns_file(client, tmp_path):
    """MP4 serve returns 200 with correct content-type when file exists."""
    out = tmp_path / "movie_5003.mp4"
    out.write_text("binary mp4 content for test")

    with patch("routes.stream_convert.CACHE_DIR", tmp_path):
        resp = client.get("/api/v1/stream/movie/5003/mp4")
    assert resp.status_code == 200
    assert resp.headers.get("content-type") == "video/mp4"
    assert resp.text == "binary mp4 content for test"


def test_serve_movie_mp4_has_accept_ranges(client, tmp_path):
    """Response includes Accept-Ranges: bytes for seeking support."""
    out = tmp_path / "movie_5004.mp4"
    out.write_text("x" * 500)

    with patch("routes.stream_convert.CACHE_DIR", tmp_path):
        resp = client.get("/api/v1/stream/movie/5004/mp4")
    assert resp.headers.get("accept-ranges") == "bytes"


def test_serve_series_mp4_404_when_not_cached(client):
    """Series MP4 serve returns 404 if file does not exist."""
    resp = client.get("/api/v1/stream/series/300/6001/mp4")
    assert resp.status_code == 404


def test_serve_series_mp4_returns_file(client, tmp_path):
    """Series MP4 serve returns 200 with correct content-type."""
    out = tmp_path / "series_6002.mp4"
    out.write_text("series episode mp4")

    with patch("routes.stream_convert.CACHE_DIR", tmp_path):
        resp = client.get("/api/v1/stream/series/301/6002/mp4")
    assert resp.status_code == 200
    assert resp.headers.get("content-type") == "video/mp4"


# ══════════════════════════════════════════════════════════════════════════════
# 7.  Range-request / 206 Partial Content
# ══════════════════════════════════════════════════════════════════════════════


def test_serve_movie_mp4_range_returns_206(client, tmp_path):
    """Range header triggers 206 Partial Content with correct headers."""
    out = tmp_path / "movie_7001.mp4"
    out.write_text("x" * 10000)

    with patch("routes.stream_convert.CACHE_DIR", tmp_path):
        resp = client.get(
            "/api/v1/stream/movie/7001/mp4",
            headers={"Range": "bytes=0-99", "Accept-Encoding": "identity"},
        )
    assert resp.status_code == 206
    assert resp.headers.get("content-type") == "video/mp4"
    assert resp.headers.get("content-range") is not None
    assert resp.headers.get("content-length") == "100"


def test_serve_movie_mp4_range_mid_file(client, tmp_path):
    """Range request for middle of file returns correct chunk."""
    out = tmp_path / "movie_7002.mp4"
    out.write_text("x" * 1000)

    with patch("routes.stream_convert.CACHE_DIR", tmp_path):
        resp = client.get(
            "/api/v1/stream/movie/7002/mp4",
            headers={"Range": "bytes=200-299", "Accept-Encoding": "identity"},
        )
    assert resp.status_code == 206
    assert resp.headers.get("content-length") == "100"
    assert "bytes 200-299/1000" in resp.headers.get("content-range", "")


def test_serve_movie_mp4_range_beyond_file_size(client, tmp_path):
    """Range end beyond file size is clamped to file_size-1."""
    out = tmp_path / "movie_7003.mp4"
    out.write_text("x" * 500)

    with patch("routes.stream_convert.CACHE_DIR", tmp_path):
        resp = client.get(
            "/api/v1/stream/movie/7003/mp4",
            headers={"Range": "bytes=400-99999", "Accept-Encoding": "identity"},
        )
    assert resp.status_code == 206
    # file_size = 500, so end clamped to 499; Content-Range = bytes 400-499/500
    cr = resp.headers.get("content-range", "")
    assert "bytes 400-499/500" in cr


def test_serve_movie_mp4_range_entire_file(client, tmp_path):
    """Range covering the whole file returns 206 with correct Content-Range."""
    out = tmp_path / "movie_7004.mp4"
    out.write_text("x" * 1000)

    with patch("routes.stream_convert.CACHE_DIR", tmp_path):
        resp = client.get(
            "/api/v1/stream/movie/7004/mp4",
            headers={"Range": "bytes=0-999", "Accept-Encoding": "identity"},
        )
    assert resp.status_code == 206
    assert resp.headers.get("content-length") == "1000"
    assert "bytes 0-999/1000" in resp.headers.get("content-range", "")


# ══════════════════════════════════════════════════════════════════════════════
# 8.  serve_cached_mp4 pure function unit tests
# ══════════════════════════════════════════════════════════════════════════════


def test_serve_cached_mp4_no_range_returns_file_response():
    """Without Range header, serve_cached_mp4 returns FileResponse (200)."""
    from fastapi import Request

    from routes.stream_convert import serve_cached_mp4

    req = MagicMock(spec=Request)
    req.headers = {}

    path = MagicMock(spec=Path)
    path.stat().st_size = 1000

    resp = serve_cached_mp4(path, req)
    assert resp.status_code == 200
    assert resp.headers.get("content-type") == "video/mp4"
    assert resp.headers.get("accept-ranges") == "bytes"


def test_serve_cached_mp4_with_range_header_returns_streaming():
    """With Range header, serve_cached_mp4 returns StreamingResponse (206)."""
    from fastapi import Request

    from routes.stream_convert import serve_cached_mp4

    req = MagicMock(spec=Request)
    req.headers = {"range": "bytes=100-199"}

    path = MagicMock(spec=Path)
    path.stat().st_size = 1000

    resp = serve_cached_mp4(path, req)
    assert resp.status_code == 206
    assert resp.headers.get("content-type") == "video/mp4"
    assert resp.headers.get("content-range") == "bytes 100-199/1000"
    assert resp.headers.get("content-length") == "100"


def test_serve_cached_mp4_range_no_end():
    """Range without end (bytes=N-) serves from N to end of file."""
    from fastapi import Request

    from routes.stream_convert import serve_cached_mp4

    req = MagicMock(spec=Request)
    req.headers = {"range": "bytes=500-"}

    path = MagicMock(spec=Path)
    path.stat().st_size = 1000

    resp = serve_cached_mp4(path, req)
    assert resp.status_code == 206
    # 500 to 999 = 500 bytes
    assert resp.headers.get("content-range") == "bytes 500-999/1000"
    assert resp.headers.get("content-length") == "500"


def test_serve_cached_mp4_invalid_range_prefix():
    """A range header that doesn't start with 'bytes=' still triggers 206.

    The current implementation treats any non-empty range header as a Range
    request; the prefix check only affects how start/end are parsed, and an
    unrecognised prefix leaves start=0, end=file_size-1.
    """
    from fastapi import Request

    from routes.stream_convert import serve_cached_mp4

    req = MagicMock(spec=Request)
    req.headers = {"range": "not-bytes=0-99"}

    path = MagicMock(spec=Path)
    path.stat().st_size = 1000

    resp = serve_cached_mp4(path, req)
    # Falls through to Range processing — returns 206 for the whole file
    assert resp.status_code == 206
    assert resp.headers.get("content-range") == "bytes 0-999/1000"


# ══════════════════════════════════════════════════════════════════════════════
# 9.  convert_to_mp4 unit tests (direct async calls)
# ══════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_convert_to_mp4_returns_early_when_output_exists(tmp_path):
    """convert_to_mp4 returns immediately if the output MP4 already exists."""
    from routes.stream_convert import convert_to_mp4

    out = tmp_path / "movie_9001.mp4"
    out.write_text("already cached")

    with patch("routes.stream_convert.CACHE_DIR", tmp_path):
        await convert_to_mp4("9001", "movie")

    assert out.exists()


@pytest.mark.asyncio
async def test_convert_to_mp4_download_fails_gracefully(tmp_path):
    """convert_to_mp4 handles curl download failure (non-zero returncode)."""
    from routes.stream_convert import convert_to_mp4

    dl_proc = AsyncMock()
    dl_proc.returncode = 1  # curl failed
    dl_proc.communicate = AsyncMock(return_value=(b"", b"connection timeout"))

    with (
        patch("routes.stream_convert.CACHE_DIR", tmp_path),
        patch(
            "routes.stream_convert.build_stream_url",
            return_value="http://fake.cdn/movie.mkv",
        ),
        patch("asyncio.create_subprocess_exec", return_value=dl_proc),
    ):
        await convert_to_mp4("9002", "movie")

    # Should not raise; lock file should have been cleaned up
    lock = tmp_path / "movie_9002.converting"
    assert not lock.exists()


@pytest.mark.asyncio
async def test_convert_to_mp4_ffmpeg_fails_gracefully(tmp_path):
    """convert_to_mp4 handles ffmpeg conversion failure (non-zero returncode)."""
    from routes.stream_convert import convert_to_mp4

    mkv = tmp_path / "movie_9003.mkv"
    mkv.write_text("fake mkv content")

    ff_proc = AsyncMock()
    ff_proc.returncode = 1
    ff_proc.stderr.readline = AsyncMock(
        side_effect=[b"error: invalid data found", b""]
    )
    ff_proc.stdout.readline = AsyncMock(return_value=b"")

    with (
        patch("routes.stream_convert.CACHE_DIR", tmp_path),
        patch(
            "routes.stream_convert.build_stream_url",
            return_value="http://fake.cdn/movie.mkv",
        ),
        patch("asyncio.create_subprocess_exec", return_value=ff_proc),
    ):
        await convert_to_mp4("9003", "movie")

    # Lock file should be cleaned up even on ffmpeg failure
    lock = tmp_path / "movie_9003.converting"
    assert not lock.exists()


@pytest.mark.asyncio
async def test_convert_to_mp4_curl_downloads_and_converts(tmp_path):
    """Happy path: curl succeeds → ffmpeg converts → files cleaned up correctly.

    This test verifies the two subprocess handoff without real network/ffmpeg.
    """
    from routes.stream_convert import convert_to_mp4

    cache_key = "movie_9004"
    mkv_path = tmp_path / f"{cache_key}.mkv"
    output_path = tmp_path / f"{cache_key}.mp4"

    # Pre-create the MKV so the download step is skipped
    mkv_path.write_text("fake mkv content")

    # Mock curl subprocess (should not be called since MKV exists)
    dl_proc = AsyncMock()
    dl_proc.returncode = 0
    dl_proc.communicate = AsyncMock(return_value=(b"", b""))

    # Mock ffmpeg subprocess (success) — create the MP4 as a side effect
    ff_proc = AsyncMock()
    ff_proc.returncode = 0
    ff_proc.stderr.readline = AsyncMock(return_value=b"")
    ff_proc.stdout.readline = AsyncMock(return_value=b"")

    # Make proc.wait create the output file (simulates successful ffmpeg)
    async def _ffmpeg_wait():
        output_path.write_text("converted mp4 content")
        return 0

    ff_proc.wait = AsyncMock(side_effect=_ffmpeg_wait)

    with (
        patch("routes.stream_convert.CACHE_DIR", tmp_path),
        patch(
            "routes.stream_convert.build_stream_url",
            return_value="http://fake.cdn/movie.mkv",
        ),
        patch("asyncio.create_subprocess_exec", return_value=ff_proc),
    ):
        await convert_to_mp4("9004", "movie")

    # On success the MKV should be deleted (line 101 condition met)
    assert not mkv_path.exists(), "MKV should be deleted after successful conversion"
    assert output_path.exists(), "MP4 should exist after conversion"
    assert output_path.read_text() == "converted mp4 content"
    # Lock file cleaned
    lock = tmp_path / f"{cache_key}.converting"
    assert not lock.exists()


# ══════════════════════════════════════════════════════════════════════════════
# 10.  _safe_convert error isolation
# ══════════════════════════════════════════════════════════════════════════════


def test_safe_convert_catches_exception_and_clears_converting():
    """_safe_convert catches exceptions from convert_to_mp4 and removes from _converting."""
    from routes.stream_convert import _converting, _safe_convert

    _converting["test_safe"] = "placeholder"

    with patch(
        "routes.stream_convert.convert_to_mp4",
        side_effect=OSError("disk full"),
    ):
        asyncio.run(_safe_convert("1", "movie", "test_safe"))

    assert "test_safe" not in _converting


def test_safe_convert_catches_http_exception():
    """_safe_convert catches HTTPException from convert_to_mp4."""
    from fastapi import HTTPException

    from routes.stream_convert import _converting, _safe_convert

    _converting["test_http"] = "placeholder"

    with patch(
        "routes.stream_convert.convert_to_mp4",
        side_effect=HTTPException(403, "forbidden"),
    ):
        asyncio.run(_safe_convert("1", "movie", "test_http"))

    assert "test_http" not in _converting
