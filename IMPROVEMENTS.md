# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

(see ROADMAP.md for the full improvement backlog)

---

## Recently Completed

### P3.22 — Component tests: BackToTop, WatchlistPopover (2 untested components)
Last 2 untested components now have full test coverage:
- **BackToTop**: 8 tests — render, hidden/default, visibility on scroll, click-to-top, no-main fallback, positioning, ChevronUp icon
- **WatchlistPopover**: 16 tests — loading state, empty state, movie/series items, 6-item limit, error state, outside click, Escape, navigation, poster/images, total count
All 24 tests pass. Frontend component coverage: **25/25 = 100%**.

### S9 — Hook test coverage: usePlayerTypes, useMpegtsPlayer, useRemuxPlayer, useShakaPlayer
All 4 previously-untested hook modules now have full test coverage:
- **usePlayerTypes**: 4 tests — constants, quality tiers, speed presets
- **useMpegtsPlayer**: 15 tests — lifecycle, MEDIA_INFO, LOADING_COMPLETE, STATISTICS_INFO, error reconnect, health check reconnect, DVR tracking, stall, cleanup
- **useRemuxPlayer**: 20 tests — lifecycle, startPos param, MEDIA_INFO, STATISTICS_INFO, duration, timeupdate→playing, durationchange, error count threshold (2 ignored, 3rd fires), 60s/90s timeouts, cleanup, event listener cleanup
- **useShakaPlayer**: 19 tests — attach/configure/load chain, load/attach errors, critical events, native HLS (Safari), unsupported browser, event listeners, timeout, empty-stream, destroy/cleanup
All 272 hook tests pass across 17 test files. Frontend test total: 1109. Hook coverage: 16/16 = **100%**.

### S1 — Admin endpoint auth (Security D→C+)
`X-Admin-Key` header required on all admin routes. `ADMIN_API_KEY` env var in .env.
Frontend prompts for key on 403. Backward-compatible (empty key = dev mode, no auth).
Generated token in .env on setup.

### S2 — Centralise tmdb-enrich path
All 3 hardcoded paths to `/home/user/.local/share/hermes-cli-tools-venv/bin/tmdb-enrich`
consolidated into `config.py` as `TMDB_ENRICH_PATH`. Imported by tmdb.py, guide.py, and
search.py (the latter via os.getenv). Now configurable via `TMDB_ENRICH_PATH` env var.

### S3 — CACHE_TTL_HOURS → CLEANUP_TTL_HOURS
Renamed to eliminate confusion with `CACHE_TTL = 300` in state.py (API data cache TTL).
`CLEANUP_TTL_HOURS` is the disk-cache cleanup daemon TTL, not API caching. Tests updated.

### S4 — Admin auth test coverage
Added 2 tests for `require_admin_key` — verifies 403 with wrong/missing key, 200 with
correct key, and dev-mode bypass (empty key = no auth). 395 backend tests pass.

### S5 — Consistent JSON error responses
Changed 8 raw-text error responses in `stream.py` from `Response(content="...")` to
`JSONResponse(content={"detail": "..."})`. All streaming error paths now return proper
JSON with `{"detail": "..."}` format instead of bare strings.

### S6 — Extract cached_fetch → iptv_client (circular imports fixed)
Created `server/iptv_client.py` containing `client`, `iptv_url`, `fetch_iptv`, `cached_fetch`.
All 6 route modules (live.py, vod.py, search.py, guide.py, misc.py, admin.py) now import
from `iptv_client` instead of doing `import main as _main`. Eliminates the primary circular
import anti-pattern. Main.py re-exports for backward compat. 395 tests pass.

### S7 — Split stream.py (1105 lines) → 7 focused modules
Decomposed the monolithic 1105-line stream.py into focused modules:
  - `stream_core.py` (~280 lines) — shared helpers: generators, pipes, URL builders, MIME, probe cache
  - `stream_live.py` (~70 lines) — live TV proxy, transcode, quality-limited transcoding (3 routes)
  - `stream_vod.py` (~170 lines) — VOD remux, transcode, direct playback with Range support (8 routes)
  - `stream_convert.py` (~170 lines) — MKV→fMP4 conversion + cached MP4 serving (6 routes)
  - `stream_hls.py` (~140 lines) — HLS segmentation and segment serving (3 routes)
  - `stream_dash.py` (~100 lines) — DASH MPD manifest generation (3 routes)
  - `stream_probe.py` (~120 lines) — ffprobe-based codec detection (3 routes)
  `stream.py` remains the umbrella — re-exports all symbols, aggregates sub-routers.
  Zero test changes needed. 395 tests pass. Backend architecture grade C+→B-.

### S8 — Split guide.py (429 lines) → 3 focused modules
Decomposed guide.py (EPG parsing, TMDB enrichment, channel groups, SSE, 4 routes):
  - `guide_core.py` (~55 lines) — parse_xmltv() + EPG enrichment cache
  - `guide_epg.py` (~170 lines) — EPG loading, background refresh, broadcast loop, guide cache builder
  - `guide_routes.py` (~185 lines) — all 4 routes: tv_guide, epg_sse, guide_now, guide_enrich
  `guide.py` remains the umbrella — re-exports all symbols, aggregates the router.
  Zero test changes needed. 395 tests pass. Backend architecture grade B-→B.

---

## Recently Completed (archive)

### Cache warmer optimisation — parallel VOD+Series, retry, concurrency 50
Warm time significantly reduced: VOD and series category fetches now run
concurrently (were sequential). Each failed category gets one automatic
retry after 1s (previously silently skipped). Default concurrency bumped
from 20 to 50. Cuts wall time from VOD_time + series_time to
max(VOD_time, series_time).

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
