# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

### P1 (Ship Blockers)

1. **P1.1 — Backend test coverage: admin.py (62%)** — Add tests for stream-health dashboard endpoint, cache warm trigger, and EPG refresh endpoint.
2. **P1.2 — Backend test coverage: main.py (59%)** — Add tests for rate limiter middleware, cache warmer background task, cleanup daemon, and lifespan startup/shutdown.
3. **P1.3 — System Picture-in-Picture** — Player has a PiP button but doesn't use the native Document Picture-in-Picture API. Wire up `documentPictureInPicture` for proper system-level PiP with resize/close events.

### P2 (UX Polish)

4. **P2.1 — NotFound page test coverage** — The only page without tests. Add vitest tests for NotFound.tsx (render, Go Home navigation, Go Back navigation).
5. **P2.2 — Mobile/tablet viewport E2E tests** — All 46 E2E tests run on desktop Chromium only. Add mobile viewport config and test key flows at responsive breakpoints.
6. **P2.3 — ESLint flat config migration** — Project still uses `.eslintrc.*` format; ESLint v9 requires flat config. Migrate to `eslint.config.js` with modern rules.

### P3 (Nice to Have)

7. **P3.1 — Auto frame-rate switching** — Detect video frame rate and switch display refresh rate for smoother playback (requires Screen Capture API or extension).
8. **P3.2 — Theme customization (light/dark mode)** — Currently dark-only. Add CSS variables for light theme, settings toggle, system preference detection.

### P4 (Tech Debt / DX)

9. **P4.1 — Backend test coverage: guide.py (72%)** — Missing EPG refresh and cache rebuild test paths.
10. **P4.2 — Backend test coverage: tmdb.py (75%)** — Missing person endpoints and enrichment fallback tests.

---

## Recently Completed

### ✅ Flaky test fix — Player test missing api.guide.catchup mock
New CatchupTimeline component (Catch-up/Timeshift TV feature) calls `api.guide.catchup()` on mount for live streams. The Player.test.tsx mock for `@/lib/api` didn't include `guide.catchup`, causing `TypeError: Cannot read properties of undefined (reading 'catchup')` in the "renders a video element for live type" test. Added the mock — 1154/1154 frontend tests pass.

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

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
