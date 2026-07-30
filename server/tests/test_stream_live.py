"""Comprehensive tests for routes/stream_live.py — live TV proxy, transcode,
timeshift, and quality-locked transcoding.

Each route derives from one of two patterns:
  1. Routes that call ``build_stream_url`` from stream_core (live, transcode, quality)
  2. Timeshift route (calls ``build_timeshift_url`` from iptv_client directly)

Conftest provides the ``client`` fixture with mocked ``cached_fetch``,
X-Admin-Key header, lifespan override, and shared-state reset.
"""

from unittest.mock import patch

import pytest

# ── Mock async generators ────────────────────────────────────────────────


async def _mock_ts_packets(*args, **kwargs):
    """Yield a single valid MPEG-TS packet (0x47 sync byte + 187 null bytes)."""
    yield b"\x47" + b"\x00" * 187


# ═══════════════════════════════════════════════════════════════════════════
#  502 — build_stream_url raises RuntimeError
# ═══════════════════════════════════════════════════════════════════════════


class TestBuildUrlFailure:
    """Routes that call ``build_stream_url`` return 502 on RuntimeError.

    The timeshift route does NOT use ``build_stream_url`` — it calls
    ``build_timeshift_url`` directly (string formatting, no raise).  Its
    502 path wraps the StreamingResponse construction and is unreachable
    in practice (StreamingResponse never raises at construction).
    """

    def test_live_returns_502_on_build_url_error(self, client):
        """GET /stream/live/{id} → 502 when build_stream_url raises RuntimeError."""
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("no provider")):
            resp = client.get("/api/v1/stream/live/1")
        assert resp.status_code == 502
        assert resp.json() == {"detail": "Stream unavailable"}

    def test_transcode_returns_502_on_build_url_error(self, client):
        """GET /stream/live/{id}/transcode → 502 when build_stream_url raises."""
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("no provider")):
            resp = client.get("/api/v1/stream/live/1/transcode")
        assert resp.status_code == 502
        assert resp.json() == {"detail": "Timeshift stream unavailable"}

    def test_quality_returns_502_on_build_url_error(self, client):
        """GET /stream/live/{id}/quality/{height} → 502 when build_stream_url raises."""
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("no provider")):
            resp = client.get("/api/v1/stream/live/1/quality/720")
        assert resp.status_code == 502
        assert resp.json() == {"detail": "Timeshift stream unavailable"}

    def test_timeshift_does_not_use_build_stream_url(self, client):
        """Timeshift route does not call build_stream_url — patching it has no effect.

        The route calls ``build_timeshift_url`` directly; a 502 from
        that path is unreachable (the call is outside the try/except).
        This test confirms the patching assumption is correct.
        """
        # Patch build_stream_url to raise — timeshift should still work.
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("irrelevant")):
            with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
                resp = client.get("/api/v1/stream/live/1/timeshift?duration=60")
        assert resp.status_code == 200, "timeshift ignores build_stream_url"


# ═══════════════════════════════════════════════════════════════════════════
#  200 — Successful StreamingResponse (all four routes)
# ═══════════════════════════════════════════════════════════════════════════


class TestSuccess:
    """Each route returns 200 with a StreamingResponse when upstream succeeds.

    When mock generators are also patched in, the consumed response body
    contains the yielded bytes.
    """

    def test_live_returns_streaming_response(self, client):
        """Live returns 200 with video/mp2t containing MPEG-TS sync byte."""
        with patch("routes.stream_live.build_stream_url", return_value="http://mock/stream.ts"):
            with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
                resp = client.get("/api/v1/stream/live/1")
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "video/mp2t"
        assert b"\x47" in resp.content

    def test_transcode_returns_streaming_response(self, client):
        """Transcode returns 200 with video/mp2t containing MPEG-TS sync byte."""
        with patch("routes.stream_live.build_stream_url", return_value="http://mock/stream.ts"):
            with patch("routes.stream_live.stream_bytes_transcode", side_effect=_mock_ts_packets):
                resp = client.get("/api/v1/stream/live/1/transcode")
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "video/mp2t"
        assert b"\x47" in resp.content

    def test_timeshift_returns_streaming_response(self, client):
        """Timeshift returns 200 with video/mp2t containing MPEG-TS sync byte."""
        with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
            resp = client.get("/api/v1/stream/live/1/timeshift?duration=60")
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "video/mp2t"
        assert b"\x47" in resp.content

    def test_quality_returns_streaming_response(self, client):
        """Quality returns 200 with video/mp2t containing MPEG-TS sync byte."""
        with patch("routes.stream_live.build_stream_url", return_value="http://mock/stream.ts"):
            with patch("routes.stream_live.stream_bytes_transcode", side_effect=_mock_ts_packets):
                resp = client.get("/api/v1/stream/live/1/quality/720")
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "video/mp2t"
        assert b"\x47" in resp.content

    def test_live_returns_200_without_mocking_generators(self, client):
        """Live returns 200 even without patching generators.

        ``StreamingResponse`` never raises at construction.  The async
        generator will be consumed by TestClient but will fail silently
        (aiohttp call fails in test env) — the response is still 200
        (possibly empty body).
        """
        with patch("routes.stream_live.build_stream_url", return_value="http://mock/stream.ts"):
            resp = client.get("/api/v1/stream/live/42")
        assert resp.status_code == 200
        assert resp.headers.get("content-type") == "video/mp2t"
        # Body may be empty since the generator exits on network failure


# ═══════════════════════════════════════════════════════════════════════════
#  Timeshift — duration query parameter
# ═══════════════════════════════════════════════════════════════════════════


class TestTimeshiftDuration:
    """Timeshift endpoint behaviour with various duration values.

    The route accepts ``duration`` as an optional integer query parameter
    (default 3600).  It is passed through to ``build_timeshift_url``
    which constructs the provider URL.
    """

    def test_default_duration(self, client):
        """Omitting duration uses the default of 3600."""
        with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
            resp = client.get("/api/v1/stream/live/1/timeshift")
        assert resp.status_code == 200

    def test_custom_duration(self, client):
        """Custom duration (7200 = 2h) is accepted."""
        with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
            resp = client.get("/api/v1/stream/live/1/timeshift?duration=7200")
        assert resp.status_code == 200

    def test_duration_zero(self, client):
        """Duration of 0 (live from current time) is accepted."""
        with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
            resp = client.get("/api/v1/stream/live/1/timeshift?duration=0")
        assert resp.status_code == 200

    def test_duration_negative(self, client):
        """Negative duration is still passed through (route doesn't validate)."""
        with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
            resp = client.get("/api/v1/stream/live/1/timeshift?duration=-3600")
        assert resp.status_code in (200, 422)  # FastAPI may or may not reject negatives

    def test_duration_large(self, client):
        """Large duration (7 days) is accepted."""
        with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
            resp = client.get("/api/v1/stream/live/1/timeshift?duration=604800")
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
#  Quality — different height values
# ═══════════════════════════════════════════════════════════════════════════


class TestQuality:
    """Quality endpoint accepts various height values via path parameter.

    ``stream_bytes_transcode`` receives ``target_height=height`` and
    passes ``-vf scale=-2:{height}`` to ffmpeg.
    """

    @pytest.mark.parametrize(
        "height,label",
        [
            (360, "SD 360p"),
            (480, "SD 480p"),
            (720, "HD 720p"),
            (1080, "Full HD 1080p"),
            (2160, "4K 2160p"),
            (144, "Very low resolution"),
        ],
    )
    def test_common_heights_return_200(self, client, height, label):
        """Quality endpoint returns 200 for {label} (height={height})."""
        with patch("routes.stream_live.build_stream_url", return_value="http://mock/stream.ts"):
            with patch("routes.stream_live.stream_bytes_transcode", side_effect=_mock_ts_packets):
                resp = client.get(f"/api/v1/stream/live/1/quality/{height}")
        assert resp.status_code == 200, f"height={height} ({label}) should return 200"
        assert resp.headers.get("content-type") == "video/mp2t"

    @pytest.mark.parametrize("height", [0, -1])
    def test_invalid_heights_still_return_200(self, client, height):
        """Route passes height to ffmpeg without validation — even 0 or -1.

        The stream_bytes_transcode generator would fail at runtime when
        ffmpeg runs, but the route constructor succeeds (200).
        """
        with patch("routes.stream_live.build_stream_url", return_value="http://mock/stream.ts"):
            with patch("routes.stream_live.stream_bytes_transcode", side_effect=_mock_ts_packets):
                resp = client.get(f"/api/v1/stream/live/1/quality/{height}")
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
#  Route existence — mounted and reachable
# ═══════════════════════════════════════════════════════════════════════════


class TestRouteExistence:
    """Each endpoint is properly mounted under /api/v1/stream/live/."""

    ROUTES = [
        "/api/v1/stream/live/1",
        "/api/v1/stream/live/1/transcode",
        "/api/v1/stream/live/1/timeshift",
        "/api/v1/stream/live/1/quality/720",
    ]

    @pytest.mark.parametrize("path", ROUTES)
    def test_route_not_404(self, client, path):
        """GET {path} does not return 404 — route is mounted."""
        resp = client.get(path)
        assert resp.status_code != 404, f"{path} returned 404 (not mounted)"


# ═══════════════════════════════════════════════════════════════════════════
#  HTTP method restrictions
# ═══════════════════════════════════════════════════════════════════════════


class TestMethodNotAllowed:
    """All endpoints reject non-GET methods with 405."""

    @pytest.mark.parametrize(
        "path",
        [
            "/api/v1/stream/live/1",
            "/api/v1/stream/live/1/transcode",
            "/api/v1/stream/live/1/timeshift",
            "/api/v1/stream/live/1/quality/720",
        ],
    )
    @pytest.mark.parametrize("method", ["post", "put", "delete", "patch"])
    def test_non_get_methods_return_405(self, client, path, method):
        """{method.upper()} {path} returns 405 (method not allowed)."""
        resp = getattr(client, method)(path)
        assert resp.status_code == 405, (
            f"{method.upper()} {path} expected 405, got {resp.status_code}"
        )


# ═══════════════════════════════════════════════════════════════════════════
#  Error detail validation
# ═══════════════════════════════════════════════════════════════════════════


class TestErrorDetail:
    """Error response detail field values match expected strings."""

    def test_live_502_detail(self, client):
        """Live 502 response detail is 'Stream unavailable'."""
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("fail")):
            resp = client.get("/api/v1/stream/live/1")
        assert resp.json() == {"detail": "Stream unavailable"}

    def test_transcode_502_detail(self, client):
        """Transcode 502 response detail is 'Timeshift stream unavailable' (error msg copy)."""
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("fail")):
            resp = client.get("/api/v1/stream/live/1/transcode")
        assert resp.json() == {"detail": "Timeshift stream unavailable"}

    def test_quality_502_detail(self, client):
        """Quality 502 response detail is 'Timeshift stream unavailable' (error msg copy)."""
        with patch("routes.stream_live.build_stream_url", side_effect=RuntimeError("fail")):
            resp = client.get("/api/v1/stream/live/1/quality/720")
        assert resp.json() == {"detail": "Timeshift stream unavailable"}


# ═══════════════════════════════════════════════════════════════════════════
#  Edge cases — stream_id values
# ═══════════════════════════════════════════════════════════════════════════


class TestStreamIdVariants:
    """Routes accept various stream_id values (non-negative integer path param)."""

    @pytest.mark.parametrize("stream_id", [1, 999999, 0])
    def test_live_accepts_various_ids(self, client, stream_id):
        """Live stream route accepts stream_id={stream_id}."""
        with patch("routes.stream_live.build_stream_url", return_value=f"http://mock/{stream_id}.ts"):
            with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
                resp = client.get(f"/api/v1/stream/live/{stream_id}")
        assert resp.status_code == 200

    @pytest.mark.parametrize("stream_id", [1, 999999, 0])
    def test_quality_accepts_various_ids(self, client, stream_id):
        """Quality route accepts stream_id={stream_id}."""
        with patch("routes.stream_live.build_stream_url", return_value=f"http://mock/{stream_id}.ts"):
            with patch("routes.stream_live.stream_bytes_transcode", side_effect=_mock_ts_packets):
                resp = client.get(f"/api/v1/stream/live/{stream_id}/quality/720")
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════
#  Headers — caching disabled
# ═══════════════════════════════════════════════════════════════════════════


class TestCacheHeaders:
    """All streaming responses include Cache-Control: no-cache."""

    def test_live_has_no_cache_header(self, client):
        """Live includes Cache-Control: no-cache."""
        with patch("routes.stream_live.build_stream_url", return_value="http://mock/stream.ts"):
            with patch("routes.stream_live.stream_bytes", side_effect=_mock_ts_packets):
                resp = client.get("/api/v1/stream/live/1")
        assert resp.headers.get("cache-control") == "no-cache"
