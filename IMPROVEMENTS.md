# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.13 — Add MSW (Mock Service Worker) for API-level integration tests
The project uses `vi.mock()` for mocking imports in tests, but there are no
API-level integration tests that exercise the full fetch/error handling layer.
MSW would intercept actual fetch calls at the network level, providing more
realistic integration tests for API error states, loading states, and edge cases.
- [ ] Install and configure MSW in test setup
- [ ] Rewrite a subset of tests to use MSW handlers instead of vi.mock()
- [ ] Document MSW patterns for future tests

### P3.14 — Investigate React Router v8 upgrade
React Router v8.0.1 is available (project uses v7.18.0). v8 introduces new
loaders/actions patterns and improved type safety. Worth investigating for
potential migration benefits vs breaking changes.
- [ ] Review React Router v8 changelog for breaking changes from v7
- [ ] Evaluate if the project's routing patterns benefit from v8 features
- [ ] Create migration plan or decide to defer

---

## Recently Completed

### P2.11 — Add component tests for Series page
Added 37 component tests for the Series page covering all render states:
|✅ Done: web/src/pages/__tests__/Series.test.tsx
— 346 frontend tests pass (17 files), TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P2.10 — Add component tests for Movies page
Added 40 component tests for the Movies page covering all render states:
|✅ Done: web/src/pages/__tests__/Movies.test.tsx
— 309 frontend tests pass (16 files), TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P3.9 — Evaluate hls.js v1.7.0-beta.1 stable vs current canary build
|✅ Done: web/package.json, web/src/hooks/useVideoPlayer.ts
— Committed as 332b5b8.
**Filed**: 2026-06-27

### P3.12 — Frontend error boundary with user-facing recovery UI
|✅ Done: web/src/components/ErrorBoundary.tsx (Go Home + refactored handlers)
|✅ Done: web/src/components/__tests__/ErrorBoundary.test.tsx (8 tests)
— 279 frontend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P3.11 — Add component tests for MovieOverlay and SeriesOverlay
|✅ Done: web/src/components/__tests__/MovieOverlay.test.tsx, web/src/components/__tests__/SeriesOverlay.test.tsx
— 271 frontend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P2.9 — Add component tests for LiveTV page
|✅ Done: web/src/pages/__tests__/LiveTV.test.tsx
— 231 frontend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P2.8 — Add component tests for ContinueWatching section on HomePage
|✅ Done: web/src/pages/__tests__/HomePage.test.tsx
— 203 frontend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P3.10 — Add backend tests for rate limiting middleware
|✅ Done: server/tests/test_rate_limit.py
— 69 backend + 182 frontend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P2.7 — Add component tests for Guide page
|✅ Done: web/src/pages/__tests__/Guide.test.tsx
— 182 frontend + 59 backend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P2.6 — Add component tests for HistoryPage
|✅ Done: web/src/pages/__tests__/HistoryPage.test.tsx
— 146 frontend + 59 backend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27
