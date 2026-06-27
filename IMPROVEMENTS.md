# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P2.7 — Add component tests for Guide page
The EPG Guide page (301 lines) is a core page with channel rows, search, and
favorites — but has no component-level tests. The data layer (`useGuideData`) is
tested via `guideUtils.test.ts`, but component interaction (loading, errors,
empty states, favorites toggle) is not.
- [ ] Create `src/pages/__tests__/Guide.test.tsx`
- [ ] Mock useGuideData and useChannelFavorites hooks
- [ ] Test loading skeleton rendering
- [ ] Test error state with retry button
- [ ] Test empty state ("No channels match")
- [ ] Test channel count in header
- [ ] Test favorites filter toggle interaction

### P3.9 — Evaluate hls.js v1.7.0-beta.1 stable vs current canary build
The project uses `hls.js@1.7.0-beta.1.0.canary.11864` for MSE/ManagedMediaSource
fixes ahead of stable v1.7.0. The stable v1.7.0-beta.1 is now available, adding
I-frame playlist support, CMCD v2 analytics, and smoother audio-track switching.
Evaluate if switching from canary to stable provides benefits or breaks existing
playback behavior.
- [ ] Compare canary vs stable changelogs for MSE/ManagedMediaSource fixes
- [ ] Run playback tests with stable v1.7.0-beta.1
- [ ] Update web/package.json if compatible

### P3.10 — Add backend tests for rate limiting middleware
The RateLimitMiddleware in main.py (~25 lines) has no tests. Key behaviors:
rate limit applied to search/image-proxy paths, rate limit resets after window,
different limits for search vs default paths, correct Retry-After header.
- [ ] Add `server/tests/test_rate_limit.py` with endpoint-based rate limit tests
- [ ] Test per-IP isolation, window expiry, Retry-After header

### P2.8 — Add component tests for ContinueWatching page
The ContinueWatching page (or section) has 20 utility tests in
`continueWatching.test.ts` but no component-level tests. Add tests covering
empty state, item rendering, and interaction.
- [ ] Create component test file for ContinueWatching
- [ ] Mock continue-watching data hooks
- [ ] Test empty state, item rendering, and resume interaction

---

## Recently Completed

### P2.6 — Add component tests for HistoryPage
Added 19 component tests for the recently-extracted HistoryPage:
- Empty state: "No watch history yet" message, subtitle, Browse Live TV
  button navigates to /live, no Clear all button, no channel cards
- Channel rendering: names, icons with lazy loading, fallback TV icon
  for channels without icons, relative timestamps via timeAgo mock
- Missing timestamps: gracefully handles watchedAt=0
- Channel click navigates to /watch/live/:stream_id
- Clear all button calls clearRecentChannels and transitions to empty state
- Edge cases: single channel, max 12 channels, data-watch-link attribute
✅ Done: web/src/pages/__tests__/HistoryPage.test.tsx
— 146 frontend + 59 backend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P2.5 — Add unit tests for `timeAgo` helper and `recentChannels` module
Added 25 new tests covering the `timeAgo` utility and `recentChannels` module:
- `utils.test.ts` (13 tests): all time boundaries (Just now, Xs/m/h, Yesterday,
  X days/mo/y), edge cases (null/undefined/0/negative/future timestamps)
- `recentChannels.test.ts` (12 tests): empty/valid/expired localStorage,
  corrupted JSON, dedup by stream_id, max-12-item limit, 14-day expiry,
  clearRecentChannels
✅ Done: web/src/lib/utils.test.ts, web/src/lib/recentChannels.test.ts
— 127 frontend + 59 backend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P2.4 — HistoryPage: show "last watched" timestamps
HistoryPage lists recently-watched channels but didn't show when each was last
watched. The `RecentChannel` type stores `watchedAt` but it was unused in the UI.
Added a `timeAgo` helper to `utils.ts` and displayed relative time (e.g. "2h ago",
"Yesterday") under each channel name. Handles missing/old timestamps gracefully.
✅ Done: web/src/lib/utils.ts (timeAgo), web/src/pages/HistoryPage.tsx
— 102 frontend + 59 backend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

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
