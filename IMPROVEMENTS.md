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

### P2.8 — Add component tests for ContinueWatching section on HomePage
The HomePage renders "Continue Watching" rows for series and movies inline.
The data layer (`continueWatching.ts`) has 20 utility tests, but the
component rendering within HomePage is untested. Add tests covering empty state,
item rendering, and resume interaction.
- [ ] Create HomePage component tests that cover continue-watching section
- [ ] Mock continue-watching data hooks and API calls
- [ ] Test empty state (no progress), series items, movie items, resume click

### P2.9 — Add component tests for LiveTV page
The LiveTV page renders channel cards, category filters, search bar, and
now-playing indicators. No component tests exist for this page.
- [ ] Create LiveTV page component tests covering channel card rendering
- [ ] Test category filter tab selection and filtering
- [ ] Test search within category filter interaction
- [ ] Test empty state and error state

### P3.11 — Add component tests for MovieOverlay and SeriesOverlay
The MovieOverlay and SeriesOverlay are rich overlays with TMDB enrichment,
episode lists, season tabs, recommendations, and TMDB images. No component
tests exist for either overlay.
- [ ] Create MovieOverlay tests for base info, cast, recommendations, trailer
- [ ] Create SeriesOverlay tests for season tabs, episode list, recommendations
- [ ] Test TMDB enrichment fallback when TMDB data unavailable
- [ ] Test backdrop/thumbnail loading states

### P3.12 — Frontend error boundary with user-facing recovery UI
The app has an `/api/error` beacon endpoint for client error reporting but no
React error boundary. A rendering crash shows a blank white page. Add a
React error boundary with "Something went wrong" UI and recovery button.
- [ ] Add ErrorBoundary component with fallback UI
- [ ] Wire error beacon to boundary's componentDidCatch
- [ ] Add "Reload" and "Go Home" recovery actions
- [ ] Test that boundary catches rendering errors gracefully

---

## Recently Completed

### P3.10 — Add backend tests for rate limiting middleware
Added 10 endpoint-based tests for the RateLimitMiddleware in main.py:
- Rate limit applied to search/image-proxy paths (RATE_SEARCH_LIMIT=3 patched)
- Different higher limit for default paths (RATE_DEFAULT_LIMIT=5 patched)
- 429 response with Retry-After header when limit exceeded
- Rate window expiry (1s window) resets the counter
- Shared counter between search and image-proxy paths
- Internal _rate_limits dict structure validation
- Default path independent of search path counter
✅ Done: server/tests/test_rate_limit.py
— 69 backend + 182 frontend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

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
