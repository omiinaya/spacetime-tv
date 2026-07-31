# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

(none — see Recently Completed)

---

## Recently Completed

### ✅ P1 — Fix pre-commit hook: silent no-op gate (exit codes never propagated) (Bug/DX)
`.githooks/pre-commit` ran `make fmt-check` / `make lint` but never propagated their
exit codes — a failing lint or format check still fell through to "✅ Pre-commit
checks complete" and the commit succeeded (the exact anti-pattern of a gate that
silently passes). Rewritten: every check failure now aborts the commit with a
non-zero exit, and checks are scoped to **staged files only** (whole-tree checks
would fail commits for unrelated in-progress work). Staged Python → `ruff format
--check` + `ruff check`; staged TS/TSX/JS/CSS → `prettier --check` + `eslint`.
Also fixed the compounding issue: `make fmt-check-frontend` invoked `npx prettier`
with no prettier dependency anywhere (unresolvable on a clean machine) — prettier
is now a real devDependency.

### ✅ P1 — Add Prettier as a real devDependency + config + format scripts (DX)
`web/package.json` had `format`/`format:check` scripts but **no prettier
dependency** (only resolvable via a stale npx cache dir) and no config file.
Added `prettier@^3.9.6` to devDependencies, `web/.prettierrc` explicitly pinning
the codebase style (prettier defaults: double quotes, semi, 80 width, trailing
comma all), and wired Makefile `fmt-frontend`/`fmt-check-frontend` to the npm
scripts. Verified: `npm run format:check` passes on all committed source; only the
4 in-progress uncommitted UI files (App.tsx, ProfilePicker.tsx, index.css,
HomePage.tsx) are flagged.

### ✅ P1 — Refresh SECURITY_AUDIT.md — HTTPS + Auth Coverage rows contradicted the code (Docs)
The audit (2026-07-06) still scored "HTTPS/TLS 20/100 — No HTTPS anywhere" and
"Auth Coverage 60/100 — watchlist/stream/search/iptv still open", both stale:
- `ENFORCE_HTTPS` redirect middleware exists in `server/main.py` (default **true**),
  nginx terminates TLS on 443 (http2, TLSv1.2/1.3, HSTS preload) with HTTP→HTTPS
  301 on port 80, docker-compose maps 80/443 + letsencrypt volume, Dockerfile
  installs certbot with ACME_DOMAIN support
- Auth middleware now covers **every `/api/*` route** (X-Admin-Key or X-Device-Token;
  401/403 otherwise), with LAN bypass gated by `ALLOW_LAN_BYPASS` (default true,
  false = hardened)
Rows updated: HTTPS 20→75, Auth Coverage 60→85, overall 72→78. Added remediation
item 10 (set `ALLOW_LAN_BYPASS=false` in production). Re-audit method documented.

### ✅ P3 — Remove dead `_mock_preflight_session` helper in test_stream.py (Maintainability)
The consolidation suggestion found two session-builder helpers; on inspection
`_mock_preflight_session` (28 lines) was **dead code** — defined once, never
called (the original preflight tests build their sessions inline). Removed it;
`_counting_preflight_session` remains the single helper for the 5 cache tests.
`tests/test_stream.py`: 120 passed, 3 xfailed.

### ✅ P3 — Docs verification: frontend test count (Test hygiene)
Verified the ROADMAP "1,500+ frontend" claim against a fresh `npm test` run:
**1559 passed / 1560 total (100 files)**. The 1 failure was the known
parallel-load flake (Movies.test.tsx "shows skeleton grid while movies load") —
passes 40/40 in isolation. No regression.

### ✅ P3 — Frontend full-suite flakiness under parallel load (Test hygiene)
Full `vitest run` intermittently failed a rotating set of tests (LiveTV category switch, Search TMDB badges, Series watchlist hearts, PlayerCenterControls click) with `waitFor`/`userEvent` 5s timeouts; serial runs passed 100%. Fixed three ways: (1) `test-setup.ts` raises Testing Library `asyncUtilTimeout` 1000ms → 4000ms so async assertions survive CPU contention from 100 parallel worker transforms; (2) `SeriesOverlay` Play button now disabled until episodes load (was navigable with fallback episode id 1 during loading — clicking early navigated to the wrong episode; tests updated to wait for loaded state `Play S1 E1`); (3) `usePlayerUtils` guards `sessionStorage.removeItem` in the 1s auto-advance `setTimeout` (throws in private mode/SSR/test teardown), test uses fake timers so the timer never fires after jsdom teardown. Also fixed the matching backend flake: `test_load_epg_background_stale_triggers_refresh` left its background EPG refresh task fire-and-forget — the task's first `await load_epg()` could run AFTER the `@patch` context was torn down, calling the REAL `load_epg()` against a closed httpx client under full-suite load (`Cannot send a request, as the client has been closed`). Test now awaits the task with an AsyncMock. Verification: backend 1314 passed / 17 skipped / 3 xfailed; frontend 100 files / 1560 tests passed in parallel. Commits `825685e`, `875fdb9`, `8febcd7`.

### ✅ P2 — Fix EPG refresh dedup broken across modules — duplicate concurrent XMLTV fetches (Bug)

`state._epg_refresh_task` is the canonical "EPG refresh in flight" tracker, but both
`guide_epg.load_epg_background()` and `admin_epg_refresh()` did `from state import
_epg_refresh_task` and then rebound a **local module copy** (`global` + assignment).
The shared `state._epg_refresh_task` stayed `None` forever, so `admin_epg_refresh`'s
`already_running` check always read "not running" and every `POST /admin/epg/refresh`
spawned a NEW concurrent `_refresh_epg_background()` task — even while guide_epg's
refresh was already in flight. Result: duplicate XMLTV downloads, double provider
load, and races on `epg_cache` writes.

Fix: both modules now read/write `state._epg_refresh_task` as a module attribute
(single source of truth). Added regression test
`test_admin_epg_refresh_records_task_on_shared_state` (fails on old code, passes on
new) and hardened `test_load_epg_background_stale_triggers_refresh` to assert the
task is visible on `state` rather than on a private copy. Full backend suite 1314 pass.

### ✅ P2 — Fix DVR recording lifecycle bugs in record.py (Bug)
`list_recordings` had three lifecycle bugs. (1) **Lost persistence**: `if _active: _save_meta(meta)` skipped the save when the last active recording's process exited, leaving it stuck as "recording" on disk forever. (2) **Crashes marked completed**: an exited ffmpeg with a 0-byte/missing output file was marked "completed" instead of "failed". (3) **Orphaned entries stuck**: after a server restart, meta entries with status "recording" had no tracked process and were never reconciled. Fixes: new `_finalize_recording()` helper (file size = source of truth), `changed`-flag persistence, orphan reconciliation pass in `list_recordings`, and live `size_bytes` reporting for still-running recordings so the RecordingsPage (polls every 3s) shows growth. 6 new lifecycle tests; `test_record.py` now 34 tests. Full backend suite 1326 pass.

### ✅ P4 — Add RecordingsPage component tests (Coverage)
`RecordingsPage` had zero tests despite being routed and used. Added 12 tests: loading spinner, empty state, name/metadata rendering, MB/GB size formatting, active "Recording…" indicator, 0-byte failed recording, play navigation, delete confirm/cancel flows, manual refresh, and the 3s polling loop (with fake timers) that runs only while a recording is active. Mocked `@/hooks/useRecording` (hook fetch logic already covered by its own 11 tests).

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
