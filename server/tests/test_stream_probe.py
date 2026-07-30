"""Tests for routes/stream_probe.py — probe endpoint codec detection.

Tests cover:
- Cache hit returns cached result without any subprocess/network
- mp4/m4v extension skips ffprobe entirely (returns native H.264)
- Route endpoints return 200 with valid JSON
- ffprobe success path parses JSON correctly (codec, dimensions, profile, container)
- ffprobe failure paths (timeout, OSError, ValueError, non-zero exit)
- curl_cffi fallback when ffprobe gets 405
- HTTP fallback when ffprobe fails without 405
- JSON decode errors from ffprobe output
- build_stream_url and _lookup_extension patch targets
"""

import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from routes.stream_core import PROBE_CACHE_TTL, _probe_cache
from routes.stream_probe import probe_stream

# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _mock_ffprobe_proc(returncode: int = 0, stdout: bytes = b"{}", stderr: bytes = b""):
    """Create an AsyncMock subprocess process with given return values."""
    proc = AsyncMock(spec=asyncio.subprocess.Process)
    proc.returncode = returncode
    proc.communicate = AsyncMock(return_value=(stdout, stderr))
    return proc


def _mock_curl_success():
    """Create a successful curl_cffi response mock (206 with content-length)."""
    resp = MagicMock()
    resp.status_code = 206
    resp.headers = {"content-length": "1000000"}
    return resp


def _mock_curl_failure(status_code: int = 404, cl: str = "0"):
    """Create a failing curl_cffi response mock."""
    resp = MagicMock()
    resp.status_code = status_code
    resp.headers = {"content-length": cl}
    return resp


# ═══════════════════════════════════════════════════════════════════════════════
# Cache tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestCache:
    """Tests for probe result caching behaviour."""

    def test_cache_hit_returns_cached_result(self):
        """probe_stream returns cached result without calling any subprocess."""
        cached = {"codec": "hevc", "width": 3840, "height": 2160}
        _probe_cache["live_555"] = (time.time(), cached)

        result = asyncio.run(probe_stream(555, "live"))

        assert result == cached
        assert result["codec"] == "hevc"

    def test_cache_hit_avoids_subprocess(self):
        """Cached result means ffprobe/curl/httpx are never called."""
        cached = {"codec": "av1", "width": 1920, "height": 1080}
        _probe_cache["live_556"] = (time.time(), cached)

        with patch("routes.stream_probe.asyncio.create_subprocess_exec") as mock_sub:
            result = asyncio.run(probe_stream(556, "live"))

        assert result["codec"] == "av1"
        mock_sub.assert_not_called()

    def test_cache_expired_re_probes(self):
        """Expired cache entry triggers a new probe."""
        cached = {"codec": "hevc", "width": 3840}
        _probe_cache["live_666"] = (time.time() - PROBE_CACHE_TTL - 10, cached)

        proc = _mock_ffprobe_proc(returncode=0, stdout=b"{}")
        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(666, "live"))

        # No streams in ffprobe output -> unknown
        assert result["codec"] == "unknown"

    def test_cache_different_types_independent(self):
        """Different stream types use independent cache keys."""
        _probe_cache["live_777"] = (time.time(), {"codec": "h264_live"})
        _probe_cache["movie_777"] = (time.time(), {"codec": "h264_movie"})
        _probe_cache["series_777"] = (time.time(), {"codec": "h264_series"})

        r1 = asyncio.run(probe_stream(777, "live"))
        r2 = asyncio.run(probe_stream(777, "movie"))
        r3 = asyncio.run(probe_stream(777, "series"))

        assert r1["codec"] == "h264_live"
        assert r2["codec"] == "h264_movie"
        assert r3["codec"] == "h264_series"

    def test_cache_stores_mp4_skip_result(self):
        """mp4-skip result is stored in cache for subsequent calls."""
        with patch("routes.stream_probe._lookup_extension", return_value="mp4"):
            asyncio.run(probe_stream(42, "movie"))

        assert "movie_42" in _probe_cache
        assert _probe_cache["movie_42"][1]["codec"] == "h264"

    def test_second_call_hits_cache_after_first_probe(self):
        """After a successful ffprobe probe, a second call uses cache."""
        ffprobe_data = json.dumps(
            {
                "streams": [
                    {
                        "codec_name": "h264",
                        "codec_long_name": "H.264 / AVC",
                        "width": 1280,
                        "height": 720,
                        "profile": "Main",
                    }
                ],
                "format": {"format_name": "ts"},
            }
        )
        proc = _mock_ffprobe_proc(returncode=0, stdout=ffprobe_data.encode())

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            _ = asyncio.run(probe_stream(101, "live"))

        # Second call — cache hit, subprocess should NOT be called
        with patch("routes.stream_probe.asyncio.create_subprocess_exec") as mock_sub:
            r2 = asyncio.run(probe_stream(101, "live"))

        assert r2["codec"] == "h264"
        assert r2["width"] == 1280
        assert r2["height"] == 720
        mock_sub.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════════════
# mp4/m4v extension skip tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestExtensionSkip:
    """Tests that mp4/m4v extensions skip ffprobe entirely."""

    @patch("routes.stream_probe._lookup_extension", return_value="mp4")
    def test_mp4_extension_skips_ffprobe(self, mock_lookup):
        """MP4 extension returns native H.264 without running ffprobe."""
        result = asyncio.run(probe_stream(10, "movie"))
        assert result["codec"] == "h264"
        assert result["codec_long"] == "H.264 / AVC / MPEG-4 AVC"
        assert result.get("native") is True

    @patch("routes.stream_probe._lookup_extension", return_value="m4v")
    def test_m4v_extension_skips_ffprobe(self, mock_lookup):
        """M4V extension returns native H.264 without running ffprobe."""
        result = asyncio.run(probe_stream(20, "movie"))
        assert result["codec"] == "h264"
        assert result.get("native") is True

    @patch("routes.stream_probe._lookup_extension", return_value="mkv")
    def test_mkv_extension_does_not_skip(self, mock_lookup):
        """MKV extension does NOT skip ffprobe."""
        proc = _mock_ffprobe_proc(returncode=0, stdout=b"{}")
        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(30, "movie"))

        assert result["codec"] == "unknown"

    def test_live_streams_are_ts_no_mp4_skip(self):
        """Live streams always use .ts — never skip ffprobe via extension check."""
        proc = _mock_ffprobe_proc(returncode=0, stdout=b"{}")
        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(40, "live"))

        assert result["codec"] == "unknown"

    @patch("routes.stream_probe._lookup_extension", return_value="ts")
    def test_ts_extension_no_skip(self, mock_lookup):
        """TS extension does not trigger the mp4 skip."""
        proc = _mock_ffprobe_proc(returncode=0, stdout=b"{}")
        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(50, "movie"))

        assert result["codec"] == "unknown"

    @patch("routes.stream_probe._lookup_extension", return_value="mp4")
    def test_mp4_skip_ffprobe_not_called(self, mock_lookup):
        """Confirm asyncio.create_subprocess_exec is never called for mp4."""
        with patch("routes.stream_probe.asyncio.create_subprocess_exec") as mock_sub:
            result = asyncio.run(probe_stream(60, "movie"))

        assert result["codec"] == "h264"
        mock_sub.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════════════
# ffprobe success path tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestFfprobeSuccess:
    """Tests for successful ffprobe execution and JSON parsing."""

    def test_ffprobe_success_returns_h264_codec(self):
        """ffprobe returns codec_name h264 with dimensions."""
        ffprobe_output = json.dumps(
            {
                "streams": [
                    {
                        "codec_name": "h264",
                        "codec_long_name": "H.264 / AVC",
                        "width": 1920,
                        "height": 1080,
                        "profile": "High",
                    }
                ],
                "format": {"format_name": "matroska"},
            }
        )
        proc = _mock_ffprobe_proc(returncode=0, stdout=ffprobe_output.encode())

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(100, "live"))

        assert result["codec"] == "h264"
        assert result["codec_long"] == "H.264 / AVC"
        assert result["width"] == 1920
        assert result["height"] == 1080
        assert result["profile"] == "High"
        assert result["container"] == "matroska"

    def test_ffprobe_success_hevc_codec(self):
        """HEVC codec is correctly parsed from ffprobe output."""
        ffprobe_output = json.dumps(
            {
                "streams": [
                    {
                        "codec_name": "hevc",
                        "codec_long_name": "H.265 / HEVC",
                        "width": 3840,
                        "height": 2160,
                        "profile": "Main",
                    }
                ],
                "format": {"format_name": "mp4"},
            }
        )
        proc = _mock_ffprobe_proc(returncode=0, stdout=ffprobe_output.encode())

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(101, "live"))

        assert result["codec"] == "hevc"
        assert result["width"] == 3840
        assert result["height"] == 2160
        assert result["profile"] == "Main"
        assert result["container"] == "mp4"

    def test_ffprobe_success_av1_codec(self):
        """AV1 codec is correctly parsed."""
        ffprobe_output = json.dumps(
            {
                "streams": [
                    {
                        "codec_name": "av1",
                        "codec_long_name": "AV1",
                        "width": 1920,
                        "height": 1080,
                        "profile": "Main",
                    }
                ],
                "format": {"format_name": "mp4"},
            }
        )
        proc = _mock_ffprobe_proc(returncode=0, stdout=ffprobe_output.encode())

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(102, "live"))

        assert result["codec"] == "av1"
        assert result["width"] == 1920
        assert result["height"] == 1080

    def test_ffprobe_empty_streams_list_returns_unknown(self):
        """ffprobe returns valid JSON but empty streams -> codec unknown."""
        ffprobe_output = json.dumps({"streams": [], "format": {"format_name": "mp4"}})
        proc = _mock_ffprobe_proc(returncode=0, stdout=ffprobe_output.encode())

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(111, "live"))

        assert result["codec"] == "unknown"

    def test_ffprobe_no_streams_key_returns_unknown(self):
        """ffprobe JSON without streams key returns unknown."""
        ffprobe_output = json.dumps({"format": {"format_name": "mp4"}})
        proc = _mock_ffprobe_proc(returncode=0, stdout=ffprobe_output.encode())

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(112, "live"))

        assert result["codec"] == "unknown"

    def test_ffprobe_missing_fields_default(self):
        """ffprobe output missing optional fields defaults to sensible values."""
        ffprobe_output = json.dumps(
            {
                "streams": [{"codec_name": "h264"}],
                "format": {},
            }
        )
        proc = _mock_ffprobe_proc(returncode=0, stdout=ffprobe_output.encode())

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(113, "live"))

        assert result["codec"] == "h264"
        assert result["width"] == 0
        assert result["height"] == 0
        assert result["profile"] == ""
        assert result["container"] == ""

    def test_ffprobe_success_caches_result(self):
        """Successful ffprobe result is stored in _probe_cache."""
        ffprobe_output = json.dumps(
            {
                "streams": [
                    {"codec_name": "vp9", "codec_long_name": "VP9", "width": 640, "height": 480, "profile": "0"}
                ],
                "format": {"format_name": "webm"},
            }
        )
        proc = _mock_ffprobe_proc(returncode=0, stdout=ffprobe_output.encode())

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(200, "live"))

        assert result["codec"] == "vp9"
        assert "live_200" in _probe_cache
        cached_ts, cached_data = _probe_cache["live_200"]
        assert cached_data["codec"] == "vp9"

    def test_ffprobe_success_series_type(self):
        """probe_stream works with series type."""
        ffprobe_output = json.dumps(
            {
                "streams": [
                    {
                        "codec_name": "h264",
                        "codec_long_name": "H.264 / AVC",
                        "width": 1280,
                        "height": 720,
                        "profile": "Main",
                    }
                ],
                "format": {"format_name": "mkv"},
            }
        )
        proc = _mock_ffprobe_proc(returncode=0, stdout=ffprobe_output.encode())

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(300, "series"))

        assert result["codec"] == "h264"
        assert result["width"] == 1280
        assert result["height"] == 720


# ═══════════════════════════════════════════════════════════════════════════════
# ffprobe failure path tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestFfprobeFailure:
    """Tests for ffprobe failure scenarios — timeout, OS errors, non-zero exit."""

    def test_ffprobe_timeout_returns_unknown(self):
        """TimeoutError during communicate returns unknown with error."""
        proc = AsyncMock()
        proc.communicate = AsyncMock(side_effect=TimeoutError("Timed out"))

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(777, "live"))

        assert result["codec"] == "unknown"
        assert "error" in result
        assert "Timed out" in result["error"]

    def test_ffprobe_oserror_returns_unknown(self):
        """OSError during subprocess creation returns unknown with error."""
        with patch(
            "routes.stream_probe.asyncio.create_subprocess_exec",
            side_effect=OSError("ffprobe not found"),
        ):
            result = asyncio.run(probe_stream(778, "live"))

        assert result["codec"] == "unknown"
        assert "error" in result
        assert "ffprobe not found" in result["error"]

    def test_ffprobe_value_error_returns_unknown(self):
        """ValueError (e.g. unicode decode error) returns unknown with error."""
        proc = AsyncMock()
        proc.communicate = AsyncMock(side_effect=ValueError("invalid start byte"))

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(779, "live"))

        assert result["codec"] == "unknown"
        assert "error" in result

    def test_ffprobe_runtime_error_returns_unknown(self):
        """RuntimeError from closed event loop returns unknown with error."""
        proc = AsyncMock()
        proc.communicate = AsyncMock(side_effect=RuntimeError("Event loop is closed"))

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(780, "live"))

        assert result["codec"] == "unknown"
        assert "error" in result

    def test_ffprobe_nonzero_exit_no_405_httpx_returns_405(self):
        """ffprobe fails without 405, httpx GET gets 405 -> unavailable with CDN error."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"some error")

        class _MockHttpxCtx:
            async def get(self, url):
                resp = MagicMock()
                resp.status_code = 405
                return resp

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__.return_value = _MockHttpxCtx()
            result = asyncio.run(probe_stream(880, "live"))

        assert result["codec"] == "unavailable"
        assert "Not on this CDN edge" in result.get("error", "")

    def test_ffprobe_nonzero_exit_no_405_httpx_success_non_405(self):
        """ffprobe fails, httpx returns non-405 status -> codec unknown."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"some error")

        class _MockHttpxCtx:
            async def get(self, url):
                resp = MagicMock()
                resp.status_code = 404
                return resp

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__.return_value = _MockHttpxCtx()
            result = asyncio.run(probe_stream(881, "live"))

        assert result["codec"] == "unknown"

    def test_ffprobe_nonzero_exit_no_405_httpx_error(self):
        """ffprobe fails, httpx raises HTTPError -> codec unknown."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"some error")

        class _MockHttpxCtx:
            async def get(self, url):
                raise httpx.HTTPError("connection failed")

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__.return_value = _MockHttpxCtx()
            result = asyncio.run(probe_stream(882, "live"))

        assert result["codec"] == "unknown"

    def test_ffprobe_missing_stdout_and_no_stderr(self):
        """ffprobe returns code=1 with no stdout and no stderr."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"")

        class _MockHttpxCtx:
            async def get(self, url):
                resp = MagicMock()
                resp.status_code = 200
                return resp

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__.return_value = _MockHttpxCtx()
            result = asyncio.run(probe_stream(883, "live"))

        assert result["codec"] == "unknown"

    def test_ffprobe_zero_return_no_stdout(self):
        """ffprobe returns code=0 but no stdout -> proceeds to httpx fallback."""
        proc = _mock_ffprobe_proc(returncode=0, stdout=b"", stderr=b"")

        class _MockHttpxCtx:
            async def get(self, url):
                resp = MagicMock()
                resp.status_code = 200
                return resp

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__.return_value = _MockHttpxCtx()
            result = asyncio.run(probe_stream(884, "live"))

        assert result["codec"] == "unknown"


# ═══════════════════════════════════════════════════════════════════════════════
# curl_cffi fallback tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestCurlCffiFallback:
    """Tests for curl_cffi fallback when ffprobe gets a 405 error."""

    # -- Helper: make run_in_executor call the lambda directly --
    @staticmethod
    def _patch_run_in_executor(mock_loop):
        async def _run_in_executor(_none, fn, *_a):
            return fn()

        mock_loop.return_value.run_in_executor = _run_in_executor

    def test_ffprobe_405_curl_cffi_success(self):
        """ffprobe returns 405, curl_cffi fallback succeeds -> h264 with curl_cffi note."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"405 Method Not Allowed")
        mock_get = MagicMock(return_value=_mock_curl_success())

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.CurlReq.get", mock_get),
            patch("routes.stream_probe.asyncio.get_event_loop") as mock_loop,
        ):
            self._patch_run_in_executor(mock_loop)
            result = asyncio.run(probe_stream(444, "live"))

        assert result["codec"] == "h264"
        assert "curl_cffi" in result.get("codec_long", "")
        mock_get.assert_called_once()

    def test_ffprobe_405_curl_cffi_403_response(self):
        """curl_cffi returns 403 -> unavailable."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"405 Method Not Allowed")
        mock_get = MagicMock(return_value=_mock_curl_failure(status_code=403))

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.CurlReq.get", mock_get),
            patch("routes.stream_probe.asyncio.get_event_loop") as mock_loop,
        ):
            self._patch_run_in_executor(mock_loop)
            result = asyncio.run(probe_stream(445, "live"))

        assert result["codec"] == "unavailable"

    def test_ffprobe_405_curl_cffi_200_zero_content_length(self):
        """curl_cffi returns 200 but content-length=0 -> unavailable."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"405 Method Not Allowed")
        mock_get = MagicMock(return_value=_mock_curl_failure(status_code=200, cl="0"))

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.CurlReq.get", mock_get),
            patch("routes.stream_probe.asyncio.get_event_loop") as mock_loop,
        ):
            self._patch_run_in_executor(mock_loop)
            result = asyncio.run(probe_stream(446, "live"))

        assert result["codec"] == "unavailable"

    def test_ffprobe_405_curl_cffi_200_non_digit_cl(self):
        """content-length header is non-numeric string -> unavailable."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"405 Method Not Allowed")
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {"content-length": "abc"}
        mock_get = MagicMock(return_value=resp)

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.CurlReq.get", mock_get),
            patch("routes.stream_probe.asyncio.get_event_loop") as mock_loop,
        ):
            self._patch_run_in_executor(mock_loop)
            result = asyncio.run(probe_stream(447, "live"))

        assert result["codec"] == "unavailable"

    def test_ffprobe_405_curl_cffi_missing_cl_header(self):
        """No content-length header -> unavailable."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"405")
        resp = MagicMock()
        resp.status_code = 200
        resp.headers = {}
        mock_get = MagicMock(return_value=resp)

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.CurlReq.get", mock_get),
            patch("routes.stream_probe.asyncio.get_event_loop") as mock_loop,
        ):
            self._patch_run_in_executor(mock_loop)
            result = asyncio.run(probe_stream(448, "live"))

        assert result["codec"] == "unavailable"

    def test_ffprobe_405_curl_cffi_404_response(self):
        """curl_cffi returns 404 -> unavailable."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"405 Method Not Allowed")
        mock_get = MagicMock(return_value=_mock_curl_failure(status_code=404))

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.CurlReq.get", mock_get),
            patch("routes.stream_probe.asyncio.get_event_loop") as mock_loop,
        ):
            self._patch_run_in_executor(mock_loop)
            result = asyncio.run(probe_stream(449, "live"))

        assert result["codec"] == "unavailable"

    def test_ffprobe_405_curl_cffi_caches_result(self):
        """Successful curl_cffi result is stored in cache."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"405")
        mock_get = MagicMock(return_value=_mock_curl_success())

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.CurlReq.get", mock_get),
            patch("routes.stream_probe.asyncio.get_event_loop") as mock_loop,
        ):
            self._patch_run_in_executor(mock_loop)
            result = asyncio.run(probe_stream(450, "live"))

        assert result["codec"] == "h264"
        assert "live_450" in _probe_cache
        assert _probe_cache["live_450"][1]["codec"] == "h264"

    def test_ffprobe_405_curl_cffi_caches_unavailable(self):
        """Failed curl_cffi also stores 'unavailable' in cache."""
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"405")
        mock_get = MagicMock(return_value=_mock_curl_failure(status_code=403))

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.CurlReq.get", mock_get),
            patch("routes.stream_probe.asyncio.get_event_loop") as mock_loop,
        ):
            self._patch_run_in_executor(mock_loop)
            result = asyncio.run(probe_stream(451, "live"))

        assert result["codec"] == "unavailable"
        assert "live_451" in _probe_cache


# ═══════════════════════════════════════════════════════════════════════════════
# JSON decode / ffprobe output edge cases
# ═══════════════════════════════════════════════════════════════════════════════


class TestFfprobeOutputEdgeCases:
    """Tests for edge cases in ffprobe output handling."""

    def test_ffprobe_invalid_json_returns_unknown(self):
        """probe_stream returns unknown when ffprobe outputs invalid JSON."""
        proc = _mock_ffprobe_proc(returncode=0, stdout=b"not valid json")

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(900, "live"))

        assert result["codec"] == "unknown"

    def test_ffprobe_unicode_decode_error_stderr(self):
        """stderr_bytes.decode() raises UnicodeDecodeError caught as ValueError."""
        proc = AsyncMock()
        proc.returncode = 0
        proc.communicate = AsyncMock(return_value=(b'{"streams":[]}', b"\xff\xfe invalid utf-8"))

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(901, "live"))

        # The decode happens in a try/except for ValueError
        assert result["codec"] == "unknown"

    def test_ffprobe_empty_stdout(self):
        """Empty stdout from ffprobe triggers httpx fallback path."""
        proc = _mock_ffprobe_proc(returncode=0, stdout=b"")

        class _MockHttpxCtx:
            async def get(self, url):
                resp = MagicMock()
                resp.status_code = 200
                return resp

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.httpx.AsyncClient") as MockClient,
        ):
            MockClient.return_value.__aenter__.return_value = _MockHttpxCtx()
            result = asyncio.run(probe_stream(902, "live"))

        assert result["codec"] == "unknown"


# ═══════════════════════════════════════════════════════════════════════════════
# Route endpoint tests (integration via TestClient)
# ═══════════════════════════════════════════════════════════════════════════════


class TestRouteEndpoints:
    """Tests for FastAPI route endpoints via TestClient."""

    def test_live_probe_endpoint_returns_json(self, client):
        """GET /api/v1/live/probe/{id} returns 200 with codec field."""
        resp = client.get("/api/v1/live/probe/99999")
        assert resp.status_code == 200
        data = resp.json()
        assert "codec" in data
        assert isinstance(data["codec"], str)

    def test_movie_probe_endpoint_returns_json(self, client):
        """GET /api/v1/movie/probe/{id} returns 200 with codec field."""
        resp = client.get("/api/v1/movie/probe/88888")
        assert resp.status_code == 200
        data = resp.json()
        assert "codec" in data
        assert isinstance(data["codec"], str)

    def test_series_probe_endpoint_returns_json(self, client):
        """GET /api/v1/series/probe/{id} returns 200 with codec field."""
        resp = client.get("/api/v1/series/probe/77777")
        assert resp.status_code == 200
        data = resp.json()
        assert "codec" in data
        assert isinstance(data["codec"], str)

    def test_probe_different_ids_independent(self, client):
        """Different stream IDs produce independent probe results."""
        resp1 = client.get("/api/v1/live/probe/1")
        resp2 = client.get("/api/v1/live/probe/2")
        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert "codec" in resp1.json()
        assert "codec" in resp2.json()

    def test_probe_returns_application_json_content_type(self, client):
        """Probe endpoint returns Content-Type: application/json."""
        resp = client.get("/api/v1/live/probe/99999")
        assert resp.status_code == 200
        assert "application/json" in resp.headers.get("content-type", "")

    def test_probe_for_stream_id_zero(self, client):
        """Probe for stream_id=0 returns gracefully with codec field."""
        resp = client.get("/api/v1/live/probe/0")
        assert resp.status_code == 200
        data = resp.json()
        assert "codec" in data
        assert data["codec"] in ("unknown", "unavailable")


# ═══════════════════════════════════════════════════════════════════════════════
# Mock target integrity tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestMockTargets:
    """Tests that verify the correct patch targets for routes.stream_probe.

    These tests confirm that monkey-patching routes.stream_probe module-level
    references works correctly. Since build_stream_url and _lookup_extension
    are imported via 'from .stream_core import ...' they are bound in the
    stream_probe module namespace and must be patched there.
    """

    @patch("routes.stream_probe.build_stream_url", return_value="http://test-cdn/stream.ts")
    def test_build_stream_url_patch_at_stream_probe(self, mock_url):
        """build_stream_url is patchable at routes.stream_probe namespace."""
        proc = _mock_ffprobe_proc(returncode=0, stdout=b"{}")
        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc):
            result = asyncio.run(probe_stream(555, "live"))

        assert result["codec"] == "unknown"
        mock_url.assert_called_once()

    @patch("routes.stream_probe._lookup_extension", return_value="mp4")
    def test_lookup_extension_patch_at_stream_probe(self, mock_lookup):
        """_lookup_extension is patchable at routes.stream_probe namespace."""
        result = asyncio.run(probe_stream(10, "movie"))
        assert result["codec"] == "h264"
        mock_lookup.assert_called_once_with(10, "movie")

    def test_asyncio_create_subprocess_exec_patchable(self):
        """asyncio.create_subprocess_exec is patchable at routes.stream_probe."""
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"{}", b""))

        with patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=mock_proc):
            result = asyncio.run(probe_stream(666, "live"))

        assert result["codec"] == "unknown"

    @patch("routes.stream_probe.CurlReq.get")
    def test_curl_req_get_patchable(self, mock_get):
        """CurlReq.get is patchable at routes.stream_probe namespace."""
        mock_get.return_value = _mock_curl_success()
        proc = _mock_ffprobe_proc(returncode=1, stdout=b"", stderr=b"405")

        async def _run_direct(_none, fn, *_a):
            return fn()

        with (
            patch("routes.stream_probe.asyncio.create_subprocess_exec", return_value=proc),
            patch("routes.stream_probe.asyncio.get_event_loop") as mock_loop,
        ):
            mock_loop.return_value.run_in_executor = _run_direct
            result = asyncio.run(probe_stream(777, "live"))

        assert result["codec"] == "h264"
        mock_get.assert_called_once()
