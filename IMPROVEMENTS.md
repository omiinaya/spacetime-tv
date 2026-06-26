# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.11 — Upgrade outdated npm packages (non-breaking)
Several npm packages have newer versions:
- `@vitejs/plugin-react`: 4.7.0 → 6.0.3
- `lucide-react`: 0.441.0 → 1.21.0
- `typescript`: 5.9.3 → 6.0.3
- `vite`: 6.4.3 → 8.1.0
- `react`/`react-dom`: 18.3.1 → 19.2.7 (needs careful testing)
- `react-router-dom`: 6.30.4 → 7.18.0 (breaking — data router APIs)
**Filed**: 2026-06-26 — tackle non-breaking upgrades first.

### P3.12 — TMDB "Recommended Movies" in MovieOverlay
SimilarMovies currently loads same-category movies from the IPTV provider. Could
add a second "TMDB Recommendations" row when TMDB ID is available, using the
existing `/api/tmdb/movie/{id}/similar` endpoint.
**Filed**: 2026-06-26

### P3.13 — Live TV category filtering
The LiveTV page shows all channels in a grid but doesn't let users filter by
category. Add a category selector/bar above the grid to filter visible channels.
**Filed**: 2026-06-26

### P3.14 — Search page TMDB enrichment
Search results currently show basic provider data (name, icon, rating). Could
enrich movie/series results with TMDB posters, genres, and ratings when
TMDB IDs are available.
**Filed**: 2026-06-26

---

## Monitoring

### P3.8 — ManagedMediaSource API for MSE optimization
Research complete this tick (2026-06-26):
- hls.js ^1.7.0-beta.1 already includes ManagedMediaSource recovery support.
- hls.js v1.7.0 stable has NOT shipped yet (latest beta is same beta.1 with
  many canary builds after). Latest stable is v1.6.16.
- mpegts.js ^1.8.0 (latest) — needs separate investigation for MMS support.
- Not Baseline yet — some browsers lack support.
- **Action**: upgrade hls.js from beta once v1.7.0 stable ships. Monitor
  hls.js releases for "sourceended" event recovery for ManagedMediaSource.

---

## Recently Completed

### P3.10 — "More Like This" (Similar TV Shows) for SeriesOverlay
Created SimilarSeries component (mirroring SimilarMovies pattern) that loads
other series from the same category via `/api/series?category_id=...`. Wired
into SeriesOverlay with a horizontal scrollable row at the bottom of the overlay.
✅ Done: web/src/components/SimilarSeries.tsx, SeriesOverlay.tsx — TypeScript clean, 28 backend tests pass, committed and pushed.

### P3.x — Vite 6 upgrade (shipped)
Upgraded Vite from ^5.4.2 (5.4.21) to ^6.4.3. Companions already compatible:
@vitejs/plugin-react 4.7.0, vitest 4.1.9, @tailwindcss/vite 4.3.1.
✅ Done: web/package.json, web/package-lock.json — TypeScript clean, 28 backend tests pass, build succeeds (1618 modules, 7.54s), committed and pushed.

### Actor/person browsing — TMDB person search, PersonPage with filmography
TMDB person search + detail via tmdb-enrich CLI (no API key). PersonPage with
bio, photo, birthday, roles, and filmography grid. Clickable cast chips in
MovieOverlay and SeriesOverlay.
✅ Done: web/src/pages/PersonPage.tsx, web/src/App.tsx — TypeScript clean, 28 backend tests pass, committed and pushed.

### P3.2 — Tailwind CSS v4 migration (shipped)
Migrated from postcss+JS-config to @tailwindcss/vite + CSS @theme. Removed
postcss, autoprefixer, tailwind.config.js. Upgraded tailwind-merge to v3.
✅ Done: web/vite.config.ts, web/src/index.css — TypeScript clean, 28 backend tests pass, build succeeds, committed and pushed.

### HomePage polish (loading skeletons + episode progress + continue-watching cleanup)
Loading skeletons always show for trending rows (not hidden when CW exists).
"View all →" links on trending rows navigate to Movies/Series. Episode progress
indicators in series grid (checkmark for ≥90%, progress bar for in-progress).
✅ Done: web/src/pages/HomePage.tsx, web/src/components/SeriesOverlay.tsx — TypeScript clean, committed and pushed.

### Recently played live channels + batch stream info API
Backend `/api/streams/batch-info` endpoint for bulk channel info. Recently
played channels row on HomePage (last 8, persisted in localStorage).
✅ Done: server/main.py, web/src/pages/HomePage.tsx, web/src/lib/recentChannels.ts — 28 tests pass, committed and pushed.

### Now-playing EPG programme info on LiveTV channel cards
`/api/guide/now` batch endpoint + `useNowPlaying` hook. Fetches current programme
for the first 200 visible channels every 30s. Programme title shown as subtitle
on channel grid cards.
✅ Done: server/main.py, web/src/hooks/useNowPlaying.ts, web/src/pages/LiveTV.tsx — 28 tests pass, committed and pushed.

### Channel number badges on LiveTV grid cards
Channel number badges (top-left) on all LiveTV grid cards. Shows when `num > 0`.
✅ Done: web/src/pages/LiveTV.tsx — TypeScript clean, committed and pushed.

### VOD timeline scrubbing fixes (3 fixes for movies + series)
Fixed VOD timeline scrubbing for both movies and series: seek position handling,
progress bar sync, and continue-watching resume position accuracy.
✅ Done: web/src/hooks/useVideoPlayer.ts, web/src/lib/continueWatching.ts — TypeScript clean, committed and pushed.

### Live TV channel favorites
Star button on channel cards and guide rows to favorite channels. Favorites
section appears above the channel grid. localStorage-backed persistence via
`useChannelFavorites` hook (Set<stream_id>). Toggle button with count badge
next to search bar for favorites-only filter.
✅ Done: web/src/hooks/useChannelFavorites.ts, ChannelRow.tsx, LiveTV.tsx — TypeScript clean, committed and pushed.

*(Older completed entries purged per cleanup policy)*
