# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P2.2 — Missing E2E / integration test layer
All 940 frontend tests are unit/component tests with mocked API responses.
No tests exercise real API calls or full user flows (search→select→play).
- ✅ Set up Playwright in web/e2e/ — 5 E2E tests covering live TV loading,
  video player rendering, playback verification, SPA navigation, and
  multi-channel probe validation. Run with `npm run test:e2e`.
- [ ] Set up CI integration to run E2E tests automatically

### P1.2 — Write integration tests for remaining uncovered backend routes
Following the P1.1 monolith decomposition, some higher-level routes still lack
direct test coverage (especially streaming/transcode endpoints that spawn
subprocesses). Focus on pure-logic / mockable paths.
- [ ] stream.py: cover DASH MPD endpoints, convert endpoints, MP4 serve
- [ ] search.py: cover search result sorting, pagination
- [ ] guide.py: cover group by channel, programme overlap logic

### P4.1 — Add tests for complex untested components
- 🚧 AudioSelector.test.tsx — created (170 lines), 3/5 tests passing
- 🚧 MediaOverlay.test.tsx — created (241 lines), 12/18 tests passing
- 🚧 SleepTimer.test.tsx — created (188 lines), 7/10 tests passing
- 🚧 SubtitleSelector.test.tsx — created (256 lines), 3/6 tests passing
- [ ] Fix remaining test failures in these 4 test files
- [ ] Add tests for Player.tsx (largest component — ~700 lines, zero direct tests)
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
Consider adding the React Compiler eslint plugin
to catch hook rule violations and memoization issues.

---

## Recently Completed

### P1.1 — Backend: monolith decomposition & test coverage (HIGH RISK)
✅ Done: All 13 phases complete. main.py reduced from 2687 to 312 lines (-88%).
58 utility tests, 12 EPG guide integration tests, 17 VOD integration tests,
16 async tests for cached_fetch fallback, 13+17+14+4 live/media/misc/health tests,
46 TMDB integration tests, 28 stream utility tests, 6 parse_xmltv tests.
Overall coverage 42% → ~75%. Fixed production bug: EPG channel icon parsing
(self-closing `<icon/>` falsy check).

### P2.1 — 16 hooks have zero test coverage
✅ Done: All 16 hooks now have full test coverage (212 tests across useChannelFavorites,
useGridKeyboardNav, useRowKeyboardNav, useInfiniteScroll, useFullscreen,
useLockBodyScroll, useKeyboardShortcuts, useKeyboard, usePlayerUtils, useStreamUrls,
useNowPlaying, useGuideData, useVideoPlayer, useHlsPlayer). Fixed 2 production bugs:
grid column repeat() detection and NaN from corrupted localStorage parseFloat.
**Filed**: 2026-06-28

### P3.23 — Add lib tests for watchlist, searchHistory, settings
✅ Done: watchlist.test.ts (25 tests — movies + series CRUD, MAX_ITEMS,
independence), searchHistory.test.ts (18 tests — add/dedup/cap/clear/trim/
length guard), settings.test.ts (44 tests — load/save, prefix extraction,
service detection, adult detection, filterCategories with language/service/
adult/hidden combos, collectAllPrefixes, collectAllServices).
729 frontend tests pass (32 files), 69 backend tests pass, TS clean.

### P3.22 — Add component tests for Pagination, Skeleton, and ContentRow
✅ Done: Pagination.test.tsx (26 tests), Skeleton.test.tsx (23 tests),
ContentRow.test.tsx (18 tests). All utility components now have coverage
covering rendering, props, loading states, keyboard nav, scroll behavior,
and edge cases. — 642 frontend tests pass (29 files), TS clean.

### P3.21 — Add component tests for OfflineBanner, ChannelRow, PWAInstallPrompt
✅ Done: OfflineBanner.test.tsx (11 tests), ChannelRow.test.tsx (25 tests),
PWAInstallPrompt.test.tsx (12 tests). — 575 frontend tests pass (26 files),
TS clean.

### P3.20 — Add component tests for PersonPage
✅ Done: web/src/pages/__tests__/PersonPage.test.tsx — 25 component tests
covering loading spinner, error states, no name, no results, API failure,
Go-back navigation, person header (name, photo, roles, birthday/age, TMDB
link), missing-data edge cases (no photo, no birthday, empty credits), known-for
credit grid (movie/TV titles, type badges, movie→movie search navigation,
TV→series search navigation, poster images), back button navigation.
— 527 frontend tests pass (23 files), 69 backend tests pass, TypeScript clean.
**Filed**: 2026-06-27

### P3.19 — Add component tests for AdminDashboard
✅ Done: web/src/pages/__tests__/AdminDashboard.test.tsx — 18 component tests
covering loading spinner, error/retry states, stats card rendering,
cache control buttons (Clear/Warm/Full Rewarm), EPG refresh trigger,
popular content table (populated + empty), error log (populated + empty),
search queries (populated + empty), and negative hit rate display.
— 502 frontend tests pass (22 files), TypeScript clean, committed and pushed.
**Filed**: 2026-06-27
