"""Live TV stream routes — proxy, transcode, quality-locked transcoding.

Extracted from stream.py during decomposition of the 1105-line monolithic file.
"""
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from state import track_hit
from .stream_core import build_stream_url, stream_bytes, stream_bytes_transcode

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["stream"])


@router.get("/api/stream/live/{stream_id}")
async def stream_live(stream_id: int, request: Request):
    """Proxy live TV stream (raw MPEG-TS). Closes upstream fast on disconnect."""
    track_hit("live", stream_id)
    url = await build_stream_url(stream_id, "live")
    log.info(f"STREAM LIVE START id={stream_id}")

    try:
        async def monitored_stream():
            try:
                async for chunk in stream_bytes(url):
                    if await request.is_disconnected():
                        log.info(f"STREAM LIVE DISCONNECT id={stream_id} — stopping upstream")
                        break
                    yield chunk
            except Exception as e:
                log.warning(f"STREAM LIVE ERROR id={stream_id}: {e}")
            finally:
                log.info(f"STREAM LIVE END id={stream_id}")

        return StreamingResponse(
            monitored_stream(),
            media_type="video/mp2t",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"Stream proxy error ({url}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Stream unavailable"})


@router.get("/api/stream/live/{stream_id}/transcode")
async def stream_live_transcode(stream_id: int):
    """Proxy live TV stream with HEVC→H.264 transcoding via ffmpeg."""
    url = await build_stream_url(stream_id, "live")
    try:
        return StreamingResponse(
            stream_bytes_transcode(url),
            media_type="video/mp2t",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"Transcode setup error ({url}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Transcode failed"})


@router.get("/api/stream/live/{stream_id}/quality/{height}")
async def stream_live_quality(stream_id: int, height: int):
    """Proxy live TV stream transcoded to a specific height (360, 720, 1080)."""
    url = await build_stream_url(stream_id, "live")
    try:
        return StreamingResponse(
            stream_bytes_transcode(url, target_height=height),
            media_type="video/mp2t",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"Quality transcode error ({url}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Transcode failed"})
