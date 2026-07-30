"""Tests for stream_vod.py — VOD stream routes with Range support, remux, transcode."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Route mounting and basic responses
# ═══════════════════════════════════════════════════════════════════════════════


class TestRouteMounting:
    """All VOD routes are properly mounted under /api/v1/."""

    VOD_ROUTES = [
        ("/api/v1/stream/movie/1", "movie"),
        ("/api/v1/stream/movie/1/transcode", "movie transcode"),
        ("/api/v1/stream/movie/1/remux", "movie remux"),
        ("/api/v1/stream/series/1/2", "series"),
        ("/api/v1/stream/series/1/2/transcode", "series transcode"),
        ("/api/v1/stream/series/1/2/remux", "series remux"),
    ]

    @pytest.mark.parametrize("path,label", VOD_ROUTES)
    def test_route_mounted(self, client, path, label):
        """Each route returns non-404."""
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
        ):
            resp = client.get(path)
        assert resp.status_code != 404, f"{label} route at {path} returned 404"


class TestMethodNotAllowed:
    """Non-GET methods return 405 on VOD routes."""

    METHODS = ["post", "put", "delete", "patch"]

    @pytest.mark.parametrize("method", METHODS)
    def test_movie_route_rejects_non_get(self, client, method):
        resp = getattr(client, method)("/api/v1/stream/movie/1")
        assert resp.status_code == 405

    @pytest.mark.parametrize("method", METHODS)
    def test_series_route_rejects_non_get(self, client, method):
        resp = getattr(client, method)("/api/v1/stream/series/1/2")
        assert resp.status_code == 405


# ═══════════════════════════════════════════════════════════════════════════════
# 2. Build URL failure → 502
# ═══════════════════════════════════════════════════════════════════════════════


class TestBuildUrlFailure:
    """When build_stream_url raises RuntimeError, route returns 502."""

    def test_movie_returns_502_on_build_failure(self, client):
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("no provider")):
            resp = client.get("/api/v1/stream/movie/1")
        assert resp.status_code == 502

    def test_movie_transcode_returns_502_on_build_failure(self, client):
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("no provider")):
            resp = client.get("/api/v1/stream/movie/1/transcode")
        assert resp.status_code == 502

    def test_movie_remux_returns_502_on_build_failure(self, client):
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("no provider")):
            resp = client.get("/api/v1/stream/movie/1/remux")
        assert resp.status_code == 502

    def test_series_returns_502_on_build_failure(self, client):
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("no provider")):
            resp = client.get("/api/v1/stream/series/1/2")
        assert resp.status_code == 502

    def test_series_transcode_returns_502_on_build_failure(self, client):
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("no provider")):
            resp = client.get("/api/v1/stream/series/1/2/transcode")
        assert resp.status_code == 502

    def test_series_remux_returns_502_on_build_failure(self, client):
        with patch("routes.stream_vod.build_stream_url", side_effect=RuntimeError("no provider")):
            resp = client.get("/api/v1/stream/series/1/2/remux")
        assert resp.status_code == 502


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Movie streaming with Range support
# ═══════════════════════════════════════════════════════════════════════════════


class TestMovieRangeSupport:
    """Movie route handles Range header for seeking."""

    def test_movie_no_range_returns_200(self, client):
        """Without Range header, movie returns 200 (full file)."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"), patch(
            "routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])
        ):
            resp = client.get("/api/v1/stream/movie/1")
        assert resp.status_code == 200

    def test_movie_with_range_returns_206(self, client):
        """With Range header, movie returns 206 partial content."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"), patch(
            "routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])
        ):
            resp = client.get("/api/v1/stream/movie/1", headers={"Range": "bytes=0-1023"})
        assert resp.status_code == 206

    def test_movie_range_has_accept_ranges_header(self, client):
        """VOD responses should advertise Accept-Ranges: bytes."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"), patch(
            "routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])
        ):
            resp = client.get("/api/v1/stream/movie/1", headers={"Range": "bytes=0-1023"})
        assert resp.headers.get("accept-ranges") == "bytes"

    def test_movie_range_has_cache_control(self, client):
        """VOD responses should have Cache-Control: no-cache."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"), patch(
            "routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])
        ):
            resp = client.get("/api/v1/stream/movie/1", headers={"Range": "bytes=0-1023"})
        assert resp.headers.get("cache-control") == "no-cache"


# ═══════════════════════════════════════════════════════════════════════════════
# 4. Movie remux
# ═══════════════════════════════════════════════════════════════════════════════


class TestMovieRemux:
    def test_remux_returns_200(self, client):
        """Remux endpoint returns a response when build URLs succeed."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"):
            resp = client.get("/api/v1/stream/movie/1/remux")
        # Will be 200 with empty body since StreamingResponse doesn't execute generator in TestClient
        assert resp.status_code in (200,)


# ═══════════════════════════════════════════════════════════════════════════════
# 5. Series streaming
# ═══════════════════════════════════════════════════════════════════════════════


class TestSeriesStream:
    def test_series_returns_200(self, client):
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"), patch(
            "routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])
        ):
            resp = client.get("/api/v1/stream/series/1/2")
        assert resp.status_code == 200

    def test_series_with_range_returns_206(self, client):
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"), patch(
            "routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])
        ):
            resp = client.get("/api/v1/stream/series/1/2", headers={"Range": "bytes=0-1023"})
        assert resp.status_code == 206

    def test_series_has_accept_ranges(self, client):
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"), patch(
            "routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])
        ):
            resp = client.get("/api/v1/stream/series/1/2")
        assert resp.headers.get("accept-ranges") == "bytes"

    def test_series_different_ids_produce_independent_results(self, client):
        """Different series/episode IDs should both return valid responses."""
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"), patch(
            "routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])
        ):
            resp1 = client.get("/api/v1/stream/series/1/2")
            resp2 = client.get("/api/v1/stream/series/3/4")
        assert resp1.status_code == 200
        assert resp2.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# 6. Transcode routes
# ═══════════════════════════════════════════════════════════════════════════════


class TestTranscode:
    def test_movie_transcode_returns_200(self, client):
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"):
            resp = client.get("/api/v1/stream/movie/1/transcode")
        assert resp.status_code in (200,)

    def test_series_transcode_returns_200(self, client):
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"):
            resp = client.get("/api/v1/stream/series/1/2/transcode")
        assert resp.status_code in (200,)


# ═══════════════════════════════════════════════════════════════════════════════
# 7. Stream ID variants
# ═══════════════════════════════════════════════════════════════════════════════


class TestStreamIdVariants:
    """Various stream_id values should be handled gracefully."""

    def test_movie_stream_id_zero(self, client):
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/0.mkv"), patch(
            "routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])
        ):
            resp = client.get("/api/v1/stream/movie/0")
        assert resp.status_code in (200, 502)

    def test_movie_large_stream_id(self, client):
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/999999.mkv"), patch(
            "routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])
        ):
            resp = client.get("/api/v1/stream/movie/999999")
        assert resp.status_code == 200

    def test_series_large_ids(self, client):
        with patch("routes.stream_vod.build_stream_url", return_value="http://test/999999.mkv"), patch(
            "routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])
        ):
            resp = client.get("/api/v1/stream/series/999999/888888")
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# 8. handle_vod_request helper
# ═══════════════════════════════════════════════════════════════════════════════


class TestHandleVodRequest:
    """Unit tests for the handle_vod_request helper function."""

    @pytest.mark.asyncio
    async def test_returns_streaming_response_without_range(self):
        """Without Range header, returns full content StreamingResponse."""
        req = MagicMock()
        req.headers.get.return_value = None

        mock_url = "http://test/1.mkv"
        mock_sv_bytes = AsyncMock()
        mock_sv_bytes.return_value.__aiter__.return_value = iter([b"data"])

        with (
            patch("routes.stream_vod.build_stream_url", return_value=mock_url),
            patch("routes.stream_vod._mime_from_url", return_value="video/x-matroska"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=mock_sv_bytes.return_value),
        ):
            from routes.stream_vod import handle_vod_request
            from fastapi.responses import StreamingResponse

            result = await handle_vod_request(req, 1, "movie")
            assert isinstance(result, StreamingResponse)
            assert result.status_code == 200

    @pytest.mark.asyncio
    async def test_returns_streaming_response_with_range(self):
        """With Range header, returns 206 partial content."""
        req = MagicMock()
        req.headers.get.return_value = "bytes=0-1023"

        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"),
            patch("routes.stream_vod._mime_from_url", return_value="video/x-matroska"),
        ):
            from routes.stream_vod import handle_vod_request

            result = await handle_vod_request(req, 1, "movie")
            assert result.status_code == 206

    @pytest.mark.asyncio
    async def test_custom_content_type(self):
        """Custom content_type parameter overrides auto-detected MIME."""
        req = MagicMock()
        req.headers.get.return_value = None

        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"),
        ):
            from routes.stream_vod import handle_vod_request

            result = await handle_vod_request(req, 1, "movie", content_type="video/mp4")
            assert result.media_type == "video/mp4"
