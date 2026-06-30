"""Search and enrichment routes.

Extracted from main.py during P1.1 Phase 4 decomposition.
"""
import asyncio
import json
import logging
import os
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from iptv_client import cached_fetch

from config import TMDB_API_KEY
from state import _cache, record_search, CACHE_LIVE_ALL, CACHE_VOD_CATEGORIES, CACHE_VOD_CAT, CACHE_SERIES_CATEGORIES, CACHE_SERIES_CAT

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["search"])

# ── tmdb-enrich CLI path ──────────────────────────────────────────────
_TMDB_ENRICH = os.getenv(
    "TMDB_ENRICH_PATH",
    "/home/user/.local/share/hermes-cli-tools-venv/bin/tmdb-enrich",
)

# ── Search Enrichment Cache ───────────────────────────────────────────
_SEARCH_ENRICH_CACHE: dict[str, tuple[float, dict | None]] = {}
_SEARCH_ENRICH_TTL = 600  # 10 minutes


async def _enrich_tmdb_item(item_type: str, tmdb_id: str) -> dict | None:
    """Fetch TMDB details for a single item, with caching."""
    cache_key = f"tmdb_enrich_{item_type}_{tmdb_id}"
    now = time.time()
    if cache_key in _SEARCH_ENRICH_CACHE:
        ts, data = _SEARCH_ENRICH_CACHE[cache_key]
        if now - ts < _SEARCH_ENRICH_TTL:
            return data

    # Try API-key path first (richer data)
    if item_type == "movie" and TMDB_API_KEY:
        from routes.tmdb import tmdb_fetch  # type: ignore[import-unused]
        data = await tmdb_fetch(f"movie/{tmdb_id}")
    elif item_type == "tv" and TMDB_API_KEY:
        from routes.tmdb import tmdb_fetch  # type: ignore[import-unused]
        data = await tmdb_fetch(f"tv/{tmdb_id}")
    else:
        # Fallback: try tmdb-enrich CLI (browserless extraction)
        try:
            proc = await asyncio.create_subprocess_exec(
                _TMDB_ENRICH, "--json", "enrich",
                f"{'movie' if item_type == 'movie' else 'tv'}/{tmdb_id}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
            if proc.returncode == 0:
                try:
                    data = json.loads(stdout.decode())
                except json.JSONDecodeError:
                    data = None
            else:
                data = None
        except Exception:
            data = None

    if not data:
        _SEARCH_ENRICH_CACHE[cache_key] = (now, None)
        return None

    enriched = {
        "genres": [g["name"] for g in (data.get("genres") or [])],
        "rating": data.get("vote_average"),
        "poster": data.get("poster_path"),
        "overview": data.get("overview"),
    }
    _SEARCH_ENRICH_CACHE[cache_key] = (now, enriched)
    return enriched


@router.post("/api/search/enrich")
async def search_enrich(body: dict):
    """Batch enrich search results with TMDB metadata (genres, rating, poster).

    Accepts:
      { "movies": [{"stream_id": 1, "tmdb_id": "550"}],
        "series": [{"series_id": 1, "tmdb_id": "1399"}] }

    Returns:
      { "movies": { "1": {"genres": [...], "rating": 8.2, "poster": "/xyz.jpg", "overview": "..."} },
        "series": { "1": {...} } }
    """
    result: dict = {"movies": {}, "series": {}}
    tasks = []

    for m in (body.get("movies") or []):
        sid = m.get("stream_id")
        tid = m.get("tmdb_id")
        if sid and tid:
            tasks.append(_enrich_tmdb_item("movie", str(tid)))

    for s in (body.get("series") or []):
        sid = s.get("series_id")
        tid = s.get("tmdb_id")
        if sid and tid:
            tasks.append(_enrich_tmdb_item("tv", str(tid)))

    if not tasks:
        return result

    enriched_list = await asyncio.gather(*tasks, return_exceptions=True)

    idx = 0
    for m in (body.get("movies") or []):
        sid = m.get("stream_id")
        if sid and m.get("tmdb_id"):
            val = enriched_list[idx]
            if val and not isinstance(val, Exception):
                result["movies"][str(sid)] = val
            idx += 1

    for s in (body.get("series") or []):
        sid = s.get("series_id")
        if sid and s.get("tmdb_id"):
            val = enriched_list[idx]
            if val and not isinstance(val, Exception):
                result["series"][str(sid)] = val
            idx += 1

    return result


@router.get("/api/search")
async def search(
    q: str = Query(..., min_length=2),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    section: str | None = Query(None, pattern="^(live|movies|series)$"),
):
    """Search across live TV, movies, and series with pagination support.

    Returns all three sections when section is omitted, or a single section
    when loading additional pages.  Always includes 'totals' so the frontend
    knows if more results are available.
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
    except Exception as e:
        log.error(f"Live search error: {e}")

    def _search_all(prefix: str, id_field: str, name_fields=("name",)):
        """Scan ALL cache entries for this prefix, return ALL matches."""
        seen: set = set()
        out: list = []
        for key, (ts, data) in _cache.items():
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
        async def get_all_vod():
            try:
                vod_cats = await cached_fetch(CACHE_VOD_CATEGORIES, "get_vod_categories")
                cat_ids = [c["category_id"] for c in vod_cats if c.get("category_id")]
                sem = asyncio.Semaphore(20)
                async def f(cid):
                    async with sem:
                        return await cached_fetch(CACHE_VOD_CAT.format(id=cid), "get_vod_streams", category_id=cid)
                all_streams = await asyncio.gather(*[f(cid) for cid in cat_ids], return_exceptions=True)
                seen = set()
                out = []
                for streams in all_streams:
                    if isinstance(streams, Exception):
                        continue
                    for s in streams:
                        sid = s.get("stream_id")
                        if sid and sid not in seen:
                            seen.add(sid)
                            if query in s.get("name", "").lower():
                                out.append(s)
                return out
            except Exception as e:
                log.error(f"VOD search error: {e}")
                return []
        all_movies = await get_all_vod()

    if not all_series:
        async def get_all_series():
            try:
                cats = await cached_fetch(CACHE_SERIES_CATEGORIES, "get_series_categories")
                cat_ids = [c["category_id"] for c in cats if c.get("category_id")]
                sem = asyncio.Semaphore(20)
                async def f(cid):
                    async with sem:
                        return await cached_fetch(CACHE_SERIES_CAT.format(id=cid), "get_series", category_id=cid)
                all_series_data = await asyncio.gather(*[f(cid) for cid in cat_ids], return_exceptions=True)
                seen = set()
                out = []
                for slist in all_series_data:
                    if isinstance(slist, Exception):
                        continue
                    for s in slist:
                        sid = s.get("series_id")
                        if sid and sid not in seen:
                            seen.add(sid)
                            name = (s.get("name") or "").lower()
                            plot = (s.get("plot") or "").lower()
                            if query in name or query in plot:
                                out.append(s)
                return out
            except Exception as e:
                log.error(f"Series search error: {e}")
                return []
        all_series = await get_all_series()

    totals = {
        "live": len(all_live),
        "movies": len(all_movies),
        "series": len(all_series),
    }

    def _slice(items, sec):
        return items[offset:offset + limit]

    if section is None or section == "live":
        results["live"] = _slice(all_live, "live")
    if section is None or section == "movies":
        results["movies"] = _slice(all_movies, "movies")
    if section is None or section == "series":
        results["series"] = _slice(all_series, "series")

    return {**results, "totals": totals}
