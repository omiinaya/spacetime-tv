# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

### P3 (Nice to Have)

- **P3.2 — Upgrade Vite 8.1.1 → 8.1.2** — Minor bump available via `npm outdated`.

### P4 (Tech Debt / DX)

- **P4.1 — Add API versioning prefix** — All routes are bare `/api/...` with no `/v1/` prefix. Add versioning to allow future breaking changes without disrupting clients. Approach: mount all routes under `/api/v1/`, add redirect from bare `/api/...` to `/api/v1/...`.

---

## Recently Completed

### ✅ P3.1 — Sonner toast coverage for error paths
Replaced 5 `console.error()` calls in `useRecording.ts` with `toast.error()` notifications from sonner. Added `<Toaster>` component to `main.tsx` with richColors, bottom-right positioning, and close button. Error paths covered:
- Record start (HTTP error + exception)
- Record stop (exception)
- Fetch recordings list (exception)
- Delete recording (exception)
ErrorBoundary's `console.error` calls retained — they fire `reportRenderError()` to the server and the fallback UI is already shown. Tests: 1208 passed, TypeScript clean, backend 49/49 passed.

---

## Recently Completed

### ✅ P4.1 — Eliminate all 13 RuntimeWarnings from test suite
Root causes and fixes:
- **test_main.py**: `patch('routes.guide.load_epg', new_callable=AsyncMock)` without return_value left AsyncMock coroutines dangling during warm_cache cleanup. Changed all 10 instances to `return_value={'channels': [], 'programmes': []}`.
- **test_stream.py**: `mock_stream_bytes` async function with `raise()` left dangling coroutine on generator exit — switched to `side_effect=RuntimeError`.
- **test_stream.py**: `proc.kill` was an `AsyncMock` but called without `await` in `_ffmpeg_pipe` — changed to `MagicMock()`.
- **test_media.py**: `proc.kill=AsyncMock()` in `test_stream_audio_success` caused unawaited coroutine — changed to `MagicMock()`.
- **test_media.py**: `_make_mock_process` used `proc.communicate=AsyncMock` — when `wait_for` side_effect raised `TimeoutError`, the communicate coroutine was never awaited. Changed to `MagicMock()`.
- **Result**: 0 RuntimeWarnings, 575 tests pass, 3 xfailed, TypeScript clean. Remaining 12 warnings are `CurlCffiWarning` from the `curl_cffi` library.

### ✅ P3.2 — useCloudBackup hook tests (+17 tests)
`useCloudBackup` hook (uploadBackup, downloadBackup, mergeFavorites, backupStatus). Added 17 tests covering:
- Initial state: no timestamps, not loading, no error
- **uploadBackup**: success (sets lastUpload), server error (returns false), loading state during request, empty favorites
- **downloadBackup**: success (returns favorites/watchlist), server error (returns null), loading state
- **mergeFavorites**: success (returns merged array), server error, request payload verification, loading state
- Error state resets on subsequent successful upload
- Timestamps update on repeated uploads
- Network failure handling for upload and download
- Added MSW handlers: `POST /api/cloud/backup`, `GET /api/cloud/backup`, `POST /api/cloud/merge`
- Frontend tests: 17 new. TypeScript clean.

---

### ✅ P3.1 — EPG Search tab tests
SearchPage gained an "EPG" filter tab (guide.search API). Added 7 tests:
- **EPG tab shows** after search with results
- **EPG programme results render** when EPG tab selected
- **Channel names** appear on EPG programme cards
- **Empty state** when EPG search returns no results
- **API error resilience** — shows empty state without crashing
- **Live/movies/series sections hidden** when EPG tab is active
- **Subtitle display** on programme cards when available
- Updated mock to include `guide.search` in the API mock
- Frontend tests: 1184→1191 (+7). TypeScript clean. Backend 571 pass.

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
