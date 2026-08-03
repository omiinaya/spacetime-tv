"""Tests for stream_vod.py — VOD stream routes with Range support, remux, transcode."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ═══════════════════════════════════════════════════════════════════════════════
# 0. Preflight — dead VOD returns 502 instead of 200/empty body
# ═══════════════════════════════════════════════════════════════════════════════


class TestPreflightFailure:
    """A failed CDN preflight returns 502 BEFORE any 200/206 is committed.

    Regression: the body generators raise inside the StreamingResponse after
    the status line is sent, so dead VOD used to reach the player as 200 with
    an empty body. Preflight converts that into a proper 502.
    """

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/stream/movie/1",
            "/api/v1/stream/movie/1/transcode",
            "/api/v1/stream/movie/1/remux",
            "/api/v1/stream/series/1/2",
            "/api/v1/stream/series/1/2/transcode",
            "/api/v1/stream/series/1/2/remux",
        ],
    )
    def test_vod_returns_502_when_preflight_fails(self, client, path):
        with patch("routes.stream_vod.preflight_stream", new=AsyncMock(return_value=False)):
            resp = client.get(path)
        assert resp.status_code == 502
        assert resp.json()["detail"] in ("Stream unavailable", "Remux failed", "Transcode failed")

    def test_movie_range_request_returns_502_when_preflight_fails(self, client):
        """Even a Range/206 request preflights — a dead file must not 206 with an empty body."""
        with patch("routes.stream_vod.preflight_stream", new=AsyncMock(return_value=False)):
            resp = client.get("/api/v1/stream/movie/1", headers={"Range": "bytes=0-"})
        assert resp.status_code == 502

    def test_movie_proceeds_when_preflight_passes(self, client):
        """Preflight passing means the stream proceeds (200, not 502)."""
        with (
            patch("routes.stream_vod.preflight_stream", new=AsyncMock(return_value=True)),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
        ):
            resp = client.get("/api/v1/stream/movie/1")
        assert resp.status_code == 200


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
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
        ):
            resp = client.get("/api/v1/stream/movie/1")
        assert resp.status_code == 200

    def test_movie_with_range_returns_206(self, client):
        """With Range header, movie returns 206 partial content."""
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
        ):
            resp = client.get("/api/v1/stream/movie/1", headers={"Range": "bytes=0-1023"})
        assert resp.status_code == 206

    def test_movie_range_has_accept_ranges_header(self, client):
        """VOD responses should advertise Accept-Ranges: bytes."""
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
        ):
            resp = client.get("/api/v1/stream/movie/1", headers={"Range": "bytes=0-1023"})
        assert resp.headers.get("accept-ranges") == "bytes"

    def test_movie_range_has_cache_control(self, client):
        """VOD responses should have Cache-Control: no-cache."""
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
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
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
        ):
            resp = client.get("/api/v1/stream/series/1/2")
        assert resp.status_code == 200

    def test_series_with_range_returns_206(self, client):
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
        ):
            resp = client.get("/api/v1/stream/series/1/2", headers={"Range": "bytes=0-1023"})
        assert resp.status_code == 206

    def test_series_has_accept_ranges(self, client):
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
        ):
            resp = client.get("/api/v1/stream/series/1/2")
        assert resp.headers.get("accept-ranges") == "bytes"

    def test_series_different_ids_produce_independent_results(self, client):
        """Different series/episode IDs should both return valid responses."""
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/1.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
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
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/0.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
        ):
            resp = client.get("/api/v1/stream/movie/0")
        assert resp.status_code in (200, 502)

    def test_movie_large_stream_id(self, client):
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/999999.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
        ):
            resp = client.get("/api/v1/stream/movie/999999")
        assert resp.status_code == 200

    def test_series_large_ids(self, client):
        with (
            patch("routes.stream_vod.build_stream_url", return_value="http://test/999999.mkv"),
            patch("routes.stream_vod.stream_vod_bytes", return_value=iter([b"data"])),
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
            from fastapi.responses import StreamingResponse

            from routes.stream_vod import handle_vod_request

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


# ═══════════════════════════════════════════════════════════════════════════════
# 9. stream_vod_mpegts / stream_vod_transcode generator branches
# ═══════════════════════════════════════════════════════════════════════════════


class TestVodGenerators:
    """Direct coverage of the remux/transcode async-generator branches."""

    @pytest.mark.asyncio
    async def test_mpegts_yields_chunks_no_disconnect(self):
        """Remux generator echoes ffmpeg chunks and does not hit the disconnect branch."""
        from routes.stream_vod import stream_vod_mpegts

        async def fake_ffmpeg(cmd, feed_coro):
            yield b"chunk1"
            yield b"chunk2"

        # No start_time, no request -> plain echo path
        with patch("routes.stream_vod._ffmpeg_pipe", new=fake_ffmpeg):
            chunks = [c async for c in stream_vod_mpegts("http://test/movie.mkv")]
        assert chunks == [b"chunk1", b"chunk2"]

    @pytest.mark.asyncio
    async def test_mpegts_with_start_time_sets_seek(self):
        """start_time>0 adds -ss + a Range header and yields chunks."""
        from routes.stream_vod import stream_vod_mpegts

        captured_cmd = {}
        captured_feed = {}

        async def fake_ffmpeg(cmd, feed_coro):
            captured_cmd["cmd"] = cmd
            captured_feed["feed"] = feed_coro
            yield b"seeked"

        with patch("routes.stream_vod._ffmpeg_pipe", new=fake_ffmpeg):
            chunks = [c async for c in stream_vod_mpegts("http://test/movie.mkv", start_time=30.0)]
        assert chunks == [b"seeked"]
        assert "-ss" in captured_cmd["cmd"]
        assert "30.0" in captured_cmd["cmd"]
        assert "-copyts" in captured_cmd["cmd"]
        # feed is a partial bound to _http_feed_stdin with a computed Range header
        assert "bytes=150000000-" in captured_feed["feed"].keywords["range_header"]

    @pytest.mark.asyncio
    async def test_mpegts_breaks_on_disconnect(self):
        """Client disconnect stops the remux generator early (no further yield)."""
        from routes.stream_vod import stream_vod_mpegts

        async def fake_ffmpeg(cmd, feed_coro):
            yield b"chunk1"
            yield b"chunk2"

        class _DiscReq:
            async def is_disconnected(self):
                return True

        with patch("routes.stream_vod._ffmpeg_pipe", new=fake_ffmpeg):
            chunks = [c async for c in stream_vod_mpegts("http://test/movie.mkv", request=_DiscReq())]  # type: ignore[arg-type]
        # disconnect is checked BEFORE each chunk: first iteration breaks
        assert chunks == []

    @pytest.mark.asyncio
    async def test_transcode_breaks_on_disconnect(self):
        """Transcode generator stops upstream on client disconnect."""
        from routes.stream_vod import stream_vod_transcode

        async def fake_ffmpeg(cmd, feed_coro):
            yield b"chunk"
            yield b"chunk2"

        class AsyncDiscReq:
            async def is_disconnected(self):
                return True

        with patch("routes.stream_vod._ffmpeg_pipe", new=fake_ffmpeg):
            chunks = [c async for c in stream_vod_transcode("http://test/movie.mkv", AsyncDiscReq())]  # type: ignore[arg-type]
        assert chunks == []
