"""Miscellaneous routes — IPTV raw proxy, image proxy, SPA catch-all.

Extracted from main.py during P1.1 Phase 6 decomposition.
"""
import hashlib
import json
import logging
import time
from pathlib import Path
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response

from iptv_client import client

from config import IPTV_BASE, IPTV_PASS, IPTV_USER, STATIC_DIR
from state import _img_cache

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["misc"])

# ── Image proxy disk cache ──────────────────────────────────────────
CACHE_DIR = Path("/tmp/stv_cache")
IMG_CACHE_DIR = CACHE_DIR / "images"
IMG_CACHE_DIR.mkdir(parents=True, exist_ok=True)

_IMG_CACHE_TTL = 600  # 10 min L1
_IMG_DISK_TTL = 86400  # 24 hours
_MAX_IMG_CACHE_SIZE = 500


def _img_cache_key(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()


def _img_cache_path(cache_key: str) -> Path:
    return IMG_CACHE_DIR / cache_key


def _img_meta_path(cache_key: str) -> Path:
    return IMG_CACHE_DIR / f"{cache_key}.meta"


def _img_stamp_path(cache_key: str) -> Path:
    return IMG_CACHE_DIR / f".{cache_key}.accessed"


def _img_write_disk(cache_key: str, content: bytes, content_type: str):
    """Write image + metadata to disk cache (fire-and-forget)."""
    try:
        _img_cache_path(cache_key).write_bytes(content)
        _img_meta_path(cache_key).write_text(
            json.dumps({"ct": content_type, "ts": time.time()})
        )
    except Exception as e:
        log.debug(f"Disk cache write failed: {e}")


def _img_read_disk(cache_key: str):
    """Read image + metadata from disk cache. Returns (content, content_type, ts) or None."""
    try:
        path = _img_cache_path(cache_key)
        meta = _img_meta_path(cache_key)
        if not path.exists() or not meta.exists():
            return None
        content = path.read_bytes()
        m = json.loads(meta.read_text())
        if time.time() - m["ts"] > _IMG_DISK_TTL:
            path.unlink(missing_ok=True)
            meta.unlink(missing_ok=True)
            return None
        return content, m["ct"], m["ts"]
    except Exception:
        return None


# ── IPTV Raw Proxy ──────────────────────────────────────────────────
@router.get("/api/v1/iptv/{path:path}")
async def iptv_raw(path: str):
    """Raw proxy for any IPTV API call (images, etc.)."""
    params = {"username": IPTV_USER, "password": IPTV_PASS}
    full = f"{IPTV_BASE}/{path}?{urlencode(params)}"
    try:
        resp = await client.get(full)
        return Response(content=resp.content, media_type=resp.headers.get("content-type", "application/octet-stream"))
    except Exception as e:
        raise HTTPException(502, str(e))


# ── Image Proxy ─────────────────────────────────────────────────────
@router.get("/api/v1/image-proxy")
async def image_proxy(request: Request, url: str = Query(...)):
    """Proxy images from blocked CDNs through our server."""
    from urllib.parse import urlparse

    referer = request.headers.get("referer", "")
    origin = request.headers.get("origin", "")
    host = request.headers.get("host", "")
    is_ours = (
        not referer
        or host in referer
        or "localhost" in referer
        or "127.0.0.1" in referer
        or (origin and (host in origin or "localhost" in origin))
    )
    if not is_ours:
        raise HTTPException(403, "Direct access not allowed — use from the Spacetime-TV app")

    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(400, "Invalid URL")

    allowed_hosts = {"cmc.exchange-cdn.com", "image.tmdb.org"}
    host = parsed.hostname or ""
    if not any(host == a or host.endswith("." + a) for a in allowed_hosts):
        raise HTTPException(400, f"Host not allowed: {host}")

    now = time.time()
    if url in _img_cache:
        cached_at, content, ct = _img_cache[url]
        if now - cached_at < _IMG_CACHE_TTL:
            return Response(content=content, media_type=ct,
                           headers={"Cache-Control": "public, max-age=86400"})
        del _img_cache[url]

    img_key = _img_cache_key(url)
    disk_hit = _img_read_disk(img_key)
    if disk_hit is not None:
        content, ct, stored_at = disk_hit
        if len(_img_cache) >= _MAX_IMG_CACHE_SIZE:
            oldest_key = min(_img_cache, key=lambda k: _img_cache[k][0])
            del _img_cache[oldest_key]
        _img_cache[url] = (now, content, ct)
        return Response(content=content, media_type=ct,
                        headers={"Cache-Control": "public, max-age=86400"})

    resp = await client.get(url, follow_redirects=True)
    resp.raise_for_status()
    content = resp.content
    content_type = resp.headers.get("content-type", "image/jpeg")

    if len(_img_cache) >= _MAX_IMG_CACHE_SIZE:
        oldest_key = min(_img_cache, key=lambda k: _img_cache[k][0])
        del _img_cache[oldest_key]
    _img_cache[url] = (now, content, content_type)

    _img_write_disk(img_key, content, content_type)
    return Response(content=content, media_type=content_type,
                    headers={"Cache-Control": "public, max-age=86400"})


# ── SPA Catch-All ───────────────────────────────────────────────────
@router.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    """Serve index.html for client-side routing."""
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"detail": "Not Found"}
