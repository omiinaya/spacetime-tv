# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.40 — Episode number badges in SeriesOverlay episode grid
The episode selection grid in SeriesOverlay currently shows thumbnails
and titles but no episode number badge. Adding the episode number
(e.g., "E03") as a small overlay badge on each episode thumbnail
improves scannability, especially for series with many episodes
per season.
**Action**: Add episode number overlay badge on episode thumbnails
in `SeriesOverlay.tsx`.
**Filed**: 2026-06-26

### P3.41 — Add tests for loadServerProgress() merge helper
P3.37 added the `loadServerProgress()` function that merges server-side
watch progress with local continue-watching state. This function has
non-trivial merge logic (dedup by key, timestamp comparison, fallback
on network error) that should be covered by unit tests.
**Action**: Add vitest tests for `loadServerProgress()` in
`web/src/lib/__tests__/continueWatching.test.ts` covering:
- Happy path: server returns entries that merge correctly
- Conflict resolution: server entry newer vs local entry newer
- Server unreachable: falls back to local data
- No server data: returns local data unchanged
- Mixed series + movie entries
**Filed**: 2026-06-27

### P3.42 — useVideoPlayer refactor Phase 2: extract playback paths
P3.36 Phase 1 extracted types, constants, and utilities into separate
files. Phase 2 should extract the actual playback setup/teardown logic
for each path into the sub-hooks:
- `useMpegtsPlayer`: mpegts.js player creation, mpegts events, liveSync
- `useHlsPlayer`: Hls.js setup, HLS events, level switching
- `useRemuxPlayer`: direct video element assignment with remux URLs
The main hook should delegate to these sub-hooks, keeping only
shared state management (phase, error, retry, progress save).
**Filed**: 2026-06-27

---

## Monitoring

### P3.8 — ManagedMediaSource API for MSE optimization
Research update (2026-06-26):
- hls.js latest stable still v1.6.16 (April 2026). Beta v1.7.0-beta.1 (June 2, 2026)
  adds I-frame playlist support, improved protected content playback, CMCD v2,
  smoother audio switching, and parallel init-segment loading. No stable v1.7.0
  shipped yet. Latest canary `1.7.0-beta.1.0.canary.11864` available but not
  recommended for production.
- mpegts.js v1.8.0 ✅ — supports ManagedMediaSource API for iOS Safari
  (iOS 17.1+). Already installed (^1.8.0). MMS is automatically used
  when available; no config changes needed.
- **Action**: upgrade hls.js from beta once v1.7.0 stable ships. Monitor
  hls.js releases for "sourceended" event recovery for ManagedMediaSource.

---

## Recently Completed

### P3.39 — TMDB responsive images with srcset for posters
Added `tmdbImageUrl`, `tmdbSrcset`, `tmdbImgProps` helpers to api.ts.
Updated all components (HomePage, Movies, Series, MovieOverlay,
SeriesOverlay, TmdbSimilarMovies, Search) to use responsive srcset
for TMDB poster/backdrop images. Added 14 new unit tests for the
helpers. Mobile browsers now download only the image size needed.
✅ Done: web/src/lib/api.ts, web/src/lib/api.test.ts,
       web/src/pages/{Movies,Series,HomePage,Search}.tsx,
       web/src/components/{MovieOverlay,SeriesOverlay,
         MediaOverlay,TmdbSimilarMovies}.tsx
— 38 backend + 79 frontend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.38 — Series page pagination controls (numbered pages)
Added "Show All" button on each ContentRow with >20 items.
Show All mode renders a paginated grid view (50 per page) with
numbered page controls, jump-to-page input, and back-to-categories
button. Reuses the existing Pagination component from Movies page.
✅ Done: web/src/pages/Series.tsx
— 66 frontend + 38 backend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-26

### P3.37 — Frontend integration of server-side watch progress
Added `loadServerProgress()` merge helper that fetches progress
from the server (synced via PWA background sync from other devices)
and merges with local continue-watching, keeping the most recent
entry per series-episode or movieId. Wired into HomePage and Movies
page with a two-phase load: instant first paint from local, then
progressive enhancement from server.
✅ Done: web/src/lib/continueWatching.ts, web/src/lib/api.ts,
       web/src/pages/HomePage.tsx, web/src/pages/Movies.tsx
— 38 backend + 66 frontend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.36 — Refactor useVideoPlayer.ts into smaller composables (Phase 1)
Extracted types, constants, and utility functions into usePlayerTypes.ts
and usePlayerUtils.ts (~500 lines removed from main hook). Created
scaffold files for sub-hooks (useMpegtsPlayer, useRemuxPlayer, useHlsPlayer)
for future extraction of playback setup functions. The main hook now imports
from the extracted modules while keeping the same public API.
✅ Done: web/src/hooks/usePlayerTypes.ts, web/src/hooks/usePlayerUtils.ts,
       web/src/hooks/useMpegtsPlayer.ts, web/src/hooks/useRemuxPlayer.ts,
       web/src/hooks/useHlsPlayer.ts, web/src/hooks/useVideoPlayer.ts
— 38 backend tests + 66 frontend tests pass, TypeScript clean.
**Filed**: 2026-06-27

### P3.35 — Frontend component test coverage for Player
Added vitest tests covering fmtTime, QUALITIES, useVideoPlayer hook
(type derivation, initial state, controls, retry stream, resume prompt),
and Player component rendering. Added @testing-library/react + jest-dom dev deps.
✅ Done: web/src/hooks/__tests__/useVideoPlayer.test.ts,
       web/src/components/__tests__/Player.test.tsx,
       web/src/test-setup.ts, web/vite.config.ts, web/package.json
— 66 frontend tests + 38 backend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-26

### P3.34 — Server-side progress persistence for background sync
Added file-based progress store, POST/GET endpoints for sync-progress.
✅ Done: server/main.py, server/tests/test_progress.py, server/tests/conftest.py
**Filed**: 2026-06-26

### P3.33 — PWA background sync for watchlist/watch progress
Added IndexedDB queue, sync event handler in service worker, periodic register.
✅ Done: web/public/sw.js, web/src/lib/watchProgressSync.ts,
       web/src/hooks/useVideoPlayer.ts, server/main.py
**Filed**: 2026-06-26

### P3.32 — Enable hls.js Web Worker for off-thread parsing
Changed enableWorker: false → true for reduced main-thread CPU.
✅ Done: web/src/hooks/useVideoPlayer.ts
**Filed**: 2026-06-26

### P3.31 — Keyboard shortcut registry (global shortcuts hub)
Central useKeyboardShortcuts hook with g→Guide, h→Home, m→Movies, s→Series, ?→shortcuts overlay.
✅ Done: web/src/hooks/useKeyboardShortcuts.ts, web/src/components/KeyboardShortcuts.tsx
**Filed**: 2026-06-26
