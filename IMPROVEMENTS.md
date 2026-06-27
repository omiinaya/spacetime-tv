# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.9 — Evaluate hls.js v1.7.0-beta.1 stable vs current canary build
The project uses `hls.js@1.7.0-beta.1.0.canary.11864` for MSE/ManagedMediaSource
fixes ahead of stable v1.7.0. As of 2026-06-27, stable v1.7.0 has not yet been
released (latest stable remains 1.6.16, released April 2026). The canary build
carries incremental MSE/ManagedMediaSource fixes not present in any stable
release. No evaluation possible until v1.7.0 stable ships. Monitor: still blocked.
- [x] Compare canary vs stable changelogs for MSE/ManagedMediaSource fixes
- [ ] Run playback tests with stable v1.7.0-beta.1 (blocked — no stable release)
- [ ] Update web/package.json if compatible

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

### P2.10 — Add component tests for Movies page
The Movies page renders category tabs, movie card grid with lazy loading,
pagination controls, and search. No component tests exist.
- [ ] Create Movies page tests for category tabs and filtering
- [ ] Test movie card rendering (poster, lazy loading, fallback, year badge)
- [ ] Test pagination controls and page navigation
- [ ] Test search within selected category
- [ ] Test empty and error states

### P2.11 — Add component tests for Series page
The Series page renders category tabs, series card grid with season/episode
progress, Recently Completed section, and search. No component tests exist.
- [ ] Create Series page tests for category tabs and filtering
- [ ] Test series card rendering (cover, progress bar, episode count badge)
- [ ] Test Recently Completed section interaction
- [ ] Test search and empty states

---

## Recently Completed

### P3.11 — Add component tests for MovieOverlay and SeriesOverlay
Added 40 component tests covering MovieOverlay (16 tests) and SeriesOverlay (24 tests):
- MovieOverlay: loading/error states, base info (title, plot, genres, rating, year,
  duration, cast, director), TMDB enrichment and fallback, language selector,
  play/watchlist/trailer interactions, cast navigation, recommendation sections
- SeriesOverlay: loading/error states, empty episodes, title/plot/genres/cast,
  season tabs with episode switching, episode grid (thumbnails, badges, duration),
  play/watchlist interactions, TMDB enrichment (genres, meta items, link),
  provider fallback, episode progress checkmarks, season watched badges,
  empty episode states, recommendation sections, cast navigation
✅ Done: web/src/components/__tests__/MovieOverlay.test.tsx, web/src/components/__tests__/SeriesOverlay.test.tsx
— 271 frontend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P2.9 — Add component tests for LiveTV page
Added 28 component tests for the LiveTV page covering all render states:
- Loading: skeleton shimmer placeholders for header and tabs
- Error: error message display with Retry button for category fetch failures
- Empty: "No channels available", "No categories match your filters" (adult
  content filtered), "No channels matching" search with Clear search flow
- Normal: Live TV heading, channel count in subtitle, category filter tabs
  ("All" + per-category), channel card rendering with names
- Channel cards: icon images with lazy loading, fallback Tv icon for
  channels without icons, channel number badges for num>0, now-playing
  EPG text when available, navigation to /watch/live/:stream_id
- Category filtering: "All" tab shows all channels, clicking a category
  tab calls api.live.streams with correct category_id
- Search: search input with placeholder, text filtering channel names,
  result count display in subtitle, clear via X button or "Clear search"
- Favorites: favorites section heading (with count badge), favorites-only
  filter toggle button, favorites channels rendered in dedicated section
- Edge cases: single channel, empty EPG now-playing (no text rendered),
  search clear restores full channel list
✅ Done: web/src/pages/__tests__/LiveTV.test.tsx
— 231 frontend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P2.8 — Add component tests for ContinueWatching section on HomePage
Added 21 component tests for the HomePage covering the Continue Watching
series and movie sections:
- Empty state: welcome message, quick links, "Welcome to Spacetime-TV", Browse
  buttons navigate to /live and /movies, no CW sections rendered
- Series CW: poster with lazy loading, cover fallback (Tv2 icon), progress bar
  calculation (1200/3600 = 33.3%), no progress bar when duration=0, resume
  navigation to /watch/series/:id/:episodeId
- Movie CW: poster with lazy loading, poster fallback (Film icon), progress bar
  calculation (2400/5400 = 44.4%), resume navigation to /watch/movie/:id
- Both CW sections rendered simultaneously
- Server progress merge: async loadServerProgress updates series/movie rows
- Edge cases: single series item only, single movie item only
✅ Done: web/src/pages/__tests__/HomePage.test.tsx
— 203 frontend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

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
