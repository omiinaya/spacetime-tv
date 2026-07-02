# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

Item labels: **P1** = ship blocker, **P2** = UX polish, **P3** = nice to have,
**P4** = tech debt / DX.

---

## Pending Items

### P4 — Split Search.tsx (855 lines) into sub-components (Maintainability)
Large search results page needs decomposition.

### P4 — Misc catch-all route shadows `HEAD` requests on streaming endpoints
The `/{full_path:path}` catch-all in misc.py intercepts HEAD requests before
included-router partial matches resolve, returning 404/SPA index instead of 405.
Only affects HEAD on GET-only streaming routes (SSE). Low impact but confusing
for API consumers. Fix: add explicit HEAD handler or reorder route resolution.

### P4 — Check for new hls.js stable release (Dependency)
hls.js is pinned at `^1.7.0-beta.1`. Latest stable is 1.6.16 (no v1.7.0 stable yet).
Re-check next tick.

---

## Recently Completed

### ✅ P4 — Upgrade lucide-react ^1.22.0 → ^1.23.0 (Dependency)
Bumped lucide-react to 1.23.0 — new icons and fixes. No breaking changes.
All 1209 frontend tests pass, TypeScript 0 errors. Commit `181a887`.

### ✅ P4 — Split Series.tsx (957 lines) into sub-components (Maintainability)
- Extracted `ContinueWatchingRow` → `@/components/ContinueWatchingRow.tsx`
- Extracted `RecentlyCompletedRow` → `@/components/RecentlyCompletedRow.tsx`
- Series.tsx reduced from 957 to 748 lines (~22% reduction)
- Both components have typed props interfaces and behave identically
- All 1209 frontend tests pass, 592 backend tests pass, TypeScript 0 errors. Commit `897b74d`.

### ✅ P4 — Add device-token auth to cloud sync endpoints (Scoped Access)
- Cloud backup endpoints now use `X-Device-Token` for scoped per-device auth
- Tokens are SHA-256 hashed before storage (server never stores raw tokens)
- First upload for a device_id acts as registration; subsequent read/write requires same token
- Admin key (`X-Admin-Key`) bypasses device token checks (admin override)
- Short tokens (< 8 chars) rejected even on first-time registration
- `CACHE_DIR` centralized in `config.py` (was duplicated across 4 files)
- `RequestBodySizeMiddleware` now handles chunked transfer encoding (413 on oversized bodies)
- MSW mock handlers updated to enforce device token on frontend tests
- 26 cloud sync tests pass, 1209 frontend tests pass, TypeScript 0 errors. Commit `715ed9c`.

### ✅ P4 — Add `role="dialog"` + aria-modal + focus trap to PinPrompt and KeyboardShortcuts (Accessibility)
- New `useFocusTrap` hook traps Tab/shift+Tab inside modals, restores previous focus on close
- PinPrompt: `role="dialog"`, `aria-modal="true"`, `aria-label={title}`, focus trap active
- KeyboardShortcuts: same ARIA dialog semantics + focus trap
- All 1209 frontend tests pass, 589 backend tests pass, TypeScript 0 errors. Commit `3b0549a`.

### ✅ P4 — Fix test_main.py syntax error + SSE endpoint HEAD tests
- Fixed rogue docstring artifact in `test_main.py` (SyntaxError on import)
- Fixed SSE endpoint tests: HEAD requests fell through to misc catch-all
  (`/{full_path:path}`). Replaced with `app.url_path_for()` verification
- All 589 backend tests pass, TypeScript 0 errors. Commit `b0db653`.

### ✅ P4 — Add shaka-player to manualChunks in vite.config.ts (Performance)
Added `shaka` chunk to `manualChunks` in `vite.config.ts` — isolates shaka-player (~700 KB with its bundled subtitle engine, STT, RTL, Translation API) into a separate vendor chunk. All 1208 frontend tests pass, 597 backend tests pass, TypeScript 0 errors. Commit `51a834a`.

---

*Older completed items are in the git history. Run `git log --oneline` for the full archive.*
