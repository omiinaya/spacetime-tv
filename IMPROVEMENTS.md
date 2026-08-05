# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

- ~~**P2 — distributed rate limiting** (SECURITY_AUDIT #8) — Redis-backed for multi-instance~~ ✅ **RESOLVED 2026-08-05** — `REDIS_URL` env opt-in: set → `RedisRateLimitStore` (fixed-window, SET NX EX + INCR, TTL-based Retry-After, fail-open on outage, shared counter across replicas); unset → in-process `MemoryRateLimitStore` (zero new deps). Store interface extracted in `main.py`; 8 fake-redis unit tests (shared-counter property, TTL retry-after, fail-open).
- ~~**P2 — `ALLOW_LAN_BYPASS=false` in production `.env`**~~ ✅ **RESOLVED 2026-08-04 by decision** — set EXPLICITLY `true` with rationale for this single-user LAN deployment (was a silent default). Startup logs the posture; `false` is documented as required only behind a public/VPN reverse proxy. Flipping it here would 401 native media playback (video/img can't attach auth headers).
- ~~**P2 — wire CACHE_TTL_HOURS/CLEANUP_INTERVAL into runtime**~~ ✅ **RESOLVED `ab96e6d`** — env-driven via `_int_env` with graceful fallback (garbage values don't crash startup); conftest sentinel 0→1; 4 wiring tests
- ~~**P3 — `env_file: ./server/.env` is hard-required**~~ ✅ **RESOLVED `def0ba6`** — compose fails on a fresh clone before the app can auto-generate a key (no longer pending)
- ~~**P4 — player control row touch targets < 44px** (a11y audit low: Speed/Record/Download/Quality/Volume/SleepTimer/SubtitleSelector/MobileMoreMenu — currently 40px; deliberate density compromise, bump only if mobile overflow is re-evaluated)~~ ✅ **RESOLVED 2026-08-05** — all 6 control components bumped `min-w/min-h` 40px → **44px** (WCAG 2.5.8 minimum); density compromise re-evaluated and accepted — the row already scrolls/wraps on narrow screens and 44px keeps the 4px slack without reflow. Frontend 1942 tests + tsc + build green.

---

### ✅ Session 14 (2026-08-04) — production-readiness close-out: CI runner, E2E in CI, auth posture, backups

- **CI red on master → fixed (billing gate).** All jobs failed in <5s with `steps:[]`
  + `runner_id:0` = the GitHub-hosted runner allocation was blocked by the Actions
  billing gate (the repo had NO self-hosted runner — every ~30 sibling repo does).
  Registered `runner-spacetime-tv` in the actions-runners farm, added it to
  `start-all-runners.sh` + `setup-all-runners.sh`, switched `ci.yml` + `release.yml`
  to `runs-on: [self-hosted, ubuntu-latest]`. **CI now actually runs.**
- **E2E wired into CI** — new `e2e` job in ci.yml: builds frontend, writes
  `server/.env` from secrets (IPTV_BASE/USER/PASS + ADMIN_API_KEY now set as
  GitHub secrets), seeds the profile storageState, starts uvicorn on :8720, runs
  all 4 Playwright projects. Gates on the secrets' presence; skips gracefully on
  forks. (FP: this closes the long-standing "E2E not in CI" P2.)
- **`hermes-id` install fixed** — requirements.txt declared `hermes-id>=1.3.0`
  but it's NOT on PyPI → every clean install (CI, Docker) failed. Now pinned to
  the source git repo at a commit SHA (verified by `pip download`).
- **Backend boots without hermes-id auth server** — `install_agent_auth` wrapped
  in try/except; no `HERMES_AUTH_SERVER_URL` → app starts with agent auth
  disabled + startup warning. `/admin/hermes-id/*` proxy already 503s clean.
- **`ALLOW_LAN_BYPASS` resolved by decision** — set explicitly `true` with
  rationale in server/.env (was silent default); startup logs posture; 2 tests.
- **Backup/restore story added** — `server/scripts/backup.sh` snapshots .env,
  Fernet key, providers.json, profiles.json, stream hits, watch progress,
  recordings, cache, EPG cache into `backups/` (rotation 14, gitignored);
  `--restore` verified. (FP: was "no backup/restore story".)
- **Remaining (unchanged):** P2 distributed rate limiting (Redis, multi-instance
  — not needed for single-user), P2 wire CACHE_TTL_HOURS/CLEANUP_INTERVAL.

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

### ✅ Session 15 (2026-08-05) — P2 distributed rate limiting (Redis) + P4 touch targets
- **P2: Redis-backed distributed rate limiting** (SECURITY_AUDIT #8) — new
  `server/rate_limit.py` `RedisRateLimitStore` (fixed-window: SET NX EX + INCR
  pipeline, TTL-based Retry-After, per-app key prefix, **fail-open** on Redis
  outage with once-per-error-class warning). `REDIS_URL` env opt-in in
  `config.py`; unset keeps the historical in-process store with zero new deps.
  `main.py`: rate-limit logic extracted into `MemoryRateLimitStore` +
  `get_rate_limit_store()` factory; middleware now talks to a store interface —
  existing tests that manipulate `main._rate_limits` globals still pass
  untouched. `requirements.txt` adds `redis>=5.0` (only imported when
  `REDIS_URL` is set). 8 new tests with an in-process fake redis client:
  limit→block, TTL retry-after == 60, remaining quota, **shared counter across
  two store instances** (the multi-instance property the memory store can't
  provide), window-expiry reset, per-key isolation, fail-open + single warning.
- **P4: player control touch targets 40px → 44px** (WCAG 2.5.8) — bumped
  `min-w/min-h` in AudioSelector, MobileMoreMenu, PlayerBottomControls
  (Speed/Record/Download/Quality), SleepTimer, SubtitleSelector, VolumeControl.
  Mobile-overflow re-evaluation: the row scrolls/wraps on narrow screens, no
  reflow introduced.
- **Test counts:** backend 1588→**1635** passed / 17 skipped / 3 xfailed
  (full suite incl. test_live; 1618 = offline-safe run excluding it);
  frontend 1922→**1942** passed (136 files), tsc + vite build clean. Live
  fail-open verified against a closed port (real `redis.asyncio` import path).

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

> Pruned 2026-08-05: the older P0-P4 backlog entries (sessions 10-11 era)
> were archived — all preserved in git history.

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
