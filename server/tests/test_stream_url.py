"""Tests for build_stream_url — async utility that falls back to API on cache miss."""

import pytest

from routes.stream import build_stream_url


@pytest.mark.asyncio
async def test_live_stream_url():
    """Live streams should use .ts extension and /live/ prefix."""
    url = await build_stream_url(12345, "live")
    assert url.endswith(".ts")
    assert "/live/" in url
    assert "12345" in url


@pytest.mark.asyncio
async def test_movie_stream_url():
    """Movie streams should use .mkv extension (default fallback) and /movie/ prefix."""
    url = await build_stream_url(999, "movie")
    assert url.endswith(".mkv")
    assert "/movie/" in url
    assert "999" in url


@pytest.mark.asyncio
async def test_series_stream_url():
    """Series streams should use .mkv extension (default fallback) and /series/ prefix."""
    url = await build_stream_url(555, "series")
    assert url.endswith(".mkv")
    assert "/series/" in url
    assert "555" in url


@pytest.mark.asyncio
async def test_live_stream_url_contains_credentials():
    """URL should include username and password from env vars."""
    url = await build_stream_url(1, "live")
    assert "test_user" in url
    assert "test_pass" in url


@pytest.mark.asyncio
async def test_stream_url_base():
    """URL should use the configured IPTV_BASE."""
    url = await build_stream_url(1, "live")
    assert url.startswith("http://test-iptv.live")
