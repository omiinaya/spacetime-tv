"""VOD routes — movies, series, and download.

Extracted from main.py during P1.1 Phase 6 decomposition.
"""
import logging
import re

from fastapi import APIRouter, Query
from fastapi.responses import RedirectResponse

from iptv_client import cached_fetch
from iptv_client import vod_url as _vod_url
from state import (
    CACHE_SERIES_CAT,
    CACHE_SERIES_CATEGORIES,
    CACHE_SERIES_INFO,
    CACHE_VOD_CAT,
    CACHE_VOD_CATEGORIES,
    CACHE_VOD_INFO,
    _cache,
)

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["vod"])


# ── Movies ───────────────────────────────────────────────────────────
@router.get("/movies/categories")
async def movies_categories():
    """All VOD categories."""
    data = await cached_fetch(CACHE_VOD_CATEGORIES, "get_vod_categories")
    return {"categories": data}


@router.get("/movies")
async def movies(
    category_id: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Movies in a category, with pagination."""
    data = await cached_fetch(CACHE_VOD_CAT.format(id=category_id), "get_vod_streams", category_id=category_id)
    if isinstance(data, list):
        total = len(data)
        data = data[offset : offset + limit]
        return {"movies": data, "total": total, "offset": offset, "limit": limit}
    return {"movies": data}


@router.get("/movies/unified")
async def movies_unified(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    q: str = Query(None),
):
    """Unified movie list — all languages merged, grouped by TMDB ID.

    Each entry includes a ``languages`` array so the frontend can offer
    a language switcher on the overlay.
    """
    # Collect all VOD streams from the in-memory cache
    groups: dict[str, dict] = {}

    for key, (_ts, data) in _cache.items():
        # Handle both unscoped keys (vod_10) and provider-scoped keys (Default:vod_10)
        # iptv_client.cached_fetch writes scoped keys like "{provider}:{key}"
        base_key = key.split(":", 1)[-1] if ":" in key else key
        if not base_key.startswith("vod_") or base_key == CACHE_VOD_CATEGORIES:
            continue
        if not isinstance(data, list):
            continue
        for m in data:
            tmdb = m.get("tmdb")
            if not tmdb:
                continue
            name = m.get("name", "")
            lang_match = re.match(r"^(\w{2,3})\s*-\s*(.+)$", name)
            lang_code = lang_match.group(1) if lang_match else ""
            base_name = lang_match.group(2).strip() if lang_match else name

            if tmdb not in groups:
                groups[tmdb] = {
                    "movie": m,
                    "base_name": base_name,
                    "languages": {},
                }
            groups[tmdb]["languages"][lang_code or "??"] = {
                "name": name,
                "stream_id": m["stream_id"],
                "container_extension": m.get("container_extension", ""),
            }

    unified = []
    for tmdb, grp in groups.items():
        movie = grp["movie"]
        langs = grp["languages"]
        lang_list = [{"code": code, **info} for code, info in langs.items()]
        lang_list.sort(key=lambda x: (x["code"] != "EN", x["code"]))
        unified.append({
            **movie,
            "base_name": grp["base_name"],
            "languages": lang_list,
            "language_count": len(lang_list),
        })

    if q:
        ql = q.lower()
        unified = [u for u in unified if ql in u.get("name", "").lower() or ql in u.get("base_name", "").lower()]

    total = len(unified)
    unified = unified[offset : offset + limit]
    return {"movies": unified, "total": total, "offset": offset, "limit": limit}


@router.get("/movies/{stream_id}")
async def movie_details(stream_id: int):
    """Movie details — plot, cast, director, genre, backdrop, etc."""
    data = await cached_fetch(CACHE_VOD_INFO.format(id=stream_id), "get_vod_info", vod_id=stream_id)
    if isinstance(data, dict):
        info = data.get("info", data)
        return {"info": info}
    return {"info": data}


# ── Series ───────────────────────────────────────────────────────────
@router.get("/series/categories")
async def series_categories():
    """All series categories."""
    data = await cached_fetch(CACHE_SERIES_CATEGORIES, "get_series_categories")
    return {"categories": data}


@router.get("/series")
async def series_list(
    category_id: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Series in a category, with pagination."""
    data = await cached_fetch(CACHE_SERIES_CAT.format(id=category_id), "get_series", category_id=category_id)
    if isinstance(data, list):
        total = len(data)
        data = data[offset : offset + limit]
        return {"series": data, "total": total, "offset": offset, "limit": limit}
    return {"series": data}


@router.get("/series/{series_id}")
async def series_details(series_id: int):
    """Series details with episodes."""
    data = await cached_fetch(CACHE_SERIES_INFO.format(id=series_id), "get_series_info", series_id=series_id)
    if isinstance(data, dict):
        return data
    return {"info": data}


# ── Download ─────────────────────────────────────────────────────────
@router.get("/download/{media_type}/{stream_id}")
async def download_stream(media_type: str, stream_id: int):
    """Download a VOD stream as MKV for offline playback."""
    url = _vod_url(stream_id, media_type)
    return RedirectResponse(url=url, status_code=302)
