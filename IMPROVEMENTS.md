# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P1.1 — Backend: monolith decomposition & test coverage (HIGH RISK)
`server/main.py` is **3,234 lines** with only **31% test coverage** (69 tests).
67 API endpoints in a single file. This is the biggest risk in the project:
refactor into standalone route modules (like `routes/streams.py`,
`routes/admin.py`, `routes/categories.py`, etc.) and drive coverage to >70%.
- [ ] Extract EPG/lifespan/progress into dedicated modules
- [ ] Extract route handlers into router files
- [ ] Write integration tests for uncovered endpoints
- [ ] Target >70% coverage on main.py

### P1.2 — watchProgressSync.ts has zero coverage
IndexedDB-backed sync queue for watch progress — complex async code with
IndexedDB fallback logic. If this breaks, watch progress is silently lost.
- [ ] Write comprehensive tests for all states (online, offline, queue flush, IDB unavailable)

### P2.1 — 16 hooks have zero test coverage
These are the most critical untested modules:
- **Player hooks**: useHlsPlayer, useShakaPlayer, useMpegtsPlayer, useRemuxPlayer, useVideoPlayer, usePlayerUtils, useStreamUrls, useNowPlaying, usePlayerTypes
- **UI/UX hooks**: useGridKeyboardNav, useGuideData, useChannelFavorites, useInfiniteScroll, useKeyboardShortcuts, useFullscreen, useLockBodyScroll, useKeyboard
- [ ] Write tests for useHlsPlayer (HLS.js lifecycle, error recovery, stalled detection)
- [ ] Write tests for useGridKeyboardNav (arrow key nav, focus management)
- [ ] Write tests for useGuideData (EPG data merging, lazy loading, category filter)
- [ ] Write tests for useChannelFavorites (localStorage favorites CRUD)
- [ ] Write tests for useInfiniteScroll (IntersectionObserver, sentinel, loading guard)
- [ ] Write remaining hook tests

### P2.2 — Missing E2E / integration test layer
All 729 frontend tests are unit/component tests with mocked API responses.
No tests exercise real API calls or full user flows (search→select→play).
- [ ] Set up Playwright or MSW's lifecycle server for integration tests
- [ ] Write 2-3 critical path E2E tests (browse movies → overlay → play)

### P3.1 — Eliminate `any` type annotations (5 occurrences)
Production code has 5 `: any` types:
- `useRemuxPlayer.ts:122` — mpegts STATISTICS_INFO stats callback
- `useVideoPlayer.ts:369` — generic result variable
- `useMpegtsPlayer.ts:128` — mpegts STATISTICS_INFO stats callback
- `Search.tsx:160,163` — reduce accumulator items
- [ ] Replace each with proper typed interfaces

### P3.2 — Enable noUnusedLocals / noUnusedParameters in tsconfig
`tsconfig.json` has `"strict": true` but **not** `noUnusedLocals` or
`noUnusedParameters`. Turning these on catches dead code and stale params.
- [ ] Enable both flags
- [ ] Fix any resulting violations

### P3.3 — Eliminate non-null assertion in Guide.tsx
`web/src/pages/Guide.tsx:276` uses `group.stream_id!` — will crash at runtime
if `stream_id` is null/undefined.
- [ ] Replace with optional chaining or guard

### P4.1 — Add tests for complex untested components
- [ ] Player.tsx (largest component — ~700 lines, zero direct tests)
- [ ] MediaOverlay.tsx (stream info overlay, TMDB enrichment, language options)
- [ ] AudioSelector.tsx, SubtitleSelector.tsx (track switching)
- [ ] SleepTimer.tsx (countdown timer, time formatting)
- [ ] SettingsContext.tsx (app-wide settings provider)

### P4.2 — Add tests for smaller untested components
- [ ] ErrorBoundary.tsx (error caught / not caught, retry, stack display)
- [ ] ErrorReporter.tsx (error reporting POST)
- [ ] SearchHistory.tsx (dropdown, click away, keyboard nav)
- [ ] SimilarMovies.tsx, SimilarSeries.tsx, TmdbSimilarMovies.tsx, TmdbSimilarShows.tsx
- [ ] KeyboardShortcuts.tsx

### P5.1 — Fix pre-existing ChannelRow test flakiness
`ChannelRow.test.tsx:283` — "shows enrichment result after debounce resolves"
fails intermittently due to debounce/fake-timer interaction. Stabilize it.
- [ ] Investigate fake timer + debounce timing
- [ ] Fix to use vi.advanceTimersByTime or vi.runAllTimers

### P5.2 — Remove unused server/test_server.py
Present in coverage report at 0% — appears to be test utility scaffolding
not wired into any test run. Either use it or delete it.

### P5.3 — Audit `react-compiler` / lint rules
Vite 8 + React 19 — consider adding the React Compiler eslint plugin
to catch hook rule violations and memoization issues.

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
