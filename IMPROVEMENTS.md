# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

### P3.1 — Make epg_cache.json TTL configurable via environment variable
Currently `EPG_CACHE_TTL = 3600` is hardcoded in `config.py`. Add `EPG_CACHE_TTL`
env var support so ops can tune the cache refresh interval without code changes.
Follow the `os.getenv("VAR", default=int)` pattern used elsewhere in config.py.

### P3.2 — Watchlist UI popover
Add a dropdown from the nav bar showing recently watched items, similar to
streaming services. Would need a small backend endpoint returning the last N
watchlist items with metadata, and a popover component on the frontend.

### P3.3 — Stream health dashboard
Live channel probe aggregator showing bitrate/codec stats per channel. Could
be a new admin page that runs ffprobe probes in the background and reports
results. Uses the existing `admin.py` route module.

### P3.4 — Upgrade FastAPI from 0.111.0 → 0.138.x
Current: 0.111.0. Latest: 0.138.1. Check changelog for breaking changes
(especially OpenAPI schema generation, dependency injection). Run full
test suite before and after.

### P3.5 — Upgrade curl_cffi from 0.15.0
Check latest version for any IPTV provider compatibility improvements.

---

## Recently Completed

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
