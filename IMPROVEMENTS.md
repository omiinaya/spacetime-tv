# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.33 — PWA background sync for watchlist/watch progress
Service Worker API `SyncManager` allows deferring data sync until the
device is online. Currently progress saving is real-time (every 5s via
`setInterval`). Network failures during saves cause data loss.
**Action**: Register a `sync` event in the service worker for
`sync-watch-progress`. Queue unsaved progress in IndexedDB, flush when
online. Use `navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-watch-progress'))`.
**Filed**: 2026-06-26

---

## Monitoring

### P3.8 — ManagedMediaSource API for MSE optimization
Research update (2026-06-26):
- hls.js latest stable still v1.6.16. Beta v1.7.0-beta.1 with MMS support
  has many canary builds but hasn't shipped stable yet.
- mpegts.js v1.8.0 ✅ — supports ManagedMediaSource API for iOS Safari
  (iOS 17.1+). Already installed (^1.8.0). MMS is automatically used
  when available; no config changes needed.
- **Action**: upgrade hls.js from beta once v1.7.0 stable ships. Monitor
  hls.js releases for "sourceended" event recovery for ManagedMediaSource.

---

## Recently Completed

### P3.32 — Enable hls.js Web Worker for off-thread parsing (performance)
Changed `enableWorker: false` → `enableWorker: true` in the HLS config
block of `useVideoPlayer.ts`. hls.js v1.7.0-beta.1 now offloads TS/MP4
segment parsing to a Web Worker, reducing main-thread CPU usage.
✅ Done: web/src/hooks/useVideoPlayer.ts
— 31 backend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-26

### P3.31 — Keyboard shortcut registry (global shortcuts hub)
Already implemented before this tick — central `useKeyboardShortcuts` hook
registers `g`→Guide, `h`→Home, `m`→Movies, `s`→Series, `?`→shortcuts overlay.
Input focus gating prevents interference while typing.
✅ Done: web/src/hooks/useKeyboardShortcuts.ts, web/src/components/KeyboardShortcuts.tsx
**Filed**: 2026-06-26

### P3.22 — Monitor Vite 8 + @vitejs/plugin-react v6
✅ COMPLETED — Vite 8.1.0 and @vitejs/plugin-react 6.0.3 successfully deployed.
Moved here from Monitoring upon completion.

### P3.30 — EPG search/filter bar for TV Guide
Guide search already implemented in commit 0789fc2 — search bar filters
programmes by title/subtitle/category/desc across all channels, shows
match count badge, clear button, and "no results" state.
✅ Already done: web/src/pages/Guide.tsx
**Filed**: 2026-06-26

### P3.29 — Enable liveSync for mpegts.js live playback
Enabled `liveSync: true` with tuned parameters in live mpegts.js config:
`liveSyncMaxLatency=2`, `liveSyncTargetLatency=1`, `liveSyncPlaybackRate=1.1`.
Smoother latency chasing via playback rate adjustment instead of abrupt seeks.
✅ Done: web/src/hooks/useVideoPlayer.ts
— 31 backend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-26

### P3.28 — Enable MSE-in-Workers for mpegts.js (performance)
mpegts.js v1.8.0 supports MSE-in-Workers (`config.enableWorkerForMSE`)
for offloading MSE processing to a Web Worker. Can reduce main-thread
jank during playback, especially on low-end devices.
✅ Done: web/src/hooks/useVideoPlayer.ts — 31 backend tests pass,
TypeScript clean, committed and pushed.
**Filed**: 2026-06-26

### P3.27 — Admin dashboard: EPG refresh trigger
Added `POST /api/admin/epg/refresh` endpoint that calls
`_refresh_epg_background()` and a "Refresh EPG Now" button in the
admin UI showing last refresh time and status.
✅ Done: server/main.py, web/src/pages/AdminDashboard.tsx
— 31 backend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-26

### P3.26 — Connection quality indicator for video player
Added real-time connection quality monitoring for both live and VOD playback:
- Tracks download speed (KB/s) from mpegts.js STATISTICS_INFO events
- Tracks playback stalls via video element `waiting` events (30s rolling window)
- Tracks dropped/decoded frame ratio for quality degradation detection
- Computes quality tier (excellent/good/fair/poor) every 3 seconds
- New 4-bar signal strength indicator in Player bottom controls
- "Lower quality" suggestion chip appears when connection is poor and a
  lower quality tier is available
- All three playback paths instrumented: live MPEG-TS, VOD remux, HLS
✅ Done: web/src/hooks/useVideoPlayer.ts, web/src/components/Player.tsx
— 31 backend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-26

### P3.25 — PWA service worker: API caching + offline indicator
Enhanced the service worker with three caching strategies:
- **Network-first** for `/api/` GET endpoints — caches responses on success,
  falls back to cached data when offline or network fails
- **Stale-while-revalidate** for TMDB image requests — serves cached
  images immediately while freshening cache in background
- **Cache-first** for static assets (unchanged)
- Added cache eviction (API: 100 entries max, images: 200 max) with
  timestamp-based trimming
- New `OfflineBanner.tsx` component — listens to `navigator.onLine` and
  `online`/`offline` events, shows amber banner when disconnected with
  `WifiOff` icon and descriptive message, auto-hides on reconnect
- Integrated OfflineBanner into `App.tsx` layout
✅ Done: web/public/sw.js, web/src/components/OfflineBanner.tsx, web/src/App.tsx
— 31 backend tests pass, 40 frontend tests pass, TypeScript clean,
committed and pushed.
**Filed**: 2026-06-26
