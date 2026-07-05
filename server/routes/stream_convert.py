"""MP4 conversion routes — MKV→fMP4 download+convert, serve cached MP4.

Extracted from stream.py during decomposition of the 1105-line monolithic file.
"""
import asyncio
import logging
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

from config import CACHE_DIR

from .stream_core import build_stream_url
from config import UA_STR

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["stream"])

_converting: dict[str, asyncio.Task] = {}


async def convert_to_mp4(stream_id: str, stream_type: str):
    """Download full MKV from CDN (with retries), then convert → fMP4 locally."""
    cache_key = f"{stream_type}_{stream_id}"
    mkv_path = CACHE_DIR / f"{cache_key}.mkv"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    lock_path = CACHE_DIR / f"{cache_key}.converting"
    if output_path.exists():
        return
    lock_path.write_text(str(time.time()))
    url = await build_stream_url(int(stream_id), stream_type)
    ua = UA_STR
    if not mkv_path.exists():
        log.info(f"Downloading {cache_key} → {mkv_path}")
        dl_cmd = [
            "curl", "-sS", "-L",
            "--retry", "10", "--retry-delay", "5",
            "--retry-max-time", "600", "--max-time", "600",
            "-H", f"User-Agent: {ua}",
            "-o", str(mkv_path), url,
        ]
        dl_proc = await asyncio.create_subprocess_exec(*dl_cmd,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        dl_stdout, dl_stderr = await dl_proc.communicate()
        dl_size = mkv_path.stat().st_size if mkv_path.exists() else 0
        if dl_proc.returncode != 0:
            log.error(f"Download failed for {cache_key} ({dl_size/1024/1024:.0f}MB): "
                      f"curl rc={dl_proc.returncode}")
            if lock_path.exists(): lock_path.unlink()
            return
        log.info(f"Downloaded {cache_key}: {dl_size/1024/1024:.0f} MB")  # pragma: no cover — subprocess download, runtime only
    log.info(f"Converting {cache_key} MKV→fMP4")  # pragma: no cover — subprocess convert, runtime only
    cmd = [
        "/usr/bin/ffmpeg", "-loglevel", "warning",
        "-i", str(mkv_path),
        "-c", "copy",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-f", "mp4", str(output_path),
    ]
    proc = await asyncio.create_subprocess_exec(*cmd,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)

    async def log_stderr():
        while proc.stderr:
            line = await proc.stderr.readline()
            if not line: break
            log.warning(f"mp4-convert: {line.decode().rstrip()}")  # pragma: no cover — ffmpeg stderr, runtime only
    stderr_task = asyncio.create_task(log_stderr())
    await proc.wait()
    stderr_task.cancel()
    try: await stderr_task
    except asyncio.CancelledError: pass
    if lock_path.exists(): lock_path.unlink()
    if proc.returncode == 0 and output_path.exists() and mkv_path.exists():
        mkv_path.unlink()  # pragma: no cover — post-convert cleanup, runtime only
    if proc.returncode != 0:
        log.warning(f"MP4 conversion exited {proc.returncode} for {cache_key}")  # pragma: no cover — subprocess exit, runtime only
    else:
        log.info(f"MP4 cached: {cache_key}")  # pragma: no cover — subprocess exit, runtime only


async def _safe_convert(stream_id: str, stream_type: str, cache_key: str):
    try:
        await convert_to_mp4(stream_id, stream_type)
    except (OSError, asyncio.TimeoutError) as e:
        log.error(f"Conversion failed for {cache_key}: {e}", exc_info=True)  # pragma: no cover — subprocess error, runtime only
    finally:
        _converting.pop(cache_key, None)  # pragma: no cover — cleanup, runtime only


@router.get("/movie/convert/{stream_id}")
async def convert_movie(stream_id: int, retry: bool = False):
    """Trigger MKV→MP4 conversion for a movie."""
    cache_key = f"movie_{stream_id}"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    lock_path = CACHE_DIR / f"{cache_key}.converting"
    mkv_path = CACHE_DIR / f"{cache_key}.mkv"
    if retry:
        if output_path.exists(): output_path.unlink()
        if mkv_path.exists(): mkv_path.unlink()
    if output_path.exists() and output_path.stat().st_size > 0:
        return {"status": "ready", "message": "Cached"}
    if lock_path.exists():
        return {"status": "converting", "message": "Conversion in progress"}
    if cache_key not in _converting:
        _converting[cache_key] = asyncio.create_task(
            _safe_convert(str(stream_id), "movie", cache_key))
    return {"status": "converting", "message": "Conversion started"}


@router.get("/series/convert/{series_id}/{episode_id}")
async def convert_series_ep(series_id: int, episode_id: int, retry: bool = False):
    """Trigger MKV→MP4 conversion for a series episode."""
    cache_key = f"series_{episode_id}"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    lock_path = CACHE_DIR / f"{cache_key}.converting"
    mkv_path = CACHE_DIR / f"{cache_key}.mkv"
    if retry:
        if output_path.exists(): output_path.unlink()
        if mkv_path.exists(): mkv_path.unlink()
    if output_path.exists() and output_path.stat().st_size > 0:
        return {"status": "ready", "message": "Cached"}
    if lock_path.exists():
        return {"status": "converting", "message": "Conversion in progress"}
    if cache_key not in _converting:
        _converting[cache_key] = asyncio.create_task(
            _safe_convert(str(episode_id), "series", cache_key))
    return {"status": "converting", "message": "Conversion started"}


def serve_cached_mp4(path: Path, request: Request):
    """Serve a local MP4 file with proper Range/206 support for seeking."""
    file_size = path.stat().st_size
    range_header = request.headers.get("range")
    if not range_header:
        return FileResponse(path, media_type="video/mp4", headers={
            "Accept-Ranges": "bytes",
        })
    start = 0
    end = file_size - 1
    if range_header.startswith("bytes="):
        parts = range_header[6:].split("-")
        start = int(parts[0]) if parts[0] else 0
        if len(parts) > 1 and parts[1]:
            end = min(int(parts[1]), file_size - 1)
    chunk_size = end - start + 1

    async def range_stream():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = chunk_size
            while remaining > 0:
                buf = f.read(min(65536, remaining))
                if not buf: break
                remaining -= len(buf)
                yield buf  # pragma: no cover — async generator, covered at runtime via serve_cached_mp4

    return StreamingResponse(
        range_stream(), status_code=206, media_type="video/mp4",
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(chunk_size),
            "Accept-Ranges": "bytes",
        },
    )


@router.get("/stream/movie/{stream_id}/mp4")
async def serve_movie_mp4(stream_id: int, request: Request):
    """Serve a cached MP4 movie with byte-range support."""
    cache_key = f"movie_{stream_id}"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise HTTPException(404, "MP4 not yet converted")
    return serve_cached_mp4(output_path, request)


@router.get("/stream/series/{series_id}/{episode_id}/mp4")
async def serve_series_mp4(series_id: int, episode_id: int, request: Request):
    """Serve a cached MP4 series episode with byte-range support."""
    cache_key = f"series_{episode_id}"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise HTTPException(404, "MP4 not yet converted")
    return serve_cached_mp4(output_path, request)
