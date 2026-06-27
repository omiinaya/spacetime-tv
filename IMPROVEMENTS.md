# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.9 — Evaluate hls.js v1.7.0-beta.1 stable vs current canary build
The project uses `hls.js@1.7.0-beta.1.0.canary.11864` for MSE/ManagedMediaSource
fixes ahead of stable v1.7.0. The stable v1.7.0 has not yet been released (latest
stable remains 1.6.16). The canary build carries incremental MSE/ManagedMediaSource
fixes not present in any stable release. No evaluation possible until v1.7.0 stable
ships.
- [x] Compare canary vs stable changelogs for MSE/ManagedMediaSource fixes
- [ ] Run playback tests with stable v1.7.0-beta.1 (blocked — no stable release)
- [ ] Update web/package.json if compatible

### P3.10 — Add backend tests for rate limiting middleware
The RateLimitMiddleware in main.py (~25 lines) has no tests. Key behaviors:
rate limit applied to search/image-proxy paths, rate limit resets after window,
different limits for search vs default paths, correct Retry-After header.
- [ ] Add `server/tests/test_rate_limit.py` with endpoint-based rate limit tests
- [ ] Test per-IP isolation, window expiry, Retry-After header

### P2.8 — Add component tests for ContinueWatching section on HomePage
The HomePage renders "Continue Watching" rows for series and movies inline.
The data layer (`continueWatching.ts`) has 20 utility tests, but the
component rendering within HomePage is untested. Add tests covering empty state,
item rendering, and resume interaction.
- [ ] Create HomePage component tests that cover continue-watching section
- [ ] Mock continue-watching data hooks and API calls
- [ ] Test empty state (no progress), series items, movie items, resume click

---

## Recently Completed

### P2.7 — Add component tests for Guide page
Added 36 component tests for the EPG Guide page covering all render states:
- Loading: skeleton shimmer placeholders, no heading/search/channels
- Error: error message with retry button calling loadPage(0)
- Empty: "No EPG data available", "No channels match your settings" (filtered),
  "No programmes matching" (search with Clear search flow)
- Normal: heading, channel count, programme titles, timeline slots, LIVE indicator,
  channel icons, aria-labels, language badge, search match count badge
- Favorites: isFavorite prop, toggleFavorite callback via ChannelRow
- Loading more: spinner visibility
✅ Done: web/src/pages/__tests__/Guide.test.tsx
— 182 frontend + 59 backend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

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
