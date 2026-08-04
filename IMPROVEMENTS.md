# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

- **P2 — distributed rate limiting** (SECURITY_AUDIT #8) — Redis-backed for multi-instance
- **P2 — `ALLOW_LAN_BYPASS=false` in production `.env`** (SECURITY_AUDIT #10)
- ~~**P2 — wire CACHE_TTL_HOURS/CLEANUP_INTERVAL into runtime**~~ ✅ **RESOLVED `ab96e6d`** — env-driven via `_int_env` with graceful fallback (garbage values don't crash startup); conftest sentinel 0→1; 4 wiring tests
- **P3 — `env_file: ./server/.env` is hard-required** — compose fails on a fresh clone before the app can auto-generate a key (**RESOLVED `def0ba6`** — no longer pending)
- **P4 — player control row touch targets < 44px** (a11y audit low: Speed/Record/Download/Quality/Volume/SleepTimer/SubtitleSelector/MobileMoreMenu — currently 40px; deliberate density compromise, bump only if mobile overflow is re-evaluated)

---

### ✅ Session 13 (2026-08-03) — public-release hardening: zero hardcoded endpoints/creds

**Audit result: gitleaks over all ~900 commits = 0 real secrets** (1 false positive — test cache key). Everything user-specific (LAN IP, real provider endpoint) externalized or scrubbed. Backend 1591 passed (+3 config/CORS tests), frontend 1924 passed.

- **Hardcoded LAN IP removed** — `server/config.py` CORS defaults, `main.py` LAN-bypass list, `web/docker-entrypoint.sh` cert SANs no longer bake in the operator's IP:
  - CORS serve host → **`STV_HOST`** env (auto-adds origins for standard ports)
  - LAN bypass → RFC1918 subnet matching + **`LAN_BYPASS_HOSTS`** exact-match list
  - Cert CN/SANs → `CERT_CN` / `CERT_SANS` env vars
- **Provider endpoint scrubbed** — the real provider host is gone from both `.env.example` files, code comments, e2e specs, docs; placeholders now `your-iptv-provider.example.com`.
- **Tracked Playwright auth state removed** — `web/e2e/.auth/` gitignored; `.auth/main-profile.json` deleted from history tracking.
- **First-run UX** — LiveTV empty state explains `IPTV_BASE/USER/PASS` / `PROVIDERS_JSON` and links to Admin (3 new tests; `useNavigate` wired).
- **Docs** — README rewritten for BYO-provider onboarding; SECURITY_AUDIT hardening note; ROADMAP session log; AGENTS.md env table expanded (STV_HOST, LAN_BYPASS_HOSTS, PROVIDERS_JSON, ADMIN_API_KEY, ENCRYPT_CREDENTIALS) and stripped of 179 embedded line-number artifacts.
- **Remaining (unchanged):** P2 distributed rate limiting, P2 `ALLOW_LAN_BYPASS=false` in prod `.env`, P2 wire CACHE_TTL_HOURS/CLEANUP_INTERVAL.

### ✅ Session 12.8 (2026-08-02) — backend coverage drive 91→97%, 1588 tests

Backend coverage 91%→**97%** (3582 stmts, 101 missed), suite 1464→**1588** passed / 17 skipped / 3 xfailed. 20 modules at **100%**: auth, crypto_utils, tmdb, misc, live, guide_epg, admin, state, stream_core, stream_dash, stream_probe, guide, guide_core, media, vod, record, watchlist, stream_live (partial), plus stream/stream_live at 97%+.

- **`verify_device_token` dead code removed** (auth 83→100%): imported `state._backups` which has NEVER existed → any call raised ImportError. Dead + broken in the auth hot path; main.py uses `verify_device_token_generic` + cloud_sync's `_verify_device_access`. +18 tests for token-verify branches, require_auth dependency, profile persistence errors, PIN lockout pruning, favorite init/missing branches.
- **iptv_client multi-provider + failover** (40→80% then →98%): fetch_all_providers dedup/health, fetch_epg_all_providers merge, fetch_iptv failover, _fetch_single_provider decrypt, single-provider cached_fetch (success/stale-fallback/re-raise), health-swallow.
- **guide_routes 81→91%** (guide_search parse-error, guide_enrich subprocess with _RICH_ENABLED patched; SSE generator body intentionally untested — manual body_iterator driving leaked async state across the suite).
- **tmdb 86→100%**: fixed a no-key test that deleted the env var but never cleared the module constant; enrich-cli subprocess branches (success/nonzero/timeout/JSONDecode/OSError); person search/details success.
- **stream_core 88→99%**: _vod_url, _http_feed_stdin aiohttp pipe, _ffmpeg_pipe lifecycle, stream_proxy (200/502×2).
- **stream_vod 84→90% effective**: remux/transcode generator branches (start_time seek, disconnect-before-yield).
- **misc 89→100%**: image-proxy eviction edges (stale entry, cache-full on disk-hit + fetch), urlparse error, SPA HEAD/missing-index.
- **live 87→100%**: /live/all-slim (zero tests before), live_info HTTPException fallback.
- **guide_epg 90→100%**: multi-provider parallel load_epg (success + exception fallbacks).
- **admin 90→100%**: hermes-id proxy errors (missing-config 503, HTTPError 502, 400+ detail extraction, unparseable body), 3 proxy endpoints, require_admin_key direct, stream-health ImportError/1440p, warm-full noop, provider update.
- **crypto_utils 90→100%**: key-file OSError read/write, default data_dir, missing-import fallback (Fernet=None).
- **config 90→93%**: providers-file load/save error paths.
- **media 94→100%**: subtitle/audio OSError + JSON-decode branches.
- **vod 94→100%**: non-list fallbacks + unified skip branches.
- **cloud_sync 93→99%**: backup read/write error paths + auth branches.
- **main 91→96%**: HTTPS redirect, api-redirect query, body-size 413s.
- **conftest**: wipe DATA_DIR/providers.json at session start — it takes PRECEDENCE over env vars on config reload, so any test that saves providers poisoned every later config test (found via 13 config failures caused by an admin provider-update test).
- **Coverage measurement caveat**: health.py + stream_vod.py preflight-fail returns show "uncovered" but are proven to execute via server logs — TestClient runs the app in a worker thread and coverage's trace drops after the first await in that chain (same artifact as starlette thread-based tracing).

### ✅ Session 12.4 (2026-08-02) — Permissions-Policy + rate-limit quota headers
- **Permissions-Policy now on every response** — `SecurityHeadersMiddleware` was setting XCTO/XFO/Referrer/CSP/HSTS but *not* Permissions-Policy (only nginx had it), so direct/dev backend responses missed it. Now emits `camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=(), usb=(), bluetooth=(), serial=()`. Mirrors `web/nginx.conf`, which gained the same denied capabilities (**was missing usb/bluetooth/serial**). SECURITY_AUDIT §13 corrected — its old "Permissions-Policy (inherits from CSP)" line was wrong (it doesn't inherit; the header just wasn't emitted backend-side).
- **Rate-quota visibility** — `RateLimitMiddleware` now sets `X-RateLimit-Limit`/`X-RateLimit-Remaining` on every response so clients read their live budget (was: only `Retry-After` on 429, otherwise guess).
- **CORS expose-headers** — `CORSMiddleware` now exposes `X-Request-ID`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` cross-origin, so the :5183 dev frontend + LAN host can correlate requests and check quota like same-origin clients.
- **Tests**: +2 backend (quota-remaining header, CORS expose-headers). Backend 1398→**1400 passed**. Commit `53b8976`.
- **Lazy-loading gap closed** — ChannelRow channel icons + enrich posters had no `loading` attr (eager fetch of ~60 icons per guide render); now `loading="lazy"`. MediaOverlay/PersonPage hero images intentionally stay eager (modal/LCP). Commit `8c290b1`.
- **Coverage drive** — POST `/api/search/query` had zero tests (7 added incl. upstream-degradation + service-exception paths); GET `/search` `_search_all` movies/series fast path untested (added); `profiles.py` (lowest, 62%) got 15 security-critical tests for `_require_profile_access` branches (wrong-token 403s, admin-key delete, refresh/me guardrails, switch validation, PIN verify). `search.py` 67→89%, `profiles.py` 62→72%. Backend 1400→**1421**. Commit `3366653`.
- **Graceful background-task cancellation on lifespan exit** — 3 tasks (cleanup_loop, warm_cache, EPG broadcast) started in lifespan were never cancelled on shutdown → "Task was destroyed but it is pending" warnings + partial rmtree/fetches on every restart. Exit block now cancels + awaits each pending task (lossless — loops tolerate CancelledError). Verified live: clean restart. +1 test. Backend 1421→**1423**. Commit `8c78f1f`.
- **PinPrompt auto-submit dead-code bug (found via new tests)** — `handleDigit` scheduled `setTimeout(() => handleSubmit(), 150)` but `handleSubmit`'s closure captured the pre-4th-digit `pin` ("123"), so its `pin.length < 4` guard always fired — numpad auto-submit never submitted (only Enter worked, via a fresh render). Fixed: `handleSubmit(submitPin?)` takes the pin explicitly. **+14 frontend tests** (7 PinPrompt + 7 CatchupTimeline — loading/error/empty states, go-live, click→offset math, hover tooltip). Frontend 1571→**1578** (102 files, zero flakes this run). Commit `d8179e9`.
- **WatchRecording video-control tests + CatchupTimeline flake fix** — +6 WatchRecording tests (source rendering, back-nav, play-state events, time/duration formatting, click-toggle play/pause with jsdom `paused` driven manually, proportional seek). Fixed CatchupTimeline empty-state contention flake (asserted null immediately after fetch mock called; now waits for the actual re-render). Frontend 1578→**1591** (104 files, zero flakes). Commit `8de0c55`.
- **Player-control coverage batch** — +19 tests for the biggest remaining untested interactive surfaces: PlayerBottomControls (7: VOD time+download, LIVE/Go-Live, record toggle, speed menu, lower-quality suggestion, fullscreen label, hidden state), MobileMoreMenu (5: open/close, download path, record, shortcuts event, quality menu), ProfilePicker (7: loading, unlocked select, PIN unlock flow, wrong-PIN error, create+refresh, mismatched-PIN disabled submit, delete-after-confirm). Frontend 1591→**1610** (107 files, zero flakes). Commit `63d000f`.
- **MobileNav/MobileHeader coverage** — the mobile drawer (rendered only from App.tsx, which has no test) had zero direct coverage. +8 tests: closed→null, all items+settings aria labels, aria-current active, navigate+close, backdrop close, body-scroll lock/restore, hamburger open, brand nav-home. Frontend 1610→**1618** (108 files, zero flakes). Commit `4b73c76`.
- **Player shell coverage** — PlayerTopBar (4: back nav, PiP enter/exit + aria-label, hidden state), PlayerResumePrompt (3: null-when-hidden, dialog + position + actions, callbacks), PlayerErrorOverlay (5: null outside error, message+retry, retry-exhausted/not-supported/empty-stream guidance). Frontend 1618→**1630** (111 files, zero flakes). Commit `57a0d36`.
- **Image disk-cache unit tests** — misc.py `_img_write_disk`/`_img_read_disk` internals (write/read/expiry/error branches) were only reachable via mocked HTTP; 8 direct tests with `IMG_CACHE_DIR` at a tmp dir: roundtrip, missing→None, TTL expiry deletes, corrupt meta→None, OSError swallow, stable md5, path helpers. misc.py 82→88%, backend coverage 86→87%. Backend 1423→**1431**. Commit `433936d`.

### ✅ Session 12.5 (2026-08-02) — H2 profile-write auth gap (security)
- **Critical auth gap closed (H1)**: the auth middleware **skips all `/api/v1/profiles` paths** (main.py:188, by design so the profile-picker works pre-auth), and the 5 **write** handlers never called `_require_profile_access` while every GET handler did. Result: any client with a `profile_id` (returned plainly by `GET /profiles`) could **PUT progress, overwrite history, wipe history, add favorites, or delete favorites on any profile** — no token, no PIN, 200 OK. Fixed: `api_put_profile_progress`, `api_add_profile_history`, `api_clear_profile_history`, `api_add_profile_favorite`, `api_remove_profile_favorite` now all enqueue `_require_profile_access(profile_id, request)` (matching profile token or admin key) — write parity with the reads. Commit `c56584c`.
- **Frontend companion bug**: `syncProfileProgress` sent only `Content-Type`, never `X-Profile-Token` — it would have 401'd under the new enforcement. Now uses `authHeaders()`.
- **Tests**: +29 backend (security contract: every write 401 untokenized, 403 wrong-token — the middleware skips profiles so each handler must self-enforce; + progress GET/PUT, history add/clear, favorites id-fallback, settings PUT-merge/clear, `/auth` endpoint success/bad-pin/missing-pin, `/me` deleted-profile) → profiles.py coverage **72→96%**, backend 1431→**1460**. +2 frontend (syncProfileProgress sends token; 401→false) → frontend 1630→**1632**. Verified live: untokenized PUT progress + DELETE history both return **401** on :8720. Commit `c56584c`.

### ✅ Session 12.6 (2026-08-02) — profile detail GET leak + PIN brute-force lockout
- **Unauthenticated profile-detail GET closed (H1)**: `GET /profiles/{id}` had **no auth at all** and `get_profile()` returns the full stored dict minus pin_hash — watch **progress, history, favorites, settings** readable by anyone who knew a profile_id (enumerable from the open picker list). The frontend never reads this endpoint, so it was pure exposure. Now requires matching X-Profile-Token or X-Admin-Key. Verified live: unauth → **401**, admin-key read → 200, picker list stays open.
- **PIN brute-force lockout (H2)**: `verify_profile_pin` had no failed-attempt backstop. The middleware-exempt `/verify` and `/session` endpoints (rate limiter keys by device-token/IP, which an attacker rotates) let a 4-6 digit PIN be enumerated in seconds. Added per-profile in-memory lockout in `auth.py`: `PIN_MAX_FAILED` (default 5) misses within `PIN_LOCK_SECONDS` (default 30) reject further attempts — even the correct PIN — until the window lapses or a success resets the counter. Unlocked profiles (no PIN) never lock.
- **Tests**: +4 backend (unauth GET 401, cross-profile token 403, lockout-after-5-failures incl. session 403, success-resets-counter). Backend 1460→**1464**. Commit `ba379dd`.

### ✅ Session 12.7 (2026-08-02) — cloud-backup tokenless registration brick
- **Tokenless first-registration closed (H1)**: `_verify_device_access` allowed a first `POST /cloud/backup` with **no X-Device-Token** — the entry was stored with an empty `_token_hash`, permanently bricking that device_id (no future token, including the owner's own, matches an empty hash). Any client that learned a `device_id` could pre-register it and lock the owner out of their own backup forever. Now first registration requires `X-Admin-Key` or a real device token (≥8 chars); the legitimate client always sends one, so real-device flow is unchanged. Existing backups keep requiring the matching token or admin key.
- **Tests**: updated `test_upload_requires_token` (tokenless + short-token registration rejected, nothing stored) and `test_short_token_rejected` (clears the fixture's default admin key so device-auth is actually exercised). Backend stays **1464**. Verified live: tokenless POST → `error`; with token → `ok`. Commit `023342a`.

### ✅ Session 12.9 (2026-08-03) — frontend coverage drive 81→85%, 1922 tests + 2 real bug fixes

Frontend coverage 81%→**85%** statements (85.9% lines; ~4915 stmts). Suite grew 1632→**1922** tests (135 files), tsc clean, full suite green (8x consecutive reruns). Installed `@vitest/coverage-v8` for real per-file measurement. Backend stays green throughout (1588 passed / 17 skipped / 3 xfailed).

**Real bugs found & fixed by the tests:**
- **Dead fullscreen button (PlayerBottomControls)**: the "Enter fullscreen" button called `handleFullscreenClick` → `fullscreenBtnRef.current.click()`, but the ref was never attached to any element → clicking did nothing. Attached the ref so the click reaches Player's `toggleFullscreen` listener.
- **`?open=` deep-link race (Series.tsx)**: the effect cleared the URL param while rows were still empty (async fetch), silently dropping the deep-link. Now only clears once rows are loaded and the id is definitively not found.

**Biggest coverage jumps** (stmts): Guide 48→95%, Player 47→86%, Series 64→82%, Sidebar 67→92%, HistoryPage 70→85%, useProfile 75→95%, useFocusTrap 60→100%, useHlsPlayer 82→90%, ChannelRow ~74, LiveTV 76→81, Movies ~80, PersonPage 77→79. New suites: AppRoutes (21 — route table), AgentAccess (10 — approve/deny/403-key-prompt), search-results trio (30), LiveChannelCard (10), SeriesCard (11), ContentRow carousel (14 — jsdom scroll metrics), PlayerInteractions (19 — fullscreen/record/timeshift/touch), useProfile API surface (+14), useHlsPlayer progress+empty-stream (+6), api image helpers (18), useFocusTrap Tab-wrap (+5).

**Flake fixed (LiveTV category-switch)**: was intermittent under full-suite parallel CPU contention — the tab element could be re-rendered between `getByText` and `click`, clicking a stale detached node. Fixed with a role-based query that re-resolves on every poll/click; 8x green full-suite reruns.

**Key test patterns learned**: native `.focus()` doesn't fire React's onFocus in jsdom (use `fireEvent.focus`); patch fullscreen APIs on the *rendered* video node (React owns the element, ref assignment is overwritten); stub `offsetParent` to reveal focusables for the focus-trap; `compareDocumentPosition` for DOM-order assertions; `vi.useFakeTimers({ shouldAdvanceTime: true })` so `waitFor` still polls.

## Recently Completed

### ✅ Session 12.2 (2026-08-02) — ops/CI/security audit batch
- **release.yml build broken** (H1): used `context: .` with no root Dockerfile — every master push failed 'Dockerfile not found'. Now a 2-image matrix (server + web Dockerfiles) with correct contexts/tags. Commits `6a5921f`.
- **master unguarded** (H2): ci.yml `pull_request` ignored master — direct PRs to master had zero test gating. PRs now run on all branches. Commits `6a5921f`.
- **test deps undeclared** (M3): backend CI + fresh contributors got ImportError — pytest/pytest-asyncio/pytest-timeout were runner-preinstalled, never in requirements. New `requirements-dev.txt`, CI installs it.
- **EPG cache dir bug** (M2): docker-compose bind-mounted the gitignored `epg_cache.json` file → Docker auto-creates a DIRECTORY → first EPG write raised IsADirectoryError. Fixed two ways: guide_epg catches IsADirectoryError/OSError (falls back to in-memory), AND compose now mounts `server/data` dir (mkdir-safe) with EPG_CACHE_FILE/STV_DATA_DIR pointed at `/app/data`.
- **HERMES_AUTH_VERIFY='false' bug** (M7): the literal string was treated as a CA-bundle path (truthy) → SSL error → 502 on every hermes-id admin proxy call when verification disabled. Normalized boolean spellings; 3 new tests.
- **nginx CSP/COEP** (L4): prod nginx still shipped `'unsafe-inline' 'unsafe-eval'` (weak CSP) while backend was hardened; aligned to strict. Removed COEP `require-corp` which blocked directly-loaded cross-origin TMDB/photo-tmdb posters (those CDNs send no CORP). CORP+COOP retained.
- **Deps cleanup** (M5/M6): removed unused `@sentry/react`; moved platform-specific `@rolldown/binding-linux-x64-gnu` from dependencies → devDependencies.
- **Config docs** (M8): `.env.example` pinned the real `RATE_SEARCH_LIMIT=300` (was 100), added ENCRYPT_CREDENTIALS/STV_ENCRYPT_KEY/EPG_CACHE_FILE/STATIC_DIR/STV_DATA_DIR/CACHE_WARM_*/PROFILE_TOKEN_SECRET; documented that CACHE_TTL_HOURS/CLEANUP_INTERVAL are hardcoded (not runtime-wired) and why.
- **Tests**: 1397 backend (+3 hermes-id), 1571 frontend, tsc clean, build clean, chromium E2E 88 passed / 1 known flake.

### ✅ Session 12.3 (2026-08-02) — rate-limit eviction + channelIconUrl + admin guard
- **Rate-limit unbounded-memory leak** (discovered during review): `_rate_limits` keyed by device-token/IP was never evicted — every unique token ever seen left an entry forever. Added opportunistic stale-bucket sweep (at most once per RATE_WINDOW, lossless). +1 test. Backend 1398.
- **`channelIconUrl()` extracted** (perf audit #12): the provider proxy-icon URL construction was copy-pasted in LiveChannelCard, LiveSearchResults, HistoryPage. Centralized in lib/api.ts; updated the two test mocks that render those components.
- **admin warm-full concurrency guard** (audit L1): `/admin/cache/warm-full` now no-ops when a warm is already running (was identical to clear-cache but could double-spawn warm tasks).

### ✅ Session 12 (2026-08-02) — security findings, SW stream fix, a11y + perf batch, task guards
- **CORS real origins** (SECURITY_AUDIT #9): origin list was missing the frontend dev port 5183 + the LAN host — their preflights 400'd with no ACAO. Added both (16 origins). CORS 70→85, overall 78→80.
- **image-proxy JSON 502** (SECURITY_AUDIT #11): uncaught `httpx.HTTPStatusError`/transport error → 500 text/plain. Now clean JSON 502, no upstream detail leak. Error-Leakage 80→90.
- **Request-ID middleware** (SECURITY_AUDIT #13): `X-Request-ID` echoed/generated + logged per request for end-to-end correlation.
- **SW stream-path bypass (CRITICAL)**: every `/api/*` GET went to `networkFirst()` which does `clone.blob()` — infinite live streams never resolved (playback hung), multi-GB VOD remux buffered fully. Added `STREAM_PATH_PREFIXES`; SW never intercepts `/api/stream|media|iptv|movie/hls|series/hls`. Cache keys now hash X-Profile-Token (per-profile isolation — was cross-profile mixing). v3→v4.
- **A11y (audit H1/H2/H3/M1/M2/M3/M5/M9)**: MediaOverlay focus trap + initial focus; Player `<video>` name + error `role=alert`; sr-only labels on 4 search inputs + 4 icon-only clear buttons + VolumeControl mute; PersonPage clickable cards → real `role=button`; MobileNav focus trap; LiveChannelCard + ProfilePicker nested-`<button>` → `div[role=button]`; HiddenCategories button-in-label → div + aria-pressed; guard z-focus of invisible delete/favorite buttons.
- **Perf (audit #1/#2/#4/#5)**: watchlist memberships via cached Set (O(1), was O(n) JSON.parse ×2 per card ×200 cards); Series visibleCats memoized; LiveTV favorites subset memoized; getNowPlaying useCallback ×2 + called once per card.
- **Backend resilience (audit L1/L2/L3/M1/M2)**: `_epg_broadcast_loop` + `warm_cache` + `_fetch_one` get Exception/top-level guards (silent "Task exception was never retrieved" kills eliminated); `_fetch_one` logs + records provider health on non-HTTPException edges; subtitle extraction failure → 404 instead of 500; api.ts searchEnrich checks `res.ok` (was parsing 502 bodies as valid data).
- **Tests**: 1571 frontend (was 1570, +1), 1394 backend (was 1386, +8 in the security batch). Commits `a37d7bc` `ccefc14` `5c8ca9f` `bf5b67e` `19eebbf` on master.

### ✅ P0 — Backend suite: 518 auth failures → 1386 pass (Bug/DX)
conftest used `os.environ.setdefault("ADMIN_API_KEY", "test-admin-key-insecure")`, but the parent shell env (spacetime-tv runs under the Hermes gateway env) already carries the REAL admin key, and `load_dotenv()` in config.py never overrides an existing var. So config resolved the production key while tests sent the test key → the auth middleware 403'd every API request. All 518 failures across 55 files were this single env-shadowing bug. Fixed: conftest FORCES `ADMIN_API_KEY` + `ALLOW_LAN_BYPASS=true` (not setdefault). Also loads hermes-id auth env from `~/.hermes/auth/projects/spacetime-tv.env` (or CI fallback) so tests are deterministic regardless of parent shell env. 2 config tests updated to reload without STV_DATA_DIR for true-default verification.

### ✅ P1 — AdminDashboard.test.tsx: 16 failures → 18/18 (Test hygiene)
`renderDashboard()` rendered `<AdminDashboard />` bare, but the component uses react-router `<Link>` — every Link threw `Cannot destructure property 'basename' of useContext(...) as it is null`, crashing 16/18 tests. Wrapped in `<MemoryRouter>` (same pattern as the other 5 page suites) + typed the sample-stats fixture so `epg_age: null` is legal.

### ✅ P1 — App.tsx 485→145 + useSearchPage.ts 460→394 decomposition (Maintainability)
Extracted `useSidebarResize` (sidebar width + drag resize), `MobileNav` (drawer + mobile header), `AppRoutes` (all 18 lazy routes + Suspense/ErrorBoundary), `backNavigation` (stv_back_url tracking), and `lib/searchFiltering` (pure filter/sort pipeline, +10 unit tests covering filter tabs, name/rating sort, TMDB enrich priority, immutability). tsc clean, build succeeds, 1,570 frontend tests pass.

### ✅ P1 — Strict CSP: script-src 'self' (Security)
Removed `'unsafe-inline' 'unsafe-eval'` from script-src. SW registration moved from inline `<script>` in index.html into `src/main.tsx` so the app has zero inline scripts. mpegts.js's global-this polyfill catches the CSP eval block and falls back to window — verified live (channel 483976 plays, video readyState 4, zero violations). 4 regression tests (`TestSecurityHeaders`).

### ✅ P1 — SW cache-first stale-build bug (Bug — root cause of "UI still broken after fix")
`sw.js` routed ALL static assets cache-first, including the unhashed `index.html` shell pre-cached at install. After a deploy, browsers served the cached old shell forever — the HTTP Cache-Control headers were never consulted because the SW intercepted first. Navigation requests are now network-first (revalidates shell every load, still serves cached offline); API stays network-first; hashed assets stay cache-first. Cache name bumped v2→v3 so existing clients get the new SW and purge the old cache on activate.

### ✅ P2 — HTTP cache headers for SPA shell (Bug)
index.html was served with no Cache-Control → browsers heuristically cached the old build. Now: index.html `no-cache, no-store, must-revalidate`; /assets/* `public, max-age=31536000, immutable` (cache-control middleware in main.py).

### ✅ P2 — E2E suite repaired (Test hygiene)
Fresh Playwright browsers hit the profile gate, so specs expecting app content failed. Added storageState seed (e2e/.auth/main-profile.json), scoped quick-link locators to `<main>`, pinned a mobile touch viewport in mobile.spec.ts via test.use(). Chromium run: 85 passed / 1 failed / 3 flaky against the live backend (was gate-blocked). Search 429 surfaced as raw "API error 429" → now a friendly "Too many requests" message.

### ✅ P2 — Preflight verified at runtime (Verification)
Tested preflight_stream() against the real provider: working channel 483976 → True in 751ms cold / 0ms cached; dead channels (1, 250) → False fast (325/185ms), 0ms cached. No mpegts desync from the 1-byte body read. All three kanban risk areas verified.

### ✅ P1 — Fix pre-commit hook: silent no-op gate (exit codes never propagated) (Bug/DX)
`.githooks/pre-commit` ran `make fmt-check` / `make lint` but never propagated their
exit codes — a failing lint or format check still fell through to "✅ Pre-commit
checks complete" and the commit succeeded (the exact anti-pattern of a gate that
silently passes). Rewritten: every check failure now aborts the commit with a
non-zero exit, and checks are scoped to **staged files only** (whole-tree checks
would fail commits for unrelated in-progress work). Staged Python → `ruff format
--check` + `ruff check`; staged TS/TSX/JS/CSS → `prettier --check` + `eslint`.
Also fixed the compounding issue: `make fmt-check-frontend` invoked `npx prettier`
with no prettier dependency anywhere (unresolvable on a clean machine) — prettier
is now a real devDependency.

### ✅ P1 — Add Prettier as a real devDependency + config + format scripts (DX)
`web/package.json` had `format`/`format:check` scripts but **no prettier
dependency** (only resolvable via a stale npx cache dir) and no config file.
Added `prettier@^3.9.6` to devDependencies, `web/.prettierrc` explicitly pinning
the codebase style (prettier defaults: double quotes, semi, 80 width, trailing
comma all), and wired Makefile `fmt-frontend`/`fmt-check-frontend` to the npm
scripts. Verified: `npm run format:check` passes on all committed source; only the
4 in-progress uncommitted UI files (App.tsx, ProfilePicker.tsx, index.css,
HomePage.tsx) are flagged.

### ✅ P1 — Refresh SECURITY_AUDIT.md — HTTPS + Auth Coverage rows contradicted the code (Docs)
The audit (2026-07-06) still scored "HTTPS/TLS 20/100 — No HTTPS anywhere" and
"Auth Coverage 60/100 — watchlist/stream/search/iptv still open", both stale:
- `ENFORCE_HTTPS` redirect middleware exists in `server/main.py` (default **true**),
  nginx terminates TLS on 443 (http2, TLSv1.2/1.3, HSTS preload) with HTTP→HTTPS
  301 on port 80, docker-compose maps 80/443 + letsencrypt volume, Dockerfile
  installs certbot with ACME_DOMAIN support
- Auth middleware now covers **every `/api/*` route** (X-Admin-Key or X-Device-Token;
  401/403 otherwise), with LAN bypass gated by `ALLOW_LAN_BYPASS` (default true,
  false = hardened)
Rows updated: HTTPS 20→75, Auth Coverage 60→85, overall 72→78. Added remediation
item 10 (set `ALLOW_LAN_BYPASS=false` in production). Re-audit method documented.

### ✅ P3 — Remove dead `_mock_preflight_session` helper in test_stream.py (Maintainability)
The consolidation suggestion found two session-builder helpers; on inspection
`_mock_preflight_session` (28 lines) was **dead code** — defined once, never
called (the original preflight tests build their sessions inline). Removed it;
`_counting_preflight_session` remains the single helper for the 5 cache tests.
`tests/test_stream.py`: 120 passed, 3 xfailed.

### ✅ P3 — Docs verification: frontend test count (Test hygiene)
Verified the ROADMAP "1,500+ frontend" claim against a fresh `npm test` run:
**1559 passed / 1560 total (100 files)**. The 1 failure was the known
parallel-load flake (Movies.test.tsx "shows skeleton grid while movies load") —
passes 40/40 in isolation. No regression.

### ✅ P3 — Frontend full-suite flakiness under parallel load (Test hygiene)
Full `vitest run` intermittently failed a rotating set of tests (LiveTV category switch, Search TMDB badges, Series watchlist hearts, PlayerCenterControls click) with `waitFor`/`userEvent` 5s timeouts; serial runs passed 100%. Fixed three ways: (1) `test-setup.ts` raises Testing Library `asyncUtilTimeout` 1000ms → 4000ms so async assertions survive CPU contention from 100 parallel worker transforms; (2) `SeriesOverlay` Play button now disabled until episodes load (was navigable with fallback episode id 1 during loading — clicking early navigated to the wrong episode; tests updated to wait for loaded state `Play S1 E1`); (3) `usePlayerUtils` guards `sessionStorage.removeItem` in the 1s auto-advance `setTimeout` (throws in private mode/SSR/test teardown), test uses fake timers so the timer never fires after jsdom teardown. Also fixed the matching backend flake: `test_load_epg_background_stale_triggers_refresh` left its background EPG refresh task fire-and-forget — the task's first `await load_epg()` could run AFTER the `@patch` context was torn down, calling the REAL `load_epg()` against a closed httpx client under full-suite load (`Cannot send a request, as the client has been closed`). Test now awaits the task with an AsyncMock. Verification: backend 1314 passed / 17 skipped / 3 xfailed; frontend 100 files / 1560 tests passed in parallel. Commits `825685e`, `875fdb9`, `8febcd7`.

### ✅ P2 — Fix EPG refresh dedup broken across modules — duplicate concurrent XMLTV fetches (Bug)

`state._epg_refresh_task` is the canonical "EPG refresh in flight" tracker, but both
`guide_epg.load_epg_background()` and `admin_epg_refresh()` did `from state import
_epg_refresh_task` and then rebound a **local module copy** (`global` + assignment).
The shared `state._epg_refresh_task` stayed `None` forever, so `admin_epg_refresh`'s
`already_running` check always read "not running" and every `POST /admin/epg/refresh`
spawned a NEW concurrent `_refresh_epg_background()` task — even while guide_epg's
refresh was already in flight. Result: duplicate XMLTV downloads, double provider
load, and races on `epg_cache` writes.

Fix: both modules now read/write `state._epg_refresh_task` as a module attribute
(single source of truth). Added regression test
`test_admin_epg_refresh_records_task_on_shared_state` (fails on old code, passes on
new) and hardened `test_load_epg_background_stale_triggers_refresh` to assert the
task is visible on `state` rather than on a private copy. Full backend suite 1314 pass.

### ✅ P2 — Fix DVR recording lifecycle bugs in record.py (Bug)
`list_recordings` had three lifecycle bugs. (1) **Lost persistence**: `if _active: _save_meta(meta)` skipped the save when the last active recording's process exited, leaving it stuck as "recording" on disk forever. (2) **Crashes marked completed**: an exited ffmpeg with a 0-byte/missing output file was marked "completed" instead of "failed". (3) **Orphaned entries stuck**: after a server restart, meta entries with status "recording" had no tracked process and were never reconciled. Fixes: new `_finalize_recording()` helper (file size = source of truth), `changed`-flag persistence, orphan reconciliation pass in `list_recordings`, and live `size_bytes` reporting for still-running recordings so the RecordingsPage (polls every 3s) shows growth. 6 new lifecycle tests; `test_record.py` now 34 tests. Full backend suite 1326 pass.

### ✅ P4 — Add RecordingsPage component tests (Coverage)
`RecordingsPage` had zero tests despite being routed and used. Added 12 tests: loading spinner, empty state, name/metadata rendering, MB/GB size formatting, active "Recording…" indicator, 0-byte failed recording, play navigation, delete confirm/cancel flows, manual refresh, and the 3s polling loop (with fake timers) that runs only while a recording is active. Mocked `@/hooks/useRecording` (hook fetch logic already covered by its own 11 tests).

### ✅ P2 — Fix cloud backup "Download & Restore" / "Merge Favorites" silent no-op (Bug)
Regression from the SettingsPage extraction refactor (`8a6654c`): both buttons
fetched data from the server but the result was discarded — nothing was written
to localStorage and the page never reloaded, so "restore" and "merge" appeared
to work while doing nothing. Restored the apply-to-localStorage + reload logic
in `CloudBackupSection.tsx` (favorites, movie watchlist, series watchlist).
Added 9 component tests locking in the apply behavior.

### ✅ P2 — Include series watchlist in cloud backup (Feature gap)
`useCloudBackup` only uploaded the movie watchlist (`stv_watchlist`); the series
watchlist (`stv_watchlist_series`) was silently excluded from cross-device sync.
Upload now sends `series_watchlist`; download restores it; backend empty-default
GET response includes it. Watchlist values are normalized to `number[]` on read,
so legacy record-shape backups (`{"550": true}`) restore without corrupting the
localStorage array format.

### ✅ P4 — Remove dead GET /api/v1/watchlist stub (Maintainability)
The endpoint returned a hardcoded `{"watchlist": {}}` with a "TODO: implement"
comment, but nothing consumes it — the watchlist is client-side (localStorage)
and synced via cloud backup. Removed the stub and its test; documented the
decision in `routes/watchlist.py`.

### ✅ P4 — Fix "Event loop is closed" pytest warning (Test hygiene)
`test_iptv_client.py` teardown called `client.aclose()` without awaiting it,
leaving an unawaited coroutine that exploded as a `PytestUnraisableException`
("Event loop is closed") at GC time. Teardown now uses `asyncio.run(...)`.
Full backend suite runs warning-free.

### ✅ P4 — Movies.tsx decomposition (689→552 lines) + 14 new tests (Maintainability)
Extracted `MovieContinueWatchingRow` and `MovieRecentlyCompletedRow` into dedicated components with full test suites (14 tests). Movies.tsx reduced by 20%. Fixed flaky AudioSelector test (async state timing). README table formatting fixed.

### ✅ P4 — Ruff lint 137→0, fix 3 production bugs (Linting + Bugs)
Fixed all 137 ruff errors across 39 files. Fixed 3 production bugs: missing `asyncio` import in iptv_client.py (NameError on asyncio.gather at runtime), missing `ProviderConfig` import in admin.py (NameError on provider creation), duplicate test function in test_stream.py. Replaced bare try/except with `contextlib.suppress` in 4 locations. state.py coverage verified at 100%.

### ✅ P4 — Fix 3 high-severity npm audit vulnerabilities (Security)
Fixed brace-expansion, postcss, and react-router vulnerabilities via `npm audit fix`. 4 packages updated, 0 remaining vulnerabilities.

### ✅ P4 — Add explicit HEAD handler to SPA catch-all (Routing)
Added `@router.head("/{full_path:path}")` to misc.py so HEAD requests to
GET-only streaming endpoints (SSE) resolve correctly instead of being
intercepted by the catch-all returning SPA HTML.

### ✅ P4 — Upgrade @rolldown/binding-linux-x64-gnu ^1.1.3 → ^1.2.0 (Dependency)
Updated to ^1.2.0 in package.json and lockfile. All 1209 frontend tests pass, TypeScript 0 errors. Commit `09bf92b`.

### ✅ P4 — Pin hls.js to stable (Dependency)
hls.js was referenced as `^1.7.0-beta.1` in docs but already pinned to `^1.6.16` (latest stable) in package.json. Removed stale entry.

### ✅ P4 — Split Search.tsx (855 lines) into sub-components (Maintainability)
- Extracted `SearchHeader` → `@/components/SearchHeader.tsx` (search bar, history, result counts)
- Extracted `SearchFilterBar` → `@/components/SearchFilterBar.tsx` (filter tabs + sort controls)
- Extracted `LiveSearchResults` → `@/components/LiveSearchResults.tsx` (channel grid + load-more + now-playing EPG)
- Extracted `MovieSearchResults` → `@/components/MovieSearchResults.tsx` (poster grid + TMDB enrichment + load-more)
- Extracted `SeriesSearchResults` → `@/components/SeriesSearchResults.tsx` (poster grid + TMDB enrichment + load-more)
- Extracted `EpgSearchResults` → `@/components/EpgSearchResults.tsx` (EPG programme results)
- Search.tsx reduced from 855 to ~445 lines (48% reduction)
- All 1209 frontend tests pass, 592 backend tests pass, TypeScript 0 errors. Commit `cdf2374`.

### ✅ P4 — Upgrade lucide-react ^1.22.0 → ^1.23.0 (Dependency)
Bumped lucide-react to 1.23.0 — new icons and fixes. No breaking changes.
All 1209 frontend tests pass, TypeScript 0 errors. Commit `181a887`.

### ✅ P4 — Split Series.tsx (957 lines) into sub-components (Maintainability)
- Extracted `ContinueWatchingRow` → `@/components/ContinueWatchingRow.tsx`
- Extracted `RecentlyCompletedRow` → `@/components/RecentlyCompletedRow.tsx`
- Series.tsx reduced from 957 to 748 lines (~22% reduction)
- All 1209 frontend tests pass, 592 backend tests pass, TypeScript 0 errors. Commit `897b74d`.

### ✅ P4 — Add device-token auth to cloud sync endpoints (Scoped Access)
- Cloud backup endpoints now use `X-Device-Token` for scoped per-device auth
- Tokens are SHA-256 hashed before storage (server never stores raw tokens)
- 26 cloud sync tests pass, 1209 frontend tests pass, TypeScript 0 errors. Commit `715ed9c`.

### ✅ P4 — Add `role="dialog"` + aria-modal + focus trap to PinPrompt and KeyboardShortcuts (Accessibility)
- New `useFocusTrap` hook traps Tab/shift+Tab inside modals, restores previous focus on close
- All 1209 frontend tests pass, 589 backend tests pass, TypeScript 0 errors. Commit `3b0549a`.

### ✅ P4 — Fix test_main.py syntax error + SSE endpoint HEAD tests
- Fixed rogue docstring artifact in `test_main.py` (SyntaxError on import)
- All 589 backend tests pass, TypeScript 0 errors. Commit `b0db653`.

### ✅ P4 — Add shaka-player to manualChunks in vite.config.ts (Performance)
Added `shaka` chunk to `manualChunks` in `vite.config.ts` — isolates shaka-player (~700 KB). All 1208 frontend tests pass, 597 backend tests pass, TypeScript 0 errors. Commit `51a834a`.

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
