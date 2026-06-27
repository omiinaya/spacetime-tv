# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.37 — Frontend integration of server-side watch progress
P3.34 added server-side persistence for watch progress (POST/GET
/api/watchlist/sync-progress and /api/watchlist/progress). The
frontend currently only reads progress from localStorage/IndexedDB.
On page load after reconnection, it should fetch from
`GET /api/watchlist/progress` and merge synced entries into the
continue-watching state, filling gaps when switching devices/browsers.
**Action**: Add a `loadServerProgress()` call in HomePage and
Movies page that fetches server progress on mount and merges
with local continue-watching data via a new merge helper.
**Filed**: 2026-06-26

### P3.38 — Series page infinite scroll / pagination
The Movies page has pagination (page numbers + jump-to-page) but the
Series page loads all series at once via `get_vod_streams`. For large
IPTV catalogs (1000+ series), this causes slow initial load and
unnecessary data transfer.
**Action**: Add server-side pagination support for series
(`GET /api/series?page=N&per_page=50`), build paginated
fetch in `Series.tsx`, and add page controls matching the
Movies page pattern.
**Filed**: 2026-06-26

### P3.39 — TMDB responsive images with srcset for posters
Currently all posters/backdrops use a single TMDB image size (usually
w500 or original). TMDB serves multiple sizes (w92, w154, w185, w342,
w500, w780, original). Adding `srcset` + `sizes` attributes on movie
and series poster/backdrop images would reduce mobile data usage by
downloading only the size needed for the viewport.
**Action**: Update `imageUrl()` in `api.ts` to accept a `size` param;
add a `srcset` helper that generates TMDB srcset string; apply to
poster images in MovieCard, SeriesCard, and detail views.
**Filed**: 2026-06-26

### P3.40 — Episode number badges in SeriesOverlay episode grid
The episode selection grid in SeriesOverlay currently shows thumbnails
and titles but no episode number badge. Adding the episode number
(e.g., "E03") as a small overlay badge on each episode thumbnail
improves scannability, especially for series with many episodes
per season.
**Action**: Add episode number overlay badge on episode thumbnails
in `SeriesOverlay.tsx`.
**Filed**: 2026-06-26

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

### P3.22 — Monitor Vite 8 + @vitejs/plugin-react v6
✅ COMPLETED — Vite 8.1.0 and @vitejs/plugin-react 6.0.3 deployed.

### P3.30 — EPG search/filter bar for TV Guide
Search bar filters programmes by title/subtitle/category/desc across all channels.
✅ Done: web/src/pages/Guide.tsx
**Filed**: 2026-06-26

### P3.29 — Enable liveSync for mpegts.js live playback
Enabled liveSync with tuned parameters for smoother latency chasing.
✅ Done: web/src/hooks/useVideoPlayer.ts
**Filed**: 2026-06-26
