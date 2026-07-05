"""Subtitle and audio track routes — ffprobe/ffmpeg extraction.

Extracted from main.py during P1.1 Phase 6 decomposition.
"""
import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse

from .stream_core import _vod_url

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["media"])

# ── Caches ──────────────────────────────────────────────────────────
SUBTITLE_CACHE: dict[str, list[dict]] = {}
SUBTITLE_VTT_CACHE: dict[str, str] = {}
AUDIO_CACHE: dict[str, list[dict]] = {}


# Uses shared _vod_url from stream_core.py
# ── Subtitles ───────────────────────────────────────────────────────
@router.get("/subtitles/probe/{media_type}/{stream_id}")
async def probe_subtitles(media_type: str, stream_id: int):
    """Probe a stream for embedded subtitle tracks."""
    cache_key = f"{media_type}:{stream_id}"
    if cache_key in SUBTITLE_CACHE:
        return {"tracks": SUBTITLE_CACHE[cache_key], "cached": True}

    url = _vod_url(stream_id, media_type)
    try:
        proc = await asyncio.create_subprocess_exec(
            "/usr/bin/ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=20.0)
        if proc.returncode != 0:
            return {"tracks": [], "error": "Probe failed"}
        info = json.loads(stdout)
        tracks = []
        for s in info.get("streams", []):
            if s.get("codec_type") == "subtitle":
                tags = s.get("tags", {})
                tracks.append({
                    "index": s.get("index", 0),
                    "language": tags.get("language", "und"),
                    "title": tags.get("title", ""),
                    "codec": s.get("codec_name", "unknown"),
                })
        SUBTITLE_CACHE[cache_key] = tracks
        return {"tracks": tracks, "cached": False}
    except asyncio.TimeoutError:
        return {"tracks": [], "error": "Probe timed out"}
    except Exception as e:
        return {"tracks": [], "error": str(e)}


@router.get("/subtitles/{media_type}/{stream_id}/{track_index}")
async def get_subtitles(media_type: str, stream_id: int, track_index: int):
    """Extract a subtitle track to WebVTT and serve it."""
    cache_key = f"{media_type}:{stream_id}:{track_index}"
    if cache_key in SUBTITLE_VTT_CACHE:
        return Response(
            content=SUBTITLE_VTT_CACHE[cache_key],
            media_type="text/vtt",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    url = _vod_url(stream_id, media_type)
    try:
        proc = await asyncio.create_subprocess_exec(
            "/usr/bin/ffmpeg", "-y",
            "-i", url,
            "-map", f"0:s:{track_index}",
            "-f", "webvtt",
            "pipe:1",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60.0)
        if proc.returncode != 0 or not stdout:
            raise HTTPException(500, "Subtitle extraction failed")
        vtt = stdout.decode("utf-8", errors="replace")
        SUBTITLE_VTT_CACHE[cache_key] = vtt
        return Response(
            content=vtt,
            media_type="text/vtt",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except asyncio.TimeoutError:
        raise HTTPException(504, "Subtitle extraction timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ── Audio ───────────────────────────────────────────────────────────
@router.get("/audio/probe/{media_type}/{stream_id}")
async def probe_audio(media_type: str, stream_id: int):
    """Probe a stream for audio tracks."""
    cache_key = f"{media_type}:{stream_id}"
    if cache_key in AUDIO_CACHE:
        return {"tracks": AUDIO_CACHE[cache_key], "cached": True}

    url = _vod_url(stream_id, media_type)
    try:
        proc = await asyncio.create_subprocess_exec(
            "/usr/bin/ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=20.0)
        if proc.returncode != 0:
            return {"tracks": [], "error": "Probe failed"}
        info = json.loads(stdout)
        tracks = []
        for s in info.get("streams", []):
            if s.get("codec_type") == "audio":
                tags = s.get("tags", {})
                tracks.append({
                    "index": s.get("index", 0),
                    "language": tags.get("language", "und"),
                    "title": tags.get("title", ""),
                    "codec": s.get("codec_name", "unknown"),
                    "channels": s.get("channels", 0),
                })
        AUDIO_CACHE[cache_key] = tracks
        return {"tracks": tracks, "cached": False}
    except asyncio.TimeoutError:
        return {"tracks": [], "error": "Probe timed out"}
    except Exception as e:
        return {"tracks": [], "error": str(e)}


@router.get("/audio/stream/{media_type}/{stream_id}/{audio_index}")
async def stream_audio_track(media_type: str, stream_id: int, audio_index: int):
    """Stream a VOD with only the selected audio track via ffmpeg remux."""
    url = _vod_url(stream_id, media_type)
    try:
        proc = await asyncio.create_subprocess_exec(
            "/usr/bin/ffmpeg", "-y",
            "-i", url,
            "-map", "0:v:0",
            "-map", f"0:a:{audio_index}",
            "-c", "copy",
            "-f", "mpegts",
            "pipe:1",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        if not proc.stdout:
            raise HTTPException(500, "Failed to open audio stream")

        async def audio_stream():
            try:
                while True:
                    chunk = await proc.stdout.read(65536)
                    if not chunk:
                        break
                    yield chunk
            finally:
                if proc.returncode is None:
                    try:
                        proc.kill()
                    except Exception:
                        pass

        return StreamingResponse(
            audio_stream(),
            media_type="video/mp2t",
            headers={"Cache-Control": "no-cache"},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
