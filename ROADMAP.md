# SpacetimeTV Roadmap v4 — Full Codebase Audit

> **Audit date:** 2026-06-29
> **Architecture:** FastAPI monolith + React/Vite SPA | 69 API routes | 12 pages | 23 components
> **Test counts:** 395 backend + 1073 frontend unit + 46 E2E | TypeScript 0 errors
> **Codebase:** 9.2K Python + 10.5K TypeScript + 19.6K TSX = ~39K total

---

## Overall Grade

| Dimension | Grade | Score |
|-----------|-------|-------|
| **Testing depth** | B+ | 85% |
| **Frontend quality** | A- | 90% |
| **Backend architecture** | B | 75% |
| **Feature completeness** | C | 55% |
| **Security** | C+ | 65% |
| **Developer experience** | B- | 70% |
| **Performance** | B | 75% |

---

## 1. Testing (85%) — Good but not great

### Backend: 393 tests, 74% line coverage (✅ Good baseline, 🟡 gaps)
- **routes/vod.py: 95%** — excellent
- **routes/media.py: 92%** — excellent
- **routes/live.py: 86%** — good
- **routes/misc.py: 85%** — good
- **routes/search.py: 84%** — good
- **routes/tmdb.py: 75%** — missing person endpoints and enrichment fallback
- **routes/guide.py: 72%** — large file, missing EPG refresh and cache rebuild paths
- **routes/stream.py: 68%** — biggest file (1105 lines), many untested error branches
- **routes/admin.py: 62%** — stream-health dashboard, cache warm triggers not tested
- **main.py: 59%** — rate limiter, cache warmer, cleanup daemon untested

### Frontend: 1073 tests, coverage tool missing (✅ Many tests, 🟡 no coverage data)
- 23/23 components have tests — **100%** component coverage
- 11/12 pages have tests — **92%** (NotFound missing)
- 12/16 hooks have tests — **75%** (useMpegtsPlayer, usePlayerTypes, useRemuxPlayer, useShakaPlayer untested)
- 10/10 lib modules have tests — **100%**

### E2E: 46 tests, all passing (✅ Covers all major flows)
- Guide, Live TV, Movies, Series, Search, Watchlist, Navigation — all covered
- No mobile/tablet viewport tests
- No offline/PWA install flow tests
- No error-state tests (server down, blank EPG, empty search)

---

## 2. Frontend Quality (90%) — Very solid

### ✅ Strengths
- **TypeScript strict mode**: 0 `any` types, 0 TypeScript errors, clean `tsc -b` build
- **57 test files**, 1073 tests — comprehensive unit coverage for components, hooks, lib, pages
- **React 19 + React Router 8** — modern, actively maintained
- **Tailwind v4** with CSS-first config — no postcss/autoprefixer cruft
- **No Axios** — uses native `fetch()`, no extra dep
- **lucide-react** icons — lightweight, tree-shakeable
- **3 video players** — hls.js (HLS), mpegts.js (MPEG-TS), shaka-player (DASH) — covers all streaming formats
- **Code splitting** — 238 kB main, 38 kB Player async chunk
- **ErrorBoundary + ErrorReporter** — client errors beacon to backend

### 🟡 Gaps
- **No mobile/tablet viewport E2E tests** — only desktop Chromium
- **sonner toasts** — used for notifications, but many error paths just use console.error
- **ESLint broken** — ESLint v9 requires flat config format, project still uses `.eslintrc.*`
- **No Storybook or visual regression** — component tests exist but no visual diff
- **2 untested components**: BackToTop, WatchlistPopover
- **4 untested hooks**: useMpegtsPlayer, usePlayerTypes, useRemuxPlayer, useShakaPlayer

---

## 3. Backend Architecture (65%) — Working but messy

### ✅ What's Right
- **69 API routes** covering Live TV, Movies, Series, Search, EPG Guide, Admin, Watchlist, Health, Streams
- **Rate limiting** middleware (100 req/min for search/proxy, 1000 for general)
- **CORS middleware** configured (though wide open — `*`)
- **Environment-configurable** via config.py: IPTV creds, TTLs, cache settings
- **Docker-ready** — Dockerfiles for both server and web + docker-compose.yml
- **CI pipeline** — GitHub Actions E2E workflow
- **Works with zero API keys** — TMDB enrichment uses browserless CLI tool, IPTV provider needs creds

### 🔴 Anti-Patterns
- ~~**Circular imports everywhere**: every route file does `import main as _main` to access `cached_fetch`. This is _the_ classic Python sin. `cached_fetch` should live in `state.py` where `_cache` lives.~~ ✅ **Fixed** — all IPTV fetch/cache logic extracted to `server/iptv_client.py`. Route modules import from there directly.
- ~~**Monolith-in-disguise**: routes are in separate files but still coupled to `main.py` via lazy imports. No DI, no service layer.~~ Stream.py (1105 lines) now split into 7 focused modules.
- ~~**stream.py is 1105 lines** — violates single-responsibility. Should be split into streaming + remux + transcode modules.~~ ✅ **Fixed** — Split into 7 focused modules. Max module size: ~280 lines.
- ~~**guide.py is 434 lines** — EPG parsing, TMDB enrichment, channel groups all in one file.~~ ✅ **Fixed** — Split into guide_core, guide_epg, guide_routes. Max module: ~185 lines.
- ~~**3 hardcoded paths** to `/home/user/.local/share/hermes-cli-tools-venv/bin/tmdb-enrich` across search.py, tmdb.py, guide.py — should be a single env-var in config.py.~~ ✅ **Fixed** — now `TMDB_ENRICH_PATH` in `config.py`, importable from all modules.
- **No API versioning** — all routes are bare `/api/...`. No `/v1/` prefix, making future breaking changes painful.
- ~~**No consistent error response format** — some endpoints return `{"detail": "..."}`, others return 502 HTML from httpx, others return `{"error": "..."}`.~~ ✅ **Fixed** — 8 raw-text 502 responses in `stream.py` converted to `JSONResponse({"detail": "..."})`. All streaming error paths now return JSON.
- ~~**CACHE_TTL confusion**: `CACHE_TTL = 300` in state.py (5 min for API data) and `CACHE_TTL_HOURS = 2` in main.py (2h for cleanup) — different caches, confusingly similar names.~~ ✅ **Fixed** — renamed to `CLEANUP_TTL_HOURS` in main.py to distinguish from API data cache TTL.
- ~~**Admin endpoints unauthenticated** — anyone can hit `/api/admin/stats`, `/api/admin/stream-health`, `/api/admin/cache/clear` (no auth middleware).~~ ✅ **Fixed** — all admin routes require `X-Admin-Key` header matching `ADMIN_API_KEY` env var. Dev mode (empty key) bypasses auth. Frontend shows key prompt on 403.
- **Test fixtures mock upstream** — tests never run against real IPTV, so integration bugs slip through (e.g., the series_cats key drift that was caught in prod).

---

## 4. Feature Completeness (55%) — Strong basics, misses polish features

### ✅ Implemented
| Feature | Status |
|---------|--------|
| Live TV grid | ✅ 48K channels, categories, search, favorites |
| Movies catalog | ✅ 65K titles, 329 categories, TMDB enrichment, unified multi-language view |
| Series catalog | ✅ 246 categories, seasons, episodes, TMDB enrichment |
| EPG Guide | ✅ 3,557 channels, schedule grid, programme descriptions, search |
| Search | ✅ Multi-section (live/movies/series), history dropdown, enrichment |
| Watchlist | ✅ Movies + series, localStorage persisted, popover in sidebar |
| Continue Watching | ✅ Movies + series progress, auto-advance next episode |
| Video Player | ✅ HLS + MPEG-TS + DASH, subtitles, audio tracks, playback speed, PiP, sleep timer |
| Admin Dashboard | ✅ Cache stats, stream health (codec/resolution/type), error log, popular content |
| PWA Support | ✅ Install prompt, offline banner |
| Keyboard Shortcuts | ✅ Global + player shortcuts with help overlay (`?`) |
| Error Handling | ✅ ErrorBoundary, ErrorReporter beacon, error type differentiation |

### ❌ Missing vs Competitors (TiviMate / IPTV Smarters Pro)

| Feature | TiviMate | IPTV Smarters | Ours | Priority |
|---------|----------|--------------|------|----------|
| **Catch-up / Timeshift TV** | ✅ | ✅ | ❌ | **High** |
| **DVR / Recording** | ✅ | ✅ | ❌ | Medium |
| **Parental Controls (PIN)** | ✅ | ✅ | ❌ | Medium |
| **EPG Search** | ✅ | ✅ | ❌ | Medium |
| **Multi-provider** | ❌ | ✅ | ❌ | Low (architectural) |
| **Cloud favorites/backup** | ❌ | ✅ | ❌ | Medium |
| **Picture-in-Picture** | ✅ | ❌ | Partial (button, no system PiP) | Low |
| **Auto frame-rate** | ✅ | ❌ | ❌ | Low |
| **Theme customization** | ✅ | ✅ | ❌ (dark only) | Low |
| **Multi-user profiles** | ❌ | ✅ | ❌ | Low |

### What We Do Better
- **TMDB enrichment** — posters, ratings, plot on hover — competitors don't do this
- **Stream health dashboard** — codec/distribution analysis from ffprobe
- **Unified movie view** — groups multi-language versions under one card
- **Open source** — self-hosted, no subscription, no ads
- **Zero API keys** — just IPTV provider creds needed

---
- **69 API routes** covering Live TV, Movies, Series, Search, EPG Guide, Admin, Watchlist, Health, Streams
- **Rate limiting** middleware (100 req/min for search/proxy, 1000 for general)
- **CORS middleware** configured (though wide open — `*`)
- **Environment-configurable** via config.py: IPTV creds, TTLs, cache settings
- **Docker-ready** — Dockerfiles for both server and web + docker-compose.yml
- **CI pipeline** — GitHub Actions E2E workflow
- **Works with zero API keys** — TMDB enrichment uses browserless CLI tool, IPTV provider needs creds

### 🔴 Anti-Patterns
- ~~**Circular imports everywhere**: every route file does `import main as _main` to access `cached_fetch`. This is _the_ classic Python sin. `cached_fetch` should live in `state.py` where `_cache` lives.~~ ✅ **Fixed** — all IPTV fetch/cache logic extracted to `server/iptv_client.py`. Route modules import from there directly.
- ~~**Monolith-in-disguise**: routes are in separate files but still coupled to `main.py` via lazy imports. No DI, no service layer.~~ Stream.py (1105 lines) now split into 7 focused modules.
- ~~**stream.py is 1105 lines** — violates single-responsibility. Should be split into streaming + remux + transcode modules.~~ ✅ **Fixed** — Split into 7 focused modules. Max module size: ~280 lines.
- ~~**guide.py is 434 lines** — EPG parsing, TMDB enrichment, channel groups all in one file.~~ ✅ **Fixed** — Split into guide_core, guide_epg, guide_routes. Max module: ~185 lines.
- ~~**3 hardcoded paths** to `/home/user/.local/share/hermes-cli-tools-venv/bin/tmdb-enrich` across search.py, tmdb.py, guide.py — should be a single env-var in config.py.~~ ✅ **Fixed** — now `TMDB_ENRICH_PATH` in `config.py`, importable from all modules.
- **No API versioning** — all routes are bare `/api/...`. No `/v1/` prefix, making future breaking changes painful.
- ~~**No consistent error response format** — some endpoints return `{"detail": "..."}`, others return 502 HTML from httpx, others return `{"error": "..."}`.~~ ✅ **Fixed** — 8 raw-text 502 responses in `stream.py` converted to `JSONResponse({"detail": "..."})`. All streaming error paths now return JSON.
- ~~**CACHE_TTL confusion**: `CACHE_TTL = 300` in state.py (5 min for API data) and `CACHE_TTL_HOURS = 2` in main.py (2h for cleanup) — different caches, confusingly similar names.~~ ✅ **Fixed** — renamed to `CLEANUP_TTL_HOURS` in main.py to distinguish from API data cache TTL.
- ~~**Admin endpoints unauthenticated** — anyone can hit `/api/admin/stats`, `/api/admin/stream-health`, `/api/admin/cache/clear` (no auth middleware).~~ ✅ **Fixed** — all admin routes require `X-Admin-Key` header matching `ADMIN_API_KEY` env var. Dev mode (empty key) bypasses auth. Frontend shows key prompt on 403.
- **Test fixtures mock upstream** — tests never run against real IPTV, so integration bugs slip through (e.g., the series_cats key drift that was caught in prod).

---

### P1 — Priorities

| Item | Status |
|------|--------|
| P1.3 — 0-byte stream error UI | ✅ **Done** — Added `errorType` system (timeout, transcode_timeout, retry_exhausted, stream_error, not_supported, empty_stream). Player shows contextual icon + message + secondary help text per error mode. |
| P1.5 — Series continue-watching data | ✅ **Done** — `SeriesOverlay` now stores rich metadata (season, episode num, title, image, duration) to sessionStorage. `useVideoPlayer` reads it when saving progress. Movies similarly store poster/name. |

### P2 — UX Quality

| Item | Status |
|------|--------|
| P2.8 — Live TV DVR buffer | ✅ **Shipped** — 5-min ring buffer via mpegts.js auto-cleanup. Pause, seek back, rewind/forward, Go Live button. Requires MSE/SourceBuffer support (Chrome, Firefox, Safari). |

### P3 — Architecture & Technical Debt

| Item | Status |
|------|--------|
| P3.2 — Tailwind CSS v4 migration | ✅ **Done** — Migrated to Tailwind v4 (CSS-first config, `@theme` block, `@tailwindcss/vite`). Removed postcss, autoprefixer, JS config. Upgraded `tailwind-merge` to v3. Build clean. |
| P3.4 — Rich EPG with program metadata | ✅ **Done** — TMDB enrichment on hover + fallback images via tmdb-enrich CLI. Guide also has search + programme descriptions. |
| P3.5 — Multi-language audio track selector for VOD | ✅ **Done** — Backend ffmpeg remux + frontend switchAudioTrack(). Click a track in the AudioSelector to switch — player recreates with selected audio, seeks to current position. |
| P3.7 — EPG programme → TMDB enrichment | ✅ **Done** — `/api/guide/enrich` endpoint with tmdb-enrich CLI. Programme hover popovers show poster, rating, overview. |
| P3.8 — ManagedMediaSource API for MSE optimization | Modern browsers support ManagedMediaSource (Chrome 120+, Safari 17+). hls.js v1.6+ has partial support. |
| **P3.9 — Auto-advance next episode (series)** | ✅ **Done** — Player auto-navigates to next episode in season at ≥95% progress. Stores episode list + index in sessionStorage. |
| **Bug: unified endpoint limit** | ✅ **Fixed** — `/api/movies/unified` raised 422 for limit >100. Backend bumped to 1000. Watchlist page now uses 1000. |
| **Bug: nested buttons** | ✅ **Fixed** — Card wrappers changed from `<button>` to `<div role="button">` to fix `validateDOMNesting` warnings on Movies, Series, Watchlist pages. |

### P4 — Deep Cuts

| Item | Status |
|------|--------|
| Report from CW | Keyboard shortcut help overlay (`?`) — ✅ **Done** |

---

## Completed (this session)

| Item | Description |
|------|-------------|
| **Home dashboard** | New landing page with continue-watching rows (series + movies), TMDB trending movies/series rows, recently played live channels, quick-link grid to Live/Movies/Series/Watchlist. Empty state with browse buttons for first-time users. |
| **P3.2 — Tailwind v4 migration** | Migrated from postcss+JS-config to `@tailwindcss/vite` + CSS `@theme`. Removed postcss, autoprefixer, tailwind.config.js. Upgraded `tailwind-merge` to v3. Build clean, all tests pass. |
| **Live TV "Now Playing" EPG** | `/api/guide/now` batch endpoint + `useNowPlaying` hook. Fetches current programme for the first 200 visible channels every 30s. Programme title shown as subtitle on channel grid cards. |
| **Channel number badges** | Channel number badges (top-left) on all LiveTV grid cards. Shows when `num > 0`. |
| **Channel favorites** | Star/toggle favorite Live TV channels. Persisted to localStorage. Dedicated "⭐ Favorites" section at top of LiveTV page. Star buttons on channel cards in both LiveTV grid and EPG Guide. |
| P1.3 — Error differentiation | Added `errorType` enum (retry_exhausted, timeout, transcode_timeout, stream_error, not_supported, empty_stream). Player shows contextual icon + error message + secondary tip per error type. |
| P1.5 — Series CW metadata | `SeriesOverlay.playEpisode()` stores season/episode/title/duration to sessionStorage. `useVideoPlayer` reads it for `saveSeriesProgress()`. Same pattern for movie CW metadata. |
| Keyboard shortcut help | New `KeyboardShortcuts` component — press `?` to toggle overlay showing all global + player shortcuts with icons. Wired in App.tsx. |
| EPG programme descriptions | Hover any programme card in the Guide to see a popover with full XMLTV description, subtitle (italic), and category tags. Info icon indicator on cards with descriptions. |
| Guide search | Search bar filters programmes across all channels by title, subtitle, category, or description. Shows match count badge, hides non-matching channels. |
| Shortcuts in player menu | "Shortcuts" button in player's More menu dispatches custom event to toggle keyboard shortcut overlay. |
| Backend config dedup | `main.py` now imports from `config.py` instead of re-defining IPTV_BASE, UA_STR, rate limits, etc. |
| Frontend test coverage | Added 38 vitest tests for `guideUtils` (XMLTV timestamp parsing, time formatting, programme progress) and `continueWatching` (series/movie progress CRUD, expiry, ordering, edge cases). |
| Recently Completed row | Series page now shows a "Recently Completed" row with green checkmark overlay for episodes watched >=90%. Splits from "Continue Watching" which only shows in-progress (<90%) items. |
| EPG programme TMDB enrichment (P3.7) | Browserless tmdb-enrich CLI (no API key) wired into `/api/guide/enrich` — hover popovers show poster + rating + overview. |
| Persistent stream hit tracking | Popular content in admin dashboard survives restarts via `/tmp/stv_stream_hits.json`. |
|| Episode thumbnail fallback to season poster | Missing thumbnails fall back to TMDB season poster; season tab buttons get poster thumbnails. |
|| **Actor/person browsing** | TMDB person search + detail via tmdb-enrich CLI (no API key). PersonPage with bio, photo, birthday, roles, filmography grid. Clickable cast chips in MovieOverlay and SeriesOverlay. |
|| **HomePage loading skeleton fix** | Loading skeletons now always show for trending rows (not hidden when CW exists). "View all →" links on trending rows. |
|| **Episode progress indicators** | SeriesOverlay episode grid shows green checkmark for completed (≥90%) episodes, thin progress bar for in-progress, nothing for unwatched. |
|| **Admin endpoint auth** (Security D→C+) | All admin routes now require `X-Admin-Key` header matching `ADMIN_API_KEY` env var. Frontend prompts for key on 403. `ADMIN_API_KEY` auto-generated in .env. Backward-compatible: empty key = dev mode (no auth). |
|| **Centralise tmdb-enrich path** | 3 hardcoded paths consolidated into `config.py` as `TMDB_ENRICH_PATH`. Imported by tmdb.py, guide.py, search.py. Configurable via env var. |
|| **CACHE_TTL_HOURS → CLEANUP_TTL_HOURS** | Renamed to eliminate confusion with API data cache `CACHE_TTL = 300` in state.py. |
|| **Admin auth test coverage** | 2 new tests for `require_admin_key` — 403/200 with key, dev-mode bypass. 395 backend tests pass. |
|| **Consistent JSON error responses** | 8 raw-text 502 errors in `stream.py` → `JSONResponse({"detail": "..."})`. |
|| **Extract iptv_client — circular imports fixed** | Created `server/iptv_client.py`. All 6 route modules import from there instead of `import main as _main`. Removes 25+ lazy imports from `main`. `main.py` size reduced by ~60 lines. |
|| **Split stream.py (1105 lines) → 7 focused modules** | stream_core, stream_live, stream_vod, stream_convert, stream_hls, stream_dash, stream_probe. Umbrella stream.py re-exports everything. Zero test changes. Backend architecture C+→B-. |
|| **Split guide.py (429 lines) → 3 focused modules** | guide_core, guide_epg, guide_routes. Umbrella guide.py re-exports everything. Zero test changes. Backend architecture B-→B. |

## Completed (previous sessions)

| Area | Items |
|------|-------|
| **P1 — Hot Fixes** | Search debounce (300ms) ✅ | Image proxy referrer guard ✅ | Alt text on all `<img>` ✅ | useEffect empty deps audited ✅ | 28 backend tests ✅ |
| **P2 — UX Quality** | Movie continue-watching ✅ | Watchlist/favorites ✅ | Recently added ✅ | Similar movies (TMDB) ✅ | Inline trailer ✅ | Playback speed ✅ | PiP button ✅ |
| **P3 — Architecture** | Player hook extracted ✅ | Guide split ✅ | EPG background refresh ✅ | Search history ✅ | Pagination UI ✅ |
| **P4 — Deep Cuts** | Subtitles ✅ | Audio tracks ✅ | Download offline ✅ | `/` keyboard shortcut ✅ | Sleep timer ✅ | Mobile swipe-back ✅ | Admin dashboard ✅ | Cache warmer config ✅ |
| **Perf** | Split mpegts.js/hls.js → async chunks (882 kB -> 38 kB Player) ✅ | IntersectionObserver root fix for LiveTV infinite scroll ✅ |
| **Stability** | `retryStream` wired to error button for live TV recovery ✅ | SSE heartbeat for stale-session recovery ✅ | Image proxy disk cache (L2, 24h TTL, 500MB) ✅ |
| **Series** | TMDB Trending This Week row ✅ | TMDB TV/series proxy endpoints ✅ | TMDB series detail enrichment in SeriesOverlay ✅ | Series continue-watching ✅ |
