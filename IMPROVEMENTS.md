# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.13 — Add MSW (Mock Service Worker) for API-level integration tests
The project uses `vi.mock()` for mocking imports in tests, but there are no
API-level integration tests that exercise the full fetch/error handling layer.
MSW would intercept actual fetch calls at the network level, providing more
realistic integration tests for API error states, loading states, and edge cases.
- [ ] Install and configure MSW in test setup
- [ ] Rewrite a subset of tests to use MSW handlers instead of vi.mock()
- [ ] Document MSW patterns for future tests

### P3.14 — Investigate React Router v8 upgrade
React Router v8.0.1 is available (project uses v7.18.0). v8 introduces new
loaders/actions patterns and improved type safety. Worth investigating for
potential migration benefits vs breaking changes.
- [ ] Review React Router v8 changelog for breaking changes from v7
- [ ] Evaluate if the project's routing patterns benefit from v8 features
- [ ] Create migration plan or decide to defer

---

## Recently Completed

### P2.11 — Add component tests for Series page
Added 37 component tests for the Series page covering all render states:
- Loading: skeleton placeholders with PosterCardSkeleton, no heading
- Error: error banner with Retry button
- Normal: "Series" heading, category count, search input with placeholder
- Content rows: category names render, series cards with names
- Series cards: rating badge, year badge, watchlist heart (not in/added/removed),
  cover fallback icon when no cover
- Search: filter categories by name, X clear button, clear on click,
  "No series matching" with Clear search link
- Continue Watching: heading with CW items, progress bar, dismiss button,
  CW hidden when empty
- Recently Completed: heading with completed items, dismiss button,
  hidden when no completed items
- Trending This Week: section rendered when enabled+data, hidden when
  disabled/empty, rating and year badges on trending cards
- Show All: no Show All button when total ≤20, Back to categories when active
- Edge cases: missing cover (Tv2 fallback), missing rating (no badge),
  missing releaseDate (no year badge), single category
- Overlay: open on card click, close via close button
- Filtered: "No categories match your filters" when hiddenCategories hides all
✅ Done: web/src/pages/__tests__/Series.test.tsx
— 346 frontend tests pass (17 files), TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

## Recently Completed

### P2.10 — Add component tests for Movies page
Added 40 component tests for the Movies page covering all render states:
- Loading: skeleton grid with PosterCardSkeleton, "Loading..." subtitle
- Empty: "No movies available", "No movies matching" with search + Clear search
- Normal: "Movies" heading, movie count, search input with placeholder
- Movie grid: card rendering (poster, fallback, rating, year, language count, watchlist heart)
- MovieOverlay: card click opens overlay, close button hides overlay
- Continue Watching: heading, progress bar, dismiss button, CW hidden when no data
- Recently Completed: heading, green check indicator
- Recently Added: heading with movies sorted by added date
- Trending: "Trending This Week" section when enabled, hidden when disabled/empty
- Search: input placeholder, X clear button, clear on click
- Pagination: controls when totalPages > 1, hidden when totalPages <= 1
- Edge cases: single movie, no year in name, no rating, no tmdb, overlay close
- Search history: shown on input focus
✅ Done: web/src/pages/__tests__/Movies.test.tsx
— 309 frontend tests pass (16 files), TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

### P3.9 — Evaluate hls.js v1.7.0-beta.1 stable vs current canary build
Evaluation concluded: canary `1.7.0-beta.1.0.canary.11864` had probe/compat issues
causing videos to hang on 'detecting format'. Reverted to stable `1.7.0-beta.1`.
Connection quality indicator also fixed to not show 'poor' on initial load.
- [x] Compare canary vs stable changelogs for MSE/ManagedMediaSource fixes
- [x] Run playback tests with stable v1.7.0-beta.1 — canary reverted (caused hangs)
- [x] Update web/package.json — reverted to 1.7.0-beta.1
✅ Done: web/package.json, web/src/hooks/useVideoPlayer.ts
— Committed as 332b5b8.
**Filed**: 2026-06-27

### P3.12 — Frontend error boundary with user-facing recovery UI
The ErrorBoundary component already existed with fallback UI and error beacon
wiring. Added "Go Home" recovery action alongside existing "Reload" and wrote
8 component tests covering:
- Normal rendering (no error) — children render, no fallback shown
- Error state — caught error shows fallback UI with warning icon and message
- Error details expandable section showing the error message and stack trace
- Backend beacon reporting via reportRenderError with correct error info
- "Reload" button triggers window.location.reload()
- "Go Home" button navigates to "/"
- Custom fallback prop rendering instead of default
✅ Done: web/src/components/ErrorBoundary.tsx (Go Home + refactored handlers)
✅ Done: web/src/components/__tests__/ErrorBoundary.test.tsx (8 tests)
— 279 frontend tests pass, TypeScript clean (0 errors), committed and pushed.
**Filed**: 2026-06-27

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
