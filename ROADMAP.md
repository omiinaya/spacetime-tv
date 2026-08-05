# SpacetimeTV Roadmap v9 — Current State

> **Audit date:** 2026-08-05 (15th session — distributed rate limiting, touch targets; backlog current)
> **Stack:** FastAPI + React 19 + Vite 8 + Tailwind v4 | 13 pages | 133 components | 31 hooks | 25 back-end route modules
> **Test counts:** 1,635 backend pass (17 skip, 3 xfail; 1,618 offline-safe) + 1,942 frontend pass (136 files) | 0 TypeScript errors | 0 production `any` types
> **CI:** GitHub Actions (lint → test → tsc → build) on a **self-hosted runner** (registered 2026-08-04 — the repo's jobs were failing the GitHub-hosted billing gate; `hermes-id` is now a git install in requirements.txt). **E2E also wired into CI** — runs against the live provider via GitHub secrets.
> **Hook test coverage:** 31/31 (100%) — all custom hooks have unit tests
> **E2E:** 22 specs / 497 tests green across chromium, Mobile Chrome, Mobile Safari, Tablet (4 Playwright projects). Profile-gate seeded via storageState. **Now runs in CI** whenever the IPTV secrets are present (see `.github/workflows/ci.yml` `e2e` job); skipped gracefully otherwise.
> **Auth posture:** single-user LAN app — `ALLOW_LAN_BYPASS=true` set EXPLICITLY in server/.env (it was a silent default). Justified: native media elements can't attach auth headers, box is RFC1918-only. Startup logs the posture. See server/scripts/backup.sh for state snapshots.

## Current File Sizes (source only, no tests)

| File | Lines | Status |
|------|:-----:|--------|
| `web/src/hooks/useVideoPlayer.ts` | 816 | Down from 901 (-9.4%) — cleanup boilerplate unified |
| `web/src/pages/Series.tsx` | 429 | Decomposed ✅ (was 957) |
| `web/src/hooks/useSearchPage.ts` | 394 | Down from 460 — filter/sort extracted to lib/searchFiltering.ts ✅ |
| `web/src/lib/types.ts` | 445 | Type definitions — flat, low churn |
| `web/src/App.tsx` | 145 | Down from 485 — extracted useSidebarResize, MobileNav, AppRoutes, backNavigation ✅ |
| `server/main.py` | 442 | Entry point + middleware — stable |
| `web/src/pages/LiveTV.tsx` | 363 | Down from 493 (-26%) — inline components extracted ✅ |
| `server/iptv_client.py` | 502 | Provider client — well-structured service module |
| `server/auth.py` | 371 | Auth utilities — stable |
| `server/routes/guide_routes.py` | 364 | EPG routes — stable |

Largest remaining files are all documented extraction candidates or
deliberately flat data/type modules. useVideoPlayer.ts (816) is documented
as diminishing returns for further splitting.

## Recent Improvements

### Session 15 (2026-08-05) — P2 distributed rate limiting (Redis) + P4 touch targets
- **P2 closed (SECURITY_AUDIT #8): Redis-backed distributed rate limiting.**
  New `server/rate_limit.py` `RedisRateLimitStore` — fixed-window (SET NX EX +
  INCR pipeline), TTL-based Retry-After, per-app key prefix, **fail-open** on
  Redis outage (once-per-error-class warning). Opt-in via `REDIS_URL` env
  (unset keeps the in-process per-IP store — single-user LAN unchanged, zero
  new deps). Store interface extracted in `main.py`
  (`MemoryRateLimitStore` + `get_rate_limit_store()` factory); the existing
  rate-limit tests keep passing untouched. `requirements.txt` +`redis>=5.0`.
  New test file `server/tests/test_rate_limit_redis.py` (fake in-process redis
  client): shared counter across instances, TTL retry-after, window reset,
  per-key isolation, fail-open. Both remaining audit items now closed except
  `ALLOW_LAN_BYPASS=false` (resolved by decision for the LAN deployment).
- **P4 closed: player control touch targets 40px → 44px** (WCAG 2.5.8) —
  AudioSelector, MobileMoreMenu, PlayerBottomControls (Speed/Record/Download/
  Quality), SleepTimer, SubtitleSelector, VolumeControl.
- **Tests:** backend 1588→**1635** pass (full suite incl. test_live: +31 redis/fixtures +16 live; offline-safe run = 1618) / 17 skip /
  3 xfail; frontend 1922→**1942** pass (136 files); tsc + vite build clean.

### Session 14 (2026-08-04) — production-readiness close-out: CI runner, auth posture, backups
- **CI was RED on master and nobody had noticed** — every job failed in <5s with
  `steps:[]` + `runner_id:0` = the GitHub-hosted runner allocation was blocked
  by the Actions billing gate (repo had NO self-hosted runner). Registered
  `runner-spacetime-tv` in the actions-runners farm (`--labels
  ubuntu-latest,self-hosted,linux`), added it to `start-all-runners.sh` +
  `setup-all-runners.sh`, switched both workflows to
  `runs-on: [self-hosted, ubuntu-latest]`.
- **`hermes-id` install fixed for CI/Docker** — it was declared
  `hermes-id>=1.3.0` in requirements.txt but is NOT on PyPI, so every clean
  install failed. Now pinned to the source repo:
  `hermes-id @ git+https://github.com/omiinaya/hermes-auth-plugin.git@<sha>`
  (verified by pip download).
- **Backend boots without the hermes-id auth server** — `install_agent_auth`
  is now wrapped in try/except: no `HERMES_AUTH_SERVER_URL` → the app starts
  with agent auth disabled + a startup warning (CI, Docker, standalone LAN).
  The `/admin/hermes-id/*` proxy already returns 503 "not configured".
- **E2E wired into CI** — new `e2e` job in ci.yml: builds frontend, writes
  `server/.env` from secrets, seeds the profile storageState, starts uvicorn
  on :8720, runs all 4 Playwright projects. Gates on `secrets.IPTV_*` +
  `ADMIN_API_KEY`; skips gracefully on forks without them.
- **Auth posture made explicit** — `ALLOW_LAN_BYPASS=true` now set with a
  rationale comment in server/.env (was a silent default). Startup logs the
  posture (🔓/🔐) + ENFORCE_HTTPS. 2 new lifespan tests. Decision: single-user
  LAN, native media elements can't attach auth headers, box is RFC1918-only —
  flipping to false would break playback for no security gain.
- **Backup/restore story** — `server/scripts/backup.sh` snapshots .env,
  Fernet key (.encrypt_key), providers.json, profiles.json, stream hits,
  watch progress, recordings, cache, and the EPG cache into `backups/`
  (rotation 14, gitignored). `--restore <archive>` supported. Verified with a
  temp-dir extraction + full 57MB EPG + 44-char key check.

### Session 13 (2026-08-03) — public-release hardening: zero hardcoded endpoints/creds
- **No user-specific values left in the repo** — the LAN IP and the real IPTV
  provider endpoint were baked into `server/config.py` CORS defaults, `main.py`'s
  LAN bypass list, `web/docker-entrypoint.sh` cert SANs, both `.env.example`
  files, code comments, e2e specs and docs. All externalized or scrubbed:
  - CORS serve host now configurable via **`STV_HOST`** (auto-adds origins for
    the standard ports); no private IP in defaults.
  - LAN bypass uses RFC1918 subnet matching + configurable **`LAN_BYPASS_HOSTS`**
    exact-match list (default `127.0.0.1,::1,localhost`).
  - Cert SANs/CN in `docker-entrypoint.sh` read `CERT_CN`/`CERT_SANS` env vars.
  - `.env.example` ×2 use `your-iptv-provider.example.com` placeholders.
- **Gitleaks over full ~900-commit history: 0 real secrets** (1 false positive —
  test cache key). `.env`, `server/data/`, and `web/e2e/.auth/` all gitignored;
  tracked Playwright auth state file removed.
- **Credential safety verified** — admin endpoints gated by `X-Admin-Key`
  (router-level); provider passwords Fernet-encrypted at rest
  (`ENCRYPT_CREDENTIALS=true` default), never returned by the API, PUT with
  empty password never clobbers the stored one.
- **First-run UX** — LiveTV empty state now explains `IPTV_BASE/USER/PASS` or
  `PROVIDERS_JSON` and links to the Admin dashboard (3 new tests; navigate wired
  via `useNavigate`).
- **Docs** — README rewritten for BYO-provider onboarding (config table,
  Admin-UI provider flow, production deployment, security notes); SECURITY_AUDIT
  and `.env.example` docs updated. New config tests for `STV_HOST`/`LAN_BYPASS_HOSTS`.
- **Test counts:** 1,591 backend pass (+3 config/CORS tests) + 1,922 frontend pass.
  Remaining audit items: distributed rate limiting (Redis), `ALLOW_LAN_BYPASS=false`
  in production `.env`.

### Session 12 (2026-08-02) — security findings closed, SW stream fix, a11y + perf
- **CRITICAL SW fix** — every `/api/*` GET was routed to `networkFirst()` which
  does `clone.blob()`; infinite live streams never resolved (playback hung),
  multi-GB VOD remux was fully buffered. SW now bypasses `/api/stream|media|
  iptv|movie/hls|series/hls` entirely, and API cache keys hash the profile
  token (per-profile isolation; was cross-profile mixing). Cache v3→v4.
- **Security findings closed** — CORS origins now include the real frontend
  dev port (5183) + LAN host; image-proxy upstream failures → JSON 502 (was
  500 text/plain); `X-Request-ID` middleware added. SECURITY_AUDIT 78→80,
  remaining: distributed rate limiting + `ALLOW_LAN_BYPASS=false` in prod.
- **A11y** — MediaOverlay focus trap, MobileNav focus trap, labeled search
  inputs, accessible icon buttons, no nested `<button>`s, keyboard-reachable
  PersonPage cards, `<video>` name + error `role=alert`.
- **Perf** — watchlist membership via cached Set (O(1)), memoized Series
  visibleCats + LiveTV favorites, stable `getNowPlaying` closures.
- **Backend resilience** — task-level Exception guards on `_epg_broadcast_loop`,
  `warm_cache`, `_fetch_one` (silent task-kill elimination + provider-health
  recording); subtitle extraction failure → 404 not 500.

### Session 11 (2026-08-01) — suite restoration + security hardening
- **Backend suite 518 failures → 1382+ pass** — root cause: conftest used
  `os.environ.setdefault("ADMIN_API_KEY")` but the parent shell env carries the
  REAL admin key, and `load_dotenv()` never overrides an existing var — every
  test sent the test key while config resolved the production key → auth
  middleware 403'd all 518 API tests. conftest now FORCES the test key + LAN
  bypass. Also loads hermes-id auth env from `~/.hermes/auth/projects/spacetime-tv.env`
  (or CI fallback) so tests are deterministic regardless of parent shell env.
- **Frontend AdminDashboard 16 failures → 18/18** — bare render lacked a Router
  ancestor; every `<Link>` crashed on `useContext` null. Wrapped in MemoryRouter.
- **Strict CSP** — `script-src 'self'` (was `'self' 'unsafe-inline' 'unsafe-eval'`).
  SW registration moved from inline `<script>` to the bundle; verified live:
  channel 483976 plays (video readyState 4) with zero CSP violations.
- **SW cache fix** — sw.js was cache-first for ALL static assets including
  index.html (unhashed shell), so the old build served forever after deploy,
  bypassing HTTP Cache-Control entirely. Navigation now network-first;
  cache name bumped v2→v3. This is the real mechanism behind the "UI still
  broken after fix" reports.
- **HTTP cache headers** — index.html `no-cache, no-store, must-revalidate`;
  hashed /assets/* `public, max-age=31536000, immutable` (cache-control middleware).
- **E2E repaired** — profile-gate storage seed + locator scoping + pinned mobile
  viewport; 85+ passing against live backend.
- **App.tsx 485→145, useSearchPage.ts 460→394** — extracted useSidebarResize,
  MobileNav, AppRoutes, backNavigation, lib/searchFiltering (+10 tests).
- **Preflight verified at runtime** — working channel 483976 preflights True in
  751ms cold / 0ms cached; dead channels (1, 250) fail fast; no mpegts desync.

### Session 10 (2026-07-31) — hardening + preflight tuning
- **ALLOW_LAN_BYPASS env flag** — the dev convenience that skips auth for all
  localhost/192.168.x.x requests is now gated by `ALLOW_LAN_BYPASS` (default
  true, set `false` for hardened deployments). 7 middleware tests added
  (`test_auth_middleware_lan.py`).
- **Preflight cache + env-configurable timeout** — `preflight_stream()` results
  are now cached short-term keyed by URL + Range header (30s success / 5s
  failure) so rapid channel re-zaps skip the redundant CDN connection, and the
  per-call timeout defaults to `STREAM_PREFLIGHT_TIMEOUT` (10s). 5 cache tests
  added in `test_stream.py`.
- **Pre-commit hook fixed** — was a silent no-op gate: `make fmt-check`/`make lint`
  failures were never propagated, so commits with lint/format violations succeeded.
  Hook now aborts the commit on any staged-file violation (ruff format+lint for
  Python, prettier+eslint for TS/CSS) and scopes checks to staged files only.
- **Prettier is now a real dependency** — `prettier@^3.9.6` added to devDependencies,
  `web/.prettierrc` pins the codebase style (prettier defaults), Makefile format
  targets use the npm scripts. `npm run format:check` is clean on all committed
  source.
- **SECURITY_AUDIT.md reconciled** — HTTPS/TLS 20→75 (nginx TLS + ENFORCE_HTTPS
  redirect + ACME) and Auth Coverage 60→85 (auth middleware covers all `/api/*`,
  LAN bypass gated by `ALLOW_LAN_BYPASS`); overall 72→78.
- **Dead test helper removed** — `_mock_preflight_session` in test_stream.py was
  never called; deleted (single `_counting_preflight_session` remains).
- **Frontend count verified** — fresh `npm test`: 1559 passed / 1560 (100 files);
  the 1 failure is the known parallel-load flake (Movies.test.tsx passes 40/40
  isolated).

### Session 10 (2026-07-31) — hardening + preflight tuning
- **ALLOW_LAN_BYPASS env flag** — the dev convenience that skips auth for all
  localhost/192.168.x.x requests is now gated by `ALLOW_LAN_BYPASS` (default
  true, set `false` for hardened deployments). 7 middleware tests added
  (`test_auth_middleware_lan.py`).
- **Preflight cache + env-configurable timeout** — `preflight_stream()` results
  are now cached short-term keyed by URL + Range header (30s success / 5s
  failure) so rapid channel re-zaps skip the redundant CDN connection, and the
  per-call timeout defaults to `STREAM_PREFLIGHT_TIMEOUT` (10s). 5 cache tests
  added in `test_stream.py`.

### Session 9 (2026-07-31) — EPG refresh dedup + preflight

### Bug Fixes
| Bug | File | Fix |
|-----|------|-----|
| EPG refresh dedup broken across modules | `guide_epg.py`, `admin.py` | `_epg_refresh_task` rebind on local copies left `state._epg_refresh_task = None` forever → admin could spawn duplicate concurrent XMLTV refreshes. Both modules now use `state._epg_refresh_task` attribute access |
| LiveTV sessionStorage cache not restoring | `LiveTV.tsx` | `setAllStreams(allStreams)` → `setAllStreams(parsed.a)` |
| Native playback event listeners leak | `useVideoPlayer.ts` | Self-cleaning mechanism via `__stv_native_listeners__` flag |
| VOD ffmpeg orphaned on disconnect | `stream_vod.py` | Added `request.is_disconnected()` check to all VOD routes (remux, transcode, proxy) |

### Refactoring
| File | Before | After | Δ |
|------|:------:|:-----:|:-:|
| **LiveTV.tsx** | 493 | **363** | **−26%** |
| **useVideoPlayer.ts** | 901 | **816** | **−9.4%** |
| **MovieOverlay.tsx** | 418 | **254** | **−39%** |
| **SeriesOverlay.tsx** | 520 | **396** | **−24%** |

**New files:**
- `web/src/components/live/LiveSearchBar.tsx` — extracted from LiveTV.tsx
- `web/src/components/live/CategoryTabs.tsx` — extracted from LiveTV.tsx
- `web/src/hooks/usePlayerCleanup.ts` — unified destroyAll() / destroyAllExcept()
- `web/src/components/movie/MovieLanguageSelector.tsx` — language dropdown
- `web/src/components/movie/MoviePlayButton.tsx` — play/watchlist/trailer buttons
- `web/src/components/media/MediaCastSection.tsx` — shared cast+director display
- `web/src/components/media/MediaInfoBar.tsx` — shared metadata bar

### New Tests
| File | Tests |
|------|:----:|
| `hooks/__tests__/usePlayerCleanup.test.ts` | 14 |
| `hooks/__tests__/useControlsVisibility.test.ts` | 7 |
| `hooks/__tests__/useFocusTrap.test.ts` | 5 |
| `hooks/__tests__/useSwipeToGoBack.test.ts` | 8 |
| `hooks/__tests__/useLiveStreamCache.test.ts` | 12 |
| `hooks/__tests__/useRecording.test.ts` | 11 |
| `hooks/__tests__/useProfile.test.ts` | 19 |
| `hooks/__tests__/usePlayerControls.test.ts` | 18 |
| `hooks/__tests__/useSearchPage.test.ts` | 14 |
| `hooks/__tests__/useDocumentPiP.test.ts` | 10 |
| **Total new tests (sessions 7-9)** | **118** |

## Remaining Work

### Frontend
- `useVideoPlayer.ts` (816 lines) — main effect is dense orchestration; further sub-hook extraction possible but diminishing returns
- **E2E: 3 flaky specs remain** (timing-sensitive negative assertions vs live backend; one search spec hit a real 429 rate limit — now friendly-messaged). E2E is wired into CI (Session 14): the `e2e` job builds the frontend, seeds the profile storageState, starts uvicorn on :8720, and runs all 4 Playwright projects — gated on `secrets.IPTV_*` + `ADMIN_API_KEY`, skipped gracefully on forks.
- Full-suite parallel-load flakiness was fixed in session 9 (asyncUtilTimeout 4000ms + SeriesOverlay play gating + usePlayerUtils sessionStorage guard); if flakes reappear, revisit the rotating waitFor/userEvent timeouts

### Backend
- Modules at full route coverage (25/25)
- record.py at **100% coverage** (was 87% — 7 error-path tests added: corrupt meta, EPG type errors, kill-on-timeout, finished-process refresh)
- state.py at **100% coverage** (cache cleanup loop fully tested)
- Consider extracting service layer from route modules if routes grow

### Infrastructure
- ✅ CI with GitHub Actions (lint + test + tsc + build) on a self-hosted runner
- ✅ Docker Compose for deployment
- ✅ Nginx + TLS (443, http2, HSTS; Let's Encrypt via ACME_DOMAIN, self-signed fallback)
- ✅ Pre-commit hooks auto-installed via `npm install` (`prepare`/`postinstall` set `core.hooksPath .githooks`); hook gates staged files on ruff/prettier/eslint and fails the commit on violations
- ✅ E2E in CI — wired Session 14 into ci.yml's `e2e` job (builds frontend, seeds profile storageState, starts uvicorn on :8720, runs all 4 Playwright projects); gated on `secrets.IPTV_*` + `ADMIN_API_KEY`, skipped gracefully on forks

## What's Solid
- **0 TypeScript errors** in production code
- **0 pre-existing test failures** (1,571 frontend tests / 101 files, 1,394 backend)
- **0 `any` types** in production source
- **Strict CSP** — script-src 'self' only (no unsafe-inline/eval), verified with live playback
- **Clean build** with proper code splitting (hls.js, shaka-player in separate chunks)
- **Good accessibility:** alt text, aria-labels, skip-to-content, roles
- **No circular imports** in backend
- **No secrets in code**
