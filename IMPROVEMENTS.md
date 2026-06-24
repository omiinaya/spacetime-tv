# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

No pending items. See Recently Completed below.

## Recently Completed

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

### P3.11 — Show EPG age on admin dashboard
✅ Done: Already implemented — `epg_age` type defined in AdminStats interface
  and rendered as a StatCard with Clock icon on AdminDashboard.tsx line 125.
  Discovered during continuous-improvement audit on 2026-06-24.

### P3.8 — Admin dashboard auto-refresh with polling
AdminDashboard.tsx already has auto-refresh via setInterval(refresh, 30000)
— code had been shipping with polling but backlog wasn't updated.
✅ Done: Already implemented with 30s interval

### P3.9 — Frontend build optimization with code splitting
App.tsx already uses React.lazy() + Suspense for ALL route-level code splitting
— all pages are lazy-loaded via dynamic imports.
✅ Done: Already implemented with lazy imports and PageLoader fallback

### P3.7 — Expose TMDB proxy endpoints in frontend API client
Added `api.tmdb.trending()`, `api.tmdb.search()`, `api.tmdb.details()`,
`api.tmdb.similar()`, and `api.tmdb.configuration()` functions to
web/src/lib/api.ts with full TypeScript interfaces for all response types.
✅ Done: 5 methods in api.ts, 6 response interfaces (TmdbMovieResult, TmdbTrendingResponse,
  TmdbSearchResponse, TmdbDetailsResponse, TmdbSimilarResponse, TmdbConfigResponse),
  TypeScript compiles clean

### P3.6 — Add trending/popular movies section from TMDB proxy
Added "Trending This Week" horizontal scrollable row on the Movies page using
ContentRow component. Sourced from the TMDB proxy `/api/tmdb/trending` endpoint.
Shows poster, year badge, TMDB rating, play overlay, and maps clicks to matching
unified movie overlay. Gracefully hides when TMDB_API_KEY is unset.
✅ Done: Movies.tsx fetches trending on mount, renders ContentRow with TMDB cards,
  TypeScript and backend tests pass
