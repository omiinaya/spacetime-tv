# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.24 — Upgrade lucide-react 0.577.0 → 1.21.0
Major version bump from v0 to v1. Check for icon renames or removed icons
(Tv, CalendarClock, Film, Tv2, Search, Heart, Menu, X, Settings, Activity,
Database, AlertTriangle, Radio, Clock, BarChart3, Trash2, RefreshCw,
RotateCcw, Loader2 must all exist). Verify TreeShaking still works.
**Filed**: 2026-06-26

### P2.3 — Episode watched badges on season tabs in SeriesOverlay
The EpisodeGrid already shows green checkmarks for watched episodes
(≥90% progress), but the season tabs don't reflect which seasons have
watched episodes. Add a small progress indicator or "X/Y watched" count
on each season tab so users know which seasons they've started.
**Filed**: 2026-06-26

### P2.4 — Guide keyboard navigation improvements
The TV Guide currently supports mouse/touch navigation but lacks
keyboard arrow-key support for navigating between channels and
programmes. Add keyboard focus management with arrow keys to move
up/down between channels and left/right between time slots.
**Filed**: 2026-06-26

---

## Monitoring

### P3.8 — ManagedMediaSource API for MSE optimization
Research complete (2026-06-26):
- hls.js latest stable still v1.6.16. Beta v1.7.0-beta.1 with MMS support
  has many canary builds but hasn't shipped stable yet.
- mpegts.js ^1.8.0 — needs separate investigation for MMS support.
- **Action**: upgrade hls.js from beta once v1.7.0 stable ships. Monitor
  hls.js releases for "sourceended" event recovery for ManagedMediaSource.

---

## Recently Completed

### P2.2 — Cache hit/miss metrics in admin dashboard
Added `_cache_hits` and `_cache_misses` counters to the in-memory cache
system. Track every `cached_fetch()` call and expose counts and hit_rate
via `/api/admin/stats`. Display a "Cache Hit Rate" card on the AdminDashboard
so operators can monitor cache effectiveness. Useful for tuning cache TTLs
and warm strategies.
✅ Done: server/main.py, web/src/pages/AdminDashboard.tsx — 31 backend tests
pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-26

### P3.23 — Upgrade Vite 6.4.3 → 8.1.0 + @vitejs/plugin-react 5.2.0 → 6.0.3
Successful upgrade completed (2026-06-26):
- Vite 8 brings Rolndown-based bundling — build took 1.87s (was 8.76s, 4.7× faster)
- Changed manualChunks from object to function form for Rolldown compat
- @tailwindcss/vite fully compatible (supports Vite ^8)
- All 71 tests pass (31 backend + 40 frontend), TypeScript and build clean
✅ Done: web/package.json, web/vite.config.ts — committed and pushed.

### P2.1 — React 19 + React Router v7 migration
Major upgrade completed (2026-06-26):
- React 18.3.1 → 19.2.7, react-dom 18.3.1 → 19.2.7
- react-router-dom 6.30.4 → 7.18.0
- @types/react 18.3.31 → 19.2.17, @types/react-dom 18.3.7 → 19.2.3
- No breaking changes encountered — React 19 backward-compatible with existing
  patterns (children as ReactNode, no forwardRef usage), React Router v7
  library-mode fully compatible with v6 BrowserRouter/Routes/Route API.
- TypeScript clean, 31 backend tests pass, build succeeds (8.76s).
✅ Done: web/package.json, web/package-lock.json — committed and pushed.

### P3.22 — Monitor Vite 8 + @vitejs/plugin-react v6
✅ COMPLETED — Vite 8.1.0 and @vitejs/plugin-react 6.0.3 successfully deployed.
See P3.23 above. (Moved from Monitoring section upon completion.)

### P3.21 — Admin dashboard: search query analytics
Added search query analytics to admin dashboard:
- In-memory ring buffer (last 1000 queries, anonymized, capped at 80 chars)
- `record_search()` called from `/api/search` endpoint
- `searches` field in `/api/admin/stats` response (total + last 20)
- New "Recent Searches" card with timestamps in AdminDashboard UI
✅ Done: server/main.py, web/src/pages/AdminDashboard.tsx — 31 backend tests
pass, TypeScript clean, build succeeds (8.50s), committed and pushed.

### P3.20 — Live TV search result enrichment with EPG now-playing
Live TV search results now show the current EPG programme title below
the channel name, matching the LiveTV page now-playing display. Uses
the existing `useNowPlaying` hook (30s auto-refresh). Added to Search.tsx.
✅ Done: web/src/pages/Search.tsx — TypeScript clean, 31 backend tests
pass, build succeeds (6.93s), committed and pushed.


