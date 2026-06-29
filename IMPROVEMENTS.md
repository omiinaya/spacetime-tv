# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

### P3.5 — Upgrade curl_cffi from 0.15.0
Check latest version for any IPTV provider compatibility improvements.
*(Note: curl_cffi 0.15.0 is already the latest as of June 2026)*

---

## Recently Completed

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

### Guide page performance — server-side cache of pre-processed channel groups
Commit `4501eb0`. Added `_build_guide_cache()` to `server/routes/guide.py`.
Before: 4.9s per /api/guide call parsing all EPG programmes + 48K live
stream fetch on every request. After: cache builds once (1.09s cold),
subsequent requests served in ~4ms. Guide page E2E load improved from
1.1m timeout → 11.2s (cold).

### Mobile responsive polish: homepage, carousels, filter tabs, guide layout
Commit `d39c1e2`. Homepage: reduced vertical spacing, 56px min-height touch
targets. LiveTV filter tabs: right-edge CSS mask gradient for scrollable
indicator. ContentRow carousels: pr-4 on mobile to prevent last-card truncation.
Guide/ChannelRow: 130px channel name column on mobile (vs 184px desktop),
right-edge fade indicator on programme scroll area.

### 46 E2E Browser Tests
Commit `ebf6024`. 6 new files (807 lines) covering navigation (13 tests),
live TV (5), movies (6), series (5), search (6), guide (4), watchlist (7).
All verified green with real backend + headless chromium.

### Phase 5-6 — stream.py generator refactoring
Commit `daddb96`. Extracted 3 shared helpers (`_curl_iter_chunks`, `_curl_feed_stdin`,
`_ffmpeg_pipe`) from 5 duplicated generators. All 5 generators reduced to ~10-line
wrappers. Net -87 lines (179 ins, 266 del). +6 dedicated helper tests.

---

## Completed Items (archived)

Items older than the last 5-10 completed entries are removed from this file.
Check `git log --oneline` for the full history.
