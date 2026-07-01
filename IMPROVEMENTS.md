# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

None 🎉 — all items completed.

---

## Recently Completed

### ✅ P4.2 — Integration test suite for real IPTV
8 new tests across Live/VOD/Series/Health endpoints using FastAPI TestClient against real IPTV provider. Tests auto-skip when credentials are placeholders. Run with `pytest -m integration -v`. Covers category listings, stream schemas, and field presence validation.

### ✅ P2.2 — Fix `(window as any).screen` type hack
useFrameRateDetector.ts: Added global Screen interface augmentation for `refreshRate?: number`. Replaced `(window as any).screen` with typed `window.screen`. TypeScript cleaner.

### ✅ P2.3 — Fix `catch (e: any)` in useCloudBackup
3 catch blocks in useCloudBackup.ts changed from `catch (e: any)` → `catch (e: unknown)` with `e instanceof Error` narrowing. TypeScript clean.

### ✅ P2.1 — Sonner toast for remaining console.warn calls (PiP, LiveTV)
useDocumentPiP.ts: 3 console.warn calls → toast.error() for PiP failures (Document PiP fallback, video PiP, exit PiP). LiveTV.tsx: 1 console.warn → toast.error() for stream fetch failure. ErrorBoundary's console.error retained (fires reportRenderError() to server). TypeScript clean. 1208 frontend tests pass.

### ✅ P4.1 — Add API versioning prefix
All 12 route modules mounted under `/api/v1/` prefix instead of bare `/api/`. Vite dev proxy rewrites `/api/` → `/api/v1/`. Middleware-based redirect: `/api/...` → `/api/v1/...` (avoids route shadowing bug where a catch-all APIRoute would intercept requests before included routers). Rate limiter paths updated. Backend tests: 575 pass, 3 xfailed. Frontend tests: 1208 pass. TypeScript clean.

### ✅ P3.3 — Update hls.js canary to latest
`npm update hls.js` bumped lockfile from canary.11864 to canary.11872. TypeScript clean.

### ✅ P3.2 — Upgrade Vite 8.1.1 → 8.1.2
Minor bump via `npm install vite@8.1.2`. Tests: 575 passed, 3 xfailed, TypeScript clean.

### ✅ P3.1 — Sonner toast coverage for error paths
Replaced 5 `console.error()` calls in `useRecording.ts` with `toast.error()` notifications from sonner. Added `<Toaster>` component to `main.tsx` with richColors, bottom-right positioning, and close button. Error paths covered:
- Record start (HTTP error + exception)
- Record stop (exception)
- Fetch recordings list (exception)
- Delete recording (exception)
ErrorBoundary's `console.error` calls retained — they fire `reportRenderError()` to the server and the fallback UI is already shown. Tests: 1208 passed, TypeScript clean, backend 49/49 passed.

### ✅ P4.1 — Eliminate all 13 RuntimeWarnings from test suite
Root causes and fixes:
- **test_main.py**: `patch('routes.guide.load_epg', new_callable=AsyncMock)` without return_value left AsyncMock coroutines dangling during warm_cache cleanup. Changed all 10 instances to `return_value={'channels': [], 'programmes': []}`.
- **test_stream.py**: `mock_stream_bytes` async function with `raise()` left dangling coroutine on generator exit — switched to `side_effect=RuntimeError`.
- **test_stream.py**: `proc.kill` was an `AsyncMock` but called without `await` in `_ffmpeg_pipe` — changed to `MagicMock()`.
- **test_media.py**: `proc.kill=AsyncMock()` in `test_stream_audio_success` caused unawaited coroutine — changed to `MagicMock()`.
- **test_media.py**: `_make_mock_process` used `proc.communicate=AsyncMock` — when `wait_for` side_effect raised `TimeoutError`, the communicate coroutine was never awaited. Changed to `MagicMock()`.
- **Result**: 0 RuntimeWarnings, 575 tests pass, 3 xfailed, TypeScript clean. Remaining 12 warnings are `CurlCffiWarning` from the `curl_cffi` library.

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
