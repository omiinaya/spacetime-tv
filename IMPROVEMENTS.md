# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.1 — Wire up retryStream in player UI
The `retryStream` callback is defined in `useVideoPlayer.ts` but not exposed in
the hook's return value, making it dead code. Need to:
- Add `retryStream` to the returned object
- Add a "Retry" button (or tap-to-retry) to the player overlay when in error/loading-stuck state
- The button should appear when `phase === "error"` or when loading hangs

### P3.2 — Tailwind CSS v4 migration planning
tailwind-merge v3+ requires Tailwind CSS v4 (it drops v3 support). We're on
Tailwind 3.4.10 and tailwind-merge 2.6.1. When we eventually migrate to Tailwind v4:
- Install `tailwindcss` v4 and update `postcss.config` / `tailwind.config`
- Bump `tailwind-merge` to 3.x at the same time
- Review utility class changes (some old utilities removed/renamed in v4)
- For now: stay on tailwind-merge ^2.6.x — no action needed.

### P3.3 — Explore: Image proxy server-side caching
Currently `/api/image-proxy` fetches images on-demand. Could add a disk cache
layer (like the VOD convert cache) to reduce TMDB CDN load and speed up subsequent
loads. Would need a TTL-based eviction policy and size cap.

### P3.4 — Explore: Rich EPG with program metadata
The guide endpoint currently returns raw XMLTV data. Could enrich with TMDB/IMDB
lookups to show program descriptions, ratings, and posters in the TV Guide grid.

### P3.5 — Explore: Multi-language audio track selector for VOD
Some VOD streams offer multiple audio tracks. The probe/selector UI (P4.2) could
be extended to show and switch audio tracks alongside subtitle tracks.

### P3.6 — Explore: Background SSE heartbeat for stale-session recovery
Currently the EPG SSE (P3.3) refreshes every 30 min. If the browser tab is in
background for extended periods, the connection may drop silently. Add a
heartbeat/ping mechanism to detect and reconnect stale SSE sessions.

---

## Recently Completed

### P3.x — Upgrade outdated npm deps
Upgraded:
- `autoprefixer` ^10.4.20 → ^10.5.2 (minor)
- `sonner` ^1.7.0 → ^2.0.7 (major — API compatible, Toaster props unchanged)
- `tailwind-merge` evaluated: v3 drops Tailwind CSS v3 support — staying at v2
  until we migrate to Tailwind v4.
TypeScript compiles clean, 27 backend tests pass, committed and pushed.
✅ Done: web/package.json — npm install, tsc clean, all tests pass.

### P3.x — Add TMDB series detail enrichment to SeriesOverlay
Added parallel TMDB enrichment fetch in SeriesOverlay: when the series object has
a `tmdb` field (TMDB ID), the overlay now fetches TV details from the existing
`/api/tmdb/tv/{series_id}` endpoint and uses richer metadata (TMDB plot, genres,
networks, episode runtime, number of seasons/episodes, status, first air date,
backdrop, poster, homepage link, TMDB external link). Falls back gracefully when
TMDB is unavailable or ID is missing. Parallel fetch minimizes latency impact.
✅ Done: web/src/components/SeriesOverlay.tsx — TypeScript clean, 27 backend tests pass, committed and pushed.

### P2.x — Series page: TMDB "Trending This Week" row
Added a horizontal trending TV shows row on the Series page (like the Movies page has),
sourced from the `/api/tmdb/tv/trending` backend endpoint. Shows TMDB posters,
year badges, rating, and maps clicks to the series overlay.
✅ Done: web/src/pages/Series.tsx — TypeScript clean, 26 backend tests pass, committed and pushed.

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
