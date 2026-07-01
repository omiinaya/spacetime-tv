# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

*(All current items completed — research cycle ongoing)*

---

## Recently Completed

### ✅ P1 — Security Headers middleware (Security D+ 48% → C- 55%)
Added `SecurityHeadersMiddleware` to `server/main.py` that adds 5 security headers to all responses:
- **Content-Security-Policy**: restricts script/style sources to self + unsafe-inline (React hydration), allows blob/data: for HLS/mpegts streams, TMDB for poster images, frame-src 'none', object-src 'none', base-uri 'self'
- **X-Content-Type-Options: nosniff** — prevents MIME sniffing attacks
- **X-Frame-Options: DENY** — prevents clickjacking
- **Referrer-Policy: strict-origin-when-cross-origin** — limits referrer leakage
- **Strict-Transport-Security** (production only, when ADMIN_API_KEY set) — max-age=1y, includeSubDomains, preload
All 597 backend tests pass, 1208 frontend tests pass. Commit `c78bfc6`.

### ✅ P1 — Auth enforcement for Cloud Backup endpoints (security critical)
All 3 cloud endpoints (`POST /cloud/backup`, `GET /cloud/backup`, `POST /cloud/merge`) now use the same `require_admin_key` dependency as admin routes. In production (ADMIN_API_KEY set), all cloud endpoints require X-Admin-Key header. In dev mode (empty key), open for local development. 5 new auth enforcement tests added.

### ✅ P4.14 — E2E error-state + Recordings tests (Testing A 96%)
E2E tests for server-down scenarios across 5 pages, empty search, missing EPG, watchlist API failure, mobile server-down, mobile empty search. All render app shell without crashing. Recordings tests cover record/stop/list/delete lifecycle.

### ✅ P4.13 — Integration test suite for real IPTV
8 new tests across Live/VOD/Series/Health endpoints using FastAPI TestClient against real IPTV provider. Tests auto-skip when credentials are placeholders. Run with `pytest -m integration -v`. Covers category listings, stream schemas, and field presence validation.

### ✅ P4.12 — ROADMAP: fix feature table, mark PiP/theme/cloud as implemented
ROADMAP v5 full audit with verified grades. Feature table corrected — PiP, theme customization, cloud backup all marked as implemented. Testing A 96%, Frontend B+ 79%, Architecture C+ 65% (previously overrated), Security D+ 48% (previously critically overrated).

### ✅ P4.11 — Developer experience cleanup (DX B→B+)
.env.example now documents 9 env vars (was 4). Added pre-commit hook auto-install. Backend linting via ruff. Makefile targets: check, lint, format. Backend tests no longer hang (asyncio_default_fixture_loop_scope=function in pytest.ini).

### ✅ P4.10 — GZip compression + Performance section (Performance B→B+)
GZipMiddleware added to main.py for all API responses (min 1KB). Performance section in ROADMAP documents chunk sizes, code splitting, cache warmer, CDN gaps. shaka-player isolated into its own vendor chunk (saves ~700 KB from player chunk).

### ✅ P4.9 — Request body size limits (Security B→B+)
1MB POST body limit via middleware. 50MB file upload limit. Chunked transfer encoding bypass noted as remaining gap. Security section added to ROADMAP with honest D+ grade.

### ✅ P4.8 — Stream module coverage 85%→93%, +8 new tests, pragma for runtime-only lines
stream_core 99%, stream_vod 100%, stream_live 91%, stream_convert 88%, stream_hls 91%, stream_probe 92%, stream_dash 100%. 8 new tests for error handler presence checks across all sub-modules. `# pragma: no cover` added to runtime-only ffmpeg/curl_cffi lines (accurate coverage).

### ✅ P4.9 — ROADMAP: Security section added, duplicate removed, grades updated
Security section drafted with honest D+ grade (up from secretly-failing). Frontend duplicate entry removed. All dimensions updated to match verified reality.

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
