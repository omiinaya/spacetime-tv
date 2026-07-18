"""Service layer for search operations extracted from routes/search.py."""
import asyncio
import json
import logging
import time

from fastapi import HTTPException

from config import TMDB_API_KEY, TMDB_ENRICH_PATH
from iptv_client import cached_fetch
from state import CACHE_SERIES_CAT, CACHE_SERIES_CATEGORIES, CACHE_VOD_CAT, CACHE_VOD_CATEGORIES

log = logging.getLogger("spacetime-tv")

# ── TMDB Enrichment Cache ──────────────────────────────────────────
_SEARCH_ENRICH_CACHE: dict[str, tuple[float, dict | None]] = {}
_SEARCH_ENRICH_TTL = 600  # 10 minutes

# Path to tmdb-enrich CLI (browserless SSR extraction) — from config.py / env var
_TMDB_ENRICH = TMDB_ENRICH_PATH


async def enrich_tmdb_item(item_type: str, tmdb_id: str) -> dict | None:
    """Fetch TMDB details for a single item, with caching.

    Tries TMDB API key path first (richer data), falls back to tmdb-enrich CLI.
    Used by the search enrichment endpoint to add genres, rating, poster, overview.
    """
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
        if not _TMDB_ENRICH:
            _SEARCH_ENRICH_CACHE[cache_key] = (now, None)
            return None
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
        except (TimeoutError, FileNotFoundError, OSError):
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


async def search_all_vod(query: str, provider_idx: int = -1) -> list:
    """Fetch all VOD streams matching query across all providers."""
    try:
        from iptv_client import get_enabled_providers, fetch_all_providers
        providers = get_enabled_providers()
        if provider_idx >= 0 and provider_idx < len(providers):
            # Specific provider requested
            from iptv_client import _fetch_single_provider
            provider = providers[provider_idx]
            vod_cats = await cached_fetch(CACHE_VOD_CATEGORIES, "get_vod_categories")
            cat_ids = set(c["category_id"] for c in vod_cats if c.get("category_id"))
            sem = asyncio.Semaphore(20)
            async def f(cid):
                async with sem:
                    return await _fetch_single_provider(provider, "get_vod_streams", category_id=cid)
            all_results = await asyncio.gather(*[f(cid) for cid in cat_ids], return_exceptions=True)
            seen = set()
            out = []
            for streams in all_results:
                if isinstance(streams, Exception):
                    continue
                for s in streams:
                    sid = s.get("stream_id")
                    if sid and sid not in seen:
                        seen.add(sid)
                        if query in s.get("name", "").lower():
                            out.append(s)
            return out
        elif len(providers) > 1:
            # Multi-provider: fetch from all in parallel with dedup
            vod_cats = await cached_fetch(CACHE_VOD_CATEGORIES, "get_vod_categories")
            cat_ids = set(c["category_id"] for c in vod_cats if c.get("category_id"))
            sem = asyncio.Semaphore(20)
            async def f(cid):
                async with sem:
                    return await fetch_all_providers("get_vod_streams", category_id=cid)
            all_results = await asyncio.gather(*[f(cid) for cid in cat_ids], return_exceptions=True)
            seen = set()
            out = []
            for streams in all_results:
                if isinstance(streams, Exception):
                    continue
                for s in streams:
                    sid = s.get("stream_id")
                    if sid and sid not in seen:
                        seen.add(sid)
                        if query in s.get("name", "").lower():
                            out.append(s)
            return out
        else:
            # Single provider — original path
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
    except (TimeoutError, HTTPException) as e:
        log.error(f"VOD search error: {e}")
        return []


async def search_all_series(query: str, provider_idx: int = -1) -> list:
    """Fetch all series matching query across all providers."""
    try:
        from iptv_client import get_enabled_providers, fetch_all_providers
        providers = get_enabled_providers()
        if provider_idx >= 0 and provider_idx < len(providers):
            # Specific provider requested
            from iptv_client import _fetch_single_provider
            provider = providers[provider_idx]
            cats = await cached_fetch(CACHE_SERIES_CATEGORIES, "get_series_categories")
            cat_ids = set(c["category_id"] for c in cats if c.get("category_id"))
            sem = asyncio.Semaphore(20)
            async def f(cid):
                async with sem:
                    return await _fetch_single_provider(provider, "get_series", category_id=cid)
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
        elif len(providers) > 1:
            # Multi-provider: aggregate from all providers
            cats = await cached_fetch(CACHE_SERIES_CATEGORIES, "get_series_categories")
            cat_ids = set(c["category_id"] for c in cats if c.get("category_id"))
            sem = asyncio.Semaphore(20)
            async def f(cid):
                async with sem:
                    return await fetch_all_providers("get_series", category_id=cid)
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
        else:
            # Single provider — original path
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
    except (TimeoutError, HTTPException) as e:
        log.error(f"Series search error: {e}")
        return []

async def search_from_cache(
    query: str,
    prefix: str,
    id_field: str,
    name_fields: tuple[str, ...] = ("name",),
    cache: dict | None = None,
) -> list:
    """Scan ALL cache entries with a given prefix, return ALL matches."""
    if cache is None:
        from state import _cache
        cache = _cache
    seen: set = set()
    out: list = []
    for key, (_ts, data) in cache.items():
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


async def search_live_channels(query: str, provider_idx: int = -1) -> list:
    """Search live channels by name from cache."""
    from state import CACHE_LIVE_ALL
    from iptv_client import cached_fetch
    try:
        all_live = await cached_fetch(CACHE_LIVE_ALL, "get_live_streams")
        return [ch for ch in all_live if query in (ch.get("name") or "").lower()]
    except Exception:
        return []
