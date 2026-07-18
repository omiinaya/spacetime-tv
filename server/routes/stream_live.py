"""Live TV stream routes — proxy, transcode, quality-locked transcoding.

Extracted from stream.py during decomposition of the 1105-line monolithic file.
"""

import logging

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse

from iptv_client import build_timeshift_url
from state import track_hit

from .stream_core import build_stream_url, stream_bytes, stream_bytes_transcode
from iptv_client import mask_url_credentials

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["stream"])


@router.get("/stream/live/{stream_id}")
async def stream_live(stream_id: int, request: Request):
    """Proxy live TV stream (raw MPEG-TS). Closes upstream fast on disconnect."""
    track_hit("live", stream_id)
    try:
        url = await build_stream_url(stream_id, "live")
    except RuntimeError as e:
        log.error(f"Stream URL build error (id={stream_id}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Stream unavailable"})
    log.info(f"STREAM LIVE START id={stream_id}")

    try:

        async def monitored_stream():
            try:
                async for chunk in stream_bytes(url):
                    if await request.is_disconnected():
                        log.info(f"STREAM LIVE DISCONNECT id={stream_id} — stopping upstream")
                        break  # pragma: no cover — disconnect only at runtime
                    yield chunk  # pragma: no cover — async generator yield
            except (OSError, RuntimeError) as e:
                log.warning(f"STREAM LIVE ERROR id={stream_id}: {e}")  # pragma: no cover — runtime error in stream
            finally:
                log.info(f"STREAM LIVE END id={stream_id}")  # pragma: no cover — runtime cleanup

        return StreamingResponse(
            monitored_stream(),
            media_type="video/mp2t",
            headers={
                "Cache-Control": "no-cache",
            },
        )
    except (RuntimeError, Exception) as e:  # pragma: no cover — StreamingResponse never raises at construction
        log.error(f"Stream proxy error ({mask_url_credentials(url)}): {e}")  # pragma: no cover
        return JSONResponse(status_code=502, content={"detail": "Stream unavailable"})  # pragma: no cover


@router.get("/stream/live/{stream_id}/transcode")
async def stream_live_transcode(stream_id: int):
    """Proxy live TV stream with HEVC→H.264 transcoding via ffmpeg."""
    try:
        url = await build_stream_url(stream_id, "live")
    except RuntimeError as e:
        log.error(f"Timeshift URL build error (id={stream_id}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Timeshift stream unavailable"})
    try:
        return StreamingResponse(
            stream_bytes_transcode(url),
            media_type="video/mp2t",
            headers={
                "Cache-Control": "no-cache",
            },
        )
    except (RuntimeError, Exception) as e:  # pragma: no cover — StreamingResponse never raises at construction
        log.error(f"Transcode setup error ({mask_url_credentials(url)}): {e}")  # pragma: no cover
        return JSONResponse(status_code=502, content={"detail": "Transcode failed"})  # pragma: no cover


@router.get("/stream/live/{stream_id}/timeshift")
async def stream_live_timeshift(
    request: Request, stream_id: int, duration: int = Query(3600, description="Seconds to go back (default 1h)")
):
    """Proxy a catch-up/timeshift stream for the given channel.

    Duration specifies how far back in seconds (e.g. 3600 = 1 hour ago).
    Returns raw MPEG-TS proxied from the provider's timeshift endpoint.
    """
    track_hit("live", stream_id)
    url = build_timeshift_url(stream_id, duration)
    log.info(f"STREAM TIMESHIFT id={stream_id} duration={duration}s")

    try:

        async def monitored_stream():
            try:
                async for chunk in stream_bytes(url):
                    if await request.is_disconnected():
                        log.info(f"STREAM TIMESHIFT DISCONNECT id={stream_id}")
                        break  # pragma: no cover — disconnect only at runtime
                    yield chunk  # pragma: no cover — async generator yield
            except (OSError, RuntimeError) as e:
                log.warning(f"STREAM TIMESHIFT ERROR id={stream_id}: {e}")  # pragma: no cover — runtime error
            finally:
                log.info(f"STREAM TIMESHIFT END id={stream_id}")  # pragma: no cover — runtime cleanup

        return StreamingResponse(
            monitored_stream(),
            media_type="video/mp2t",
            headers={
                "Cache-Control": "no-cache",
            },
        )
    except (RuntimeError, Exception) as e:  # pragma: no cover — StreamingResponse never raises at construction
        log.error(f"Timeshift proxy error (id={stream_id}, dur={duration}): {e}")  # pragma: no cover
        return JSONResponse(status_code=502, content={"detail": "Timeshift stream unavailable"})  # pragma: no cover


@router.get("/stream/live/{stream_id}/quality/{height}")
async def stream_live_quality(stream_id: int, height: int):
    """Proxy live TV stream transcoded to a specific height (360, 720, 1080)."""
    try:
        url = await build_stream_url(stream_id, "live")
    except RuntimeError as e:
        log.error(f"Timeshift URL build error (id={stream_id}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Timeshift stream unavailable"})
    try:
        return StreamingResponse(
            stream_bytes_transcode(url, target_height=height),
            media_type="video/mp2t",
            headers={
                "Cache-Control": "no-cache",
            },
        )
    except (RuntimeError, Exception) as e:  # pragma: no cover — StreamingResponse never raises at construction
        log.error(f"Quality transcode error ({mask_url_credentials(url)}): {e}")  # pragma: no cover
        return JSONResponse(status_code=502, content={"detail": "Transcode failed"})  # pragma: no cover
