# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

### P1 (Ship Blockers)

*(none — all P1 items completed)*

### P2 (UX Polish)

*(none — all P2 items completed)*

### P3 (Nice to Have)

*(none — all P3 items completed)*

### P4 (Tech Debt / DX)

3. **P4.4 — CORS middleware hardening** — Currently wide open (`*`) per ROADMAP audit. Restrict to known origins (Vite dev, nginx prod domains).
4. **P4.5 — Upgrade Vite 8.1.0 → 8.1.1** — Minor bump with bugfixes. Run `npm install vite@^8.1.1` and verify tsc + tests.
5. **P4.6 — Backend test coverage: stream.py (68%→80%)** — Largest backend module (split into 7 files but many error branches still untested). Focus on stream_core, stream_live, stream_vod error paths.
6. **P4.7 — Backend test coverage: guide.py (72%→85%)** — EPG refresh, cache rebuild, and SSE broadcast paths need coverage.

---

## Recently Completed

### ✅ P4.3 — Upgrade react-router 8.0.1 → 8.1.0
`npm install react-router@^8.1.0` — minor bump adding route metadata instrumentation. tsc clean, 1184 frontend tests pass, 491 backend tests pass. Pushed to master.

### ✅ P4.1 — Backend test coverage: guide_epg.py (60%→100%), guide_routes.py (64%→90%)
Added 44 new tests across two new test files:

**test_guide_epg.py** (27 tests):
- `_parse_ts`: valid timestamps, midnight edge case
- `load_epg`: fresh memory cache, stale→disk cache, disk corruption→HTTP refetch, HTTP success with XMLTV parse/save to disk, HTTP failure with/without stale fallback
- `load_epg_background`: fresh data, stale→triggers background refresh task, no-data synchronous fallback
- `_refresh_epg_background`: success path, exception caught+logged
- `_build_guide_cache`: stream mapping success/duplicate/failure, past/future programme filtering, malformed timestamps, empty EPG, multi-channel alphabetical sort
- `_epg_broadcast_loop`: client notification via Queue, queue-full client removal, exception resilience

**test_guide_routes.py** (18 tests):
- `tv_guide`: cache rebuild when EPG refreshed, is_live parse-error resilience (malformed timestamps)
- `guide_now`: malformed programme timestamp resilience
- `guide_catchup`: full timeline response, unknown stream_id, missing live_all mapping, malformed timestamps, parameter validation (422), window boundary filtering
- `guide_enrich`: non-zero CLI exit, `asyncio.TimeoutError` (direct + HTTP), generic exception (direct + HTTP), cache-hit dedup
- `epg_sse`: route registration, HEAD proxy verification

Total backend tests: 491 (+44), tsc --noEmit: clean, all existing suites pass.

### ✅ P4.2 — Backend test coverage: tmdb.py (75%→100%)
Added 9 new tests covering:
- **HTTP fetch path**: stale cache refetch, non-200 error, httpx exception — all with `httpx.AsyncClient` mocked via MagicMock/AsyncMock
- **Cache edge cases**: fresh cache hit avoids HTTP call, stale entry deletion before refetch
- **CLI error branches**: non-zero exit, `asyncio.TimeoutError`, generic `Exception` in `tmdb_enrich_cli`
- **Person endpoint None paths**: both `person/search` and `person/{id}` return `enabled: False` when CLI returns None
- Total backend tests: 447 (+9), tmdb.py line coverage: 118/118 (100%)

### ✅ P3.1 — Auto frame-rate switching
Added `useFrameRateDetector` hook using `requestVideoFrameCallback` API:
- Rolling window of 30 frame deltas (minimum 5 samples) for stable fps estimates
- Ignores frame gaps > 500ms (seeks, pauses, buffering) to avoid skewing
- Falls back gracefully when API is unsupported; detects display refresh rate
- Frame rate badge shown in Player bottom controls next to connection indicator
- Only active during `"playing"` phase to avoid idle overhead
- 10 vitest tests across supported/unsupported paths, all 1184 frontend tests pass

### ✅ P3.2 — Theme customization (light/dark mode)
Added full light/dark/system theme support:
- `AppSettings.theme` field with `"dark" | "light" | "system"` values (default: `"dark"`)
- Light theme CSS variables in `.light` class — all 10 design tokens inverted for a clean light appearance
- Theme application effect in `SettingsContext` — toggles `.dark` / `.light` on `<html>` element
- System preference detection via `matchMedia('prefers-color-scheme: light')` with live listener for `"system"` mode
- Dark/Light/System toggle buttons in SettingsPage with Sun/Moon/Monitor icons and active state highlighting
- Sonner Toaster respects resolved theme for proper toast colors
- 8 new tests (5 SettingsPage theme tests + 3 SettingsContext theme application tests), all 1174 pass
- Zero breaking changes — frontend test count: 1174 (+8), backend: 388 pass

### ✅ P2.1–P2.3 — UX Polish (3 items shipped)

**P2.1 — NotFound page test coverage**: 12 vitest tests covering 404 heading, messages, TV icon, Go Home/Go Back buttons, navigation, and button styling. Last untested page → **12/12 pages tested (100%)**.

**P2.2 — Mobile/tablet viewport E2E tests**: Playwright config extended with Mobile Chrome (Pixel 5), Mobile Safari (iPhone 13), Tablet (iPad) projects. 10 E2E tests covering mobile nav, Live TV, player controls, search, settings, movies, series, TV guide. 9/10 stable.

**P2.3 — ESLint flat config**: Installed eslint 9 + typescript-eslint. Created `eslint.config.js` with TypeScript-aware rules, relaxed test config. Fixed 6 lint issues in source. 0 errors, 0 warnings. New `npm run lint` / `lint:fix` scripts.

### ✅ P1.3 — System Picture-in-Picture
Added `useDocumentPiP` hook with Document Picture-in-Picture API support (Chrome 116+):
- Detects `documentPictureInPicture` availability via feature detection
- Opens a styled floating PiP window with the video element + play/pause controls + close button
- Falls back seamlessly to `HTMLVideoElement.requestPictureInPicture()` when Document PiP unavailable
- Returns video to original container when PiP window is closed (pagehide/unload events)
- Active state styling on button (highlighted when PiP is open)
- PiP button shows "Exit Picture in Picture" aria-label when active
- Zero breaking changes — all 1154 frontend tests pass

### ✅ P1.2 — Backend test coverage: main.py (59%→94%)
Added 37 new tests across 7 test classes:
- **RateLimitMiddleware**: 6 tests — basic pass/block, window reset, search/image-proxy limits, IP isolation
- **warm_cache**: 11 tests — disabled, all-phases, category filter, live/VOD/EPG failure non-fatal, VOD/series retry, empty VOD/series categories, double-failure resilience
- **_verify_cache_coherence**: 3 tests — all-keys-present, missing-static, empty-template
- **start_cache_warmer**: 3 tests — create/replace/noop
- **cleanup_loop**: 2 tests — normal flow, error continuance
- **touch_access/get_last_access**: 4 tests — create/read/missing/corrupt
- **_auto_star**: 7 tests — no-token, success, 409/500/network/204 error handling, 200/403 status
- Plus: fixed `_auto_star` to use `_urllib_error.HTTPError` instead of bare `urllib.error.HTTPError` (missing import)
- Backend test total: 438 (+37).

### ✅ P1.1 — Backend test coverage: admin.py (65%→98%)
Added 6 new tests for admin routes:
- **Stream health dashboard** (`/api/admin/stream-health`): structure/codec/resolution/type aggregation, stale boundary (3600s), empty cache, error field normalization, non-standard resolution (`<480p → NNNp`)
- **Warm cache "already in progress"** branch: tests the path where `_warm_task` is not None and not done()
- Coverage: 99 stmts, 2 miss (98%). Remaining 2 lines are try/except ImportError safety net for `_probe_cache` import.
- Backend test total: 401 pass (+6).

### ✅ Flaky test fix — Player test missing api.guide.catchup mock
New CatchupTimeline component (Catch-up/Timeshift TV feature) calls `api.guide.catchup()` on mount for live streams. The Player.test.tsx mock for `@/lib/api` didn't include `guide.catchup`, causing `TypeError: Cannot read properties of undefined (reading 'catchup')` in the "renders a video element for live type" test. Added the mock — 1154/1154 frontend tests pass.

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
