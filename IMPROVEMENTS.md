# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.14 — Investigate React Router v8 upgrade (BLOCKED)
✅ RESEARCH COMPLETE: `react-router` core has v8.0.1, but `react-router-dom`
(which the project uses) latest on npm is v7.18.0 — **no react-router-dom v8
exists yet**. npm dist-tags: `latest: 7.18.0`. Migration not possible until
react-router-dom v8 is published.
- [x] Review React Router v8 changelog for breaking changes from v7
- [x] Evaluate if the project's routing patterns benefit from v8 features
- [ ] ~~Create migration plan or decide to defer~~ → BLOCKED: no react-router-dom v8
- **Re-checked**: 2026-06-27 — still at v7.18.0, no v8

### P3.17 — Investigate hls.js v1.7.0 stable release status (BLOCKED)
hls.js v1.7.0 stable still not published (latest npm tag: 1.6.16).
The project uses 1.7.0-beta.1 successfully. No stable release available.
- [x] Check npm for hls.js v1.7.0 stable → still 1.6.16, no 1.7.0 stable
- [ ] If available, create migration plan → BLOCKED: no stable 1.7.0
- **Re-checked**: 2026-06-27 — still at 1.6.16 (beta at 1.7.0-beta.1)

### P3.21 — Add component tests for OfflineBanner and utility components
OfflineBanner, ChannelRow, PWAInstallPrompt, and other utility components have
no test coverage. These are small but widely used across the app.
- [ ] Create OfflineBanner.test.tsx
- [ ] Create ChannelRow.test.tsx
- [ ] Create PWAInstallPrompt.test.tsx

### P3.22 — Add component tests for Pagination, Skeleton, and ContentRow
Pagination, Skeleton, and ContentRow are utility components used across multiple
pages but have no dedicated test coverage. Pagination handles page controls,
Skeleton provides loading placeholders, and ContentRow renders horizontal
scrolling content sections.
- [ ] Create Pagination.test.tsx with 8+ tests
- [ ] Create Skeleton.test.tsx with 5+ tests
- [ ] Create ContentRow.test.tsx with 8+ tests

### P3.23 — Add lib tests for uncovered modules (watchlist, searchHistory, settings)
The watchlist, searchHistory, and settings lib modules handle core app state
(localStorage-backed) but have no direct test coverage.
- [ ] Create watchlist.test.ts with 10+ tests
- [ ] Create searchHistory.test.ts with 8+ tests
- [ ] Create settings.test.ts with 8+ tests

---

## Recently Completed

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

### P3.15 — Add component tests for Search page
| ✅ Done: web/src/pages/__tests__/Search.test.tsx — 40 component tests
| covering initial state, loading/error/empty states, results rendering (live/
| movies/series), filter tabs, sort controls, TMDB enrichment, load-more
| pagination, now-playing EPG, search history, Enter key, URL param sync,
| and short query handling. 407 frontend tests pass (19 files), TS clean.
**Filed**: 2026-06-27
