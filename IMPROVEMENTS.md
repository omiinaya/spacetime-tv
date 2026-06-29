# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

(none — all caught up!)

---

## Recently Completed

### P4.2 — Fix pre-existing flaky test in test_misc.py
`test_image_proxy_with_localhost_referer_allows_access` returned 429
in suite order because the `_rate_limits` global in main.py accumulated
across all tests without being reset. The `clear_cache` fixture now
clears `_rate_limits` and `_search_queries` before each test — fixing
both the misc flake and an unrelated search-query leak in admin stats.
393 tests pass, 0 failed.

### Cache key centralisation — prevent key drift
The warmer and endpoint used different strings for the series categories
cache key ('series_categories' vs 'series_cats'). All cache keys are now
centralised constants in state.py with a startup coherence check and
integration tests.

### P2.1 — Upgrade npm dependencies to latest
Upgraded @tailwindcss/vite 4.3.1→4.3.2, lucide-react 1.21.0→1.22.0,
shaka-player 5.1.11→5.1.12, tailwindcss 4.3.1→4.3.2. TypeScript clean
(0 errors), 57 frontend test files / 1073 tests pass. Backend 390/391
pass (1 pre-existing flake unchanged).

### P3.5 — curl_cffi 0.15.0 confirmed latest stable
Verified via pip index. No IPTV provider compatibility improvements
available — 0.15.0 remains the latest stable release (0.15.1b1/b2
betas exist but are pre-release).

### P3.4 — Upgrade FastAPI from 0.111.0 → 0.138.2
Upgraded across 27 minor/patch versions. Fixed 2 SSE tests that inspected
`app.routes` metadata — Starlette 1.3.1 changed how included routers are
stored (now `_IncludedRouter` instead of flat `Route` objects). Replaced
with HEAD-request route verification. One pre-existing test isolation flake
in `test_misc.py` (passes in isolation but fails in suite order). 390/391
tests pass, 2 xfailed (same as before upgrade).

### P3.3 — Stream health dashboard
New admin section showing codec distribution, resolution distribution, stream
type breakdown, and recent probe results from `_probe_cache`. Backend:
`GET /api/admin/stream-health` aggregates all cached ffprobe results. Frontend:
3-column stats grid + sortable recent-probes table with color-coded codecs.
Found 0 issues uncovered during review.

### P4.1 — Guide channel filter returning unfiltered total
`/api/guide?channel=X` was returning the total count of ALL channels (before
filter) in `total_channels`. After filtering, `total` is now recalculated.
Fixes the flaky `test_guide_channel_filter` assertion `total_channels == 1`.

### Back-to-top button
Floating button appears on long pages (Movies, Series, Watchlist, Search)
when scrolled past 600px. Smooth-scrolls the main content area to top.

### P3.2 — Watchlist UI popover
Sidebar watchlist button now opens a compact popover showing the last 6 saved
movies/series with poster thumbnails, ratings, year badges, and a "View all"
link. Fetches data from existing unified API (server-cached). Click an item to
navigate directly to its search page. Includes loading/empty states and auto-
closes on outside click or Escape. TypeScript clean. 1073 frontend tests pass.

### 404 Not Found page + catch-all route
Added `NotFound.tsx` page with Go Home / Go Back buttons. Registered as
`<Route path="*">` in the router so unknown routes no longer show blank.

### Scroll restoration on cross-page navigation
Added `useEffect` that scrolls the main content area to top on route change
(skip watch routes). Prevents disorienting stale scroll position when
navigating between pages via sidebar.

### Search history: per-item delete
Added `removeSearchHistory()` function and an X button on each search history
item (hover-revealed). Users can now remove individual entries instead of
clearing everything.

### P3.1 — epg_cache TTL configurable via EPG_CACHE_TTL env var
Commit `80133d1`. Changed `EPG_CACHE_TTL = 3600` to
`int(os.getenv("EPG_CACHE_TTL", "3600"))` in `config.py`. Follows existing
config patterns. 390/391 backend tests pass (1 pre-existing flaky excluded).

---

## Completed Items (archived)

Items older than the last 5-10 completed entries are removed from this file.
Check `git log --oneline` for the full history.
