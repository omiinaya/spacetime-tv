"""DVR Recording API — start, stop, list, delete, serve recordings.

Spawns ffmpeg to record live streams to disk. Metadata stored in a JSON
manifest at RECORDINGS_DIR / _meta.json. Supports concurrent recordings.
"""

import asyncio
import json
import logging
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from config import DATA_DIR, UA_STR
from iptv_client import iptv_referer
from routes.stream_core import build_stream_url
from state import _cache

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["recordings"])

RECORDINGS_DIR = DATA_DIR / "recordings"
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
META_FILE = RECORDINGS_DIR / "_meta.json"

# In-memory tracking of active recording processes
_active: dict[str, asyncio.subprocess.Process] = {}


def _load_meta() -> dict[str, dict]:
    """Load recordings metadata from disk."""
    if META_FILE.exists():
        try:
            return json.loads(META_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_meta(meta: dict[str, dict]) -> None:
    """Persist recordings metadata to disk."""
    META_FILE.write_text(json.dumps(meta, indent=2, default=str))


@router.post("/record/start")
async def start_recording(
    stream_id: int = Query(..., description="Live stream ID to record"),
    stream_name: str = Query("", description="Optional display name"),
):
    """Start recording a live stream. Returns a recording ID."""
    url = await build_stream_url(stream_id, "live")

    # Try to get EPG programme name for metadata
    epg_name = ""
    try:
        for key, (_, data) in _cache.items():
            if key == "epg_programmes" and isinstance(data, list):
                now = int(time.time())
                for p in data:
                    if p.get("channel_id") == stream_id:
                        start = p.get("start_timestamp", 0)
                        stop = p.get("stop_timestamp", 0)
                        if start <= now <= stop:
                            epg_name = p.get("title", "")
                        break
                break
    except (ValueError, TypeError):
        pass

    display_name = stream_name or epg_name or f"Channel {stream_id}"

    rec_id = uuid.uuid4().hex[:12]
    out_path = RECORDINGS_DIR / f"{rec_id}.mp4"
    started_at = datetime.now(UTC)

    cmd = [
        "/usr/bin/ffmpeg",
        "-loglevel",
        "warning",
        "-user_agent",
        UA_STR,
        "-headers",
        f"Referer: {iptv_referer()}\r\n",
        "-i",
        url,
        "-c",
        "copy",
        "-bsf:a",
        "aac_adtstoasc",
        "-f",
        "mp4",
        "-movflags",
        "+frag_keyframe+empty_moov+faststart",
        str(out_path),
    ]

    log.info(f"[record] Starting recording {rec_id} for stream {stream_id}")
    proc = await asyncio.create_subprocess_exec(*cmd)
    _active[rec_id] = proc

    meta = _load_meta()
    meta[rec_id] = {
        "id": rec_id,
        "stream_id": stream_id,
        "name": display_name,
        "started_at": started_at.isoformat(),
        "status": "recording",
        "file": str(out_path),
    }
    _save_meta(meta)

    return {
        "recording_id": rec_id,
        "stream_id": stream_id,
        "name": display_name,
        "started_at": started_at.isoformat(),
    }


@router.post("/record/stop")
async def stop_recording(recording_id: str = Query(...)):
    """Stop an active recording."""
    meta = _load_meta()
    rec = meta.get(recording_id)
    if not rec:
        raise HTTPException(404, "Recording not found")

    if rec["status"] != "recording":
        return {"recording_id": recording_id, "status": rec["status"]}

    proc = _active.get(recording_id)
    if proc:
        log.info(f"[record] Stopping recording {recording_id}")
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=5)
        except TimeoutError:
            proc.kill()
            await proc.wait()
        _active.pop(recording_id, None)

    file_path = Path(rec["file"])
    file_size = file_path.stat().st_size if file_path.exists() else 0

    rec["status"] = "completed" if file_size > 0 else "failed"
    rec["stopped_at"] = datetime.now(UTC).isoformat()
    rec["size_bytes"] = file_size
    _save_meta(meta)

    return {
        "recording_id": recording_id,
        "status": rec["status"],
        "size_bytes": file_size,
    }


@router.get("/recordings")
async def list_recordings():
    """List all recordings, newest first."""
    meta = _load_meta()
    # Refresh status for active recordings
    for rid, proc in list(_active.items()):
        if proc.returncode is not None:
            rec = meta.get(rid, {})
            if rec.get("status") == "recording":
                rec["status"] = "completed"
                rec["stopped_at"] = datetime.now(UTC).isoformat()
                try:
                    rec["size_bytes"] = Path(rec.get("file", "")).stat().st_size
                except OSError:
                    rec["size_bytes"] = 0
            _active.pop(rid, None)

    if _active:
        _save_meta(meta)

    recordings = sorted(meta.values(), key=lambda r: r.get("started_at", ""), reverse=True)
    return {"recordings": recordings, "total": len(recordings)}


@router.get("/recordings/{recording_id}")
async def get_recording(recording_id: str):
    """Get metadata for a single recording."""
    meta = _load_meta()
    rec = meta.get(recording_id)
    if not rec:
        raise HTTPException(404, "Recording not found")
    return rec


@router.delete("/recordings/{recording_id}")
async def delete_recording(recording_id: str):
    """Delete a recording and its file."""
    meta = _load_meta()
    rec = meta.get(recording_id)
    if not rec:
        raise HTTPException(404, "Recording not found")

    # Stop if active
    if rec["status"] == "recording":
        proc = _active.get(recording_id)
        if proc:
            proc.terminate()
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except TimeoutError:
                proc.kill()
                await proc.wait()
            _active.pop(recording_id, None)

    file_path = Path(rec.get("file", ""))
    if file_path.exists():
        file_path.unlink()

    del meta[recording_id]
    _save_meta(meta)

    return {"deleted": recording_id}


@router.get("/stream/recordings/{recording_id}")
async def serve_recording(recording_id: str):
    """Serve a recorded MP4 file."""
    meta = _load_meta()
    rec = meta.get(recording_id)
    if not rec:
        raise HTTPException(404, "Recording not found")
    if rec["status"] == "recording":
        raise HTTPException(409, "Recording still in progress")

    file_path = Path(rec.get("file", ""))
    if not file_path.exists():
        raise HTTPException(404, "Recording file not found")

    return FileResponse(
        file_path,
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
        },
    )
