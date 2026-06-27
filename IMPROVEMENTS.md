# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.14 — Investigate React Router v8 upgrade
✅ RESEARCH COMPLETE: `react-router` core has v8.0.1, but `react-router-dom`
(which the project uses) latest on npm is v7.18.0 — **no react-router-dom v8
exists yet**. npm dist-tags: `latest: 7.18.0`. Migration not possible until
react-router-dom v8 is published. Re-evaluate when available.
- [x] Review React Router v8 changelog for breaking changes from v7
- [x] Evaluate if the project's routing patterns benefit from v8 features
- [ ] ~~Create migration plan or decide to defer~~ → BLOCKED: no react-router-dom v8

### P3.15 — Add component tests for Search page
The Search page is a core feature with no component test coverage. Tests should
cover: loading state, error state, empty results, combined results (live/movies/
series), section tab filtering, search enrichment, and edge cases.
- [ ] Create Search.test.tsx with 20+ component tests
- [ ] Use MSW handlers for API data instead of vi.mock()

### P3.16 — Add component tests for WatchlistPage  
The Watchlist page allows users to view saved movies and series. Needs tests for:
empty state (no watchlist items), movie/series tabs, remove from watchlist,
navigation to watch pages, and edge cases.
- [ ] Create WatchlistPage.test.tsx with 15+ component tests

### P3.17 — Investigate hls.js v1.7.0 stable release status
Last checked: hls.js v1.7.0 stable **still not published** (latest npm tag: 1.6.16).
The project uses 1.7.0-beta.1 successfully after reverting canary. No stable
release available yet.
- [x] Check npm for hls.js v1.7.0 stable → still 1.6.16, no 1.7.0 stable
- [ ] If available, create migration plan → BLOCKED: no stable 1.7.0

---

## Recently Completed

### P3.13 — Add MSW (Mock Service Worker) for API-level integration tests
|✅ Done: MSW v2.14.6 installed, 21 integration tests, Series test migrated
to MSW (37 tests), documentation at web/src/mocks/README.md.
— 367 frontend tests pass (18 files), TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P2.11 — Add component tests for Series page
|✅ Done: web/src/pages/__tests__/Series.test.tsx
— 346 frontend tests pass (17 files), TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P2.10 — Add component tests for Movies page
|✅ Done: web/src/pages/__tests__/Movies.test.tsx
— Committed and pushed.
**Filed**: 2026-06-27

### P3.12 — Frontend error boundary with user-facing recovery UI
|✅ Done: web/src/components/ErrorBoundary.tsx + tests
— Committed and pushed.
**Filed**: 2026-06-27

### P3.11 — Add component tests for MovieOverlay and SeriesOverlay
|✅ Done: web/src/components/__tests__/MovieOverlay.test.tsx, SeriesOverlay.test.tsx
— Committed and pushed.
**Filed**: 2026-06-27

### P2.9 — Add component tests for LiveTV page
|✅ Done: web/src/pages/__tests__/LiveTV.test.tsx
— Committed and pushed.
**Filed**: 2026-06-27

### P2.8 — Add component tests for ContinueWatching section on HomePage
|✅ Done: web/src/pages/__tests__/HomePage.test.tsx
— Committed and pushed.
**Filed**: 2026-06-27

### P3.10 — Add backend tests for rate limiting middleware
|✅ Done: server/tests/test_rate_limit.py
— Committed and pushed.
**Filed**: 2026-06-27

### P2.7 — Add component tests for Guide page
|✅ Done: web/src/pages/__tests__/Guide.test.tsx
— Committed and pushed.
**Filed**: 2026-06-27

### P2.6 — Add component tests for HistoryPage
|✅ Done: web/src/pages/__tests__/HistoryPage.test.tsx
— Committed and pushed.
**Filed**: 2026-06-27
