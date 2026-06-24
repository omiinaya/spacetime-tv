# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P2.2b — Watchlist page (complete P2.2)
Heart button + localStorage lib exist, but there's no `/watchlist` route/page
to browse watchlisted movies. Create dedicated page + nav item.
Files: web/src/pages/WatchlistPage.tsx, web/src/App.tsx
Difficulty: Medium
Est: 1h

### P3.1 — Series watchlist (favorite series)
Watchlist currently only supports movies. Extend to series.
Files: web/src/lib/watchlist.ts, web/src/pages/Series.tsx
Difficulty: Easy
Est: 30 min

### P3.2 — Add tmdb v3 API fallback for richer metadata
The TMDB proxy endpoints are in the backend but could be enhanced
with trending/popular movie lists for the Movies homepage.
Files: server/
Difficulty: Medium
Est: 1h

### P3.3 — Client-side search result caching
Search results aren't cached session-side. Add sessionStorage cache
with TTL for recent searches to improve back-button experience.
Files: web/src/pages/Search.tsx
Difficulty: Easy
Est: 20 min

### P3.4 — Keyboard navigation for content grids
Arrow-key navigation through movie/series grids with focus indicators.
Files: web/src/pages/Movies.tsx, web/src/pages/Series.tsx
Difficulty: Medium
Est: 1h

---

## Recently Completed

### P2.2b — Watchlist page (complete P2.2)
Heart button + localStorage lib exist, but there's no `/watchlist` route/page
to browse watchlisted movies. Create dedicated page + nav item.
✅ Done: WatchlistPage.tsx created with card grid, filter by IDs, empty state, remove button

### P1.1 — Search debounce (300ms)
Every keystroke fires an API call. Add 300ms debounce on Movies/Search pages.
✅ Done: debounceRef implemented in Movies.tsx and Search.tsx

### P1.2 — Image proxy referrer check
Anyone can use /api/image-proxy as a free proxy. Add referrer/origin check.
✅ Done: origin/referrer validation in server/main.py image_proxy endpoint

### P1.3 — 0-byte stream error UI
Player sits black when CDN returns empty response. Show error state.
✅ Done: Player.tsx has full error UI with AlertCircle icon, errorMsg, Retry button

### P1.4 — Missing alt attributes on all <img> tags
10+ images missing alt text — accessibility regression.
✅ Done: All images have alt attributes (empty alt="" for decorative images with text labels)

### P1.5 — Fix 6 useEffect stale closures
Missing deps or stale closures in effect hooks. Add missing deps or suppress.
✅ Done: All effects have proper deps; intentional eslint-suppress on main useVideoPlayer effect

### P1.6 — Backend tests
1,790 lines of backend with zero tests. Add pytest for critical paths.
✅ Done: 18 integration tests in server/test_server.py covering health, movies, series, live, search, image proxy, streams, errors, guide

### P2.1 — Movie continue-watching
SessionStorage + UI row for partially watched movies (like series already has).
✅ Done: continueWatching lib with MovieProgress, UI row on Movies page

### P2.2 — Watchlist / favorites (heart button + lib)
Heart button on movie cards, dedicated watchlist page, localStorage.
✅ Partially done: heart button on movie cards + watchlist lib exist. Page missing — tracked as P2.2b

### P2.6 — Playback speed control
0.5x–2x speed selector in player.
✅ Done: speed selector in Player.tsx with 0.5/1/1.5/2 options

### P2.7 — Picture-in-Picture support
PiP button in player for desktop/mobile.
✅ Done: PiP button in Player.tsx top bar with requestPictureInPicture API
