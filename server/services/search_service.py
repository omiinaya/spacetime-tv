"""Service layer for search operations extracted from routes/search.py."""
import asyncio
import logging

from fastapi import HTTPException

from iptv_client import cached_fetch
from state import CACHE_SERIES_CAT, CACHE_SERIES_CATEGORIES, CACHE_VOD_CAT, CACHE_VOD_CATEGORIES

log = logging.getLogger("spacetime-tv")

async def search_all_vod(query: str) -> list:
    """Fetch all VOD streams matching query, using cached fetch per category."""
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
    except (TimeoutError, HTTPException) as e:
        log.error(f"VOD search error: {e}")
        return []

async def search_all_series(query: str) -> list:
    """Fetch all series matching query, using cached fetch per category."""
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
    except (TimeoutError, HTTPException) as e:
        log.error(f"Series search error: {e}")
        return []
