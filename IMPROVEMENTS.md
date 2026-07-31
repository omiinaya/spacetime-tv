# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

- (no pending items — all known issues addressed

---

## Recently Completed

### ✅ P2 — Fix cloud backup "Download & Restore" / "Merge Favorites" silent no-op (Bug)
Regression from the SettingsPage extraction refactor (`8a6654c`): both buttons
fetched data from the server but the result was discarded — nothing was written
to localStorage and the page never reloaded, so "restore" and "merge" appeared
to work while doing nothing. Restored the apply-to-localStorage + reload logic
in `CloudBackupSection.tsx` (favorites, movie watchlist, series watchlist).
Added 9 component tests locking in the apply behavior.

### ✅ P2 — Include series watchlist in cloud backup (Feature gap)
`useCloudBackup` only uploaded the movie watchlist (`stv_watchlist`); the series
watchlist (`stv_watchlist_series`) was silently excluded from cross-device sync.
Upload now sends `series_watchlist`; download restores it; backend empty-default
GET response includes it. Watchlist values are normalized to `number[]` on read,
so legacy record-shape backups (`{"550": true}`) restore without corrupting the
localStorage array format.

### ✅ P4 — Remove dead GET /api/v1/watchlist stub (Maintainability)
The endpoint returned a hardcoded `{"watchlist": {}}` with a "TODO: implement"
comment, but nothing consumes it — the watchlist is client-side (localStorage)
and synced via cloud backup. Removed the stub and its test; documented the
decision in `routes/watchlist.py`.

### ✅ P4 — Fix "Event loop is closed" pytest warning (Test hygiene)
`test_iptv_client.py` teardown called `client.aclose()` without awaiting it,
leaving an unawaited coroutine that exploded as a `PytestUnraisableException`
("Event loop is closed") at GC time. Teardown now uses `asyncio.run(...)`.
Full backend suite runs warning-free.

### ✅ P4 — Movies.tsx decomposition (689→552 lines) + 14 new tests (Maintainability)
Extracted `MovieContinueWatchingRow` and `MovieRecentlyCompletedRow` into dedicated components with full test suites (14 tests). Movies.tsx reduced by 20%. Fixed flaky AudioSelector test (async state timing). README table formatting fixed.

### ✅ P4 — Ruff lint 137→0, fix 3 production bugs (Linting + Bugs)
Fixed all 137 ruff errors across 39 files. Fixed 3 production bugs: missing `asyncio` import in iptv_client.py (NameError on asyncio.gather at runtime), missing `ProviderConfig` import in admin.py (NameError on provider creation), duplicate test function in test_stream.py. Replaced bare try/except with `contextlib.suppress` in 4 locations. state.py coverage verified at 100%.

### ✅ P4 — Fix 3 high-severity npm audit vulnerabilities (Security)
Fixed brace-expansion, postcss, and react-router vulnerabilities via `npm audit fix`. 4 packages updated, 0 remaining vulnerabilities.

### ✅ P4 — Add explicit HEAD handler to SPA catch-all (Routing)
Added `@router.head("/{full_path:path}")` to misc.py so HEAD requests to
GET-only streaming endpoints (SSE) resolve correctly instead of being
intercepted by the catch-all returning SPA HTML.

### ✅ P4 — Upgrade @rolldown/binding-linux-x64-gnu ^1.1.3 → ^1.2.0 (Dependency)
Updated to ^1.2.0 in package.json and lockfile. All 1209 frontend tests pass, TypeScript 0 errors. Commit `09bf92b`.

### ✅ P4 — Pin hls.js to stable (Dependency)
hls.js was referenced as `^1.7.0-beta.1` in docs but already pinned to `^1.6.16` (latest stable) in package.json. Removed stale entry.

### ✅ P4 — Split Search.tsx (855 lines) into sub-components (Maintainability)
- Extracted `SearchHeader` → `@/components/SearchHeader.tsx` (search bar, history, result counts)
- Extracted `SearchFilterBar` → `@/components/SearchFilterBar.tsx` (filter tabs + sort controls)
- Extracted `LiveSearchResults` → `@/components/LiveSearchResults.tsx` (channel grid + load-more + now-playing EPG)
- Extracted `MovieSearchResults` → `@/components/MovieSearchResults.tsx` (poster grid + TMDB enrichment + load-more)
- Extracted `SeriesSearchResults` → `@/components/SeriesSearchResults.tsx` (poster grid + TMDB enrichment + load-more)
- Extracted `EpgSearchResults` → `@/components/EpgSearchResults.tsx` (EPG programme results)
- Search.tsx reduced from 855 to ~445 lines (48% reduction)
- All 1209 frontend tests pass, 592 backend tests pass, TypeScript 0 errors. Commit `cdf2374`.

### ✅ P4 — Upgrade lucide-react ^1.22.0 → ^1.23.0 (Dependency)
Bumped lucide-react to 1.23.0 — new icons and fixes. No breaking changes.
All 1209 frontend tests pass, TypeScript 0 errors. Commit `181a887`.

### ✅ P4 — Split Series.tsx (957 lines) into sub-components (Maintainability)
- Extracted `ContinueWatchingRow` → `@/components/ContinueWatchingRow.tsx`
- Extracted `RecentlyCompletedRow` → `@/components/RecentlyCompletedRow.tsx`
- Series.tsx reduced from 957 to 748 lines (~22% reduction)
- All 1209 frontend tests pass, 592 backend tests pass, TypeScript 0 errors. Commit `897b74d`.

### ✅ P4 — Add device-token auth to cloud sync endpoints (Scoped Access)
- Cloud backup endpoints now use `X-Device-Token` for scoped per-device auth
- Tokens are SHA-256 hashed before storage (server never stores raw tokens)
- 26 cloud sync tests pass, 1209 frontend tests pass, TypeScript 0 errors. Commit `715ed9c`.

### ✅ P4 — Add `role="dialog"` + aria-modal + focus trap to PinPrompt and KeyboardShortcuts (Accessibility)
- New `useFocusTrap` hook traps Tab/shift+Tab inside modals, restores previous focus on close
- All 1209 frontend tests pass, 589 backend tests pass, TypeScript 0 errors. Commit `3b0549a`.

### ✅ P4 — Fix test_main.py syntax error + SSE endpoint HEAD tests
- Fixed rogue docstring artifact in `test_main.py` (SyntaxError on import)
- All 589 backend tests pass, TypeScript 0 errors. Commit `b0db653`.

### ✅ P4 — Add shaka-player to manualChunks in vite.config.ts (Performance)
Added `shaka` chunk to `manualChunks` in `vite.config.ts` — isolates shaka-player (~700 KB). All 1208 frontend tests pass, 597 backend tests pass, TypeScript 0 errors. Commit `51a834a`.

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
