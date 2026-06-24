# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.10 — Increase test_server.py timeout for guide test
`test_guide` uses 15s httpx timeout which is too tight for EPG-first-load.
Increase to 60s or use module-scoped fixture with longer timeout for guide tests.
Files: server/test_server.py
Difficulty: Easy
Est: 5 min

### P3.11 — Show EPG age on admin dashboard
The health endpoint exposes `epg_age` but admin dashboard doesn't display it.
Add EPG age stat card alongside existing cache/stream stats.
Files: web/src/pages/AdminDashboard.tsx
Difficulty: Easy
Est: 10 min

### P3.12 — IPTV upstream returning empty VOD/series categories
The IPTV provider (`iptv-provider.example.com`) periodically returns empty `[]` for VOD
and series categories, preventing cache warming and causing test failures. Add
resilience: retry stale cache on empty response, log upstream health metrics.
Files: server/main.py
Difficulty: Medium
Est: 30 min

## Recently Completed

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

### P3.5 — Upgrade hls.js to v1.7.0-beta.1
Upgraded from ^1.6.16 to ^1.7.0-beta.1. Gives I-frame playlist support, smoother
audio switching, CMCD v2 analytics, faster startup, and improved live resilience.
TypeScript check passes cleanly.
✅ Done: web/package.json installed via `npm install hls.js@beta`, TypeScript compiles clean

### P3.4 — Keyboard navigation for content grids
Arrow-key navigation through movie/series grids with focus indicators.
Files: web/src/hooks/useGridKeyboardNav.ts, web/src/pages/Movies.tsx,
web/src/components/ContentRow.tsx, web/src/pages/Series.tsx
Difficulty: Medium
Est: 1h
✅ Done: useGridKeyboardNav hook for CSS grid layouts, useRowKeyboardNav for
horizontal scrollable rows. Movies grid uses arrow keys + grid column awareness.
Series ContentRow uses left/right arrow navigation with auto-scroll. Focus
indicators (ring + border highlight). All TypeScript and backend tests pass.

### P3.2 — Add tmdb v3 API fallback for richer metadata
Added 5 TMDB v3 API proxy endpoints (trending, search, movie details, similar,
configuration). All gracefully return enabled=false when TMDB_API_KEY is unset.
Config in config.py + .env.example.
✅ Done: 5 endpoints in server/main.py, 5 tests, config.py, .env.example

### P3.1 — Series watchlist (favorite series)
Watchlist previously only supported movies. Extended to series with:
- `stv_watchlist_series` localStorage key with dedicated `getSeriesWatchlist`,
  `isSeriesInWatchlist`, `toggleSeriesWatchlist` functions
- Heart button on series cards (Poster area, bottom-right, hover reveal)
- Tabbed WatchlistPage with Movies and Series tabs
- Series tab fetches details via parallel `api.series.details()` calls
✅ Done: watchlist.ts, Series.tsx, WatchlistPage.tsx

### P3.3 — Client-side search result caching
Search results weren't cached session-side. Added sessionStorage cache
with 2-minute TTL for recent searches to improve back-button experience.
✅ Done: sessionStorage cache with SEARCH_CACHE_TTL=120s in Search.tsx

### P2.2b — Watchlist page (complete P2.2)
Heart button + localStorage lib exist, but there's no `/watchlist` route/page
to browse watchlisted movies. Create dedicated page + nav item.
✅ Done: WatchlistPage.tsx created with card grid, filter by IDs, empty state, remove button
