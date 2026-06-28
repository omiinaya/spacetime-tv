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
- ✅ **[Phase 6b]** Removed dead streaming code (MP4, HLS, DASH helper
  stubs) from main.py. main.py reduced from 2687 to 312 lines (-88%).
  Stream/transcode/DASH/MP4/HLS logic now lives entirely in
  `routes/stream.py` (1005 lines, the largest module).
  removed 22 duplicate decorators from main.py
- ✅ **[Phase 7]** Added 58 unit tests for pure utility functions in
  main.py (_mime_from_url, generate_live_mpd, generate_vod_mpd,
  _lookup_extension, iptv_url, _img_cache_key, touch_access,
  get_last_access, serve_cached_mp4) — coverage 42% → 48%
- ✅ **Phase 8** Added 12 integration tests for EPG guide endpoints
  (/api/guide, /api/guide/now) — guide.py coverage 18% → 54%,
  overall coverage 56% → 60%
- ✅ **Phase 9** Added 17 integration tests for VOD routes (movies,
  series, download) — vod.py coverage 38% → 62%, overall 61% → 62%
- ✅ **[Phase 10]** Added 16 async tests for cached_fetch empty-list/stale
  fallback, fetch_iptv error path, cleanup_stale_cache, and
  start_cleanup_task — main.py coverage 56% → 73% (target achieved)
- ✅ **[Phase 11]** Added integration tests for live (13), media (17), misc (14),
  and health (4) routes — live.py 50%→92%, media.py 20%→92%, misc.py 44%→85%,
  health.py 55%→100%. Overall coverage 67%→75%.
- ✅ **Phase 12** Added 46 TMDB integration tests — tmdb.py 31%→75%.
- ✅ **[Phase 13]** Added 28 stream utility tests (_mime_from_url, generate_live/vod MPD,
  serve_cached_mp4 Range/206, DASH manifest endpoints, convert endpoints, MP4 404) —
  stream.py pure functions and smoke tests
- ✅ **[Phase 13b]** Added 6 parse_xmltv tests (channel/programme extraction, empty XML,
  missing elements, malformed XML error handling) — guide.py
- 🐛 **Fixed production bug**: EPG channel icon parsing — `xml.etree.ElementTree.Element`
  is falsy when empty (self-closing `<icon src="..."/>`), so `(el or {}).get("src")` returned `""`.
  Fixed with proper `if el is not None` guard.
- [ ] Write integration tests for remaining uncovered routes (stream, search, guide)



### P2.2 — Missing E2E / integration test layer
All 940 frontend tests are unit/component tests with mocked API responses.
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
covering loading spinner, error states (no name, no results, API failure,
Go-back navigation), person header (name, photo, roles, birthday/age, TMDB
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
