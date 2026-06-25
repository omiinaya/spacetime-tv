# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.2 — Tailwind CSS v4 migration planning
tailwind-merge v3+ requires Tailwind CSS v4 (it drops v3 support). We're on
Tailwind 3.4.10 and tailwind-merge 2.6.0. Latest npm versions as of this tick:
Tailwind CSS v4.3.1, tailwind-merge v3.6.0.
- Migration path: install `@tailwindcss/vite` (replaces postcss plugin), update
  `vite.config.ts`, replace `@tailwind` directives with `@import "tailwindcss"`,
  migrate `tailwind.config.js` to CSS-based config, bump `tailwind-merge` to 3.x.
- This is a significant refactor — best done in a dedicated session with UI
  verification. For now: stay on tailwind-merge ^2.6.x — no action needed.

### P3.4 — Explore: Rich EPG with program metadata
The guide endpoint currently returns raw XMLTV data. Could enrich with TMDB/IMDB
lookups to show program descriptions, ratings, and posters in the TV Guide grid.

### P3.5 — Explore: Multi-language audio track selector for VOD
Some VOD streams offer multiple audio tracks. The probe/selector UI (P4.2) could
be extended to show and switch audio tracks alongside subtitle tracks.

### P3.6 — SSE heartbeat for stale-session recovery
Currently the EPG SSE (P3.3) refreshes every 30 min. If the browser tab is in
background for extended periods, the connection may drop silently. Add a
heartbeat/ping mechanism to detect and reconnect stale SSE sessions.

### P3.7 — Explore: EPG programme → TMDB enrichment
Research done this tick: TMDB `/search/tv` and `/search/movie` endpoints can
be used to look up programme titles from XMLTV. Challenge: title matching is
often inexact (XMLTV titles differ from TMDB). Best approach: lazy enrichment
on the frontend when viewing a programme detail, rather than batch enrichment
on the backend. Could add a "/api/epg/enrich" endpoint that takes programme
title + channel info and returns TMDB metadata.

### P3.8 — Explore: ManagedMediaSource API for MSE optimization
Modern browsers support `ManagedMediaSource` (Chrome 120+, Safari 17+) which
handles MSE SourceBuffer management more efficiently. Could replace raw MSE 
usage in hls.js or add as an optimization for direct MPEG-TS playback.
- hls.js v1.6+ already has partial ManagedMediaSource support
- Worth testing when we upgrade to Tailwind v4 / refresh the player

---

## Recently Completed

### P3.3 — Image proxy server-side disk caching
Added a disk-backed L2 cache (`/tmp/stv_cache/images/`) for `/api/image-proxy`
that persists across server restarts (in-memory L1 only lasted 1 hour / 500
entries before). Uses the same access-stamp / TTL eviction pattern as the VOD
convert cache: 24-hour TTL, 500 MB total budget, 10 MB per-file limit.
Automatic cleanup integrated with the existing cleanup loop.
✅ Done: server/main.py — image disk cache L2, 27 backend tests pass, committed and pushed.

### P3.1 — Wire up retryStream in player UI
The `retryStream` callback was defined in `useVideoPlayer.ts` but not exposed
in the hook's return value. Now fully wired: returned from the hook, hooked to
a "Retry" button in the player error overlay, and the autoplay logic was also
fixed to try unmuted first before falling back to muted.
✅ Done: web/src/hooks/useVideoPlayer.ts, web/src/components/Player.tsx — TypeScript clean, committed and pushed.

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

*(Older completed entries purged per cleanup policy)*
