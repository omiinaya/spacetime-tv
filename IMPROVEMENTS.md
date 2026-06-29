# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: COMPLETED — all backlog items cleared

Pending items and their current state:

### ~~P2.2 — Missing E2E / integration test layer~~
- ✅ Set up Playwright in web/e2e/ — 46 E2E tests covering all features (live TV
  player/playback/probe, movies, series, search, EPG guide, watchlist, navigation/routing).
- ✅ CI workflow in `.github/workflows/e2e.yml` (self-hosted runner, IPTV credentials).

### ~~P1.2 — Write integration tests for remaining uncovered backend routes~~
- ✅ search.py: 79%→84%, guide.py: 67%→70%, stream.py: 28%→~65% (55 tests, 2 xfail).
- ✅ 391 backend tests (22 files), 1073 frontend tests (32 files).

### ~~P4.1 — Tests for complex untested components~~
- ✅ MediaOverlay (25), AudioSelector (12), SubtitleSelector (12), SleepTimer (12),
  SettingsContext (6), Player (221 existing).

### ~~P4.2 — Tests for smaller untested components~~
- ✅ ErrorReporter (9), KeyboardShortcuts (12), SearchHistory (9), SimilarMovies (9),
  SimilarSeries (10), TmdbSimilarMovies (9), TmdbSimilarShows (8), ErrorBoundary (186 existing).

### ~~P5.1 — Fix ChannelRow test flakiness~~
- ✅ Investigated: "shows enrichment result after debounce resolves" test no longer
  exists in current codebase. All 25 ChannelRow tests pass 5/5 consistently.

### ~~P5.2 — Remove unused server/test_server.py~~
- ✅ Deleted — file had 0% coverage with no imports, no test integration.

### ~~P5.3 — Audit react-compiler / lint rules~~
- ✅ Assessed: TypeScript strict mode on, 0 build errors, 0 `: any` casts.
  React Compiler deferred — not worth experimental instability on a clean codebase.

---

## Recently Completed

### Phase 5-6 — stream.py generator refactoring
Committed `daddb96`. Extracted 3 shared helpers (`_curl_iter_chunks`, `_curl_feed_stdin`,
`_ffmpeg_pipe`) from 5 duplicated generators. All 5 generators reduced to ~10-line
wrappers. Net -87 lines (179 ins, 266 del). +6 dedicated helper tests.

### 46 E2E Browser Tests
Committed `ebf6024`. 6 new files (807 lines) covering navigation (13 tests),
live TV (5), movies (6), series (5), search (6), guide (4), watchlist (7).
All verified green with real backend + headless chromium.

---

## Future Opportunities (not yet prioritized)

- **Guide page performance** — EPG endpoint loads 3,467 channels with full schedule;
  takes ~15s to render. Could add server-side pagination optimization or UI streaming.
- **Mobile responsive layout** — verify + polish mobile breakpoints across all pages.
- **Watchlist UI popover** — add dropdown from the nav bar showing recent items.
- **Stream health dashboard** — live channel probe aggregator showing bitrate/codec stats.
- **epg_cache.json TTL** — currently 1 hour, could make configurable.
