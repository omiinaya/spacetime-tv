"""Search and enrichment routes.

Extracted from main.py during P1.1 Phase 4 decomposition.
"""
import asyncio
import json
import logging
import time

from fastapi import APIRouter, HTTPException, Query

from config import TMDB_ENRICH_PATH
from iptv_client import cached_fetch
from services.search_service import enrich_tmdb_item, search_all_series, search_all_vod
from state import CACHE_LIVE_ALL, _cache, record_search

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["search"])

# ── tmdb-enrich CLI path ──────────────────────────────────────────
_TMDB_ENRICH = TMDB_ENRICH_PATH


@router.post("/search/enrich")
async def search_enrich(body: dict):
    """Batch enrich search results with TMDB metadata (genres, rating, poster).

    Uses enrich_tmdb_item from the service layer — tries TMDB API key first,
    falls back to tmdb-enrich CLI.
    """
    result: dict = {"movies": {}, "series": {}}
    tasks = []

    for m in (body.get("movies") or []):
        sid = m.get("stream_id")
        tid = m.get("tmdb_id")
        if sid and tid:
            tasks.append(enrich_tmdb_item("movie", str(tid)))

    for s in (body.get("series") or []):
        sid = s.get("series_id")
        tid = s.get("tmdb_id")
        if sid and tid:
            tasks.append(enrich_tmdb_item("tv", str(tid)))

    if not tasks:
        return result

    enriched_list = await asyncio.gather(*tasks, return_exceptions=True)
    idx = 0
    for m in (body.get("movies") or []):
        sid = m.get("stream_id")
        if sid and m.get("tmdb_id"):
            data = enriched_list[idx]
            if data and not isinstance(data, Exception):
                result["movies"][str(sid)] = data
            idx += 1
    for s in (body.get("series") or []):
        sid = s.get("series_id")
        if sid and s.get("tmdb_id"):
            data = enriched_list[idx]
            if data and not isinstance(data, Exception):
                result["series"][str(sid)] = data
            idx += 1

    return result


@router.get("/search")
async def search(
    q: str = Query(..., min_length=2),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    section: str | None = Query(None, pattern="^(live|movies|series)$"),
):
    """Search across live TV, movies, and series with pagination support.

    Returns all three sections when section is omitted, or a single section
    when loading additional pages. Uses in-memory cache for fast warm-cache
    path, falls back to service layer for full scan.
    """
    query = q.lower().strip()
    record_search(query)
    results: dict = {"live": [], "movies": [], "series": []}
    all_live: list = []
    all_movies: list = []
    all_series: list = []

    try:
        live_data = await cached_fetch(CACHE_LIVE_ALL, "get_live_streams")
        all_live = [s for s in live_data if query in s.get("name", "").lower()]
    except HTTPException as e:
        log.error(f"Live search error: {e}")

    def _search_all(prefix: str, id_field: str, name_fields=("name",)):
        """Scan ALL cache entries for this prefix, return ALL matches."""
        seen: set = set()
        out: list = []
        for key, (_ts, data) in _cache.items():
            if not key.startswith(prefix):
                continue
            if not isinstance(data, list):
                continue
            for s in data:
                sid = s.get(id_field)
                if not sid or sid in seen:
                    continue
                seen.add(sid)
                text = " ".join(str(s.get(f, "") or "") for f in name_fields).lower()
                if query in text:
                    out.append(s)
        return out

    # Fast path: if caches are warm, scan in-memory directly
    all_movies = _search_all("vod_", "stream_id")
    all_series = _search_all("series_", "series_id", ("name", "plot"))

    # Fallback if caches weren't warm
    if not all_movies:
        all_movies = await search_all_vod(query)
    if not all_series:
        all_series = await search_all_series(query)

    totals = {
        "live": len(all_live),
        "movies": len(all_movies),
        "series": len(all_series),
    }

    if section is None or section == "live":
        results["live"] = all_live[offset:offset + limit]
    if section is None or section == "movies":
        results["movies"] = all_movies[offset:offset + limit]
    if section is None or section == "series":
        results["series"] = all_series[offset:offset + limit]

    return {**results, "totals": totals}


@router.post("/search/query")
async def search_query(body: dict):
    """Full-text search across movies, series, and live channels."""
    query = (body.get("query") or "").strip().lower()
    if len(query) < 2:
        raise HTTPException(400, "Query must be at least 2 characters")

    # Track search query for analytics
    record_search(query)

    live_results = []
    movies = []
    series = []

    tasks = []
    tasks.append(search_all_vod(query))
    tasks.append(search_all_series(query))

    # Live channel search — cached live_all
    try:
        all_live = await cached_fetch(CACHE_LIVE_ALL, "get_live_streams")
        for ch in all_live:
            name = (ch.get("name") or "").lower()
            if query in name:
                live_results.append(ch)
    except (TimeoutError, HTTPException):
        pass

    results = await asyncio.gather(*tasks, return_exceptions=True)
    if not isinstance(results[0], Exception):
        movies = results[0]
    if not isinstance(results[1], Exception):
        series = results[1]

    return {
        "movies": {"results": movies, "total": len(movies)},
        "series": {"results": series, "total": len(series)},
        "live": {"results": live_results, "total": len(live_results)},
    }
