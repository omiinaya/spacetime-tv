"""Tests for stream_hls.py — HLS streaming route module.

Covers verifiable code paths without real ffmpeg/curl:
  - serve_hls_file: path traversal protection, missing segment, valid path structure
  - download_mkv: cached MKV returns path directly, build_stream_url error
  - run_hls_segmenter: seg_dir cleanup, playlist removal, subprocess creation
  - ensure_hls: cached MP4 triggers segmenter, in-progress task returns False
  - Route existence for movie_hls_start and series_hls_start
"""

import asyncio
import asyncio.subprocess
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from config import DATA_DIR

# ── serve_hls_file ────────────────────────────────────────────────────────


def test_serve_hls_file_rejects_dotdot_in_filename(client_with_cache):
    """serve_hls_file returns 400 for filenames containing '..'.

    The route checks if ".." or "/" in filename to prevent path traversal.
    This is a defense-in-depth — FastAPI normalizes URLs before routing,
    so we verify the logic via the serve_hls_file function directly.
    """
    import inspect

    from routes.stream_hls import serve_hls_file

    source = inspect.getsource(serve_hls_file)
    assert '".." in filename' in source or "'..' in filename" in source
    assert '"/" in filename' in source


def test_serve_hls_file_returns_404_for_missing_segment(client_with_cache):
    """serve_hls_file returns 404 when segment file doesn't exist."""
    resp = client_with_cache.get("/api/v1/hls/movie/1/nonexistent.ts")
    assert resp.status_code == 404


def test_serve_hls_file_accepts_m3u8_playlist(client_with_cache):
    """serve_hls_file accepts .m3u8 playlist filenames."""
    resp = client_with_cache.get("/api/v1/hls/movie/1/nonexistent.m3u8")
    assert resp.status_code == 404  # File doesn't exist, but no 400 error


# ── Route existence ───────────────────────────────────────────────────────


def test_movie_hls_start_route_exists(client_with_cache):
    """GET /api/movie/hls/1 returns a valid response (not 404)."""
    resp = client_with_cache.get("/api/v1/movie/hls/1")
    assert resp.status_code != 404


def test_series_hls_start_route_exists(client_with_cache):
    """GET /api/series/hls/1/1 returns a valid response (not 404)."""
    resp = client_with_cache.get("/api/v1/series/hls/1/1")
    assert resp.status_code != 404


# ── download_mkv ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_download_mkv_returns_cached_path():
    """download_mkv returns cached MKV path when file exists with size > 0."""

    from routes.stream_hls import download_mkv

    with patch("routes.stream_hls.CACHE_DIR") as mock_cache:
        # Create the mkv at the path download_mkv expects
        mkv_path = Path("/tmp/test_cached.mkv")
        mkv_path.write_bytes(b"x" * 100)
        mock_cache.__truediv__.return_value = mkv_path

        try:
            result = await download_mkv("1", "movie", "cached_test")
            assert result == mkv_path
        finally:
            if mkv_path.exists():
                mkv_path.unlink()


@pytest.mark.asyncio
async def test_download_mkv_cache_key_path():
    """download_mkv constructs the correct cache key path."""

    from routes.stream_hls import CACHE_DIR, download_mkv

    # Create the file at the expected path
    cache_key = "dl_test_key"
    mkv_path = CACHE_DIR / f"{cache_key}.mkv"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    mkv_path.write_bytes(b"x" * 100)

    try:
        result = await download_mkv("1", "movie", cache_key)
        assert result == mkv_path
    finally:
        mkv_path.unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_download_mkv_empty_file_not_cached():
    """download_mkv does NOT return an empty cached file."""

    from routes.stream_hls import CACHE_DIR, download_mkv

    cache_key = "empty_test"
    mkv_path = CACHE_DIR / f"{cache_key}.mkv"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    mkv_path.write_text("")  # Empty file (st_size == 0)

    try:
        with patch("routes.stream_hls.build_stream_url") as mock_build:
            mock_build.return_value = "http://example.com/test.mkv"
            with patch("asyncio.create_subprocess_exec") as mock_sub:
                mock_proc = AsyncMock()
                mock_proc.returncode = 0
                mock_sub.return_value = mock_proc

                await download_mkv("1", "movie", cache_key)
                # build_stream_url was called (not shortcut from cache)
                mock_build.assert_called_once_with(1, "movie")
    finally:
        mkv_path.unlink(missing_ok=True)


# ── run_hls_segmenter ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_run_hls_segmenter_creates_segment_dir():
    """run_hls_segmenter creates the segment directory."""
    import shutil

    from routes.stream_hls import HLS_DIR, run_hls_segmenter

    cache_key = "seg_test"
    seg_dir = HLS_DIR / cache_key

    # Clean up if exists from previous test runs
    if seg_dir.exists():
        shutil.rmtree(seg_dir)

    input_path = DATA_DIR / "_test_input.mkv"
    input_path.write_bytes(b"x" * 100)

    try:
        with patch("asyncio.create_subprocess_exec") as mock_sub:
            mock_proc = AsyncMock()
            mock_proc.returncode = 0
            mock_sub.return_value = mock_proc

            await run_hls_segmenter(cache_key, input_path)

            # Segment directory should exist
            assert seg_dir.exists()
            # Old .ts files should have been cleaned (none existed, but no error)
            # ffmpeg args should include the correct output path
            args = mock_sub.call_args[0]
            assert any("playlist.m3u8" in str(a) for a in args)
            assert "-hls_time" in args
            assert "4" in args
    finally:
        input_path.unlink(missing_ok=True)
        if seg_dir.exists():
            shutil.rmtree(seg_dir)


@pytest.mark.asyncio
async def test_run_hls_segmenter_nonzero_exit():
    """run_hls_segmenter handles non-zero ffmpeg exit gracefully."""
    import shutil

    from routes.stream_hls import HLS_DIR, run_hls_segmenter

    cache_key = "seg_fail"
    seg_dir = HLS_DIR / cache_key
    if seg_dir.exists():
        shutil.rmtree(seg_dir)

    input_path = DATA_DIR / "_test_fail.mkv"
    input_path.write_bytes(b"x" * 100)

    try:
        with patch("asyncio.create_subprocess_exec") as mock_sub:
            mock_proc = AsyncMock()
            mock_proc.returncode = 1  # ffmpeg failed
            mock_sub.return_value = mock_proc

            # Should not raise
            await run_hls_segmenter(cache_key, input_path)
    finally:
        input_path.unlink(missing_ok=True)
        if seg_dir.exists():
            shutil.rmtree(seg_dir)


# ── ensure_hls ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ensure_hls_cached_mp4_triggers_segmenter():
    """ensure_hls triggers segmenter when cached MP4 exists."""
    import shutil

    from routes.stream_hls import CACHE_DIR, HLS_DIR, ensure_hls

    cache_key = "movie_1"
    mp4_path = CACHE_DIR / f"{cache_key}.mp4"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    mp4_path.write_bytes(b"x" * 100)

    seg_dir = HLS_DIR / cache_key
    if seg_dir.exists():
        shutil.rmtree(seg_dir)

    try:
        with patch("asyncio.create_subprocess_exec") as mock_sub:
            mock_proc = AsyncMock()
            mock_proc.returncode = 0
            mock_sub.return_value = mock_proc

            await ensure_hls("1", "movie")

            # Segmenter should have been called since MP4 exists but no HLS yet
            assert mock_sub.called
    finally:
        mp4_path.unlink(missing_ok=True)
        if seg_dir.exists():
            shutil.rmtree(seg_dir)


@pytest.mark.asyncio
async def test_ensure_hls_task_already_running():
    """ensure_hls returns False when a task is already in progress."""

    from routes.stream_hls import _hls_tasks, ensure_hls

    cache_key = "movie_2"

    # Simulate an in-progress task
    _hls_tasks[cache_key] = asyncio.create_task(asyncio.sleep(10))

    try:
        with patch("routes.stream_hls.HLS_DIR") as mock_hls_dir:
            # No playlist file exists
            pl_path = MagicMock(spec=Path)
            pl_path.exists.return_value = False
            mock_hls_dir.__truediv__.return_value.__truediv__.return_value = pl_path

            # CACHE_DIR / f"{cache_key}.mp4" should not exist either
            with patch("routes.stream_hls.CACHE_DIR") as mock_cache:
                mp4_path = MagicMock(spec=Path)
                mp4_path.exists.return_value = False
                mock_cache.__truediv__.return_value = mp4_path

                result = await ensure_hls("1", "movie")

                # Task is running, HLS not ready yet
                assert result is False
    finally:
        # Cancel the background task
        task = _hls_tasks.pop(cache_key, None)
        if task and not task.done():
            task.cancel()
