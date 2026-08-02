"""Tests for media routes — subtitle and audio probing/streaming."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

# ── Mock helpers ──────────────────────────────────────────────────────


def _make_mock_process(returncode: int = 0, stdout: bytes = b"", stderr: bytes = b""):
    proc = AsyncMock()
    proc.returncode = returncode
    proc.communicate = MagicMock(return_value=(stdout, stderr))
    proc.stdout = None
    proc.stderr = None
    return proc


def _ffprobe_output(streams: list[dict]) -> bytes:
    return json.dumps({"streams": streams}).encode()


def _make_subtitle_stream(index=0, language="eng", title="English", codec="subrip"):
    return {
        "codec_type": "subtitle",
        "index": index,
        "codec_name": codec,
        "tags": {"language": language, "title": title},
    }


def _make_audio_stream(index=0, language="eng", title="English", codec="aac", channels=2):
    return {
        "codec_type": "audio",
        "index": index,
        "codec_name": codec,
        "channels": channels,
        "tags": {"language": language, "title": title},
    }


# ── Subtitles: /api/subtitles/probe ──────────────────────────────────


class TestProbeSubtitles:
    """Tests for GET /api/subtitles/probe/{media_type}/{stream_id}."""

    # Patch at the global asyncio level — routes.media.asyncio IS the same module
    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_probe_subtitles_success(self, mock_wait_for, mock_create_subprocess, client):
        """Should return subtitle tracks when ffprobe succeeds."""
        streams = [
            {"codec_type": "video", "index": 0, "codec_name": "h264"},
            _make_subtitle_stream(1, "eng", "English", "subrip"),
            _make_subtitle_stream(2, "spa", "Espanol", "subrip"),
        ]
        proc = _make_mock_process(0, _ffprobe_output(streams))
        mock_create_subprocess.return_value = proc
        mock_wait_for.return_value = (_ffprobe_output(streams), b"")

        resp = client.get("/api/v1/subtitles/probe/movie/123")
        assert resp.status_code == 200
        data = resp.json()
        assert data["cached"] is False
        assert len(data["tracks"]) == 2
        assert data["tracks"][0]["language"] == "eng"
        assert data["tracks"][1]["language"] == "spa"

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_probe_subtitles_cached(self, mock_wait_for, mock_create_subprocess, client):
        """Second call should return cached result without running ffprobe again."""
        streams = [_make_subtitle_stream(1, "eng", "English", "subrip")]
        proc = _make_mock_process(0, _ffprobe_output(streams))
        mock_create_subprocess.return_value = proc
        mock_wait_for.return_value = (_ffprobe_output(streams), b"")

        resp1 = client.get("/api/v1/subtitles/probe/movie/456")
        assert resp1.status_code == 200
        assert resp1.json()["cached"] is False

        resp2 = client.get("/api/v1/subtitles/probe/movie/456")
        assert resp2.status_code == 200
        data = resp2.json()
        assert data["cached"] is True
        assert len(data["tracks"]) == 1
        assert mock_create_subprocess.call_count == 1

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_probe_subtitles_no_subtitle_streams(self, mock_wait_for, mock_create_subprocess, client):
        """Should return empty tracks when no subtitle streams exist."""
        streams = [
            {"codec_type": "video", "index": 0, "codec_name": "h264"},
            _make_audio_stream(1, "eng", "English", "aac", 2),
        ]
        proc = _make_mock_process(0, _ffprobe_output(streams))
        mock_create_subprocess.return_value = proc
        mock_wait_for.return_value = (_ffprobe_output(streams), b"")

        resp = client.get("/api/v1/subtitles/probe/movie/789")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tracks"] == []
        assert data["cached"] is False

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_probe_subtitles_ffprobe_fails(self, mock_wait_for, mock_create_subprocess, client):
        """Should return error when ffprobe returns non-zero exit code."""
        proc = _make_mock_process(1, b"", b"error message")
        mock_create_subprocess.return_value = proc
        mock_wait_for.return_value = (b"", b"")

        resp = client.get("/api/v1/subtitles/probe/movie/999")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tracks"] == []
        assert data["error"] == "Probe failed"

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_probe_subtitles_timeout(self, mock_wait_for, mock_create_subprocess, client):
        """Should handle ffprobe timeout gracefully."""
        mock_wait_for.side_effect = TimeoutError("Timed out")
        proc = _make_mock_process(0, b"")
        mock_create_subprocess.return_value = proc

        resp = client.get("/api/v1/subtitles/probe/movie/111")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tracks"] == []
        assert data["error"] == "Probe timed out"

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_probe_subtitles_unexpected_exception(self, mock_wait_for, mock_create_subprocess, client):
        """Should handle unexpected exceptions gracefully."""
        mock_create_subprocess.side_effect = RuntimeError("Something went wrong")

        resp = client.get("/api/v1/subtitles/probe/movie/222")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tracks"] == []
        assert "Something went wrong" in data["error"]


# ── Audio: /api/audio/probe ──────────────────────────────────────────


class TestProbeAudio:
    """Tests for GET /api/audio/probe/{media_type}/{stream_id}."""

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_probe_audio_success(self, mock_wait_for, mock_create_subprocess, client):
        """Should return audio tracks when ffprobe succeeds."""
        streams = [
            {"codec_type": "video", "index": 0, "codec_name": "h264"},
            _make_audio_stream(1, "eng", "English", "aac", 6),
            _make_audio_stream(2, "spa", "Espanol", "ac3", 2),
        ]
        proc = _make_mock_process(0, _ffprobe_output(streams))
        mock_create_subprocess.return_value = proc
        mock_wait_for.return_value = (_ffprobe_output(streams), b"")

        resp = client.get("/api/v1/audio/probe/movie/123")
        assert resp.status_code == 200
        data = resp.json()
        assert data["cached"] is False
        assert len(data["tracks"]) == 2
        assert data["tracks"][0]["language"] == "eng"
        assert data["tracks"][1]["language"] == "spa"
        assert data["tracks"][0]["channels"] == 6

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_probe_audio_cached(self, mock_wait_for, mock_create_subprocess, client):
        """Second call should return cached result."""
        streams = [_make_audio_stream(1, "eng", "English", "aac", 2)]
        proc = _make_mock_process(0, _ffprobe_output(streams))
        mock_create_subprocess.return_value = proc
        mock_wait_for.return_value = (_ffprobe_output(streams), b"")

        resp1 = client.get("/api/v1/audio/probe/movie/456")
        assert resp1.json()["cached"] is False

        resp2 = client.get("/api/v1/audio/probe/movie/456")
        data = resp2.json()
        assert data["cached"] is True
        assert mock_create_subprocess.call_count == 1

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_probe_audio_no_audio_streams(self, mock_wait_for, mock_create_subprocess, client):
        """Should return empty tracks when no audio streams."""
        streams = [{"codec_type": "video", "index": 0, "codec_name": "h264"}]
        proc = _make_mock_process(0, _ffprobe_output(streams))
        mock_create_subprocess.return_value = proc
        mock_wait_for.return_value = (_ffprobe_output(streams), b"")

        resp = client.get("/api/v1/audio/probe/movie/789")
        data = resp.json()
        assert data["tracks"] == []

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_probe_audio_ffprobe_fails(self, mock_wait_for, mock_create_subprocess, client):
        """Should return error when ffprobe fails."""
        proc = _make_mock_process(1, b"", b"error")
        mock_create_subprocess.return_value = proc
        mock_wait_for.return_value = (b"", b"")

        resp = client.get("/api/v1/audio/probe/movie/999")
        data = resp.json()
        assert data["tracks"] == []
        assert data["error"] == "Probe failed"

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_probe_audio_timeout(self, mock_wait_for, mock_create_subprocess, client):
        """Should handle ffprobe timeout."""
        mock_wait_for.side_effect = TimeoutError("Timed out")
        proc = _make_mock_process(0, b"")
        mock_create_subprocess.return_value = proc

        resp = client.get("/api/v1/audio/probe/movie/111")
        data = resp.json()
        assert data["tracks"] == []
        assert data["error"] == "Probe timed out"


# ── Subtitles: /api/subtitles/{media_type}/{stream_id}/{track_index} ──


class TestGetSubtitles:
    """Tests for GET /api/subtitles/{media_type}/{stream_id}/{track_index}."""

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_get_subtitles_success(self, mock_wait_for, mock_create_subprocess, client):
        """Should return WebVTT content from ffmpeg extraction."""
        vtt_content = "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHello world\n"
        proc = _make_mock_process(0, vtt_content.encode())
        mock_create_subprocess.return_value = proc
        mock_wait_for.return_value = (vtt_content.encode(), b"")

        resp = client.get("/api/v1/subtitles/movie/123/1")
        assert resp.status_code == 200
        assert "text/vtt" in resp.headers["content-type"]
        assert "WEBVTT" in resp.text
        assert "Cache-Control" in resp.headers

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_get_subtitles_cached(self, mock_wait_for, mock_create_subprocess, client):
        """Second call should return cached VTT without running ffmpeg again."""
        vtt_content = "WEBVTT\n\n00:00:01.000 --> 00:00:05.000\nHello\n"
        proc = _make_mock_process(0, vtt_content.encode())
        mock_create_subprocess.return_value = proc
        mock_wait_for.return_value = (vtt_content.encode(), b"")

        resp1 = client.get("/api/v1/subtitles/movie/456/2")
        assert resp1.status_code == 200
        resp2 = client.get("/api/v1/subtitles/movie/456/2")
        assert resp2.status_code == 200
        assert mock_create_subprocess.call_count == 1

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_get_subtitles_ffmpeg_fails(self, mock_wait_for, mock_create_subprocess, client):
        """Should return 404 (graceful) when ffmpeg extraction fails — a 500
        here makes the <track> element fail hard. CDN-down is common, so a
        clean 404 lets the client show 'subtitles unavailable'."""
        proc = _make_mock_process(1, b"", b"error")
        mock_create_subprocess.return_value = proc
        mock_wait_for.return_value = (b"", b"error")

        resp = client.get("/api/v1/subtitles/movie/999/0")
        assert resp.status_code == 404
        assert "Subtitle track unavailable" in resp.text

    @patch("asyncio.create_subprocess_exec")
    @patch("asyncio.wait_for")
    def test_get_subtitles_timeout(self, mock_wait_for, mock_create_subprocess, client):
        """Should return 504 when ffmpeg times out."""
        mock_wait_for.side_effect = TimeoutError("Timed out")
        proc = _make_mock_process(0, b"")
        mock_create_subprocess.return_value = proc

        resp = client.get("/api/v1/subtitles/movie/111/0")
        assert resp.status_code == 504
        assert "timed out" in resp.text.lower()


# ── Audio stream: /api/audio/stream/{media_type}/{stream_id}/{audio_index} ─


class TestStreamAudio:
    """Tests for GET /api/audio/stream/{media_type}/{stream_id}/{audio_index}."""

    @patch("asyncio.create_subprocess_exec")
    def test_stream_audio_success(self, mock_create_subprocess, client):
        """Should return streaming response with audio data."""
        proc = AsyncMock()
        proc.returncode = None
        proc.stdout = AsyncMock()
        proc.stdout.read = AsyncMock(side_effect=[b"chunk1", b"chunk2", b""])
        proc.kill = MagicMock()
        mock_create_subprocess.return_value = proc

        resp = client.get("/api/v1/audio/stream/movie/123/0")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "video/mp2t"
        assert "Cache-Control" in resp.headers

    @patch("asyncio.create_subprocess_exec")
    def test_stream_audio_fails(self, mock_create_subprocess, client):
        """Should return 500 when ffmpeg fails to open stream."""
        proc = AsyncMock()
        proc.stdout = None
        mock_create_subprocess.return_value = proc

        resp = client.get("/api/v1/audio/stream/movie/999/0")
        assert resp.status_code == 500
