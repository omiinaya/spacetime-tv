# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.4 — Keyboard navigation for content grids
Arrow-key navigation through movie/series grids with focus indicators.
Files: web/src/pages/Movies.tsx, web/src/pages/Series.tsx
Difficulty: Medium
Est: 1h

### P3.5 — Upgrade hls.js to v1.7.0-beta.1
Newer hls.js adds I-frame playlist support, smoother audio switching, CMCD v2
analytics, faster startup (parallel init-segment loading), and improved live
resilience config options.
Files: web/package.json, web/src/components/Player.tsx
Difficulty: Easy
Est: 15 min

### P3.6 — Add trending/popular movies section from TMDB proxy
The backend has TMDB proxy infrastructure but no frontend integration yet.
Add a "Trending" or "Popular" row on the Movies page sourced from the proxy.
Files: server/main.py, web/src/pages/Movies.tsx
Difficulty: Medium
Est: 45 min

---

## Recently Completed

### P3.2 — Add tmdb v3 API fallback for richer metadata
Added 5 TMDB v3 API proxy endpoints (trending, search, movie details, similar,
configuration). All gracefully return enabled=false when TMDB_API_KEY is unset.
Config in config.py + .env.example.
✅ Done: 5 endpoints in server/main.py, 5 tests, config.py, .env.example

### P3.1 — Series watchlist (favorite series)
Watchlist previously only supported movies. Extended to series with:
- `stv_watchlist_series` localStorage key with dedicated `getSeriesWatchlist`,
  `isSeriesInWatchlist`, `toggleSeriesWatchlist` functions
- Heart button on series cards (Poster area, bottom-right, hover reveal)
- Tabbed WatchlistPage with Movies and Series tabs
- Series tab fetches details via parallel `api.series.details()` calls
✅ Done: watchlist.ts, Series.tsx, WatchlistPage.tsx

### P3.3 — Client-side search result caching
Search results weren't cached session-side. Added sessionStorage cache
with 2-minute TTL for recent searches to improve back-button experience.
✅ Done: sessionStorage cache with SEARCH_CACHE_TTL=120s in Search.tsx

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

