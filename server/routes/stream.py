"""Stream proxy, transcode, probe, HLS, DASH, and conversion routes.

Extracted from main.py to decompose the monolithic backend.
Phases 3+6b of P1.1: probe, live proxy, VOD remux/transcode, HLS, DASH, MP4 conversion.
"""
import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

from config import IPTV_BASE, IPTV_PASS, IPTV_USER, UA_STR
from state import track_hit

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["stream"])

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
    # Build the same API URL main.py::fetch_iptv uses, but do it here
    # to avoid a circular import / tight coupling.
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
    except Exception as e:
        log.warning(f"Extension lookup API fallback failed for {stream_type} {stream_id}: {e}")

    log.info(f"Extension lookup for {stream_type} {stream_id}: defaulting to mkv")
    return "mkv"


async def build_stream_url(stream_id: int, stream_type: str) -> str:
    """Build the IPTV stream URL for a given stream ID and type."""
    ext = "ts" if stream_type == "live" else await _lookup_extension(stream_id, stream_type)
    prefix = "live" if stream_type == "live" else stream_type
    return f"{IPTV_BASE}/{prefix}/{IPTV_USER}/{IPTV_PASS}/{stream_id}.{ext}"


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
    except Exception as e:
        log.debug(f"Content-Length probe failed for {url}: {e}")
        return None


# ── Stream generators (byte-level) ─────────────────────────────────────────

async def stream_bytes(url: str):
    """Generator that yields bytes from a streaming URL via curl_cffi.
    curl_cffi emulates Chrome TLS fingerprint to bypass Cloudflare CDN blocks.
    """
    import curl_cffi.requests as CurlReq
    headers = {"User-Agent": UA_STR, "Referer": f"{IPTV_BASE}/"}

    chunk_queue: asyncio.Queue = asyncio.Queue(maxsize=32)
    _sentinel = object()

    async def _download():
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None,
                lambda: CurlReq.get(url, headers=headers, stream=True,
                                    timeout=120, impersonate="chrome120"),
            )
            def _iter():
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        loop.call_soon_threadsafe(chunk_queue.put_nowait, chunk)
                resp.close()
            await loop.run_in_executor(None, _iter)
        except Exception as e:
            log.warning(f"stream_bytes error: {e}")
        finally:
            chunk_queue.put_nowait(_sentinel)

    download_task = asyncio.create_task(_download())
    try:
        while True:
            chunk = await chunk_queue.get()
            if chunk is _sentinel:
                break
            yield chunk
    finally:
        download_task.cancel()
        try:
            await download_task
        except (asyncio.CancelledError, Exception):
            pass


async def stream_vod_bytes(url: str, range_header: Optional[str] = None):
    """Generator that yields VOD bytes via curl_cffi streaming.

    curl_cffi emulates Chrome TLS fingerprint (impersonate="chrome120"),
    which bypasses Cloudflare's bot detection. The CDN blocks httpx and
    ffmpeg/libav with 405 but accepts curl_cffi's browser-emulated TLS.
    Supports Range/206 for seeking.
    """
    import curl_cffi.requests as CurlReq
    headers = {
        "User-Agent": UA_STR,
        "Referer": f"{IPTV_BASE}/",
    }
    if range_header:
        headers["Range"] = range_header

    chunk_queue: asyncio.Queue = asyncio.Queue(maxsize=32)
    _sentinel = object()

    async def _download():
        """Download chunks in an async-compatible thread and queue them."""
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None,
                lambda: CurlReq.get(url, headers=headers, stream=True,
                                    timeout=120, impersonate="chrome120"),
            )
            # Iterate chunks in the thread pool and queue them
            def _iter():
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        loop.call_soon_threadsafe(chunk_queue.put_nowait, chunk)
                resp.close()

            await loop.run_in_executor(None, _iter)
        except Exception as e:
            log.warning(f"stream_vod_bytes error: {e}")
        finally:
            chunk_queue.put_nowait(_sentinel)

    download_task = asyncio.create_task(_download())

    try:
        while True:
            chunk = await chunk_queue.get()
            if chunk is _sentinel:
                break
            yield chunk
    finally:
        download_task.cancel()
        try:
            await download_task
        except (asyncio.CancelledError, Exception):
            pass


async def stream_proxy(url: str, content_type: str):
    """Stream a remote URL through our backend, bypassing CORS."""
    try:
        return StreamingResponse(
            stream_bytes(url),
            media_type=content_type,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            },
        )
    except Exception as e:
        log.error(f"Stream proxy error ({url}): {e}")
        return Response(status_code=502, content="Stream unavailable")


async def stream_bytes_transcode(url: str, target_height: Optional[int] = None):
    """Generator: transcode HEVC→H.264 via ffmpeg.

    Uses curl_cffi to download from the CDN (bypasses Cloudflare bot detection)
    and pipes the data to ffmpeg's stdin for transcoding to H.264 MPEG-TS.
    If target_height is set, scales video to that height.
    """
    log.info(f"Transcoding {url[:100]}...")
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
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # ── Start curl_cffi download ──
    import curl_cffi.requests as CurlReq
    headers = {"User-Agent": UA_STR, "Referer": f"{IPTV_BASE}/"}

    async def download_to_stdin():
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None, lambda: CurlReq.get(
                    url, headers=headers, stream=True, timeout=120,
                    impersonate="chrome120",
                )
            )
            for chunk in resp.iter_content(chunk_size=262144):
                if not chunk:
                    break
                if proc.stdin:
                    proc.stdin.write(chunk)
                    await proc.stdin.drain()
            resp.close()
        except Exception as e:
            log.warning(f"transcode download error: {e}")
        finally:
            if proc.stdin:
                try:
                    proc.stdin.close()
                except:
                    pass

    async def log_stderr():
        while proc.stderr:
            line = await proc.stderr.readline()
            if not line:
                break
            log.warning(f"ffmpeg: {line.decode().rstrip()}")

    download_task = asyncio.create_task(download_to_stdin())
    stderr_task = asyncio.create_task(log_stderr())

    try:
        while proc.stdout:
            chunk = await proc.stdout.read(65536)
            if not chunk:
                break
            yield chunk
    except GeneratorExit:
        pass
    finally:
        download_task.cancel()
        stderr_task.cancel()
        for t in (download_task, stderr_task):
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        if proc.returncode is None:
            proc.kill()
            try:
                await proc.wait()
            except:
                pass


# ── Live stream routes ──────────────────────────────────────────────────────

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
        return Response(status_code=502, content="Stream unavailable")


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
        return Response(status_code=502, content="Transcode failed")


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
        return Response(status_code=502, content="Transcode failed")


# ── VOD stream helpers ──────────────────────────────────────────────────────

async def handle_vod_request(req: Request, stream_id: int, stream_type: str,
                              content_type: str = ""):
    """Handle a VOD stream request with Range/206 support for seeking.

    Uses curl_cffi as the HTTP transport (CDN blocks httpx with 405 but
    accepts curl_cffi's Chrome-emulated TLS fingerprint).
    """
    track_hit(stream_type, stream_id)
    url = await build_stream_url(stream_id, stream_type)
    out_content_type = content_type or _mime_from_url(url)
    range_header = req.headers.get("range")

    if range_header:
        return StreamingResponse(
            stream_vod_bytes(url, range_header),
            media_type=out_content_type,
            status_code=206,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
                "Accept-Ranges": "bytes",
            },
        )

    # Full request — no Range
    return StreamingResponse(
        stream_vod_bytes(url),
        media_type=out_content_type,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
            "Accept-Ranges": "bytes",
        },
    )


async def stream_vod_mpegts(url: str, start_time: Optional[float] = None):
    """Remux VOD (any container) → MPEG-TS with -c copy (no re-encode).

    Uses curl_cffi to download from the CDN (bypasses Cloudflare's bot
    detection) and pipes the data to ffmpeg's stdin for remuxing to
    MPEG-TS, which is playable by mpegts.js.
    Supports time-based seeking via start_time.
    """
    log.info(f"VOD remux starting for {IPTV_BASE}... start={start_time}")

    # ── Start ffmpeg — reads from stdin (pipe:0), outputs MPEG-TS ──
    cmd = [
        "/usr/bin/ffmpeg",
        "-loglevel", "warning",
        "-probesize", "512K",
        "-analyzeduration", "512K",
    ]
    if start_time and start_time > 0:
        cmd += ["-ss", str(start_time), "-copyts"]
    cmd += [
        "-i", "pipe:0",
        "-c", "copy",
        "-f", "mpegts",
        "pipe:1",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # ── Start curl_cffi download in a thread ──
    import curl_cffi.requests as CurlReq
    headers = {"User-Agent": UA_STR, "Referer": f"{IPTV_BASE}/"}
    if start_time and start_time > 0:
        # Approximate byte offset from time (conservative 5MB/s estimate)
        headers["Range"] = f"bytes={int(start_time * 5_000_000)}-"

    async def download_to_stdin():
        """Read from curl_cffi and write to ffmpeg stdin."""
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None, lambda: CurlReq.get(
                    url, headers=headers, stream=True, timeout=120,
                    impersonate="chrome120",
                )
            )
            buf_size = 262144  # 256KB
            for chunk in resp.iter_content(chunk_size=buf_size):
                if not chunk:
                    break
                if proc.stdin:
                    proc.stdin.write(chunk)
                    await proc.stdin.drain()
            resp.close()
        except Exception as e:
            log.warning(f"vod-remux download error: {e}")
        finally:
            if proc.stdin:
                try:
                    proc.stdin.close()
                except:
                    pass

    async def log_stderr():
        while proc.stderr:
            line = await proc.stderr.readline()
            if not line:
                break
            log.warning(f"vod-remux: {line.decode().rstrip()}")

    download_task = asyncio.create_task(download_to_stdin())
    stderr_task = asyncio.create_task(log_stderr())

    try:
        while proc.stdout:
            chunk = await proc.stdout.read(65536)
            if not chunk:
                break
            yield chunk
    except GeneratorExit:
        pass
    finally:
        download_task.cancel()
        stderr_task.cancel()
        for t in (download_task, stderr_task):
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        if proc.returncode is None:
            proc.kill()
            try:
                await proc.wait()
            except:
                pass


async def stream_vod_transcode(url: str):
    """Transcode VOD (MKV with HEVC) → H.264+AAC in MPEG-TS container.
    Used when the browser can't decode H.265 natively.

    Uses curl_cffi to download from CDN, pipes to ffmpeg stdin for transcoding.
    """
    log.info(f"VOD transcode {IPTV_BASE}...")
    cmd = [
        "/usr/bin/ffmpeg",
        "-loglevel", "warning",
        "-probesize", "512K",
        "-analyzeduration", "512K",
        "-i", "pipe:0",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-crf", "26",
        "-c:a", "aac",
        "-b:a", "128k",
        "-f", "mpegts",
        "pipe:1",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    import curl_cffi.requests as CurlReq
    headers = {"User-Agent": UA_STR, "Referer": f"{IPTV_BASE}/"}

    async def download_to_stdin():
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None, lambda: CurlReq.get(
                    url, headers=headers, stream=True, timeout=120,
                    impersonate="chrome120",
                )
            )
            for chunk in resp.iter_content(chunk_size=262144):
                if not chunk:
                    break
                if proc.stdin:
                    proc.stdin.write(chunk)
                    await proc.stdin.drain()
            resp.close()
        except Exception as e:
            log.warning(f"vod-transcode download error: {e}")
        finally:
            if proc.stdin:
                try:
                    proc.stdin.close()
                except:
                    pass

    async def log_stderr():
        while proc.stderr:
            line = await proc.stderr.readline()
            if not line:
                break
            log.warning(f"vod-transcode: {line.decode().rstrip()}")

    download_task = asyncio.create_task(download_to_stdin())
    stderr_task = asyncio.create_task(log_stderr())
    try:
        while proc.stdout:
            chunk = await proc.stdout.read(65536)
            if not chunk:
                break
            yield chunk
    except GeneratorExit:
        pass
    finally:
        download_task.cancel()
        stderr_task.cancel()
        for t in (download_task, stderr_task):
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        if proc.returncode is None:
            proc.kill()
            try:
                await proc.wait()
            except:
                pass


# ── VOD stream routes ───────────────────────────────────────────────────────

@router.get("/api/stream/movie/{stream_id}/remux")
async def stream_movie_remux(stream_id: int, start: Optional[float] = None):
    """Remux movie MKV→MPEG-TS for browser playback (mpegts.js)."""
    url = await build_stream_url(stream_id, "movie")
    try:
        return StreamingResponse(
            stream_vod_mpegts(url, start),
            media_type="video/mp2t",
            headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
        )
    except Exception as e:
        log.error(f"Movie remux error ({stream_id}): {e}")
        return Response(status_code=502, content="Remux failed")


@router.get("/api/stream/series/{series_id}/{episode_id}/remux")
async def stream_series_remux(series_id: int, episode_id: int, start: Optional[float] = None):
    """Remux series episode MKV→MPEG-TS for browser playback (mpegts.js)."""
    url = await build_stream_url(episode_id, "series")
    try:
        return StreamingResponse(
            stream_vod_mpegts(url, start),
            media_type="video/mp2t",
            headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
        )
    except Exception as e:
        log.error(f"Series remux error ({episode_id}): {e}")
        return Response(status_code=502, content="Remux failed")


@router.get("/api/stream/movie/{stream_id}/transcode")
async def stream_movie_transcode(stream_id: int):
    """Transcode a HEVC movie to H.264 on-the-fly."""
    url = await build_stream_url(stream_id, "movie")
    try:
        return StreamingResponse(
            stream_vod_transcode(url),
            media_type="video/mp2t",
            headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
        )
    except Exception as e:
        log.error(f"VOD transcode error (movie {stream_id}): {e}")
        return Response(status_code=502, content="Transcode failed")


@router.get("/api/stream/series/{series_id}/{episode_id}/transcode")
async def stream_series_transcode(series_id: int, episode_id: int):
    """Transcode a HEVC series episode to H.264 on-the-fly."""
    url = await build_stream_url(episode_id, "series")
    try:
        return StreamingResponse(
            stream_vod_transcode(url),
            media_type="video/mp2t",
            headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
        )
    except Exception as e:
        log.error(f"VOD transcode error (series {episode_id}): {e}")
        return Response(status_code=502, content="Transcode failed")


@router.get("/api/stream/movie/{stream_id}")
async def stream_movie(req: Request, stream_id: int):
    """Proxy movie stream (MKV) with Range support for seeking."""
    return await handle_vod_request(req, stream_id, "movie")


@router.get("/api/stream/series/{series_id}/{episode_id}")
async def stream_series_ep(req: Request, series_id: int, episode_id: int):
    """Proxy series episode stream (MKV) with Range support for seeking."""
    return await handle_vod_request(req, episode_id, "series")


# ── MP4 Conversion ──────────────────────────────────────────────────────────

CACHE_DIR = Path("/tmp/stv_cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)
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
        log.info(f"Downloaded {cache_key}: {dl_size/1024/1024:.0f} MB")
    log.info(f"Converting {cache_key} MKV→fMP4")
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
            log.warning(f"mp4-convert: {line.decode().rstrip()}")
    stderr_task = asyncio.create_task(log_stderr())
    await proc.wait()
    stderr_task.cancel()
    try: await stderr_task
    except asyncio.CancelledError: pass
    if lock_path.exists(): lock_path.unlink()
    if proc.returncode == 0 and output_path.exists() and mkv_path.exists():
        mkv_path.unlink()
    if proc.returncode != 0:
        log.warning(f"MP4 conversion exited {proc.returncode} for {cache_key}")
    else:
        log.info(f"MP4 cached: {cache_key}")


async def _safe_convert(stream_id: str, stream_type: str, cache_key: str):
    try:
        await convert_to_mp4(stream_id, stream_type)
    except Exception as e:
        log.error(f"Conversion failed for {cache_key}: {e}", exc_info=True)
    finally:
        _converting.pop(cache_key, None)


@router.get("/api/movie/convert/{stream_id}")
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


@router.get("/api/series/convert/{series_id}/{episode_id}")
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
            "Access-Control-Allow-Origin": "*", "Accept-Ranges": "bytes",
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
                yield buf
    return StreamingResponse(
        range_stream(), status_code=206, media_type="video/mp4",
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(chunk_size),
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/api/stream/movie/{stream_id}/mp4")
async def serve_movie_mp4(stream_id: int, request: Request):
    """Serve a cached MP4 movie with byte-range support."""
    cache_key = f"movie_{stream_id}"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise HTTPException(404, "MP4 not yet converted")
    return serve_cached_mp4(output_path, request)


@router.get("/api/stream/series/{series_id}/{episode_id}/mp4")
async def serve_series_mp4(series_id: int, episode_id: int, request: Request):
    """Serve a cached MP4 series episode with byte-range support."""
    cache_key = f"series_{episode_id}"
    output_path = CACHE_DIR / f"{cache_key}.mp4"
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise HTTPException(404, "MP4 not yet converted")
    return serve_cached_mp4(output_path, request)


# ── HLS Streaming ───────────────────────────────────────────────────────────

HLS_DIR = CACHE_DIR / "hls"
HLS_DIR.mkdir(parents=True, exist_ok=True)
_hls_tasks: dict[str, asyncio.Task] = {}
_hls_procs: dict[str, asyncio.subprocess.Process] = {}
_mkv_downloaders: dict[str, asyncio.subprocess.Process] = {}


async def download_mkv(stream_id: str, stream_type: str, cache_key: str) -> Optional[Path]:
    """Download MKV from CDN to disk with retries."""
    mkv_path = CACHE_DIR / f"{cache_key}.mkv"
    if mkv_path.exists() and mkv_path.stat().st_size > 0:
        return mkv_path
    url = await build_stream_url(int(stream_id), stream_type)
    ua = UA_STR
    log.info(f"[HLS] Downloading {cache_key} → {mkv_path}")
    cmd = [
        "curl", "-sS", "-L",
        "--retry", "10", "--retry-delay", "5",
        "--retry-max-time", "600", "--max-time", "900",
        "-H", f"User-Agent: {ua}",
        "-o", str(mkv_path), url,
    ]
    proc = await asyncio.create_subprocess_exec(*cmd)
    _mkv_downloaders[cache_key] = proc
    await proc.wait()
    _mkv_downloaders.pop(cache_key, None)
    if proc.returncode != 0 or not mkv_path.exists():
        log.error(f"[HLS] Download failed for {cache_key}")
        return None
    log.info(f"[HLS] Downloaded {cache_key}: {mkv_path.stat().st_size/1024/1024:.0f} MB")
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
        "/usr/bin/ffmpeg", "-loglevel", "warning", "-y",
        "-i", str(input_path),
        "-c", "copy",
        "-f", "hls",
        "-hls_time", "4",
        "-hls_list_size", "0",
        "-hls_flags", "delete_segments",
        str(seg_dir / "playlist.m3u8"),
    ]
    old = _hls_procs.pop(cache_key, None)
    if old and old.returncode is None:
        old.kill()
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
            try: mkv_path.unlink()
            except Exception: pass


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
                await run_hls_segmenter(cache_key, mkv)
        except Exception as e:
            log.error(f"[HLS] Pipeline failed for {cache_key}: {e}", exc_info=True)
        finally:
            _hls_tasks.pop(cache_key, None)
    _hls_tasks[cache_key] = asyncio.create_task(_do())
    return False


@router.get("/api/movie/hls/{stream_id}")
async def movie_hls_start(stream_id: int, start: float = 0):
    """Start HLS streaming for a movie."""
    ready = await ensure_hls(str(stream_id), "movie", start)
    cache_key = f"movie_{stream_id}"
    pl_path = HLS_DIR / cache_key / "playlist.m3u8"
    if pl_path.exists():
        return {"status": "ready", "playlist": f"/api/hls/movie/{stream_id}/playlist.m3u8"}
    return {"status": "preparing", "message": "Downloading and segmenting..."}


@router.get("/api/series/hls/{series_id}/{episode_id}")
async def series_hls_start(series_id: int, episode_id: int, start: float = 0):
    """Start HLS streaming for a series episode."""
    ready = await ensure_hls(str(episode_id), "series", start)
    cache_key = f"series_{episode_id}"
    pl_path = HLS_DIR / cache_key / "playlist.m3u8"
    if pl_path.exists():
        return {"status": "ready", "playlist": f"/api/hls/series/{episode_id}/playlist.m3u8"}
    return {"status": "preparing", "message": "Downloading and segmenting..."}


@router.get("/api/hls/{stream_type}/{stream_id}/{filename}")
async def serve_hls_file(stream_type: str, stream_id: str, filename: str):
    """Serve .m3u8 playlist or .ts segment for HLS playback."""
    if ".." in filename or "/" in filename:
        raise HTTPException(400, "Invalid filename")
    cache_key = f"{stream_type}_{stream_id}"
    file_path = HLS_DIR / cache_key / filename
    if not file_path.exists():
        raise HTTPException(404, "Segment not found")
    media = "application/vnd.apple.mpegurl" if filename.endswith(".m3u8") else "video/mp2t"
    return FileResponse(file_path, media_type=media, headers={
        "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache",
    })


# ── DASH Streaming (MPD manifest generation) ─────────────────────────────────

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


def generate_live_mpd(stream_id: int, stream_url: str) -> str:
    """Generate a dynamic MPD manifest for a live MPEG-TS stream."""
    from datetime import datetime, timezone
    mime = _mime_from_url(stream_url)
    safe_url = stream_url.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f'''<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-live:2011"
     type="dynamic"
     availabilityStartTime="{now_iso}"
     publishTime="{now_iso}"
     minimumUpdatePeriod="PT10S"
     minBufferTime="PT15S"
     timeShiftBufferDepth="PT120S">
  <Period id="1">
    <AdaptationSet mimeType="{mime}" contentType="video" startWithSAP="1">
      <Representation bandwidth="5000000">
        <BaseURL>{safe_url}</BaseURL>
        <SegmentBase indexRangeExact="true">
          <Initialization range="0-0" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>'''


def generate_vod_mpd(stream_id: int, stream_type: str, stream_url: str) -> str:
    """Generate a static onDemand MPD manifest for a VOD MKV/fMP4 stream."""
    mime = _mime_from_url(stream_url)
    safe_url = stream_url.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    return f'''<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"
     type="static">
  <Period>
    <AdaptationSet mimeType="{mime}" contentType="video" startWithSAP="1">
      <Representation bandwidth="5000000">
        <BaseURL>{safe_url}</BaseURL>
        <SegmentBase indexRangeExact="true">
          <Initialization range="0-0" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>'''


@router.get("/api/stream/live/{stream_id}/manifest.mpd")
async def live_dash_manifest(stream_id: int):
    """DASH MPD manifest for live TV stream playback via shaka-player."""
    url = await build_stream_url(stream_id, "live")
    xml = generate_live_mpd(stream_id, url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
    )


@router.get("/api/stream/movie/{stream_id}/manifest.mpd")
async def movie_dash_manifest(stream_id: int):
    """DASH MPD manifest for movie playback via shaka-player."""
    url = await build_stream_url(stream_id, "movie")
    xml = generate_vod_mpd(stream_id, "movie", url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
    )


@router.get("/api/stream/series/{series_id}/{episode_id}/manifest.mpd")
async def series_dash_manifest(series_id: int, episode_id: int):
    """DASH MPD manifest for series episode playback via shaka-player."""
    url = await build_stream_url(episode_id, "series")
    xml = generate_vod_mpd(episode_id, "series", url)
    return Response(
        content=xml,
        media_type="application/dash+xml",
        headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
    )


# ── Probe functions ─────────────────────────────────────────────────────────

async def probe_stream(stream_id: int, stream_type: str = "live") -> dict:
    """Run ffprobe on a stream to detect codec. Cached for 1 hour.

    For known H.264 containers (mp4, m4v) we skip ffprobe entirely —
    it would need to download the whole file for MP4s with moov-at-end,
    which is slow and unnecessary.
    """
    cache_key = f"{stream_type}_{stream_id}"
    now = time.time()
    if cache_key in _probe_cache and (now - _probe_cache[cache_key][0]) < PROBE_CACHE_TTL:
        return _probe_cache[cache_key][1]

    # ── Skip probe for known H.264 containers ──────────────────
    ext = await _lookup_extension(stream_id, stream_type)
    if ext in ("mp4", "m4v"):
        log.info(f"Probe {stream_id}: {ext} — assuming H.264, skipping ffprobe")
        result = {"codec": "h264", "codec_long": "H.264 / AVC / MPEG-4 AVC", "width": 0, "height": 0, "native": True}
        _probe_cache[cache_key] = (now, result)
        return result

    url = await build_stream_url(stream_id, stream_type)
    ua = UA_STR

    try:
        proc = await asyncio.create_subprocess_exec(
            "/usr/bin/timeout", "8", "/usr/bin/ffprobe",
            "-v", "error",
            "-print_format", "json",
            "-show_streams",
            "-user_agent", ua,
            "-select_streams", "v:0",
            url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=10.0)
        stderr_text = stderr_bytes.decode() if stderr_bytes else ""
    except (asyncio.TimeoutError, Exception) as e:
        log.warning(f"ffprobe failed for {stream_id}: {e}")
        return {"codec": "unknown", "error": str(e)}

    if proc.returncode != 0 or not stdout:
        if "405" in stderr_text or "Method Not Allowed" in stderr_text:
            log.info(f"Probe {stream_id}: ffprobe got 405 — trying curl_cffi fallback")
            # curl_cffi emulates Chrome TLS fingerprint and can bypass Cloudflare
            try:
                import curl_cffi.requests as CurlReq
                cffi_url = await build_stream_url(stream_id, stream_type)
                resp = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: CurlReq.get(
                        cffi_url,
                        headers={"User-Agent": UA_STR, "Referer": f"{IPTV_BASE}/", "Range": "bytes=0-65535"},
                        timeout=10,
                        impersonate="chrome120",
                    )
                )
                cl = resp.headers.get("content-length", "0")
                if resp.status_code in (200, 206) and cl.isdigit() and int(cl) > 0:
                    log.info(f"Probe {stream_id}: curl_cffi OK (HTTP {resp.status_code}, {cl}B) — accessible")
                    result = {"codec": "h264", "codec_long": "H.264 (curl_cffi)", "width": 0, "height": 0}
                    _probe_cache[cache_key] = (now, result)
                    return result
            except Exception as cffi_err:
                log.warning(f"Probe {stream_id}: curl_cffi fallback failed: {cffi_err}")
            log.info(f"Probe {stream_id}: all probe methods failed — reporting unavailable")
            result = {"codec": "unavailable", "error": "Not on this CDN edge"}
            _probe_cache[cache_key] = (now, result)
            return result
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True, headers={"User-Agent": ua}) as c:
                resp = await c.get(url)
                if resp.status_code == 405:
                    log.info(f"Probe {stream_id}: GET returned 405 — unavailable")
                    result = {"codec": "unavailable", "error": "Not on this CDN edge"}
                    _probe_cache[cache_key] = (now, result)
                    return result
        except Exception as e:
            log.warning(f"Probe HTTP GET failed for stream {stream_id}: {e}")
        return {"codec": "unknown"}

    try:
        data = json.loads(stdout)
        streams = data.get("streams", [])
        if not streams:
            return {"codec": "unknown"}
        s = streams[0]
        fmt = data.get("format", {})
        result = {
            "codec": s.get("codec_name", "unknown"),
            "codec_long": s.get("codec_long_name", ""),
            "width": s.get("width", 0),
            "height": s.get("height", 0),
            "profile": s.get("profile", ""),
            "container": fmt.get("format_name", ""),
        }
        _probe_cache[cache_key] = (now, result)
        log.info(f"Probe {stream_id}: {result['codec']} {result['width']}x{result['height']}")
        return result
    except json.JSONDecodeError:
        return {"codec": "unknown"}


@router.get("/api/live/probe/{stream_id}")
async def probe_endpoint(stream_id: int):
    """Probe a live stream to detect video codec before playback."""
    return await probe_stream(stream_id, "live")


@router.get("/api/movie/probe/{stream_id}")
async def probe_movie(stream_id: int):
    """Probe a movie stream to detect video codec."""
    return await probe_stream(stream_id, "movie")


@router.get("/api/series/probe/{stream_id}")
async def probe_series(stream_id: int):
    """Probe a series stream to detect video codec."""
    return await probe_stream(stream_id, "series")
