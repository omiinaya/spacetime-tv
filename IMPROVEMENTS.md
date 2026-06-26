# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.19 — Search result pagination / "Load more"
Current search endpoint caps at 20 results per category with no way to
load more. Add limit/offset params to the search endpoint and "Load more"
button on the search page for each section that has additional results.
**Filed**: 2026-06-26

### P3.20 — Live TV search result enrichment with EPG now-playing
Live TV search results currently show channel name + icon only. When a
live channel search result appears, show the current EPG programme title
below the channel name (like the main LiveTV page does with now-playing).
**Filed**: 2026-06-26

### P2.1 — React 19 + React Router v7 migration
Major upgrade: React 18.3.1 → 19.2.7, react-dom 18.3.1 → 19.2.7,
react-router-dom 6.30.4 → 7.18.0, @types/react 18.3.31 → 19.2.17,
@types/react-dom 18.3.7 → 19.2.3.
- React 19: concurrent features, new hooks, automatic batching improvements
- React Router v7: new data loading patterns, RRv7 router changes
- May need to update some patterns (forwardRef, children types, context)
- Keep React 18 compatibility layer if possible for a smooth migration
**Filed**: 2026-06-26

### P3.21 — Admin dashboard: add search query analytics
The admin dashboard shows cache stats, popular content, and error logs.
Add a section showing popular/recent search queries so operators can
see what users are looking for. Store anonymized search terms in a
ring buffer (in-memory, last 1000 queries).
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

### P3.15 — TMDB "Recommended TV Shows" in SeriesOverlay
Added a new `TmdbSimilarShows` component that loads TMDB similar TV series
recommendations when a TMDB ID is available on the series. Renders below the
existing provider-based "More Like This" row with TMDB poster artwork, ratings,
and year labels. Clicking navigates to a series search by title.
Uses existing `/api/tmdb/tv/{id}/similar` endpoint.
✅ Done: web/src/components/TmdbSimilarShows.tsx, SeriesOverlay.tsx — TypeScript clean, 28 backend tests pass, committed and pushed.

### P3.13 — Live TV category filtering
The LiveTV page previously locked users into a single category tab with no way
to see all channels at once. Added an "All" tab at the start of the category bar
that shows every channel across all categories (uses the existing `/api/live/all`
endpoint with infinite scroll). Now users can browse the full channel catalog or
filter down to a specific category.
✅ Done: web/src/pages/LiveTV.tsx — TypeScript clean, 28 backend tests pass.

### P3.12 — TMDB "Recommended Movies" in MovieOverlay
Added a new `TmdbSimilarMovies` component that loads TMDB similar movie
recommendations when a TMDB ID is available on the movie. Renders below the
existing provider-based "More Like This" row with TMDB poster artwork, ratings,
and year labels. Clicking navigates to a provider search by title.
✅ Done: web/src/components/TmdbSimilarMovies.tsx, MovieOverlay.tsx — TypeScript clean, 28 backend tests pass, committed and pushed.

### P3.11 — Upgrade outdated npm packages (non-breaking batch)
Upgraded three packages on the non-breaking path:
- TypeScript 5.9.3 → 6.0.3: added `"ignoreDeprecations": "6.0"` to
  tsconfig.json for the `baseUrl`+`paths` deprecation. No code changes needed.
- @vitejs/plugin-react 4.7.0 → 5.2.0: compatible with React 18 + Vite 6;
  v6.x would require React 19.
- lucide-react 0.441.0 → 0.577.0: latest v0 release. All icon names unchanged.
✅ Done: web/package.json, web/tsconfig.json — tsc clean, 28 backend tests pass, build succeeds (8.22s), committed and pushed (2 commits).

### P3.10 — "More Like This" (Similar TV Shows) for SeriesOverlay
Created SimilarSeries component (mirroring SimilarMovies pattern) that loads
other series from the same category via `/api/series?category_id=...`. Wired
into SeriesOverlay with a horizontal scrollable row at the bottom of the overlay.
✅ Done: web/src/components/SimilarSeries.tsx, SeriesOverlay.tsx — TypeScript clean, 28 backend tests pass, committed and pushed.

### P3.x — Vite 6 upgrade (shipped)
Upgraded Vite from ^5.4.2 (5.4.21) to ^6.4.3. Companions already compatible:
@vitejs/plugin-react 4.7.0, vitest 4.1.9, @tailwindcss/vite 4.3.1.
✅ Done: web/package.json, web/package-lock.json — TypeScript clean, 28 backend tests pass, build succeeds (1618 modules, 7.54s), committed and pushed.

*(Older completed entries purged per cleanup policy)*
