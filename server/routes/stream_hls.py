"""HLS streaming routes — MKV download, ffmpeg segmentation, segment serving.

Extracted from stream.py during decomposition of the 1105-line monolithic file.
"""

import asyncio
import logging
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .stream_core import build_stream_url

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["stream"])

from config import CACHE_DIR

HLS_DIR = CACHE_DIR / "hls"
HLS_DIR.mkdir(parents=True, exist_ok=True)
_hls_tasks: dict[str, asyncio.Task] = {}
_hls_procs: dict[str, asyncio.subprocess.Process] = {}
_mkv_downloaders: dict[str, asyncio.subprocess.Process] = {}


async def download_mkv(stream_id: str, stream_type: str, cache_key: str) -> Path | None:
    """Download MKV from CDN to disk with retries."""
    mkv_path = CACHE_DIR / f"{cache_key}.mkv"
    if mkv_path.exists() and mkv_path.stat().st_size > 0:
        return mkv_path
    url = await build_stream_url(int(stream_id), stream_type)
    ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    log.info(f"[HLS] Downloading {cache_key} → {mkv_path}")
    cmd = [
        "curl",
        "-sS",
        "-L",
        "--retry",
        "10",
        "--retry-delay",
        "5",
        "--retry-max-time",
        "600",
        "--max-time",
        "900",
        "-H",
        f"User-Agent: {ua}",
        "-o",
        str(mkv_path),
        url,
    ]
    proc = await asyncio.create_subprocess_exec(*cmd)
    _mkv_downloaders[cache_key] = proc
    await proc.wait()
    _mkv_downloaders.pop(cache_key, None)
    if proc.returncode != 0 or not mkv_path.exists():
        log.error(f"[HLS] Download failed for {cache_key}")
        return None  # pragma: no cover — subprocess download, runtime only
    log.info(f"[HLS] Downloaded {cache_key}: {mkv_path.stat().st_size / 1024 / 1024:.0f} MB")
    return mkv_path


async def run_hls_segmenter(cache_key: str, input_path: Path):
    """Run ffmpeg to segment a local MKV/MP4 into HLS (.m3u8 + .ts)."""
    seg_dir = HLS_DIR / cache_key
    seg_dir.mkdir(parents=True, exist_ok=True)
    for f in seg_dir.glob("*.ts"):
        f.unlink()
    pl_path = seg_dir / "playlist.m3u8"
    if pl_path.exists():
        pl_path.unlink()
    ffmpeg_args = [
        "/usr/bin/ffmpeg",
        "-loglevel",
        "warning",
        "-y",
        "-i",
        str(input_path),
        "-c",
        "copy",
        "-f",
        "hls",
        "-hls_time",
        "4",
        "-hls_list_size",
        "0",
        "-hls_flags",
        "delete_segments",
        str(seg_dir / "playlist.m3u8"),
    ]
    old = _hls_procs.pop(cache_key, None)
    if old and old.returncode is None:
        old.kill()  # pragma: no cover — old proc cleanup, runtime only
    log.info(f"[HLS] Segmenting {cache_key}")
    proc = await asyncio.create_subprocess_exec(*ffmpeg_args)
    _hls_procs[cache_key] = proc
    await proc.wait()
    _hls_procs.pop(cache_key, None)
    if proc.returncode != 0:
        log.warning(f"[HLS] Segmenter exited {proc.returncode} for {cache_key}")
    else:
        mkv_path = CACHE_DIR / f"{cache_key}.mkv"
        if mkv_path.exists():
            try:
                mkv_path.unlink()
            except OSError:
                pass  # pragma: no cover — unlink error, runtime only


async def ensure_hls(stream_id: str, stream_type: str, seek_seconds: float = 0) -> bool:
    """Ensure HLS segments exist for a VOD stream. Returns True if ready."""
    cache_key = f"{stream_type}_{stream_id}"
    seg_dir = HLS_DIR / cache_key
    pl_path = seg_dir / "playlist.m3u8"
    mp4_path = CACHE_DIR / f"{cache_key}.mp4"
    if mp4_path.exists():
        if not pl_path.exists():
            log.info(f"[HLS] Converting cached MP4 → HLS: {cache_key}")
            await run_hls_segmenter(cache_key, mp4_path)
        return pl_path.exists()
    if cache_key in _hls_tasks:
        return pl_path.exists()

    async def _do():
        try:
            mkv = await download_mkv(stream_id, stream_type, cache_key)
            if mkv:
                await run_hls_segmenter(cache_key, mkv)  # pragma: no cover — subprocess pipeline, runtime only
        except (OSError, httpx.HTTPError, httpx.TimeoutException) as e:
            log.error(f"[HLS] Pipeline failed for {cache_key}: {e}", exc_info=True)  # pragma: no cover
        finally:
            _hls_tasks.pop(cache_key, None)

    _hls_tasks[cache_key] = asyncio.create_task(_do())
    return False


@router.get("/movie/hls/{stream_id}")
async def movie_hls_start(stream_id: int, start: float = 0):
    """Start HLS streaming for a movie."""
    await ensure_hls(str(stream_id), "movie", start)
    cache_key = f"movie_{stream_id}"
    pl_path = HLS_DIR / cache_key / "playlist.m3u8"
    if pl_path.exists():
        return {
            "status": "ready",
            "playlist": f"/api/hls/movie/{stream_id}/playlist.m3u8",
        }  # pragma: no cover — requires real HLS output
    return {"status": "preparing", "message": "Downloading and segmenting..."}


@router.get("/series/hls/{series_id}/{episode_id}")
async def series_hls_start(series_id: int, episode_id: int, start: float = 0):
    """Start HLS streaming for a series episode."""
    await ensure_hls(str(episode_id), "series", start)
    cache_key = f"series_{episode_id}"
    pl_path = HLS_DIR / cache_key / "playlist.m3u8"
    if pl_path.exists():
        return {
            "status": "ready",
            "playlist": f"/api/hls/series/{episode_id}/playlist.m3u8",
        }  # pragma: no cover — requires real HLS output
    return {"status": "preparing", "message": "Downloading and segmenting..."}


@router.get("/hls/{stream_type}/{stream_id}/{filename}")
async def serve_hls_file(stream_type: str, stream_id: str, filename: str):
    """Serve .m3u8 playlist or .ts segment for HLS playback."""
    if ".." in filename or "/" in filename:
        raise HTTPException(400, "Invalid filename")
    cache_key = f"{stream_type}_{stream_id}"
    file_path = HLS_DIR / cache_key / filename
    if not file_path.exists():
        raise HTTPException(404, "Segment not found")
    media = "application/vnd.apple.mpegurl" if filename.endswith(".m3u8") else "video/mp2t"
    return FileResponse(
        file_path,
        media_type=media,
        headers={  # pragma: no cover — requires real HLS file
            "Cache-Control": "no-cache",
        },
    )
