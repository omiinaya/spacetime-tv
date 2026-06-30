"""TMDB v3 API proxy routes.

Pure API proxy layer — no dependencies on main.py.
All TMDB endpoints are self-contained with in-memory caching.
"""
import asyncio
import json
import logging
import os
import time

import httpx
from fastapi import APIRouter, Query

log = logging.getLogger("spacetime-tv")
router = APIRouter(tags=["tmdb"])

# ── TMDB v3 API Proxy ────────────────────────────────────────────
_TMDB_CACHE: dict[str, tuple[float, dict]] = {}  # cache_key -> (fetched_at, data)
_TMDB_CACHE_TTL = 600  # 10 minutes


async def tmdb_fetch(path: str) -> dict | None:
    """Fetch from TMDB v3 API with caching."""
    api_key = os.getenv("TMDB_API_KEY", "")
    tmdb_base = "https://api.themoviedb.org/3"

    if not api_key:
        return None

    cache_key = f"tmdb_{path}"
    now = time.time()
    if cache_key in _TMDB_CACHE:
        ts, data = _TMDB_CACHE[cache_key]
        if now - ts < _TMDB_CACHE_TTL:
            return data
        del _TMDB_CACHE[cache_key]

    url = f"{tmdb_base}/{path}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            resp = await c.get(url, params={"api_key": api_key})
            if resp.status_code != 200:
                log.warning(f"TMDB API error {resp.status_code} for {path}")
                return None
            data = resp.json()
            _TMDB_CACHE[cache_key] = (now, data)
            return data
    except Exception as e:
        log.error(f"TMDB fetch error for {path}: {e}")
        return None


# ── Movies ───────────────────────────────────────────────────────

@router.get("/api/tmdb/trending")
async def tmdb_trending(
    time_window: str = Query("week", pattern="^(day|week)$"),
    page: int = Query(1, ge=1, le=20),
):
    """Trending movies from TMDB v3 API.

    Requires TMDB_API_KEY to be set. Returns empty trending list when unset.
    Results are cached for 10 minutes.
    """
    data = await tmdb_fetch(f"trending/movie/{time_window}?page={page}")
    if data is None:
        return {"trending": [], "total_pages": 0, "total_results": 0, "enabled": False}
    return {
        "trending": data.get("results", []),
        "total_pages": data.get("total_pages", 0),
        "total_results": data.get("total_results", 0),
        "enabled": True,
    }


@router.get("/api/tmdb/search")
async def tmdb_search(
    q: str = Query(..., min_length=2),
    page: int = Query(1, ge=1, le=20),
):
    """Search movies via TMDB v3 API.

    Useful as a fallback when the provider catalog lacks results.
    Requires TMDB_API_KEY to be set.
    """
    data = await tmdb_fetch(f"search/movie?query={q}&page={page}")
    if data is None:
        return {"results": [], "total_pages": 0, "total_results": 0, "enabled": False}
    return {
        "results": data.get("results", []),
        "total_pages": data.get("total_pages", 0),
        "total_results": data.get("total_results", 0),
        "enabled": True,
    }


@router.get("/api/tmdb/movie/{tmdb_id}")
async def tmdb_movie_details(tmdb_id: int):
    """Full movie details from TMDB v3 API by TMDB ID.

    Enriches the provider metadata with TMDB plot, cast, director, runtime,
    IMDb ID, budget/revenue, production companies, etc.
    Requires TMDB_API_KEY to be set.
    """
    data = await tmdb_fetch(f"movie/{tmdb_id}")
    if data is None:
        return {"enabled": False, "info": None}
    return {"enabled": True, "info": data}


@router.get("/api/tmdb/movie/{tmdb_id}/similar")
async def tmdb_movie_similar(tmdb_id: int, page: int = Query(1, ge=1, le=10)):
    """Similar movies from TMDB by TMDB ID.

    Used for 'More Like This' recommendations.
    Requires TMDB_API_KEY to be set.
    """
    data = await tmdb_fetch(f"movie/{tmdb_id}/similar?page={page}")
    if data is None:
        return {"results": [], "total_pages": 0, "total_results": 0, "enabled": False}
    return {
        "results": data.get("results", []),
        "total_pages": data.get("total_pages", 0),
        "total_results": data.get("total_results", 0),
        "enabled": True,
    }


@router.get("/api/tmdb/configuration")
async def tmdb_configuration():
    """TMDB API configuration (image base URLs, sizes, etc.).

    Useful for the frontend to construct correct image URLs.
    Requires TMDB_API_KEY to be set.
    """
    data = await tmdb_fetch("configuration")
    if data is None:
        return {"enabled": False, "images": None}
    return {"enabled": True, "images": data.get("images", {})}


# ── TV / Series ──────────────────────────────────────────────────

@router.get("/api/tmdb/tv/trending")
async def tmdb_tv_trending(
    time_window: str = Query("week", pattern="^(day|week)$"),
    page: int = Query(1, ge=1, le=20),
):
    """Trending TV shows from TMDB v3 API.

    Mirrors the movies endpoint but for TV content.
    Requires TMDB_API_KEY to be set. Returns empty list when unset.
    Results are cached for 10 minutes.
    """
    data = await tmdb_fetch(f"trending/tv/{time_window}?page={page}")
    if data is None:
        return {"trending": [], "total_pages": 0, "total_results": 0, "enabled": False}
    return {
        "trending": data.get("results", []),
        "total_pages": data.get("total_pages", 0),
        "total_results": data.get("total_results", 0),
        "enabled": True,
    }


@router.get("/api/tmdb/tv/search")
async def tmdb_tv_search(
    q: str = Query(..., min_length=2),
    page: int = Query(1, ge=1, le=20),
):
    """Search TV shows via TMDB v3 API.

    Useful when the provider catalog lacks series results.
    Requires TMDB_API_KEY to be set.
    """
    data = await tmdb_fetch(f"search/tv?query={q}&page={page}")
    if data is None:
        return {"results": [], "total_pages": 0, "total_results": 0, "enabled": False}
    return {
        "results": data.get("results", []),
        "total_pages": data.get("total_pages", 0),
        "total_results": data.get("total_results", 0),
        "enabled": True,
    }


@router.get("/api/tmdb/tv/{series_id}")
async def tmdb_tv_details(series_id: int):
    """Full TV series details from TMDB v3 API by TMDB series ID.

    Enriches the provider metadata with TMDB plot, cast, creator, seasons,
    runtime, networks, homepage, etc.
    Requires TMDB_API_KEY to be set.
    """
    data = await tmdb_fetch(f"tv/{series_id}")
    if data is None:
        return {"enabled": False, "info": None}
    return {"enabled": True, "info": data}


@router.get("/api/tmdb/tv/{series_id}/similar")
async def tmdb_tv_similar(series_id: int, page: int = Query(1, ge=1, le=10)):
    """Similar TV shows from TMDB by TMDB series ID.

    Used for 'More Like This' recommendations on series.
    Requires TMDB_API_KEY to be set.
    """
    data = await tmdb_fetch(f"tv/{series_id}/similar?page={page}")
    if data is None:
        return {"results": [], "total_pages": 0, "total_results": 0, "enabled": False}
    return {
        "results": data.get("results", []),
        "total_pages": data.get("total_pages", 0),
        "total_results": data.get("total_results", 0),
        "enabled": True,
    }


# ── Person / Cast (CLI-backed, browserless SSR) ─────────────────

# Path to tmdb-enrich CLI tool (browserless SSR extraction)
from config import TMDB_ENRICH_PATH


async def tmdb_enrich_cli(*args: str) -> dict | None:
    """Call tmdb-enrich CLI and return parsed JSON result."""
    try:
        proc = await asyncio.create_subprocess_exec(
            TMDB_ENRICH_PATH, "--json", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
        if proc.returncode != 0:
            log.warning(f"tmdb-enrich failed (exit {proc.returncode}): {stderr.decode()[:200]}")
            return None
        result = json.loads(stdout.decode())
        return result
    except asyncio.TimeoutError:
        log.warning(f"tmdb-enrich timed out for: {' '.join(args)[:80]}")
        return None
    except Exception as e:
        log.warning(f"tmdb-enrich error: {e}")
        return None


@router.get("/api/tmdb/person/search")
async def tmdb_person_search(
    q: str = Query(..., min_length=2),
):
    """Search for a person by name via tmdb-enrich CLI.

    No API key needed — mines TMDB's internal API via browserless SSR.
    Returns best match person detail when found.
    """
    data = await tmdb_enrich_cli("person", q)
    if data is None:
        return {"enabled": False, "info": None}
    return {"enabled": True, "info": data}


@router.get("/api/tmdb/person/{person_id}")
async def tmdb_person_details(person_id: int):
    """Full person details + filmography via tmdb-enrich CLI.

    Returns name, photo, birthday, roles, and known_for credits.
    No API key needed.
    """
    data = await tmdb_enrich_cli("person", str(person_id))
    if data is None:
        return {"enabled": False, "info": None}
    return {"enabled": True, "info": data}
