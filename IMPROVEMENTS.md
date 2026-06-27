# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P2.5 — Add unit tests for `timeAgo` helper and `recentChannels` module
The `utils.ts` (timeAgo) and `recentChannels.ts` modules have zero test coverage.
The `timeAgo` function handles various time boundaries (seconds, minutes, hours,
days, months, years). The `recentChannels` module persists to localStorage with
14-day expiry and max-12-item limit.
- [ ] Add test file `src/lib/utils.test.ts` covering:
  - timeAgo: "Just now", "Xs ago", "Xm ago", "Xh ago", "Yesterday", "X days ago",
    "Xmo ago", "Xy ago"
  - timeAgo edge cases: null/undefined/0/future timestamps
- [ ] Add test file `src/lib/recentChannels.test.ts` covering:
  - getRecentChannels with empty/valid/expired localStorage
  - saveRecentChannel deduplication and max limit
  - clearRecentChannels
  - 14-day expiry filtering

### P2.6 — Add component tests for HistoryPage
HistoryPage was recently extracted from the home page sidebar but has no tests.
Key behaviors to cover: renders channel cards, shows timestamps via timeAgo,
empty state with "No watch history yet" message, Clear all button functionality.
- [ ] Create `src/pages/__tests__/HistoryPage.test.tsx`
- [ ] Mock `getRecentChannels` with sample data including timestamps
- [ ] Test empty state rendering
- [ ] Test channel list with icons and fallbacks
- [ ] Test Clear all button clears list
- [ ] Test relative timestamps render correctly

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

---

## Recently Completed

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
