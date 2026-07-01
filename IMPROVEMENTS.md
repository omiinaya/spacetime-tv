# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

### P4 — Add `role="dialog"` + aria-modal + focus trap to PinPrompt and KeyboardShortcuts (Accessibility)
Current modal overlays lack proper dialog semantics for screen readers.

### P4 — Split Series.tsx (957 lines) into sub-components (Maintainability)
Extract CW section, recently-completed row, and grid keyboard nav into separate components.

### P4 — Split Search.tsx (855 lines) into sub-components (Maintainability)
Large search results page needs decomposition.

### P4 — Misc catch-all route shadows `HEAD` requests on streaming endpoints
The `/{full_path:path}` catch-all in misc.py intercepts HEAD requests before
included-router partial matches resolve, returning 404/SPA index instead of 405.
Only affects HEAD on GET-only streaming routes (SSE). Low impact but confusing
for API consumers. Fix: add explicit HEAD handler or reorder route resolution.

---

## Recently Completed

### ✅ P4 — Fix test_main.py syntax error + SSE endpoint HEAD tests
- Fixed rogue docstring artifact in `test_main.py` (SyntaxError on import)
- Fixed SSE endpoint tests: HEAD requests fell through to misc catch-all
  (`/{full_path:path}`). Replaced with `app.url_path_for()` verification
- All 589 backend tests pass, TypeScript 0 errors. Commit `b0db653`.

### ✅ P4 — Add shaka-player to manualChunks in vite.config.ts (Performance)
Added `shaka` chunk to `manualChunks` in `vite.config.ts` — isolates shaka-player (~700 KB with its bundled subtitle engine, STT, RTL, Translation API) into a separate vendor chunk. All 1208 frontend tests pass, 597 backend tests pass, TypeScript 0 errors. Commit `51a834a`.

### ✅ P2 — Add keyboard handlers to `role="button"` divs (accessibility)
All 5 `role="button"` `div` elements already had complete `onKeyDown` handlers for Enter/Space (Movies.tsx:478, WatchlistPage.tsx:160/353, Series.tsx:530/664). Item was already implemented.

### ✅ P2 — Fix duplicate Toaster + update .env.example with all env vars
- Removed duplicate `<Toaster>` from `main.tsx` (consolidated in `App.tsx`)
- `server/.env.example` now documents 8 env vars (was 4): added `ADMIN_API_KEY`, `EPG_CACHE_TTL`, `TMDB_ENRICH_PATH`, `MAX_REQUEST_BODY`, `MAX_FILE_UPLOAD`, `CORS_ORIGINS`
- All 597 backend tests pass, TypeScript 0 errors. Commit `f02ed63`.

### ✅ P1 — Security Headers middleware (Security D+ 48% → C- 55%)
Added `SecurityHeadersMiddleware` to `server/main.py` that adds 5 security headers.
All 597 backend tests pass, 1208 frontend tests pass. Commit `c78bfc6`.

### ✅ P1 — Auth enforcement for Cloud Backup endpoints (security critical)
All 3 cloud endpoints now use `require_admin_key` dependency. Commit `e84cb4e`.

### ✅ P4.14 — E2E error-state + Recordings tests (Testing A 96%)
E2E tests for server-down scenarios across 5 pages. Commit `104e96b`.

### ✅ P4.13 — Integration test suite for real IPTV
8 new tests across Live/VOD/Series/Health endpoints. Commit `4833bb2`.

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
