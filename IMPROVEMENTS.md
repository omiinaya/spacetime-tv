# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P2.x — Series page: TMDB "Trending This Week" row
Add a horizontal trending TV shows row on the Series page (like the Movies page has),
sourced from the new `/api/tmdb/tv/trending` backend endpoint. Shows TMDB posters,
year badges, rating, and maps clicks to the series overlay.

### P3.x — Upgrade outdated npm deps (autoprefixer, sonner, tailwind-merge)
Several npm packages have newer versions. Focus on minor/patch upgrades first:
autoprefixer 10.5.0 → 10.5.2 (minor), sonner 1.7.4 → 2.0.7 (major — review changelog),
tailwind-merge 2.6.1 → 3.6.0 (major — review changelog).

### P3.x — Add TMDB series detail enrichment to SeriesOverlay
Use the new `api.tmdb.tv.details(seriesId)` endpoint to show richer metadata
(TMDB plot, cast, creator, seasons, runtime, networks, homepage) in SeriesOverlay
when a TMDB ID is available on the series object.

## Recently Completed

### P2.x — Add TMDB TV/Series proxy endpoints to backend + frontend
Added 4 new TMDB v3 API proxy endpoints for TV content:
- `/api/tmdb/tv/trending` — trending TV shows
- `/api/tmdb/tv/search` — search TV shows
- `/api/tmdb/tv/{series_id}` — TV series details
- `/api/tmdb/tv/{series_id}/similar` — similar TV shows
Follows the same pattern as the movie endpoints (caching, key-gating, response shapes).
Added 5 TypeScript interfaces (TmdbTvResult, TmdbTvTrendingResponse, TmdbTvSearchResponse,
TmdbTvDetailsResponse, TmdbTvSimilarResponse) and 4 methods under `api.tmdb.tv.*` in the
frontend API client. Added 4 backend integration tests (no-key case). All 27 tests pass,
TypeScript compiles clean, committed and pushed.
✅ Done: server/main.py, web/src/lib/api.ts, server/test_server.py

### P2.x — Fix deprecated `regex` → `pattern` in FastAPI Query params
FastAPI deprecated `regex=` in Query in favor of `pattern=`. Replaced both occurrences
in server/main.py (tmdb_trending and tmdb_tv_trending endpoints).
✅ Done: server/main.py — `regex` → `pattern`

### P3.12 — IPTV upstream returning empty VOD/series categories
Added stale-cache fallback in `cached_fetch()`: when the provider returns an empty
list, the function now returns stale cache data if available instead of propagating
the empty result. Added upstream health warnings in `warm_cache()` for empty VOD
and series categories. This prevents cache-warming from silently doing nothing
and ensures the UI always has data to display even during upstream blips.
✅ Done: server/main.py — cached_fetch stale fallback + warmer empty-category warnings,
  23 backend tests pass, TypeScript clean, committed and pushed.

### P3.10 — Increase test_server.py timeout for guide test
Increased httpx client fixture timeout from 15s → 60s. The module-scoped client
used a 15s timeout which was too tight for EPG-first-load (which fetches XMLTV
synchronously on first call). 60s provides enough headroom for slow upstream
responses while still failing on genuinely hung requests.
✅ Done: server/test_server.py — timeout 15.0 → 60.0, 23 tests pass.

### P2.5 — EPG guide: background refresh + pre-warm in cache warmer
The `/api/guide` endpoint blocked until EPG was fully fetched/parsed during
cache expiry, causing >15s timeouts. Added:
- EPG pre-warming in `warm_cache()` so guide data is ready at startup
- `load_epg_background()` function returns stale data immediately while
  refreshing in background — no more blocking on cache expiry
- Switched `/api/guide` to use `load_epg_background()`
- Bonus: fixed `vod_cats` vs `vod_categories` cache key mismatch that
  prevented movie/series categories from being served from warm cache
✅ Done: server/main.py — `test_guide` now passes (was timing out),
  VOD categories properly cached from warmer, TypeScript clean,
  all changes committed and pushed (765c6cf)

*(Older completed entries purged per cleanup policy)*
