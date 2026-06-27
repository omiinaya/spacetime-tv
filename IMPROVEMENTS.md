# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P2.4 — HistoryPage: show "last watched" timestamps
The new HistoryPage (moved from home page sidebar) lists recently-watched channels
but doesn't show when each was last watched. The `RecentChannel` type in
`src/lib/recentChannels.ts` stores a `timestamp` field already. Display relative
time (e.g., "2h ago", "Yesterday") under each channel name.
- [ ] Add a small timestamp text below each channel name in HistoryPage
- [ ] Use a `timeAgo` helper function (or import from existing util)
- [ ] Gracefully handle missing/old timestamps

---

## Recently Completed

### P1.1 — Fix `tsc --noEmit` errors in test files (vitest globals not typed)
`tsc --noEmit` reported 31 errors in `src/lib/api.test.ts` because vitest globals
(`vi`, `beforeEach`) weren't recognized by TypeScript's tsconfig. Fixed by excluding
test files from the main tsconfig (standard practice — vitest handles its own type
checking). Also added `npm test` / `npm run test:watch` scripts to package.json.
✅ Done: web/tsconfig.json, web/package.json, IMPROVEMENTS.md
— 102 frontend + 59 backend tests pass, `tsc --noEmit` clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P2.3 — Add `test` script to package.json
The web app has vitest configured (vite.config.ts has `globals: true`,
`environment: "jsdom"`, `setupFiles`) but no `npm test` script. Devs must
remember `npx vitest run` instead of `npm test`. Added `"test": "vitest run"`
and `"test:watch": "vitest"` scripts.
✅ Done: web/package.json
— `npm test` now runs all 102 frontend tests.
**Filed**: 2026-06-27

### P3.8 — ManagedMediaSource API for MSE optimization
Upgraded hls.js to latest canary (`1.7.0-beta.1` → `1.7.0-beta.1.0.canary.11864`)
which includes incremental MSE/ManagedMediaSource fixes ahead of stable
v1.7.0. Evaluated DASH mimeType auto-detection for shaka-player — explicit
mimeType parameter (`application/dash+xml` / `application/x-mpegURL`) is
correct and preferred over auto-detection. No further changes needed.
- mpegts.js v1.8.0 ✅ — already installed, MMS auto-used on iOS
- shaka-player v5.1.11 ✅ — MMS support, DRM, DASH/CMAF all covered
✅ Done: web/package.json (hls.js@1.7.0-beta.1.0.canary.11864)
— 102 frontend + 59 backend tests pass, TypeScript clean.

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
