# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.8 — ManagedMediaSource API for MSE optimization
Research update (2026-07-02):
- hls.js still at v1.7.0-beta.1 (June 2, 2026). Latest canary `1.7.0-beta.1.0.canary.11864`
  (verified 2026-07-02). No stable v1.7.0 shipped yet.
- mpegts.js v1.8.0 ✅ — supports ManagedMediaSource API for iOS Safari
  (iOS 17.1+). Already installed (^1.8.0). MMS is automatically used
  when available; no config changes needed.
- shaka-player v5.1.11 (June 27, 2026) confirmed as latest — robust
  DRM, Offline playback, ManagedMediaSource support. Integrated as
  hls.js fallback (P3.45 ✅). DASH streaming support added (P3.47 ✅).
- **Action**: upgrade hls.js from beta once v1.7.0 stable ships. Monitor
  hls.js releases for "sourceended" event recovery for ManagedMediaSource.
  Evaluate whether DASH via shaka-player needs mimeType auto-detection.
**Filed**: 2026-06-27

---

## Recently Completed

### P2.2 — Fix act() warnings in Player.test.tsx
All 8 Player tests were producing "An update to Player inside a test
was not wrapped in act(...)" warnings because useVideoPlayer's initial
useEffect fires setPhase("probing") outside an act() boundary. Added
`await act(async () => {})` flush after render in all synchronous tests
to settle pending React state updates before assertions. Zero act()
warnings remaining across all 6 test files.
✅ Done: web/src/components/__tests__/Player.test.tsx
— 102 frontend + 59 backend tests pass, TypeScript clean.

### P2.1 — Add frontend tests for api.ts fetch utilities
Added 17 new tests covering the core networking primitives:
- `fetchWithTimeout` (4 tests): normal resolution, abort on timeout,
  custom timeout, parent signal integration
- `fetchWithRetry` (6 tests): first-attempt success, retry on TypeError,
  retry on AbortError, no retry on HTTP 4xx, exhaust retries, non-retryable
  error propagation
- `api` object integration (7 tests): `live.categories()`, `live.streams()`,
  `movies.list()`, 404 error, `search()` with query encoding, `searchEnrich()`
  POST method, `watchlist.progress()`
- Exported `fetchWithTimeout` and `fetchWithRetry` from api.ts for testing
-- 102 frontend + 59 backend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.42 — Refactor useVideoPlayer Phase 2: extract useStreamUrls hook
Extracted 6 `useMemo` URL builders and 4 inline derivations (`isLive`,
`isVod`, `watchKey`, `streamId`) into a dedicated `useStreamUrls` hook
(122 lines). The main hook drops from 619→577 lines (-7%), and URL
derivation is now testable in isolation without mounting the full
player hook. No behavioural changes — all existing tests pass.
✅ Done: web/src/hooks/useStreamUrls.ts, web/src/hooks/useVideoPlayer.ts
— 85 frontend + 38 backend tests pass, TypeScript clean.

### P3.49 — Add backend tests for Admin dashboard endpoints
Added 10 new tests for admin endpoints: stats structure, empty/fresh
cache state, populated cache reflection, cache clear count/empty/EPG
reset, warm cache, warm-full, EPG refresh status and already-running
detection. All use existing test fixtures (mocked upstream, cleared
cache per test).
✅ Done: server/tests/test_admin.py
— 59 backend + 85 frontend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.47 — Add DASH streaming support via shaka-player
Added MPD manifest generation on the server (`generate_live_mpd`,
`generate_vod_mpd`) and three new endpoints:
- `/api/stream/live/{stream_id}/manifest.mpd` (dynamic DASH profile)
- `/api/stream/movie/{stream_id}/manifest.mpd` (static onDemand profile)
- `/api/stream/series/{series_id}/{episode_id}/manifest.mpd`
Frontend `useVideoPlayer` hook now computes `dashUrl` and the HLS fatal
error fallback tries DASH MPD (`application/dash+xml`) via shaka-player
before falling back to HLS. 11 new server-side tests for MPD validation.
✅ Done: server/main.py, web/src/hooks/useVideoPlayer.ts,
       server/tests/test_dash.py
— 49 backend + 85 frontend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.48 — Resolve StarletteDeprecationWarning in test suite
Added `httpx2>=2.0.0` to `server/requirements.txt`. Starlette's TestClient
auto-detects httpx2 and prefers it over httpx, eliminating the warning.
✅ Done: server/requirements.txt
— 38 tests pass with zero warnings, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.46 — Eliminate remaining `as any` type casts (done)
Replaced 3 `as any` casts with proper TypeScript types:
- `usePlayerUtils.ts`: Declared `SyncManager` + `ServiceWorkerRegistrationWithSync`
  interfaces for the Background Sync API sync.register() call.
- `useShakaPlayer.ts`: Used `CustomEvent<shaka.util.Error>` for error event detail.
- `Search.tsx`: Created `SearchResultsWithTotals` interface extending SearchResults
  with optional `totals`. Simplified cache-hit totals access.
✅ Done: web/src/hooks/usePlayerUtils.ts, web/src/hooks/useShakaPlayer.ts,
       web/src/pages/Search.tsx
— Zero `as any` casts remaining. TypeScript clean, 38 backend tests pass, committed and pushed.
**Filed**: 2026-06-27

### P3.45 — shaka-player integration as hls.js fallback
✅ Done: installed shaka-player@5.1.11, created useShakaPlayer sub-hook
(wireframe), integrated as automatic fallback when hls.js encounters an
unrecoverable fatal error. The fallback is transparent — hls.js tries first,
and if it fails with a non-recoverable error (e.g. manifest parse failure,
codec not supported), `useShakaPlayer` takes over with the same playlist URL.
shaka-player offers native ManagedMediaSource for iOS, robust DRM support
(Widevine, PlayReady, FairPlay), and DASH/CMAF capability.
**Filed**: 2026-06-27

### P3.44 — Add .gitignore for pytest worker temp directories
Added `web/[0-9]*/` and `server/[0-9]*/` patterns to `.gitignore`
to prevent pytest worker temp directories from appearing in `git status`.
✅ Done: .gitignore
— All existing tests pass, committed and pushed.
**Filed**: 2026-06-27
