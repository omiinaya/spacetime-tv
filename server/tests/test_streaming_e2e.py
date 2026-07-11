"""
Streaming E2E tests covering live and VOD paths.
Mocks all network/ffmpeg calls so tests run offline.
"""

import os
os.environ["ENFORCE_HTTPS"] = "false"
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app
from routes.stream_core import stream_bytes, _ffmpeg_pipe
from routes.stream_vod import stream_vod_transcode


# ── Mock async generators ────────────────────────────────────────────────


async def _mock_ts_packets(*args, **kwargs):
    """Yield minimal valid MPEG-TS packet (sync async generator)."""
    yield b"\x47" + b"\x00" * 187


async def _mock_vod_bytes(url=None, range_header=None, **kwargs):
    """Return bytes for VOD stream mock."""
    yield b"\x00" * 4096


async def _mock_ffmpeg(cmd, feed, **kwargs):
    """Mock ffmpeg pipe - yield one TS packet."""
    yield b"\x47" + b"\x00" * 187


# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest.fixture
def client():
    """TestClient with admin key."""
    with TestClient(app) as c:
        c.headers.setdefault("X-Admin-Key", "test-admin-key-insecure")
        yield c


@pytest.fixture
def live_cache():
    """Pre-populate live cache with a test channel."""
    from state import _cache
    _cache["live_all"] = (
        time.time() + 3600,
        [
            {
                "stream_id": 999, "name": "Test Live", "stream_icon": "",
                "category_id": "1", "epg_channel_id": "", "num": 1,
                "stream_type": "live", "added": "", "is_adult": 0,
                "category_ids": ["1"], "custom_sid": None,
                "tv_archive": 0, "direct_source": "", "tv_archive_duration": 0,
            }
        ],
    )
    yield


# ═══════════════════════════════════════════════════════════════════════════
#  LIVE STREAM TESTS
# ═══════════════════════════════════════════════════════════════════════════


class TestLiveStream:
    """E2E tests for live TV streaming."""

    def test_live_returns_200(self, client, live_cache):
        """Live stream returns 200 with video/mp2t content."""
        with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
            resp = client.get("/api/v1/stream/live/999")
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "video/mp2t"

    def test_live_quality_returns_200(self, client, live_cache):
        """Live quality endpoint returns 200 with mock transcode."""
        with patch("routes.stream_live.build_stream_url", return_value="http://mock/stream.ts"):
            with patch("routes.stream_live.stream_bytes_transcode", side_effect=_mock_ts_packets):
                resp = client.get("/api/v1/stream/live/999/quality/720")
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "video/mp2t"

    def test_live_timeshift_returns_200(self, client, live_cache):
        """Timeshift endpoint returns 200."""
        with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
            resp = client.get("/api/v1/stream/live/999/timeshift?duration=60")
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "video/mp2t"

    def test_live_dash_returns_200(self, client, live_cache):
        """DASH manifest returns valid XML MPD."""
        with patch("routes.stream_dash.build_stream_url", return_value="http://mock/stream.ts"):
            resp = client.get("/api/v1/stream/live/999/manifest.mpd")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/dash+xml"
        assert "<MPD" in resp.text

    def test_live_returns_500_on_build_url_error(self, client, live_cache):
        """Live stream returns 502 when build_stream_url fails."""
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("fail")):
            resp = client.get("/api/v1/stream/live/999")
        assert resp.status_code == 502

    def test_live_quality_returns_500_on_build_url_error(self, client, live_cache):
        """Live quality returns 502 when build_stream_url fails."""
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("fail")):
            resp = client.get("/api/v1/stream/live/999/quality/720")
        assert resp.status_code == 502

    def test_live_anonymous_access(self, client, live_cache):
        """Live stream requires auth (empty admin key == 401)."""
        with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
            resp = client.get("/api/v1/stream/live/999", headers={"X-Admin-Key": ""})
        assert resp.status_code == 401

    def test_live_non_existent_not_404(self, client, live_cache):
        """Non-existent stream ID does not return 404."""
        with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
            resp = client.get("/api/v1/stream/live/99999")
        assert resp.status_code != 404


# ═══════════════════════════════════════════════════════════════════════════
#  VOD: MOVIE STREAM TESTS
# ═══════════════════════════════════════════════════════════════════════════


class TestMovieStream:
    """E2E tests for movie VOD streaming."""

    def test_movie_proxy_returns_200(self, client):
        """Movie proxy returns 200 with mocked stream_vod_bytes."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://mock/movie.mkv"):
            with patch("routes.stream_vod.stream_vod_bytes", side_effect=_mock_vod_bytes):
                resp = client.get("/api/v1/stream/movie/1")
        assert resp.status_code == 200
        assert "video" in resp.headers.get("content-type", "")

    def test_movie_proxy_handles_range(self, client):
        """Movie proxy returns 206 for Range requests."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://mock/movie.mkv"):
            with patch("routes.stream_vod.stream_vod_bytes", side_effect=_mock_vod_bytes):
                resp = client.get("/api/v1/stream/movie/1", headers={"Range": "bytes=0-1023"})
        assert resp.status_code == 206
        assert "video" in resp.headers.get("content-type", "")

    def test_movie_remux_returns_200(self, client):
        """Movie remux returns 200 with mock ffmpeg."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://mock/movie.mkv"):
            with patch("routes.stream_vod.stream_vod_transcode", side_effect=_mock_ts_packets):
                resp = client.get("/api/v1/stream/movie/1/remux")
        assert resp.status_code == 200

    def test_movie_remux_returns_500_on_build_url_failure(self, client):
        """Movie remux returns 502 when build_stream_url fails."""
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("fail")):
            resp = client.get("/api/v1/stream/movie/1/remux")
        assert resp.status_code == 502

    def test_movie_transcode_returns_200(self, client):
        """Movie transcode returns 200."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://mock/movie.mkv"):
            with patch("routes.stream_vod.stream_vod_transcode", side_effect=_mock_ts_packets):
                resp = client.get("/api/v1/stream/movie/1/transcode")
        assert resp.status_code == 200

    def test_movie_dash_returns_200(self, client):
        """Movie DASH manifest returns valid XML."""
        with patch("routes.stream_dash.build_stream_url", return_value="http://mock/movie.mkv"):
            resp = client.get("/api/v1/stream/movie/1/manifest.mpd")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/dash+xml"
        assert "<MPD" in resp.text


# ═══════════════════════════════════════════════════════════════════════════
#  VOD: SERIES STREAM TESTS
# ═══════════════════════════════════════════════════════════════════════════


class TestSeriesStream:
    """E2E tests for series episode VOD streaming."""

    def test_series_proxy_returns_200(self, client):
        """Series proxy returns 200 with mocked bytes."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://mock/series.mkv"):
            with patch("routes.stream_vod.stream_vod_bytes", side_effect=_mock_vod_bytes):
                resp = client.get("/api/v1/stream/series/1/42")
        assert resp.status_code == 200
        assert "video" in resp.headers.get("content-type", "")

    def test_series_proxy_handles_range(self, client):
        """Series proxy returns 206 for Range requests."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://mock/series.mkv"):
            with patch("routes.stream_vod.stream_vod_bytes", side_effect=_mock_vod_bytes):
                resp = client.get("/api/v1/stream/series/1/42", headers={"Range": "bytes=0-1023"})
        assert resp.status_code == 206

    def test_series_remux_returns_200(self, client):
        """Series remux returns 200."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://mock/series.mkv"):
            with patch("routes.stream_vod.stream_vod_transcode", side_effect=_mock_ts_packets):
                resp = client.get("/api/v1/stream/series/1/42/remux")
        assert resp.status_code == 200

    def test_series_remux_returns_502_on_build_url_failure(self, client):
        """Series remux returns 502 when build_stream_url fails."""
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("fail")):
            resp = client.get("/api/v1/stream/series/1/42/remux")
        assert resp.status_code == 502

    def test_series_transcode_returns_200(self, client):
        """Series transcode returns 200."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://mock/series.mkv"):
            with patch("routes.stream_vod.stream_vod_transcode", side_effect=_mock_ts_packets):
                resp = client.get("/api/v1/stream/series/1/42/transcode")
        assert resp.status_code == 200

    def test_series_dash_returns_200(self, client):
        """Series DASH manifest returns valid XML."""
        with patch("routes.stream_dash.build_stream_url", return_value="http://mock/series.mkv"):
            resp = client.get("/api/v1/stream/series/1/42/manifest.mpd")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/dash+xml"
        assert "<MPD" in resp.text
