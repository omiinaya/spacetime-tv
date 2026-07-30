# SpacetimeTV Roadmap v6 — Current State

> **Audit date:** 2026-07-30 (Final refactor round complete)
> **Stack:** FastAPI + React 19 + Vite 8 + Tailwind v4 | 13 pages | 70+ components | 30+ hooks | 12 back-end route modules
> **Test counts:** 1,313 backend pass + 1,397 frontend pass + 74 E2E | 0 TypeScript errors | 0 production `any` types
> **CI:** GitHub Actions (lint → test → tsc → build)

## Current File Sizes (source only, no tests)

| File | Lines | Status |
|------|:-----:|--------|
| `web/src/hooks/useVideoPlayer.ts` | 901 | Complex orchestration hook — 4 sub-hooks, callbacks, cleanup |
| `web/src/pages/Series.tsx` | 407 | Latest decomposition complete ✅ |
| `web/src/pages/LiveTV.tsx` | 494 | Decomposed ✅ |
| `web/src/components/MovieOverlay.tsx` | 418 | Dense metadata overlay, could split cast/language menu |
| `web/src/pages/SettingsPage.tsx` | 259 | Decomposed ✅ |
| `web/src/App.tsx` | 399 | Decomposed ✅ |
| `server/iptv_client.py` | 497 | Provider client — well-structured service module |
| `server/auth.py` | 371 | Auth utilities — stable |
| `server/routes/guide_routes.py` | 364 | EPG routes — stable |

All other files < 350 lines.

## Recent Refactoring (last 2 sessions)

| File | Before | After | Δ |
|------|:------:|:-----:|:-:|
| **Movies.tsx** | 546 | **313** | **−43%** |
| **Search.tsx** | 521 | **107** | **−79%** |
| **WatchlistPage.tsx** | 464 | **62** | **−87%** |
| **Series.tsx** | 527 | **407** | **−23%** |

**New components (14 total):** MovieSearchBar, MovieGrid, RecentlyAddedRow, TrendingMoviesRow, WatchlistMoviesTab, WatchlistSeriesTab, SeriesSearchInput, SeriesPageSkeleton, SeriesHeader, SeriesRowSkeleton, SeriesEmptyStates, ErrorBanner, SeriesPageSkeleton
**New hook:** useSearchPage (search pipeline, caching, debounce, cancellation, sort/filter)
**Test growth:** 1,233 → 1,397 (+164 tests, +15 files)

## Remaining Work

### Frontend
- `useVideoPlayer.ts` (901 lines) — already has 4 sub-hooks extracted but still dense
- `MovieOverlay.tsx` (418 lines) — language menu, cast info, metadata sections could be extracted
- E2E test count (74) could grow for edge cases

### Backend
- record.py at 24% coverage (runtime-only ffmpeg subprocess — hard to unit test)
- state.py at 72% coverage (cache cleanup loop — runtime-only)
- Consider extracting service layer from route modules if routes grow

### Infrastructure
- ✅ CI with GitHub Actions (lint + test + tsc + build)
- ✅ Docker Compose for deployment
- ✅ Nginx + self-signed TLS
- Pre-commit hooks not auto-installed

## What's Solid
- **0 TypeScript errors** in 18k lines of production code
- **0 pre-existing test failures** in 1,397 frontend tests
- **0 `any` types** in production source
- **Clean build** with proper code splitting (hls.js, shaka-player in separate chunks)
- **Good accessibility:** alt text, aria-labels, skip-to-content, roles
- **No circular imports** in backend
- **No secrets in code**
