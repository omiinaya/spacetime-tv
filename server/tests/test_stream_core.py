"""Tests for stream_core.py — shared stream helpers, URL building, probe cache, MIME."""

import time
from unittest.mock import MagicMock, patch

import pytest

# ═══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture(autouse=True)
def reset_probe_cache():
    """Clear _probe_cache between tests."""
    from routes.stream_core import _probe_cache

    _probe_cache.clear()


# ═══════════════════════════════════════════════════════════════════════════════
# 1. stream_core_get_provider
# ═══════════════════════════════════════════════════════════════════════════════


class TestGetProvider:
    def test_negative_index_returns_active(self):
        """provider_idx < 0 should return active provider."""
        from routes.stream_core import stream_core_get_provider

        p = stream_core_get_provider(-1)
        assert p is not None
        assert p.enabled

    def test_valid_index_returns_specific(self):
        """provider_idx ≥ 0 should return that specific provider."""
        from routes.stream_core import stream_core_get_provider

        p = stream_core_get_provider(0)
        assert p is not None
        assert p.name == "Default"

    def test_out_of_range_returns_none(self):
        """provider_idx beyond list should return None."""
        from routes.stream_core import stream_core_get_provider

        p = stream_core_get_provider(999)
        assert p is None

    def test_negative_one_returns_none_when_no_providers(self):
        """When no providers exist, get_active returns None."""
        with patch("routes.stream_core.get_active_provider", return_value=None):
            from routes.stream_core import stream_core_get_provider

            assert stream_core_get_provider(-1) is None


# ═══════════════════════════════════════════════════════════════════════════════
# 2. _mime_from_url
# ═══════════════════════════════════════════════════════════════════════════════


class TestMimeFromUrl:
    def test_mkv_returns_matroska(self):
        from routes.stream_core import _mime_from_url

        assert _mime_from_url("http://example.com/video.mkv") == "video/x-matroska"

    def test_ts_returns_mp2t(self):
        from routes.stream_core import _mime_from_url

        assert _mime_from_url("http://example.com/video.ts") == "video/mp2t"

    def test_mp4_returns_mp4(self):
        from routes.stream_core import _mime_from_url

        assert _mime_from_url("http://example.com/video.mp4") == "video/mp4"

    def test_m4v_returns_mp4(self):
        from routes.stream_core import _mime_from_url

        assert _mime_from_url("http://example.com/video.m4v") == "video/mp4"

    def test_webm_returns_webm(self):
        from routes.stream_core import _mime_from_url

        assert _mime_from_url("http://example.com/video.webm") == "video/webm"

    def test_avi_returns_msvideo(self):
        from routes.stream_core import _mime_from_url

        assert _mime_from_url("http://example.com/video.avi") == "video/x-msvideo"

    def test_mov_returns_quicktime(self):
        from routes.stream_core import _mime_from_url

        assert _mime_from_url("http://example.com/video.mov") == "video/quicktime"

    def test_unknown_returns_mp2t(self):
        from routes.stream_core import _mime_from_url

        assert _mime_from_url("http://example.com/video.bin") == "video/mp2t"

    def test_no_extension_returns_mp2t(self):
        from routes.stream_core import _mime_from_url

        assert _mime_from_url("http://example.com/stream") == "video/mp2t"

    def test_case_insensitive(self):
        from routes.stream_core import _mime_from_url

        assert _mime_from_url("http://example.com/video.MKV") == "video/x-matroska"
        assert _mime_from_url("http://example.com/video.MP4") == "video/mp4"

    def test_query_params_ignored(self):
        from routes.stream_core import _mime_from_url

        url = "http://example.com/video.mkv?token=abc&expiry=123"
        assert _mime_from_url(url) == "video/x-matroska"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. _lookup_extension
# ═══════════════════════════════════════════════════════════════════════════════


class TestLookupExtension:
    @pytest.mark.asyncio
    async def test_defaults_to_mkv_when_no_data(self):
        """When cached_fetch returns empty, default to mkv."""
        with patch("iptv_client.cached_fetch", return_value=[]):
            from routes.stream_core import _lookup_extension

            ext = await _lookup_extension(1, "movie")
            assert ext == "mkv"

    @pytest.mark.asyncio
    async def test_returns_extension_from_cached_data(self):
        """When stream found in cached data, return its container_extension."""
        mock_data = [
            {"stream_id": 1, "container_extension": "mp4", "name": "Test"},
            {"stream_id": 2, "container_extension": "mkv", "name": "Test2"},
        ]
        with patch("iptv_client.cached_fetch", return_value=mock_data):
            from routes.stream_core import _lookup_extension

            ext = await _lookup_extension(1, "movie")
            assert ext == "mp4"

    @pytest.mark.asyncio
    async def test_empty_extension_returns_mp4(self):
        """Empty container_extension should resolve to mp4."""
        mock_data = [{"stream_id": 1, "container_extension": "", "name": "Test"}]
        with patch("iptv_client.cached_fetch", return_value=mock_data):
            from routes.stream_core import _lookup_extension

            ext = await _lookup_extension(1, "movie")
            assert ext == "mp4"

    @pytest.mark.asyncio
    async def test_none_extension_returns_mp4(self):
        """None container_extension should resolve to mp4."""
        mock_data = [{"stream_id": 1, "name": "Test"}]
        with patch("iptv_client.cached_fetch", return_value=mock_data):
            from routes.stream_core import _lookup_extension

            ext = await _lookup_extension(1, "movie")
            assert ext == "mp4"

    @pytest.mark.asyncio
    async def test_live_type_uses_cached_live_streams(self):
        """Live streams query via get_live_streams instead of get_vod_streams."""
        mock_data = [{"stream_id": 42, "container_extension": "ts", "name": "Ch"}]
        with patch("iptv_client.cached_fetch", return_value=mock_data):
            from routes.stream_core import _lookup_extension

            ext = await _lookup_extension(42, "live")
            assert ext == "ts"

    @pytest.mark.asyncio
    async def test_series_type_uses_series_id(self):
        """Series lookups use series_id field."""
        mock_data = [{"series_id": 55, "container_extension": "mp4", "name": "Show"}]
        with patch("iptv_client.cached_fetch", return_value=mock_data):
            from routes.stream_core import _lookup_extension

            ext = await _lookup_extension(55, "series")
            assert ext == "mp4"


# ═══════════════════════════════════════════════════════════════════════════════
# 4. build_stream_url
# ═══════════════════════════════════════════════════════════════════════════════


class TestBuildStreamUrl:
    @pytest.mark.asyncio
    async def test_builds_url_with_default_provider(self):
        """build_stream_url should call iptv_stream_url with correct params."""
        with patch(
            "routes.stream_core.iptv_stream_url",
            return_value="http://test-iptv.live/live/test_user/test_pass/42.ts",
        ):
            from routes.stream_core import build_stream_url

            url = await build_stream_url(42, "live")
            assert "42.ts" in url
            assert "test-iptv.live" in url

    @pytest.mark.asyncio
    async def test_builds_movie_url(self):
        with patch(
            "routes.stream_core.iptv_stream_url",
            return_value="http://test-iptv.live/movie/test_user/test_pass/99.mkv",
        ):
            from routes.stream_core import build_stream_url

            url = await build_stream_url(99, "movie")
            assert "99.mkv" in url

    @pytest.mark.asyncio
    async def test_raises_runtime_error_on_failure(self):
        with patch("routes.stream_core.iptv_stream_url", side_effect=RuntimeError("boom")):
            from routes.stream_core import build_stream_url

            with pytest.raises(RuntimeError, match="boom"):
                await build_stream_url(1, "live")

    @pytest.mark.asyncio
    async def test_passes_provider_idx(self):
        with patch(
            "routes.stream_core.iptv_stream_url",
            return_value="http://test-iptv.live/live/u/p/1.ts",
        ) as mock_fn:
            from routes.stream_core import build_stream_url

            await build_stream_url(1, "live", provider_idx=0)
            mock_fn.assert_called_once()


# ═══════════════════════════════════════════════════════════════════════════════
# 5. Probe cache operations
# ═══════════════════════════════════════════════════════════════════════════════


class TestProbeCache:
    def test_cache_starts_empty(self):
        from routes.stream_core import _probe_cache

        assert _probe_cache == {}

    def test_cache_store_and_retrieve(self):
        from routes.stream_core import _probe_cache

        now = time.time()
        data = {"codec": "h264", "width": 1920}
        _probe_cache["live_1"] = (now, data)
        assert _probe_cache["live_1"][1] == data

    def test_cache_ttl_expiry(self):
        from routes.stream_core import PROBE_CACHE_TTL

        assert PROBE_CACHE_TTL == 3600

    def test_cache_separates_by_stream_type_and_id(self):
        from routes.stream_core import _probe_cache

        now = time.time()
        _probe_cache["live_1"] = (now, {"codec": "h264"})
        _probe_cache["movie_1"] = (now, {"codec": "hevc"})
        assert _probe_cache["live_1"][1]["codec"] == "h264"
        assert _probe_cache["movie_1"][1]["codec"] == "hevc"


# ═══════════════════════════════════════════════════════════════════════════════
# 6. get_content_length
# ═══════════════════════════════════════════════════════════════════════════════


class TestGetContentLength:
    @pytest.mark.asyncio
    async def test_returns_content_length_on_success(self):
        """Should return the Content-Length header value."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-length": "12345"}

        async def mock_head(url, **kw):
            return mock_resp

        with patch.object(_ := __import__("httpx"), "AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.get.return_value = mock_resp
            from routes.stream_core import get_content_length

            result = await get_content_length("http://test.url/stream.ts")
            assert result == 12345

    @pytest.mark.asyncio
    async def test_returns_zero_on_error(self):
        """Should return None on HTTP error."""

        async def mock_get(url, **kw):
            raise httpx_module.HTTPError("timeout")

        with patch.object(httpx_module := __import__("httpx"), "AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.get = mock_get
            from routes.stream_core import get_content_length

            result = await get_content_length("http://test.url/stream.ts")
            assert result is None

    @pytest.mark.asyncio
    async def test_returns_zero_on_non_200(self):
        """Should return None when status is not 200."""
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_resp.headers = {}

        async def mock_get(url, **kw):
            return mock_resp

        with patch.object(_ := __import__("httpx"), "AsyncClient") as MockClient:
            instance = MockClient.return_value.__aenter__.return_value
            instance.get = mock_get
            from routes.stream_core import get_content_length

            result = await get_content_length("http://test.url/stream.ts")
            assert result is None


# ═══════════════════════════════════════════════════════════════════════════════
# 7. stream_bytes
# ═══════════════════════════════════════════════════════════════════════════════


class TestStreamBytes:
    @pytest.mark.asyncio
    async def test_streams_data_from_aiohttp(self):
        """stream_bytes should yield chunks from aiohttp response."""
        chunks = []

        class MockResponse:
            status = 200
            headers = {}

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return None

            async def read(self, n=-1):
                return b"data_chunk"

            @property
            def content(self):
                return self

        mock_resp = MockResponse()

        class MockSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return None

            def get(self, url, **kw):
                return mock_resp

        with patch("routes.stream_core.aiohttp.ClientSession", return_value=MockSession()):
            from routes.stream_core import stream_bytes

            async for chunk in stream_bytes("http://test.url/stream.ts"):
                chunks.append(chunk)
                break  # one chunk is enough
            assert chunks == [b"data_chunk"]

    @pytest.mark.asyncio
    async def test_exits_on_non_200(self):
        """stream_bytes should raise RuntimeError on non-200 status."""

        class MockResponse:
            status = 403
            headers = {}

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return None

            @property
            def content(self):
                return self

        mock_resp = MockResponse()

        class MockSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return None

            def get(self, url, **kw):
                return mock_resp

        with patch("routes.stream_core.aiohttp.ClientSession", return_value=MockSession()):
            from routes.stream_core import stream_bytes

            generator = stream_bytes("http://test.url/stream.ts")
            with pytest.raises(RuntimeError, match="CDN returned HTTP 403"):
                await generator.__anext__()
