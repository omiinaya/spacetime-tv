# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.27 — Admin dashboard: EPG refresh trigger
There's no manual "Refresh EPG now" button in the Admin Dashboard.
Add a `POST /api/admin/epg/refresh` endpoint that calls
`_refresh_epg_background()` and a button in the admin UI to trigger
it, showing last refresh time and status.
**Filed**: 2026-06-26

### P3.28 — Enable MSE-in-Workers for mpegts.js (performance)
mpegts.js v1.8.0 supports MSE-in-Workers (`config.enableWorkerForMSE`)
for offloading MSE processing to a Web Worker. Can reduce main-thread
jank during playback, especially on low-end devices.
**Action**: Set `enableWorkerForMSE: true` in both live and VOD
player configurations. Test on real devices for compatibility.
**Filed**: 2026-06-26

### P3.29 — Enable liveSync for mpegts.js live playback
mpegts.js v1.8.0 supports `config.liveSync` for smoother live latency
chasing by adjusting playback rate. Currently live buffer uses
`liveBufferLatencyChasing: false`. Enabling liveSync + tuning
parameters could reduce live delay naturally without abrupt seeks.
**Action**: Enable `liveSync: true` in live player config, test
behaviour with real streams.
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

### P3.22 — Monitor Vite 8 + @vitejs/plugin-react v6
✅ COMPLETED — Vite 8.1.0 and @vitejs/plugin-react 6.0.3 successfully deployed.
Moved here from Recently Completed upon reaching the 10-entry cap.

---

## Recently Completed

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

### P2.4 — Guide keyboard navigation improvements
Arrow-key navigation for the TV Guide:
- Arrow Up/Down: move between channel rows
- Arrow Left/Right: move between programme cards within a row
- Enter/Space: navigate to watch the focused channel
- Escape: clear focus state
- Visual focus ring (ring-2 ring-primary) on focused elements
- role="grid" ARIA accessibility, auto-scroll on focus change
✅ Done: web/src/pages/Guide.tsx, web/src/components/ChannelRow.tsx — 31 backend
tests pass, 40 frontend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-26

### P2.3 — Episode watched badges on season tabs in SeriesOverlay
Added `seasonWatched` memo that counts episodes with ≥90% progress per
season from localStorage. Each season tab now shows a green ✓N alongside
the total episode count when episodes in that season have been watched.
✅ Done: web/src/components/SeriesOverlay.tsx — 31 backend tests pass,
40 frontend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-26

### P2.2 — Cache hit/miss metrics in admin dashboard
Added `_cache_hits` and `_cache_misses` counters to the in-memory cache
system. Track every `cached_fetch()` call and expose counts and hit_rate
via `/api/admin/stats`. Display a "Cache Hit Rate" card on the AdminDashboard
so operators can monitor cache effectiveness. Useful for tuning cache TTLs
and warm strategies.
✅ Done: server/main.py, web/src/pages/AdminDashboard.tsx — 31 backend tests
pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-26
