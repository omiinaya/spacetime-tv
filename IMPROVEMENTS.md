# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.14 — Search page TMDB enrichment
Search results currently show basic provider data (name, icon, rating). Could
enrich movie/series results with TMDB posters, genres, and ratings when
TMDB IDs are available.
**Filed**: 2026-06-26

### P3.16 — Search page category filter tabs
Search results currently show all types in one list. Add tab bar to filter
between All/Movies/Series/Live categories above results for quicker scanning.
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

### Actor/person browsing — TMDB person search, PersonPage with filmography
TMDB person search + detail via tmdb-enrich CLI (no API key). PersonPage with
bio, photo, birthday, roles, and filmography grid. Clickable cast chips in
MovieOverlay and SeriesOverlay.
✅ Done: web/src/pages/PersonPage.tsx, web/src/App.tsx — TypeScript clean, 28 backend tests pass, committed and pushed.

*(Older completed entries purged per cleanup policy)*
