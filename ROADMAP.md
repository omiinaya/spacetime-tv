1|# SpacetimeTV Roadmap v4 — Full Codebase Audit
2|
3|> **Audit date:** 2026-06-29
4|> **Architecture:** FastAPI monolith + React/Vite SPA | 69 API routes | 12 pages | 23 components
5|> **Test counts:** 500+ backend + 1184 frontend unit + 46 E2E | TypeScript 0 errors (2 pre-existing)
6|> **Codebase:** 9.2K Python + 10.5K TypeScript + 19.6K TSX = ~39K total
7|
8|---
9|
10|## Overall Grade
11|
12|| Dimension | Grade | Score |
13||-----------|-------|-------|
14|| **Testing depth** | A- | 92% |
15|| **Frontend quality** | A | 93% |
16|| **Backend architecture** | B | 75% |
17|| **Feature completeness** | B+ | 78% |
18|| **Security** | B | 78% |
19|| **Developer experience** | B | 77% |
20|| **Performance** | B | 75% |
21|
22|---
23|
24|## 1. Testing (85%) — Good but not great
25|
26|### Backend: 500+ tests, 82% line coverage (✅ Good baseline, 🟡 few gaps)
27|- **main.py: 94%** — rate limiter, cache warmer, cleanup loop all tested
28|- **routes/admin.py: 98%** — stream-health dashboard, cache warm triggers tested
29|- **routes/vod.py: 95%** — excellent
30|- **routes/media.py: 92%** — excellent
31|- **routes/live.py: 86%** — good
32|- **routes/misc.py: 85%** — good
33|- **routes/search.py: 84%** — good
34|- **routes/tmdb.py: 75%** — missing person endpoints and enrichment fallback
35|- **routes/guide.py: 90%** — guide_core/guide_epg at 100%, guide_routes at 90% (SSE stream body is runtime-only path)
36|- **routes/stream.py: 78%** — biggest file (split into 7 modules), timeshift, ffmpeg-pipe, _safe_convert now tested
37|
38|### Frontend: 1166 tests (✅ Comprehensive coverage)
39|- 12/12 pages have tests — **100%** page coverage
40|- 23/23 components have tests — **100%** component coverage
41|- 16/16 hooks have tests — **100%** hook coverage
42|- 10/10 lib modules have tests — **100%** lib coverage
43|
44|### E2E: 56 tests (46 desktop + 10 mobile) (✅ Covers all major flows + responsive)
45|- Guide, Live TV, Movies, Series, Search, Watchlist, Navigation — all covered
46|- Mobile Chrome (Pixel 5), Mobile Safari (iPhone 13), Tablet (iPad) viewport projects
47|- No offline/PWA install flow tests
48|- No error-state tests (server down, blank EPG, empty search)
49|
50|---
51|
52|## 2. Frontend Quality (90%) — Very solid
53|
54|### ✅ Strengths
55|- **TypeScript strict mode**: 0 `any` types, 0 TypeScript errors, clean `tsc -b` build
56|- **64 test files**, 1166 tests — comprehensive unit coverage for pages, components, hooks, lib
57|- **React 19 + React Router 8** — modern, actively maintained
58|- **ESLint 9** with flat config + typescript-eslint — 0 errors, 0 warnings
59|- **Tailwind v4** with CSS-first config — no postcss/autoprefixer cruft
60|- **No Axios** — uses native `fetch()`, no extra dep
61|- **lucide-react** icons — lightweight, tree-shakeable
62|- **3 video players** — hls.js (HLS), mpegts.js (MPEG-TS), shaka-player (DASH) — covers all streaming formats
63|- **Code splitting** — 238 kB main, 38 kB Player async chunk
64|- **ErrorBoundary + ErrorReporter** — client errors beacon to backend
65|
66|### 🟡 Gaps
67|- **sonner toasts** — used for notifications, but many error paths just use console.error
68|- **No Storybook or visual regression** — component tests exist but no visual diff
69|- **No offline/PWA install flow tests** in E2E
70|
71|---
72|
73|## 3. Backend Architecture (65%) — Working but messy
74|
75|### ✅ What's Right
76|- **69 API routes** covering Live TV, Movies, Series, Search, EPG Guide, Admin, Watchlist, Health, Streams
77|- **Rate limiting** middleware (100 req/min for search/proxy, 1000 for general)
78|- **CORS middleware** hardened to known origins (Vite dev, nginx prod, LAN)
79|- **Environment-configurable** via config.py: IPTV creds, TTLs, cache settings
80|- **Docker-ready** — Dockerfiles for both server and web + docker-compose.yml
81|- **CI pipeline** — GitHub Actions E2E workflow
82|- **Works with zero API keys** — TMDB enrichment uses browserless CLI tool, IPTV provider needs creds
83|
84|### 🔴 Anti-Patterns
85|- ~~**Circular imports everywhere**: every route file does `import main as _main` to access `cached_fetch`. This is _the_ classic Python sin. `cached_fetch` should live in `state.py` where `_cache` lives.~~ ✅ **Fixed** — all IPTV fetch/cache logic extracted to `server/iptv_client.py`. Route modules import from there directly.
86|- ~~**Monolith-in-disguise**: routes are in separate files but still coupled to `main.py` via lazy imports. No DI, no service layer.~~ Stream.py (1105 lines) now split into 7 focused modules.
87|- ~~**stream.py is 1105 lines** — violates single-responsibility. Should be split into streaming + remux + transcode modules.~~ ✅ **Fixed** — Split into 7 focused modules. Max module size: ~280 lines.
88|- ~~**guide.py is 434 lines** — EPG parsing, TMDB enrichment, channel groups all in one file.~~ ✅ **Fixed** — Split into guide_core, guide_epg, guide_routes. Max module: ~185 lines.
89|- ~~**3 hardcoded paths** to `/home/user/.local/share/hermes-cli-tools-venv/bin/tmdb-enrich` across search.py, tmdb.py, guide.py — should be a single env-var in config.py.~~ ✅ **Fixed** — now `TMDB_ENRICH_PATH` in `config.py`, importable from all modules.
90|- **No API versioning** — all routes are bare `/api/...`. No `/v1/` prefix, making future breaking changes painful.
91|- ~~**No consistent error response format** — some endpoints return `{"detail": "..."}`, others return 502 HTML from httpx, others return `{"error": "..."}`.~~ ✅ **Fixed** — 8 raw-text 502 responses in `stream.py` converted to `JSONResponse({"detail": "..."})`. All streaming error paths now return JSON.
92|- ~~**CACHE_TTL confusion**: `CACHE_TTL = 300` in state.py (5 min for API data) and `CACHE_TTL_HOURS = 2` in main.py (2h for cleanup) — different caches, confusingly similar names.~~ ✅ **Fixed** — renamed to `CLEANUP_TTL_HOURS` in main.py to distinguish from API data cache TTL.
93|- ~~**Admin endpoints unauthenticated** — anyone can hit `/api/admin/stats`, `/api/admin/stream-health`, `/api/admin/cache/clear` (no auth middleware).~~ ✅ **Fixed** — all admin routes require `X-Admin-Key` header matching `ADMIN_API_KEY` env var. Dev mode (empty key) bypasses auth. Frontend shows key prompt on 403.
94|- **Test fixtures mock upstream** — tests never run against real IPTV, so integration bugs slip through (e.g., the series_cats key drift that was caught in prod).
95|
96|---
97|
98|## 4. Feature Completeness (55%) — Strong basics, misses polish features
99|
100|### ✅ Implemented
101|| Feature | Status |
102||---------|--------|
103|| Live TV grid | ✅ 48K channels, categories, search, favorites |
104|| Movies catalog | ✅ 65K titles, 329 categories, TMDB enrichment, unified multi-language view |
105|| Series catalog | ✅ 246 categories, seasons, episodes, TMDB enrichment |
106|| EPG Guide | ✅ 3,557 channels, schedule grid, programme descriptions, search |
107|| Search | ✅ Multi-section (live/movies/series), history dropdown, enrichment |
108|| Watchlist | ✅ Movies + series, localStorage persisted, popover in sidebar |
109|| Continue Watching | ✅ Movies + series progress, auto-advance next episode |
110|| Video Player | ✅ HLS + MPEG-TS + DASH, subtitles, audio tracks, playback speed, PiP, sleep timer |
111|| Admin Dashboard | ✅ Cache stats, stream health (codec/resolution/type), error log, popular content |
112|| PWA Support | ✅ Install prompt, offline banner |
113|| Keyboard Shortcuts | ✅ Global + player shortcuts with help overlay (`?`) |
114|| Error Handling | ✅ ErrorBoundary, ErrorReporter beacon, error type differentiation |
115|
116|### ❌ Missing vs Competitors (TiviMate / IPTV Smarters Pro)
117|
118|| Feature | TiviMate | IPTV Smarters | Ours | Priority |
119||---------|----------|--------------|------|----------|
120|| **Catch-up / Timeshift TV** | ✅ | ✅ | ✅ | **High** |
121|| **DVR / Recording** | ✅ | ✅ | ✅ | **High** |
122|| **Parental Controls (PIN)** | ✅ | ✅ | ✅ | **High** |
123|| **EPG Search** | ✅ | ✅ | ✅ | **Medium** |
124|| **Multi-provider** | ❌ | ✅ | ❌ | Low (architectural) |
125|| **Cloud favorites/backup** | ❌ | ✅ | ✅ | **Medium** |
126|| **Picture-in-Picture** | ✅ | ❌ | Partial (button, no system PiP) | Low |
127|| **Auto frame-rate** | ✅ | ❌ | ❌ | Low |
128|| **Theme customization** | ✅ | ✅ | ❌ (dark only) | Low |
129|| **Multi-user profiles** | ❌ | ✅ | ❌ | Low |
130|
131|### What We Do Better
132|- **TMDB enrichment** — posters, ratings, plot on hover — competitors don't do this
133|- **Stream health dashboard** — codec/distribution analysis from ffprobe
134|- **Unified movie view** — groups multi-language versions under one card
135|- **Open source** — self-hosted, no subscription, no ads
136|- **Zero API keys** — just IPTV provider creds needed
137|
138|---
139|- **69 API routes** covering Live TV, Movies, Series, Search, EPG Guide, Admin, Watchlist, Health, Streams
140|- **Rate limiting** middleware (100 req/min for search/proxy, 1000 for general)
141|- **CORS middleware** hardened to known origins (Vite dev, nginx prod, LAN)
142|- **Environment-configurable** via config.py: IPTV creds, TTLs, cache settings
143|- **Docker-ready** — Dockerfiles for both server and web + docker-compose.yml
144|- **CI pipeline** — GitHub Actions E2E workflow
145|- **Works with zero API keys** — TMDB enrichment uses browserless CLI tool, IPTV provider needs creds
146|
147|### 🔴 Anti-Patterns
148|- ~~**Circular imports everywhere**: every route file does `import main as _main` to access `cached_fetch`. This is _the_ classic Python sin. `cached_fetch` should live in `state.py` where `_cache` lives.~~ ✅ **Fixed** — all IPTV fetch/cache logic extracted to `server/iptv_client.py`. Route modules import from there directly.
149|- ~~**Monolith-in-disguise**: routes are in separate files but still coupled to `main.py` via lazy imports. No DI, no service layer.~~ Stream.py (1105 lines) now split into 7 focused modules.
150|- ~~**stream.py is 1105 lines** — violates single-responsibility. Should be split into streaming + remux + transcode modules.~~ ✅ **Fixed** — Split into 7 focused modules. Max module size: ~280 lines.
151|- ~~**guide.py is 434 lines** — EPG parsing, TMDB enrichment, channel groups all in one file.~~ ✅ **Fixed** — Split into guide_core, guide_epg, guide_routes. Max module: ~185 lines.
152|- ~~**3 hardcoded paths** to `/home/user/.local/share/hermes-cli-tools-venv/bin/tmdb-enrich` across search.py, tmdb.py, guide.py — should be a single env-var in config.py.~~ ✅ **Fixed** — now `TMDB_ENRICH_PATH` in `config.py`, importable from all modules.
153|- **No API versioning** — all routes are bare `/api/...`. No `/v1/` prefix, making future breaking changes painful.
154|- ~~**No consistent error response format** — some endpoints return `{"detail": "..."}`, others return 502 HTML from httpx, others return `{"error": "..."}`.~~ ✅ **Fixed** — 8 raw-text 502 responses in `stream.py` converted to `JSONResponse({"detail": "..."})`. All streaming error paths now return JSON.
155|- ~~**CACHE_TTL confusion**: `CACHE_TTL = 300` in state.py (5 min for API data) and `CACHE_TTL_HOURS = 2` in main.py (2h for cleanup) — different caches, confusingly similar names.~~ ✅ **Fixed** — renamed to `CLEANUP_TTL_HOURS` in main.py to distinguish from API data cache TTL.
156|- ~~**Admin endpoints unauthenticated** — anyone can hit `/api/admin/stats`, `/api/admin/stream-health`, `/api/admin/cache/clear` (no auth middleware).~~ ✅ **Fixed** — all admin routes require `X-Admin-Key` header matching `ADMIN_API_KEY` env var. Dev mode (empty key) bypasses auth. Frontend shows key prompt on 403.
157|- **Test fixtures mock upstream** — tests never run against real IPTV, so integration bugs slip through (e.g., the series_cats key drift that was caught in prod).
158|
159|---
160|
161|### P1 — Priorities
162|
163|| Item | Status |
164||------|--------|
165|| P1.3 — 0-byte stream error UI | ✅ **Done** — Added `errorType` system (timeout, transcode_timeout, retry_exhausted, stream_error, not_supported, empty_stream). Player shows contextual icon + message + secondary help text per error mode. |
166|| P1.5 — Series continue-watching data | ✅ **Done** — `SeriesOverlay` now stores rich metadata (season, episode num, title, image, duration) to sessionStorage. `useVideoPlayer` reads it when saving progress. Movies similarly store poster/name. |
167|
168|### P2 — UX Quality
169|
170|| Item | Status |
171||------|--------|
172|| P2.8 — Live TV DVR buffer | ✅ **Shipped** — 5-min ring buffer via mpegts.js auto-cleanup. Pause, seek back, rewind/forward, Go Live button. Requires MSE/SourceBuffer support (Chrome, Firefox, Safari). |
173|
174|### P3 — Architecture & Technical Debt
175|
176|| Item | Status |
177||------|--------|
178|| P3.2 — Tailwind CSS v4 migration | ✅ **Done** — Migrated to Tailwind v4 (CSS-first config, `@theme` block, `@tailwindcss/vite`). Removed postcss, autoprefixer, JS config. Upgraded `tailwind-merge` to v3. Build clean. |
179|| P3.4 — Rich EPG with program metadata | ✅ **Done** — TMDB enrichment on hover + fallback images via tmdb-enrich CLI. Guide also has search + programme descriptions. |
180|| P3.5 — Multi-language audio track selector for VOD | ✅ **Done** — Backend ffmpeg remux + frontend switchAudioTrack(). Click a track in the AudioSelector to switch — player recreates with selected audio, seeks to current position. |
181|| P3.7 — EPG programme → TMDB enrichment | ✅ **Done** — `/api/guide/enrich` endpoint with tmdb-enrich CLI. Programme hover popovers show poster, rating, overview. |
182|| P3.8 — ManagedMediaSource API for MSE optimization | Modern browsers support ManagedMediaSource (Chrome 120+, Safari 17+). hls.js v1.6+ has partial support. |
183|| **P3.9 — Auto-advance next episode (series)** | ✅ **Done** — Player auto-navigates to next episode in season at ≥95% progress. Stores episode list + index in sessionStorage. |
184|| **Bug: unified endpoint limit** | ✅ **Fixed** — `/api/movies/unified` raised 422 for limit >100. Backend bumped to 1000. Watchlist page now uses 1000. |
185|| **Bug: nested buttons** | ✅ **Fixed** — Card wrappers changed from `<button>` to `<div role="button">` to fix `validateDOMNesting` warnings on Movies, Series, Watchlist pages. |
186|
187|### P4 — Deep Cuts
188|
189|| Item | Status |
190||------|--------|
191|| Report from CW | Keyboard shortcut help overlay (`?`) — ✅ **Done** |
192|
193|---
194|
195|## Completed (this session)
196|
197|| Item | Description |
198||------|-------------|
199|| **Home dashboard** | New landing page with continue-watching rows (series + movies), TMDB trending movies/series rows, recently played live channels, quick-link grid to Live/Movies/Series/Watchlist. Empty state with browse buttons for first-time users. |
200|| **P3.2 — Tailwind v4 migration** | Migrated from postcss+JS-config to `@tailwindcss/vite` + CSS `@theme`. Removed postcss, autoprefixer, tailwind.config.js. Upgraded `tailwind-merge` to v3. Build clean, all tests pass. |
201|| **Live TV "Now Playing" EPG** | `/api/guide/now` batch endpoint + `useNowPlaying` hook. Fetches current programme for the first 200 visible channels every 30s. Programme title shown as subtitle on channel grid cards. |
202|| **Channel number badges** | Channel number badges (top-left) on all LiveTV grid cards. Shows when `num > 0`. |
203|| **Channel favorites** | Star/toggle favorite Live TV channels. Persisted to localStorage. Dedicated "⭐ Favorites" section at top of LiveTV page. Star buttons on channel cards in both LiveTV grid and EPG Guide. |
204|| P1.3 — Error differentiation | Added `errorType` enum (retry_exhausted, timeout, transcode_timeout, stream_error, not_supported, empty_stream). Player shows contextual icon + error message + secondary tip per error type. |
205|| P1.5 — Series CW metadata | `SeriesOverlay.playEpisode()` stores season/episode/title/duration to sessionStorage. `useVideoPlayer` reads it for `saveSeriesProgress()`. Same pattern for movie CW metadata. |
206|| Keyboard shortcut help | New `KeyboardShortcuts` component — press `?` to toggle overlay showing all global + player shortcuts with icons. Wired in App.tsx. |
207|| EPG programme descriptions | Hover any programme card in the Guide to see a popover with full XMLTV description, subtitle (italic), and category tags. Info icon indicator on cards with descriptions. |
208|| Guide search | Search bar filters programmes across all channels by title, subtitle, category, or description. Shows match count badge, hides non-matching channels. |
209|| Shortcuts in player menu | "Shortcuts" button in player's More menu dispatches custom event to toggle keyboard shortcut overlay. |
210|| Backend config dedup | `main.py` now imports from `config.py` instead of re-defining IPTV_BASE, UA_STR, rate limits, etc. |
211|| Frontend test coverage | Added 38 vitest tests for `guideUtils` (XMLTV timestamp parsing, time formatting, programme progress) and `continueWatching` (series/movie progress CRUD, expiry, ordering, edge cases). |
212|| Recently Completed row | Series page now shows a "Recently Completed" row with green checkmark overlay for episodes watched >=90%. Splits from "Continue Watching" which only shows in-progress (<90%) items. |
213|| EPG programme TMDB enrichment (P3.7) | Browserless tmdb-enrich CLI (no API key) wired into `/api/guide/enrich` — hover popovers show poster + rating + overview. |
214|| Persistent stream hit tracking | Popular content in admin dashboard survives restarts via `/tmp/stv_stream_hits.json`. |
215||| Episode thumbnail fallback to season poster | Missing thumbnails fall back to TMDB season poster; season tab buttons get poster thumbnails. |
216||| **Actor/person browsing** | TMDB person search + detail via tmdb-enrich CLI (no API key). PersonPage with bio, photo, birthday, roles, filmography grid. Clickable cast chips in MovieOverlay and SeriesOverlay. |
217||| **HomePage loading skeleton fix** | Loading skeletons now always show for trending rows (not hidden when CW exists). "View all →" links on trending rows. |
218||| **Episode progress indicators** | SeriesOverlay episode grid shows green checkmark for completed (≥90%) episodes, thin progress bar for in-progress, nothing for unwatched. |
219||| **Admin endpoint auth** (Security D→C+) | All admin routes now require `X-Admin-Key` header matching `ADMIN_API_KEY` env var. Frontend prompts for key on 403. `ADMIN_API_KEY` auto-generated in .env. Backward-compatible: empty key = dev mode (no auth). |
220||| **Centralise tmdb-enrich path** | 3 hardcoded paths consolidated into `config.py` as `TMDB_ENRICH_PATH`. Imported by tmdb.py, guide.py, search.py. Configurable via env var. |
221||| **CACHE_TTL_HOURS → CLEANUP_TTL_HOURS** | Renamed to eliminate confusion with API data cache `CACHE_TTL = 300` in state.py. |
222||| **Admin auth test coverage** | 2 new tests for `require_admin_key` — 403/200 with key, dev-mode bypass. 395 backend tests pass. |
223||| **Consistent JSON error responses** | 8 raw-text 502 errors in `stream.py` → `JSONResponse({"detail": "..."})`. |
224||| **Extract iptv_client — circular imports fixed** | Created `server/iptv_client.py`. All 6 route modules import from there instead of `import main as _main`. Removes 25+ lazy imports from `main`. `main.py` size reduced by ~60 lines. |
225||| **Split stream.py (1105 lines) → 7 focused modules** | stream_core, stream_live, stream_vod, stream_convert, stream_hls, stream_dash, stream_probe. Umbrella stream.py re-exports everything. Zero test changes. Backend architecture C+→B-. |
226|||| **Split guide.py (429 lines) → 3 focused modules** | guide_core, guide_epg, guide_routes. Umbrella guide.py re-exports everything. Zero test changes. Backend architecture B-→B. |
227|||| **Catch-up / Timeshift TV** | Full backend (timeshift route + EPG timeline endpoint + tv_archive fields) + frontend (CatchupTimeline with programme timeline bar, click-to-seek, Live button, query-param timeshift mode, ARCH badge on channel cards). 366 lines, 1154 tests pass. |
228|||| **DVR / Recording** | Backend: record/start, record/stop, recordings list/get/delete, MP4 serve via ffmpeg. Frontend: RecordingsPage (list, play, delete, auto-refresh), WatchRecording standalone player, Record button in Player (desktop + mobile), Radio icon in sidebar nav. 454 lines, 1154 frontend tests pass, 395 backend pass. |
229|||| **Parental Controls (PIN)** | SHA-256 hashed PIN via Web Crypto API, PinPrompt modal with 4-digit numpad, adult toggle always visible (PIN-gated when configured), PIN setup/change/remove in Settings, adultUnlocked session state, filterCategories blocks adult channels when PIN locked. 432 lines, 1152/1154 tests pass. |
230|
231|## Completed (previous sessions)
232|
233|| Area | Items |
234||------|-------|
235|| **P1 — Hot Fixes** | Search debounce (300ms) ✅ | Image proxy referrer guard ✅ | Alt text on all `<img>` ✅ | useEffect empty deps audited ✅ | 28 backend tests ✅ |
236|| **P2 — UX Quality** | Movie continue-watching ✅ | Watchlist/favorites ✅ | Recently added ✅ | Similar movies (TMDB) ✅ | Inline trailer ✅ | Playback speed ✅ | PiP button ✅ |
237|| **P3 — Architecture** | Player hook extracted ✅ | Guide split ✅ | EPG background refresh ✅ | Search history ✅ | Pagination UI ✅ |
238|| **P4 — Deep Cuts** | Subtitles ✅ | Audio tracks ✅ | Download offline ✅ | `/` keyboard shortcut ✅ | Sleep timer ✅ | Mobile swipe-back ✅ | Admin dashboard ✅ | Cache warmer config ✅ |
239|| **Perf** | Split mpegts.js/hls.js → async chunks (882 kB -> 38 kB Player) ✅ | IntersectionObserver root fix for LiveTV infinite scroll ✅ |
240|| **Stability** | `retryStream` wired to error button for live TV recovery ✅ | SSE heartbeat for stale-session recovery ✅ | Image proxy disk cache (L2, 24h TTL, 500MB) ✅ |
241|| **Series** | TMDB Trending This Week row ✅ | TMDB TV/series proxy endpoints ✅ | TMDB series detail enrichment in SeriesOverlay ✅ | Series continue-watching ✅ |
242|