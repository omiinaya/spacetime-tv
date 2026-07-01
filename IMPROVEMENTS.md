# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

### P2 — Add keyboard handlers to `role="button"` divs (accessibility)
5 `role="button"` `div` elements without keyboard handlers (Movies.tsx:478, WatchlistPage.tsx:160/353, Series.tsx:530/664). These break keyboard navigation for users who can't use a mouse. Add `onKeyDown` handlers for Enter/Space.

### P4 — Add shaka-player to manualChunks in vite.config.ts (Performance)
shaka-player (with its bundled subtitle engine, STT, RTL, Translation API) inflates the player chunk by ~700 KB. Add to manualChunks to isolate it in a separate vendor chunk.

### P4 — Add `role="dialog"` + aria-modal + focus trap to PinPrompt and KeyboardShortcuts (Accessibility)
Current modal overlays lack proper dialog semantics for screen readers.

### P4 — Split Series.tsx (957 lines) into sub-components (Maintainability)
Extract CW section, recently-completed row, and grid keyboard nav into separate components.

### P4 — Split Search.tsx (855 lines) into sub-components (Maintainability)
Large search results page needs decomposition.

---

## Recently Completed

### ✅ P2 — Fix duplicate Toaster + update .env.example with all env vars
- Removed duplicate `<Toaster>` from `main.tsx` (consolidated in `App.tsx` with `closeButton` and `toastOptions`)
- `server/.env.example` now documents 8 env vars (was 4): added `ADMIN_API_KEY`, `EPG_CACHE_TTL`, `TMDB_ENRICH_PATH`, `MAX_REQUEST_BODY`, `MAX_FILE_UPLOAD`, `CORS_ORIGINS`
- All 597 backend tests pass, TypeScript 0 errors
- Commit `f02ed63`

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

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
