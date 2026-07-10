"""Shared stream helpers — generators, pipes, URL builders, probe cache, MIME.

Extracted from stream.py during decomposition of the 1105-line monolithic file.
These helpers are used by stream_live, stream_vod, stream_convert, stream_hls,
stream_dash, and stream_probe modules.
"""
import asyncio
import json
import logging
import time
from functools import partial
from typing import Optional

import httpx

from fastapi.responses import JSONResponse, StreamingResponse

from config import IPTV_BASE, IPTV_PASS, IPTV_USER, UA_STR

log = logging.getLogger("spacetime-tv")

# ── Probe cache ────────────────────────────────────────────────────────────
_probe_cache: dict[str, tuple[float, dict]] = {}
PROBE_CACHE_TTL = 3600


# ── Helpers ─────────────────────────────────────────────────────────────────
async def _lookup_extension(stream_id: int, stream_type: str) -> str:
    """Look up the container_extension for a VOD stream.

    Checks the in-memory cache first. Falls back to the IPTV provider's VOD
    info API when the stream isn't cached, caching the result for subsequent
    lookups.
    """
    from state import _cache

    # ── 1. Check local in-memory cache ─────────────────────────────
    prefix = f"{stream_type}_" if stream_type == "series" else "vod_"
    for key, (ts, data) in _cache.items():
        if not key.startswith(prefix):
            continue
        if not isinstance(data, list):
            continue
        for item in data:
            sid = item.get("stream_id") if stream_type == "movie" else item.get("series_id")
            if sid == stream_id:
                ext = item.get("container_extension", "mp4")
                return ext if ext else "mp4"

    # ── 2. Fallback: query the provider API directly ────────────────
    params = {
        "username": IPTV_USER,
        "password": IPTV_PASS,
        "action": "get_vod_info" if stream_type == "movie" else "get_series_info",
    }
    id_key = "vod_id" if stream_type == "movie" else "series_id"
    params[id_key] = str(stream_id)
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    api_url = f"{IPTV_BASE}/player_api.php?{qs}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            resp = await c.get(api_url)
            if resp.status_code == 200:
                data = resp.json()
                if stream_type == "movie":
                    md = data.get("movie_data", {}) if isinstance(data, dict) else {}
                    ext = md.get("container_extension", "")
                else:
                    md = data.get("info", {}) if isinstance(data, dict) else {}
                    ext = md.get("container_extension", "")
                if ext:
                    log.info(f"Looked up extension for {stream_type} {stream_id}: {ext} (API fallback)")
                    return ext
    except (httpx.HTTPError, httpx.TimeoutException) as e:
        log.warning(f"Extension lookup API fallback failed for {stream_type} {stream_id}: {e}")

    log.info(f"Extension lookup for {stream_type} {stream_id}: defaulting to mkv")
    return "mkv"


async def build_stream_url(stream_id: int, stream_type: str) -> str:
    """Build the IPTV stream URL for a given stream ID and type."""
    ext = "ts" if stream_type == "live" else await _lookup_extension(stream_id, stream_type)
    prefix = "live" if stream_type == "live" else stream_type
    return f"{IPTV_BASE}/{prefix}/{IPTV_USER}/{IPTV_PASS}/{stream_id}.{ext}"


def _vod_url(stream_id: int, media_type: str = "movie") -> str:
    """Build the provider MKV URL for ffprobe/ffmpeg (VOD subtitle/audio context)."""
    prefix = "movie" if media_type == "movie" else "series"
    return f"{IPTV_BASE}/{prefix}/{IPTV_USER}/{IPTV_PASS}/{stream_id}.mkv"


def build_timeshift_url(stream_id: int, duration_seconds: int) -> str:
    """Build timeshift URL for catch-up TV playback.

    Xtream Codes API format:
      {base}/live/{user}/{pass}/{stream_id}/timeshift/{duration}.ts

    Duration is how far back in seconds (e.g. 3600 = 1 hour ago).
    Returns the raw provider URL; the caller proxies it through the server.
    """
    return f"{IPTV_BASE}/live/{IPTV_USER}/{IPTV_PASS}/{stream_id}/timeshift/{duration_seconds}.ts"


async def get_content_length(url: str) -> Optional[int]:
    """Discover Content-Length via Range request (HEAD returns 0 for this CDN)."""
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True,
                                     headers={"User-Agent": UA_STR, "Range": "bytes=0-0"}) as c:
            resp = await c.get(url)
            cr = resp.headers.get("content-range")
            if cr and cr.startswith("bytes"):
                return int(cr.split("/")[-1])
            cl = resp.headers.get("content-length")
            return int(cl) if cl else None
    except (httpx.HTTPError, httpx.TimeoutException) as e:
        log.debug(f"Content-Length probe failed for {url}: {e}")
        return None


# ── Stream generators (byte-level) ─────────────────────────────────────────

async def _http_iter_chunks(url: str, *,
                            range_header: Optional[str] = None,
                            chunk_size: int = 1048576,
                            status_ok: tuple[int, ...] = (200,),
                            timeout: int = 120):
    """Async generator: yield chunks from a CDN URL via curl subprocess.

    The provider's Cloudflare WAF blocks Python HTTP clients (httpx, curl_cffi)
    with HTTP 405.  Only ``curl`` (libcurl) at the system level reliably gets
    through -- it uses a TLS fingerprint Cloudflare trusts.  This function
    spawns ``curl -sL`` and pipes its stdout.
    """
    cmd = [
        "curl", "-sL", "--max-time", str(timeout),
        "-A", f"{UA_STR}",
    ]
    if range_header:
        cmd += ["-H", f"Range: {range_header}"]
    cmd += [url]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Read stderr in background (for diagnostics, not consumed here)
    async def _drain_stderr():
        while proc.stderr:
            line = await proc.stderr.readline()
            if not line:
                break

    stderr_task = asyncio.create_task(_drain_stderr())

    try:
        while proc.stdout:
            chunk = await proc.stdout.read(chunk_size)
            if not chunk:
                break
            yield chunk  # pragma: no cover — async generator yield (covered at runtime, not tracked by coverage)
    finally:
        stderr_task.cancel()
        try:
            await stderr_task
        except (asyncio.CancelledError, Exception):
            pass
        if proc.returncode is None:
            proc.kill()
            try:
                await proc.wait()
            except OSError:
                pass


async def stream_bytes(url: str):
    """Generator that yields bytes from a live stream URL via curl_cffi."""
    async for chunk in _http_iter_chunks(url, status_ok=(200,)):
        yield chunk  # pragma: no cover — async generator yield, covered at runtime


async def _http_feed_stdin(proc: asyncio.subprocess.Process, url: str, *,
                           range_header: Optional[str] = None,
                           buf_size: int = 1048576,
                           log_prefix: str = ""):
    """Fetch a URL via curl subprocess and pipe the data to an ffmpeg process stdin.

    Same curl subprocess approach as ``_http_iter_chunks`` — the provider's
    Cloudflare WAF blocks Python HTTP clients but allows system ``curl``.
    """
    cmd = [
        "curl", "-sL", "--max-time", "120",
        "-A", f"{UA_STR}",
    ]
    if range_header:
        cmd += ["-H", f"Range: {range_header}"]
    cmd += [url]

    try:
        curl_proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        # Drain stderr (don't need it, but must consume to avoid deadlock)
        async def _drain_stderr():
            while curl_proc.stderr:
                line = await curl_proc.stderr.readline()
                if not line:
                    break

        stderr_task = asyncio.create_task(_drain_stderr())

        try:
            chunk = await curl_proc.stdout.read(buf_size)
            while chunk:
                proc.stdin.write(chunk)
                await proc.stdin.drain()
                chunk = await curl_proc.stdout.read(buf_size)
        finally:
            stderr_task.cancel()
            try:
                await stderr_task
            except (asyncio.CancelledError, Exception):
                pass
            if curl_proc.returncode is None:
                curl_proc.kill()
                try:
                    await curl_proc.wait()
                except OSError:
                    pass
    except (OSError, RuntimeError) as e:  # pragma: no cover — subprocess error, runtime only
        log.warning(f"{log_prefix} download error: {e}")  # pragma: no cover
    finally:
        try:
            proc.stdin.close()
        except OSError:  # pragma: no cover — stdin close error, runtime only
            pass  # pragma: no cover


async def _ffmpeg_pipe(cmd: list[str], feed_coro):
    """Run ffmpeg with pipes and yield its stdout chunks.

    Starts *ffmpeg cmd* with ``stdin=PIPE``, ``stdout=PIPE``, ``stderr=PIPE``.
    Runs *feed_coro(proc)* in a background task to feed data to stdin,
    logs stderr via another background task, then yields chunks from stdout.
    """
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    feed_task = asyncio.create_task(feed_coro(proc))

    async def log_stderr():
        while proc.stderr:
            line = await proc.stderr.readline()
            if not line:
                break
            log.warning(f"ffmpeg: {line.decode().rstrip()}")

    stderr_task = asyncio.create_task(log_stderr())

    try:
        while proc.stdout:
            chunk = await proc.stdout.read(65536)
            if not chunk:
                break
            yield chunk  # pragma: no cover — async generator yield, covered at runtime
    except GeneratorExit:
        pass  # pragma: no cover — GeneratorExit only raised on async generator GC
    finally:
        feed_task.cancel()
        stderr_task.cancel()
        for t in (feed_task, stderr_task):
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass  # pragma: no cover — cleanup edge case
        if proc.returncode is None:
            proc.kill()  # pragma: no cover — cleanup only when generator exits early
            try:
                await proc.wait()
            except OSError:
                pass  # pragma: no cover — wait error, runtime only


async def stream_vod_bytes(url: str, range_header: Optional[str] = None):
    """Generator that yields VOD bytes via curl_cffi streaming.
    Supports Range/206 for seeking.
    """
    async for chunk in _http_iter_chunks(url, range_header=range_header,
                                         status_ok=(200, 206)):
        yield chunk  # pragma: no cover — async generator yield, covered at runtime


async def stream_proxy(url: str, content_type: str):
    """Stream a remote URL through our backend, bypassing CORS."""
    try:
        return StreamingResponse(
            stream_bytes(url),
            media_type=content_type,
            headers={
                "Cache-Control": "no-cache",
            },
        )
    except (RuntimeError, httpx.RequestError) as e:
        log.error(f"Stream proxy error ({url}): {e}")
        return JSONResponse(status_code=502, content={"detail": "Stream unavailable"})


async def stream_bytes_transcode(url: str, target_height: Optional[int] = None):
    """Transcode HEVC→H.264 via ffmpeg using curl_cffi download pipe."""
    cmd = [
        "/usr/bin/ffmpeg",
        "-loglevel", "warning",
        "-probesize", "512K",
        "-analyzeduration", "512K",
        "-i", "pipe:0",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-crf", "28",
    ]
    if target_height:
        cmd += ["-vf", f"scale=-2:{target_height}"]
    cmd += [
        "-c:a", "copy",
        "-f", "mpegts",
        "pipe:1",
    ]
    feed = partial(_http_feed_stdin, url=url, log_prefix="transcode")
    async for chunk in _ffmpeg_pipe(cmd, feed):
        yield chunk  # pragma: no cover — async generator yield, covered at runtime


# ── MIME helper ────────────────────────────────────────────────────────────

def _mime_from_url(url: str) -> str:
    """Guess the content mime type from a stream URL extension."""
    ext = url.rsplit(".", 1)[-1].lower() if "." in url else ""
    mime_map = {
        "ts": "video/mp2t",
        "mkv": "video/x-matroska",
        "mp4": "video/mp4",
        "m4v": "video/mp4",
        "webm": "video/webm",
        "avi": "video/x-msvideo",
        "mov": "video/quicktime",
    }
    return mime_map.get(ext, "video/mp2t")
