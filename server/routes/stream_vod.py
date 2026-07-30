"""VOD stream routes — remux, transcode, direct playback with Range support.

Extracted from stream.py during decomposition of the 1105-line monolithic file.
"""

import logging
from functools import partial

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from state import track_hit

from .stream_core import (
    _ffmpeg_pipe,
    _http_feed_stdin,
    _mime_from_url,
    build_stream_url,
    stream_vod_bytes,
)

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["stream"])


# ── VOD stream helpers ──────────────────────────────────────────────────────


async def handle_vod_request(req: Request, stream_id: int, stream_type: str, content_type: str = ""):
    """Handle a VOD stream request with Range/206 support for seeking.

    Uses curl_cffi as the HTTP transport (CDN blocks httpx with 405 but
    accepts curl_cffi's Chrome-emulated TLS fingerprint).
    """
    track_hit(stream_type, stream_id)
    try:
        url = await build_stream_url(stream_id, stream_type)
    except RuntimeError as e:
        log.error(f"VOD URL build error ({stream_type} {stream_id}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Stream unavailable"})
    out_content_type = content_type or _mime_from_url(url)
    range_header = req.headers.get("range")

    if range_header:
        return StreamingResponse(
            stream_vod_bytes(url, range_header),
            media_type=out_content_type,
            status_code=206,
            headers={
                "Cache-Control": "no-cache",
                "Accept-Ranges": "bytes",
            },
        )

    # Full request — no Range
    return StreamingResponse(
        stream_vod_bytes(url),
        media_type=out_content_type,
        headers={
            "Cache-Control": "no-cache",
            "Accept-Ranges": "bytes",
        },
    )


async def stream_vod_mpegts(url: str, start_time: float | None = None):
    """Remux VOD (any container) → MPEG-TS with -c copy (no re-encode).

    Uses curl_cffi to download from the CDN (bypasses Cloudflare's bot
    detection) and pipes the data to ffmpeg's stdin for remuxing to
    MPEG-TS, which is playable by mpegts.js.
    Supports time-based seeking via start_time.
    """
    cmd = [
        "/usr/bin/ffmpeg",
        "-loglevel",
        "warning",
        "-probesize",
        "512K",
        "-analyzeduration",
        "512K",
    ]
    range_header = None
    if start_time and start_time > 0:
        cmd += ["-ss", str(start_time), "-copyts"]
        range_header = f"bytes={int(start_time * 5_000_000)}-"
    cmd += [
        "-i",
        "pipe:0",
        "-c",
        "copy",
        "-f",
        "mpegts",
        "pipe:1",
    ]
    feed = partial(_http_feed_stdin, url=url, range_header=range_header, buf_size=262144, log_prefix="vod-remux")
    async for chunk in _ffmpeg_pipe(cmd, feed):
        yield chunk  # pragma: no cover — async generator yield, covered at runtime


async def stream_vod_transcode(url: str):
    """Transcode VOD (MKV with HEVC) → H.264+AAC in MPEG-TS container.
    Used when the browser can't decode H.265 natively.
    """
    cmd = [
        "/usr/bin/ffmpeg",
        "-loglevel",
        "warning",
        "-probesize",
        "512K",
        "-analyzeduration",
        "512K",
        "-i",
        "pipe:0",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-crf",
        "26",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-f",
        "mpegts",
        "pipe:1",
    ]
    feed = partial(_http_feed_stdin, url=url, log_prefix="vod-transcode")
    async for chunk in _ffmpeg_pipe(cmd, feed):
        yield chunk  # pragma: no cover — async generator yield, covered at runtime


# ── VOD stream routes ───────────────────────────────────────────────────────


@router.get("/stream/movie/{stream_id}/remux")
async def stream_movie_remux(stream_id: int, start: float | None = None):
    """Remux movie MKV→MPEG-TS for browser playback (mpegts.js)."""
    try:
        url = await build_stream_url(stream_id, "movie")
    except RuntimeError as e:
        log.error(f"VOD remux URL build error (movie {stream_id}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Remux failed"})
    try:
        return StreamingResponse(
            stream_vod_mpegts(url, start),
            media_type="video/mp2t",
            headers={"Cache-Control": "no-cache"},
        )
    except (RuntimeError, Exception) as e:  # pragma: no cover — StreamingResponse never raises at construction
        log.error(f"Movie remux error ({stream_id}): {e}")  # pragma: no cover
        return JSONResponse(status_code=502, content={"detail": "Remux failed"})  # pragma: no cover


@router.get("/stream/series/{series_id}/{episode_id}/remux")
async def stream_series_remux(series_id: int, episode_id: int, start: float | None = None):
    """Remux series episode MKV→MPEG-TS for browser playback (mpegts.js)."""
    try:
        url = await build_stream_url(episode_id, "series")
    except RuntimeError as e:
        log.error(f"VOD remux URL build error (series {episode_id}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Remux failed"})
    try:
        return StreamingResponse(
            stream_vod_mpegts(url, start),
            media_type="video/mp2t",
            headers={"Cache-Control": "no-cache"},
        )
    except (RuntimeError, Exception) as e:  # pragma: no cover — StreamingResponse never raises at construction
        log.error(f"Series remux error ({episode_id}): {e}")  # pragma: no cover
        return JSONResponse(status_code=502, content={"detail": "Remux failed"})  # pragma: no cover


@router.get("/stream/movie/{stream_id}/transcode")
async def stream_movie_transcode(stream_id: int):
    """Transcode a HEVC movie to H.264 on-the-fly."""
    try:
        url = await build_stream_url(stream_id, "movie")
    except RuntimeError as e:
        log.error(f"VOD remux URL build error (movie {stream_id}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Remux failed"})
    try:
        return StreamingResponse(
            stream_vod_transcode(url),
            media_type="video/mp2t",
            headers={"Cache-Control": "no-cache"},
        )
    except (RuntimeError, Exception) as e:  # pragma: no cover — StreamingResponse never raises at construction
        log.error(f"VOD transcode error (movie {stream_id}): {e}")  # pragma: no cover
        return JSONResponse(status_code=502, content={"detail": "Transcode failed"})  # pragma: no cover


@router.get("/stream/series/{series_id}/{episode_id}/transcode")
async def stream_series_transcode(series_id: int, episode_id: int):
    """Transcode a HEVC series episode to H.264 on-the-fly."""
    try:
        url = await build_stream_url(episode_id, "series")
    except RuntimeError as e:
        log.error(f"VOD remux URL build error (series {episode_id}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Remux failed"})
    try:
        return StreamingResponse(
            stream_vod_transcode(url),
            media_type="video/mp2t",
            headers={"Cache-Control": "no-cache"},
        )
    except (RuntimeError, Exception) as e:  # pragma: no cover — StreamingResponse never raises at construction
        log.error(f"VOD transcode error (series {episode_id}): {e}")  # pragma: no cover
        return JSONResponse(status_code=502, content={"detail": "Transcode failed"})  # pragma: no cover


@router.get("/stream/movie/{stream_id}")
async def stream_movie(req: Request, stream_id: int):
    """Proxy movie stream (MKV) with Range support for seeking."""
    return await handle_vod_request(req, stream_id, "movie")


@router.get("/stream/series/{series_id}/{episode_id}")
async def stream_series_ep(req: Request, series_id: int, episode_id: int):
    """Proxy series episode stream (MKV) with Range support for seeking."""
    return await handle_vod_request(req, episode_id, "series")
