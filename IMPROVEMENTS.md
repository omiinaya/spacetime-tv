# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

*No pending items — backlog is empty!* 🎉

---

## Recently Completed

### P3.22 — Add component tests for Pagination, Skeleton, and ContentRow
✅ Done: Pagination.test.tsx (26 tests), Skeleton.test.tsx (23 tests),
ContentRow.test.tsx (18 tests). All utility components now have coverage
covering rendering, props, loading states, keyboard nav, scroll behavior,
and edge cases. — 642 frontend tests pass (29 files), TS clean.

### P3.23 — Add lib tests for watchlist, searchHistory, settings
✅ Done: watchlist.test.ts (25 tests — movies + series CRUD, MAX_ITEMS,
independence), searchHistory.test.ts (18 tests — add/dedup/cap/clear/trim/
length guard), settings.test.ts (44 tests — load/save, prefix extraction,
service detection, adult detection, filterCategories with language/service/
adult/hidden combos, collectAllPrefixes, collectAllServices).
729 frontend tests pass (32 files), 69 backend tests pass, TS clean.

### P3.21 — Add component tests for OfflineBanner, ChannelRow, PWAInstallPrompt
✅ Done: OfflineBanner.test.tsx (11 tests), ChannelRow.test.tsx (25 tests),
PWAInstallPrompt.test.tsx (12 tests). — 575 frontend tests pass (26 files),
TS clean.

### P3.14 — Migrate to React Router v8
✅ Done: switched from `react-router-dom` v7.18.0 to `react-router` v8.0.1.
react-router-dom was merged into react-router in v8. Updated 30 import lines
across the codebase, 8 test file mocks, and package.json. 575 tests pass
(was 554), TypeScript clean. Committed and pushed.

### P3.17 — hls.js dependency status
✅ Already on latest available hls.js (`^1.7.0-beta.1`). No stable v1.7.0
published on npm — latest tag is 1.6.16, latest overall is 1.7.0-beta.1
(already in use). No action needed. Canary builds (`1.7.0-beta.1.0.canary.*`)
are dev builds with no stable milestone in sight.

### P3.20 — Add component tests for PersonPage
| ✅ Done: web/src/pages/__tests__/PersonPage.test.tsx — 25 component tests
| covering loading spinner, error states (no name, no results, API failure,
| Go-back navigation), person header (name, photo, roles, birthday/age, TMDB
| link), missing-data edge cases (no photo, no birthday, empty credits), known-for
| credit grid (movie/TV titles, type badges, movie→movie search navigation,
| TV→series search navigation, poster images), back button navigation.
| — 527 frontend tests pass (23 files), 69 backend tests pass, TypeScript clean.
**Filed**: 2026-06-27

### P3.19 — Add component tests for AdminDashboard
| ✅ Done: web/src/pages/__tests__/AdminDashboard.test.tsx — 18 component tests
| covering loading spinner, error/retry states, stats card rendering,
| cache control buttons (Clear/Warm/Full Rewarm), EPG refresh trigger,
| popular content table (populated + empty), error log (populated + empty),
| search queries (populated + empty), and negative hit rate display.
| — 502 frontend tests pass (22 files), TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.18 — Fix SettingsPage component tests (12 failures → 484 pass)
✅ Done: 12 test failures in SettingsPage.test.tsx — all fixed. Root causes:
duplicate text elements (getAllByText for counts like "3"/"1"/"4"), "All"
button ambiguity in Language vs Service sections (within() scoping), full
category_name display without prefix stripping ("EN| Entertainment" not
"Entertainment"), and multiple type badges ("Movies"/"Series" per category).
— 484 frontend tests pass (21 files), TypeScript clean, 69 backend tests pass,
committed and pushed.
**Filed**: 2026-06-27

### P3.16 — Add component tests for WatchlistPage
| ✅ Done: web/src/pages/__tests__/WatchlistPage.test.tsx — 37 component tests
| covering loading/error/empty states, movies tab (card rendering, ratings,
| remove from watchlist, MovieOverlay), series tab (detail fetching, badges,
| SeriesOverlay), tab switching, header, and CTA navigation.
|— 444 frontend tests pass (20 files), TypeScript clean, committed and pushed.
**Filed**: 2026-06-27
