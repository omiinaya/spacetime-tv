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

### P3.8 — Explore: ManagedMediaSource API for MSE optimization
Modern browsers support `ManagedMediaSource` (Chrome 120+, Safari 17+) which
handles MSE SourceBuffer management more efficiently. Could replace raw MSE 
usage in hls.js or add as an optimization for direct MPEG-TS playback.
- hls.js v1.6+ already has partial ManagedMediaSource support
- Worth testing when we upgrade to Tailwind v4 / refresh the player

### Stream hit tracking persistence
Admin dashboard popular content now persists across server restarts via
`/tmp/stv_stream_hits.json`. Loaded on startup, saved on every stream play.
Prevents the "No stream data yet" message from appearing after every restart.
✅ Done: server/main.py — 28 tests pass, committed and pushed.

---|---

## Recently Completed

### Channel favorites for Live TV & Guide
Added star/toggle favorites on Live TV channel cards and Guide ChannelRow. Favorites
are persisted to localStorage and shown in a dedicated "⭐ Favorites" section at the
top of the LiveTV page. Star button appears on hover (opacity transition) on channel
cards. Works across both LiveTV grid and EPG Guide views.
✅ Done: web/src/hooks/useChannelFavorites.ts, web/src/pages/LiveTV.tsx,
   web/src/pages/Guide.tsx, web/src/components/ChannelRow.tsx — TypeScript clean,
   28 backend + 40 frontend tests pass.

### P3.7 — EPG programme → TMDB enrichment
Added `/api/guide/enrich` endpoint that searches TMDB movie + TV databases
for EPG programme titles and returns poster, rating, overview, year.
Frontend ProgrammeCard popover now shows TMDB poster thumbnail, rating
badge, and TMDB overview alongside existing XMLTV data. 400ms debounce
prevents spam. Graceful fallback when TMDB_API_KEY is unset.
✅ Done: server/main.py, web/src/lib/api.ts, web/src/components/ChannelRow.tsx
   — TypeScript clean, 28 backend tests pass, committed and pushed.

### P3.6 — Fix: scroll arrow buttons intercepting clicks when invisible
The left/right scroll arrow buttons in ContentRow were invisible (opacity-0) by
default but still captured click events because `opacity: 0` doesn't prevent
pointer interaction. Added `pointer-events-none` / `group-hover/row:pointer-events-auto`
to match the opacity transition. Also fixed first-click swallow on scrollable
rows with `touch-action: manipulation`.
✅ Done: web/src/components/ContentRow.tsx + 6 other scroll container files — TypeScript clean, 27 backend tests pass, committed and pushed.

### P3.6 — SSE heartbeat for stale-session recovery
Upgraded the EPG SSE keepalive from a silent comment to a real `event: ping`
with server timestamp. Frontend now tracks the last ping; if no heartbeat is
received within 90 seconds, it force-closes and reconnects the EventSource.
This prevents silent connection drops when tabs are backgrounded.
✅ Done: server/main.py, web/src/hooks/useGuideData.ts — TypeScript clean,
  27 backend tests pass, committed and pushed.

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
