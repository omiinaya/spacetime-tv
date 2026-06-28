# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P1.1 — Backend: monolith decomposition & test coverage (HIGH RISK)
- ✅ **[Phase 1]** Created `server/state.py` (shared state module) and
  `server/routes/{health,admin}.py` — extracted 6 endpoints from main.py
- ✅ **[Phase 2]** Extracted TMDB routes (`/api/tmdb/*` — 14 endpoints) into
  `server/routes/tmdb.py`
- ✅ **[Phase 3]** Extracted stream proxy + transcode routes into
  `server/routes/stream.py`
- ✅ **[Phase 4]** Extracted search + enrichment routes into
  `server/routes/search.py`
- ✅ **[Phase 5]** Extracted guide + EPG + SSE routes into
  `server/routes/guide.py`
- ✅ **[Phase 6a]** Extracted watchlist, live TV, movies, series,
  subtitles, audio, download, IPTV raw, image proxy, and SPA catch-all
  into `routes/{watchlist,live,vod,media,misc}.py`
- [ ] **Phase 6b**: Extract remaining streaming routes (stream proxy,
  HLS, DASH, MP4, convert) still in main.py
- [ ] Write integration tests for uncovered endpoints
- [ ] Target >70% coverage on main.py

### P2.1 — 16 hooks have zero test coverage
- ✅ **useChannelFavorites** (12 tests) — add/remove/toggle, localStorage persistence,
  stale closure via ref, corrupted storage handling
- ✅ **useGridKeyboardNav + useRowKeyboardNav** (24 tests) — arrow key navigation,
  Enter/Space selection, column detection with repeat() fix, enabled/disabled,
  focus management, edge cases (empty, first/last)
- ✅ **useInfiniteScroll** (11 tests) — batch rendering, hasMore, reset, source change
- ✅ **useFullscreen** (6 tests) — native fullscreenchange/webkit events, optimistic set
- ✅ **useLockBodyScroll** (5 tests) — body overflow toggle, Escape key, cleanup
- ✅ **useKeyboardShortcuts** (13 tests) — all navigation shortcuts, input gating,
  modifier key gating, ? overlay toggle, listener cleanup
- ✅ **useKeyboard** (19 tests) — Space/k/j/l/f/m/arrow keys, input gating, volume
  clamping, preventDefault, listener cleanup, handler update on prop change
- ✅ **usePlayerUtils** (35 tests) — transcodeCache, getWatchPos/saveWatchPos (6),
  getVolume/saveVolume (4, +1 production bug fix: NaN from parseFloat), getMuted/
  saveMuted (4), tryAutoplay (4, muted fallback), probeStream (4, abort+timeout),
  saveProgress (10, series/movie/auto-advance/all-guards), registerProgressSync (2)
- ✅ **useStreamUrls** (30 tests) — all type/quality combinations for live/movie/series,
  edge cases (missing ids, null urls)
- ✅ **useNowPlaying** (6 tests) — successful fetch, null programme filtering,
  unknown streamId, API error, 200-batch limit, empty streamIds
- ✅ **useGuideData** (9 tests) — initial loading, fetch success/error, sessionStorage
  cache (fresh + stale), hidden-category filtering, timeSlots/nowPct computation,
  loadPage with offset>0, sentinelRef
- ✅ **useVideoPlayer — probe routing** (8 integration tests) — MSW-controlled probe
  results: native codec → remux, hevc → transcoding, unavailable → empty_stream error,
  fetch failure → native fallback, resume prompt with stored position, live bypass,
  transcodeCache reuse
- 🐛 **Fixed production bug**: grid column detection broke with `repeat(N, ...)` CSS syntax
- 🐛 **Fixed production bug**: getVolume() returned NaN for corrupted localStorage values
  (parseFloat("nope") → NaN, not caught by try/catch)
- [ ] Write tests for useHlsPlayer (HLS.js lifecycle, error recovery)

### P2.2 — Missing E2E / integration test layer
All 729 frontend tests are unit/component tests with mocked API responses.
No tests exercise real API calls or full user flows (search→select→play).
- [ ] Set up Playwright or MSW's lifecycle server for integration tests
- [ ] Write 2-3 critical path E2E tests (browse movies → overlay → play)

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
Consider adding the React Compiler eslint plugin
to catch hook rule violations and memoization issues.

---

## Recently Completed

### P3.2 — Enable noUnusedLocals / noUnusedParameters in tsconfig
✅ Done (commit 07070cc)
- Enabled both flags in tsconfig.json and fixed 22 files with violations.
- Removed unused imports, orphaned callbacks, unused parameters, and dead
  constants. Verification: 0 TS errors, 921 frontend, 69 backend all pass.

### P3.1 — Eliminate `any` type annotations (5 occurrences)
✅ Done (commit 8246a50)
- `useRemuxPlayer.ts:122` — mpegts STATISTICS_INFO stats callback
- `useVideoPlayer.ts:369` — generic result variable
- `useMpegtsPlayer.ts:128` — mpegts STATISTICS_INFO stats callback
- `Search.tsx:160,163` — reduce accumulator items
- Each replaced with proper typed interfaces

### P3.3 — Eliminate non-null assertion in Guide.tsx
✅ Done (commit 8246a50)
`web/src/pages/Guide.tsx:276` uses `group.stream_id!` — will crash at runtime
if `stream_id` is null/undefined. Replaced with optional chaining or guard.

### P1.2 — watchProgressSync.ts coverage
✅ Done: 14 tests covering all states — queue, retrieve, remove, retry limits,
flush success, flush failure (500), flush with network error, IDB unavailable
graceful fallback. Uses fake-indexeddb for in-memory IndexedDB.

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
