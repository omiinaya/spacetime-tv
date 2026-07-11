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

import aiohttp
import httpx

from fastapi.responses import JSONResponse, StreamingResponse

from config import UA_STR
from iptv_client import build_timeshift_url as _build_timeshift_url, iptv_stream_url, iptv_vod_url, iptv_timeshift_url, get_active_provider
from config import ProviderConfig

log = logging.getLogger("spacetime-tv")

# ── Probe cache ────────────────────────────────────────────────────────────
_probe_cache: dict[str, tuple[float, dict]] = {}
PROBE_CACHE_TTL = 3600

def stream_core_get_provider(provider_idx: int = -1):
    """Get provider by index or active provider.
    
    Args:
        provider_idx: Provider index (-1 = active/default)
    Returns:
        ProviderConfig or None
    """
    if provider_idx >= 0:
        from iptv_client import get_provider_by_index
        return get_provider_by_index(provider_idx)
    return get_active_provider()

# ── Helpers ─────────────────────────────────────────────────────────────────
async def _lookup_extension(stream_id: int, stream_type: str) -> str:
    """Look up the container extension for a stream, using cached or API data."""
    # ── 1. Try cached category data first (pre-warmed from live/movie/series listings)
    from iptv_client import cached_fetch, get_active_provider

    cache_key = f"ext_lookup_{stream_type}_{stream_id}"
    cached_val = None

    # Check primary provider's category listings for the extension
    action = "get_live_streams" if stream_type == "live" else "get_vod_streams" if stream_type == "movie" else "get_series"
    try:
        data = await cached_fetch(cache_key, action)
        if isinstance(data, list):
            for item in data:
                sid = item.get("stream_id") if stream_type in ("live", "movie") else item.get("series_id")
                if sid == stream_id:
                    ext = item.get("container_extension", "mp4")
                    if ext:
                        log.info(f"Looked up extension for {stream_type} {stream_id}: {ext} (cached)")
                        return ext if ext else "mp4"
    except (HTTPException, KeyError, TypeError, IndexError) as e:
        log.warning(f"Extension lookup cache failed for {stream_type} {stream_id}: {e}")

    # ── 2. Fallback: query the provider API directly ────────────────
    provider = get_active_provider()
    if provider:
        from urllib.parse import urlencode
        ext_params = {
            "username": provider.username,
            "password": provider.password,
            "action": "get_vod_info" if stream_type == "movie" else "get_series_info",
        }
        id_key = "vod_id" if stream_type == "movie" else "series_id"
        ext_params[id_key] = str(stream_id)
        api_url = f"{provider.base_url}/player_api.php?{urlencode(ext_params)}"

        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                resp = await c.get(api_url)
                if resp.status_code == 200:
                    data = resp.json()
                    if stream_type == "movie":
                        md = data.get("movie_data", {}) if isinstance(data, dict) else {}
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
async def build_stream_url(stream_id: int, stream_type: str, provider_idx: int = -1) -> str:
    """Build the IPTV stream URL for a given stream ID and type."""
    ext = "ts" if stream_type == "live" else await _lookup_extension(stream_id, stream_type)
    provider = stream_core_get_provider(provider_idx)
    return iptv_stream_url(stream_id, stream_type, ext=ext, provider=provider)

def _vod_url(stream_id: int, media_type: str = "movie", provider_idx: int = -1) -> str:
    """Build the provider MKV URL for ffprobe/ffmpeg (VOD subtitle/audio context)."""
    provider = stream_core_get_provider(provider_idx)
    return iptv_vod_url(stream_id, media_type, provider=provider)

def build_timeshift_url(stream_id: int, duration_seconds: int, provider_idx: int = -1) -> str:
    """Build timeshift URL for catch-up TV playback.

    Xtream Codes API format:
      {base}/live/{user}/{pass}/{stream_id}/timeshift/{duration}.ts

    Duration is how far back in seconds (e.g. 3600 = 1 hour ago).
    Returns the raw provider URL; the caller proxies it through the server.
    """
    provider = stream_core_get_provider(provider_idx)
    return iptv_timeshift_url(stream_id, duration_seconds, provider=provider)

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
    """Async generator: yield chunks from a CDN URL via aiohttp.

    ═══════════════════════════════════════════════════════════════════
    TRANSPORT CHOICE — DO NOT CHANGE WITHOUT READING THIS
    ═══════════════════════════════════════════════════════════════════

    The provider (iptv-provider.example.com) uses Cloudflare → CDN (Apache2 HTTP/1.1):

      1. Cloudflare at iptv-provider.example.com returns HTTP 302 with short-lived token
      2. CDN edge (e.g. 185.245.x.x:80) returns the actual MPEG-TS stream

    httpx (via httpcore/anyio) **cannot** read from the CDN after the redirect.
    It hangs/times out even with follow_redirects=True and a fresh redirect URL.
    This is an httpx + this-specific-Apache2-CDN bug — not Cloudflare blocking.

    Subprocess curl works but has **55% throughput penalty** (0.73 MB/s vs 1.4 MB/s)
    due to pipe-copy overhead. See commit 4be4d3b.

    **aiohttp works correctly** (1.4 MB/s, 90% of direct) because its HTTP/1.1
    implementation handles this CDN's Connection: close and chunked encoding
    properly. aiohttp uses c-ares DNS + native asyncio sockets.

    What to do if streaming breaks again:
    - First verify: does ``curl -vL --max-time 15 'http://iptv-provider.example.com/live/{USER}/{PASS}/{STREAM_ID}.ts'``
      return 302 → 200 with streaming data? If yes, the provider is fine.
    - Test every candidate HTTP library (httpx, aiohttp, requests, tls_client)
      against the FULL redirect chain (not just the first hop) with a WORKING
      stream ID. Some stream IDs (250, 1) are dead channels that return 405
      regardless of client — test with a known-working ID like 483976.
    - ⚠️  Do NOT use subprocess curl for streaming — the pipe overhead halves
      throughput. Only use subprocess as a last resort if no Python library works.

    ═══════════════════════════════════════════════════════════════════
    """
    headers = {
        "User-Agent": UA_STR,
    }
    if range_header:
        headers["Range"] = range_header

    timeout_obj = aiohttp.ClientTimeout(total=timeout)
    async with aiohttp.ClientSession(timeout=timeout_obj) as session:
        async with session.get(url, headers=headers) as resp:
            if resp.status not in status_ok:
                log.warning(f"_http_iter_chunks: CDN returned HTTP {resp.status} for {url[:80]}...")
                raise RuntimeError(f"CDN returned HTTP {resp.status} (stream unavailable)")

            while True:
                chunk = await resp.content.read(chunk_size)
                if not chunk:
                    break
                yield chunk  # pragma: no cover — async generator yield (covered at runtime, not tracked by coverage)

async def stream_bytes(url: str):
    """Generator that yields bytes from a live stream URL via curl_cffi."""
    async for chunk in _http_iter_chunks(url, status_ok=(200,)):
        yield chunk  # pragma: no cover — async generator yield, covered at runtime

async def _http_feed_stdin(proc: asyncio.subprocess.Process, url: str, *,
                           range_header: Optional[str] = None,
                           buf_size: int = 1048576,
                           log_prefix: str = ""):
    """Fetch a URL via aiohttp and pipe the data to an ffmpeg process stdin.

    Same aiohttp approach as ``_http_iter_chunks`` — avoids the pipe-copy
    overhead and subprocess spawn cost of curl.
    """
    headers = {"User-Agent": UA_STR}
    if range_header:
        headers["Range"] = range_header

    try:
        timeout_obj = aiohttp.ClientTimeout(total=120)
        async with aiohttp.ClientSession(timeout=timeout_obj) as session:
            async with session.get(url, headers=headers) as resp:
                resp.raise_for_status()
                while True:
                    chunk = await resp.content.read(buf_size)
                    if not chunk:
                        break
                    proc.stdin.write(chunk)
                    await proc.stdin.drain()
    except (aiohttp.ClientError, OSError, RuntimeError) as e:  # pragma: no cover — network error, runtime only
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
