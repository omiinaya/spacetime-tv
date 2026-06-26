# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.21 — Admin dashboard: search query analytics
The admin dashboard shows cache stats, popular content, and error logs.
Add a section showing popular/recent search queries so operators can
see what users are looking for. Store anonymized search terms in a
ring buffer (in-memory, last 1000 queries).
**Filed**: 2026-06-26

### P3.23 — Upgrade @vitejs/plugin-react 5.2.0 → 6.0.3 + Vite 6.4.3 → 8.1.0
Combined upgrade: plugin-react v6 requires Vite ^8.0.0. Vite 8 drops Node 20
support (we're on Node 22.23.1 — fine). New features include Rolldown-based
bundling, improved CSS handling, and faster HMR. Test compatibility thoroughly.
**Filed**: 2026-06-26

### P3.24 — Upgrade lucide-react 0.577.0 → 1.21.0
Major version bump from v0 to v1. Check for icon renames or removed icons
(Tv, CalendarClock, Film, Tv2, Search, Heart, Menu, X, Settings, Activity,
Database, AlertTriangle, Radio, Clock, BarChart3, Trash2, RefreshCw,
RotateCcw, Loader2 must all exist). Verify TreeShaking still works.
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

### P3.22 — Monitor Vite 8 + @vitejs/plugin-react v6
Vite 8.1.0 and @vitejs/plugin-react 6.0.3 are available but need
compatibility verification. Plugin-react v6 requires Vite 6+ and has
new RSC/AST-based transform. Vite 8 drops Node 20 support. Test with
current setup before upgrading.
**Filed**: 2026-06-26

---

## Recently Completed

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

### P3.20 — Live TV search result enrichment with EPG now-playing
Live TV search results now show the current EPG programme title below
the channel name, matching the LiveTV page now-playing display. Uses
the existing `useNowPlaying` hook (30s auto-refresh). Added to Search.tsx.
✅ Done: web/src/pages/Search.tsx — TypeScript clean, 31 backend tests
pass, build succeeds (6.93s), committed and pushed.

### P3.19 — Search result pagination / "Load more"
Added `limit` (default 20, max 50), `offset`, and `section` params to
`/api/search`. The endpoint now returns `totals` per category so the
frontend knows whether more results are available. The Search page has
"Load more" buttons below each section (Live, Movies, Series) that load
the next 20 items and append them. Buttons show visible count vs total
(e.g. "Load more movies (20 of 156)"), with a spinner while loading.
Backwards-compatible — old calls without pagination params work identically.
✅ Done: server/main.py, web/src/lib/api.ts, web/src/pages/Search.tsx,
server/tests/test_search.py — 31 backend tests pass, TypeScript clean,
build succeeds (8.24s), committed and pushed.

### P3.18 — Clean up remaining `any` type casts
Removed all 12 `as any` casts across 6 files (Player.tsx, MovieOverlay.tsx,
SeriesOverlay.tsx, PWAInstallPrompt.tsx, useFullscreen.ts, useVideoPlayer.ts).
Replaced with proper typed interfaces: `DocumentWithWebkit`,
`VideoElementWithWebkit`, `WindowWithMSStream`, and `TmdbInfoShape` (shared API
type). Also fixed `episode_run_time` (number → number[]) and `seasons.poster_path`
(string | null → string | undefined) in the shared type to match the local
`TmdbEnrichment` contracts.
✅ Done: web/src/lib/api.ts, web/src/hooks/useFullscreen.ts,
web/src/hooks/useVideoPlayer.ts, web/src/components/PWAInstallPrompt.tsx,
web/src/components/Player.tsx, web/src/components/MovieOverlay.tsx,
web/src/components/SeriesOverlay.tsx — TypeScript clean, 30 backend tests pass,
build succeeds (7.85s).

### P3.17 — Search result sorting options
Added a sort button bar below the category filter tabs with three options:
Relevance (default), Name A–Z (alphabetical), and Rating (highest first, uses
TMDB enrichment rating when available, falls back to rating_5based). Works
within the active filter tab.
✅ Done: web/src/pages/Search.tsx — TypeScript clean, 30 backend tests pass,
build succeeds (7.13s), committed and pushed.

### P3.16 — Search page category filter tabs
Added tab bar above search results to filter between All/Live/Movies/Series
categories. Each tab shows the result count. Uses memoized filtered results
to only render the active section. Pattern matches the LiveTV category tab bar.
✅ Done: web/src/pages/Search.tsx — TypeScript clean, 30 backend tests pass, committed and pushed.

### P3.14 — Search page TMDB enrichment
Added batch `/api/search/enrich` endpoint that fetches TMDB genres,
ratings, and poster paths for movies/series items with TMDB IDs.
Search page now shows TMDB poster artwork (with fallback), TMDB rating
badge overlay on posters, and genre badges below titles.
Uses TMDB_API_KEY path when available, falls back to tmdb-enrich CLI.
✅ Done: server/main.py, web/src/lib/api.ts, web/src/pages/Search.tsx — 30 backend tests pass, TypeScript clean, committed and pushed.
