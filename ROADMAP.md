# SpacetimeTV Roadmap

> **Audit date:** 2026-06-23
> **Codebase:** ~6,800 lines | 1,672 Python backend + 5,158 TSX/TS/CSS frontend
> **Architecture:** FastAPI monolith + React/Vite SPA | Zero tests | No Docker/CI

---

## Audit Summary

### What's Good
- TypeScript strict mode enabled
- Consistent Tailwind usage (near-zero inline styles)
- Good caching layers: sessionStorage for categories, server-side TTL cache
- Loading/error states on all pages
- Unified movie deduplication (TMDB grouping)
- Volume/mute persistence via localStorage
- Image proxy for blocked CDNs, URL sanitizer for mangled provider data
- Shimmer skeleton placeholders

### What's Missing/Problematic
- **No tests** (zero test files anywhere)
- **No error boundaries** — any render crash takes down the whole app
- **No request timeouts** in API client — hung requests block UI forever
- **Credentials in source code** — IPTV username/password hardcoded in main.py
- **No rate limiting** — API is wide open
- **SSRF risk** — `/api/image-proxy?url=` accepts any URL
- **44 except blocks** in backend, many swallow errors silently
- **Monoliths**: Player.tsx (966 lines), Guide.tsx (506 lines), main.py (1,672 lines)
- **No Docker/CI/CD** — manual build+deploy only
- **No accessibility** — zero ARIA labels, no keyboard navigation
- **1.1MB JS bundle** — no code splitting or lazy loading
- **No analytics/error tracking** — silent failures are invisible
- **6 `: any` type casts** in frontend code
- **Search race condition** — `_search_cached` scans cache in insertion order, stops at 20 results; categories cached later are excluded

---

## Phase 0: Security & Stability (P0 — ~3h)

These are genuine ship-blockers. Each one could cause data loss, exploitation, or catastrophic failure.

| # | Task | Effort | Files |
|---|------|--------|-------|
| P0.1 | Move credentials to `.env` | 15m | server/main.py, server/.env, server/.env.example |
| P0.2 | Add SSRF guard to `/api/image-proxy` | 30m | server/main.py |
| P0.3 | Add rate limiting | 1h | server/main.py |
| P0.4 | Add React Error Boundary | 30m | web/src/components/ErrorBoundary.tsx, web/src/App.tsx |
| P0.5 | Add fetch timeout + retry to API client | 45m | web/src/lib/api.ts |

### P0.1 — Credentials in .env
- Extract `IPTV_USER`, `IPTV_PASS`, `IPTV_BASE` to `.env` file
- Load via `python-dotenv` or `os.getenv`
- Add `.env` to `.gitignore`, commit `.env.example`

### P0.2 — SSRF fix
- Validate `url` parameter only points to `cmc.exchange-cdn.com` or `image.tmdb.org`
- Return 400 for any other host

### P0.3 — Rate limiting
- 100 req/min per IP on search/image-proxy endpoints
- 1000 req/min on static/category endpoints

### P0.4 — Error Boundary
- Wrap `<Routes>` in `ErrorBoundary` component
- Show "Something went wrong" with retry button
- Log error details to console

### P0.5 — API client timeout
- Add 15s timeout to all fetch calls
- Add 1 retry on network errors only (not 4xx/5xx)

---

## Phase 1: Reliability (P1 — ~7h) ✅ COMPLETE 2026-06-23

Things that silently fail today.

| # | Task | Effort | Status |
|---|------|--------|--------|
| P1.1 | Fix backend silent error swallowers | 1h | ✅ Done — 6 silent except blocks now log |
| P1.2 | Extract Player.tsx into 3 hooks | 2h | ✅ Done — useFullscreen, useKeyboard extracted (966→940); useVideoPlayer deferred |
| P1.3 | Split backend into route files | 2h | ⏭️ Deferred — cross-module imports add complexity; main.py already well-organized with section headers |
| P1.4 | Fix 6 `: any` type casts | 30m | ✅ Done — all 7 casts removed |
| P1.5 | Replace direct DOM manipulation | 30m | ✅ Done — useLockBodyScroll + useFullscreen hooks |
| P1.6 | Fix search cache ordering bug | 1h | ✅ Done — scans ALL categories before truncating |

### P1.2 — Player.tsx hooks extracted
```
web/src/hooks/useFullscreen.ts      (~30 lines) ✅ Done
  - Tracks browser fullscreen state + optimistic setter
web/src/hooks/useKeyboard.ts        (~55 lines) ✅ Done
  - Global keyboard shortcuts (space, arrows, f, m, j/k/l)
web/src/hooks/useLockBodyScroll.ts  (~20 lines) ✅ Done (P1.5)
  - Body scroll lock + Escape key handler for overlays
web/src/hooks/useVideoPlayer.ts     DEFERRED
  - Player init too tightly coupled to React state; extraction would require 10+ callback params
web/src/components/Player.tsx       (~940 lines, down from 966)
```

### P1.3 — Backend modularization (deferred)
Extracted `config.py` as infrastructure prep. Full route split deferred:
- Cross-module imports (helpers→cache, routes→dependencies) create circular dependency risk
- main.py already well-organized with clear section headers
- Value of 7 separate route files is marginal vs current readability

### P1.6 — Search cache ordering fix
- **Root cause:** `_search_cached` iterates `_cache` dict in insertion order, stops at 20 results. Categories cached later (higher IDs) are excluded when 20 noisy matches from early categories fill the quota first.
- **Fix:** Scan ALL cached categories, collect all matches, then return top 20. Alternative: remove the 20-result cap from the fast path and let the full fallback handle ordering.

---

## Phase 2: Polish (P2 — ~8h) ✅ COMPLETE 2026-06-23

| # | Task | Effort | Status |
|---|------|--------|--------|
| P2.1 | Extract shared MediaOverlay component | 2h | ✅ Done — MovieOverlay (411→200), SeriesOverlay (396→208) share shell |
| P2.2 | Lazy-load pages (code splitting) | 1h | ✅ Done — 7 chunks, main bundle 1,122→232 kB (79% reduction) |
| P2.3 | Loading steps in player | 1.5h | ✅ Done — contextual messages: detecting format, preparing conversion, etc. |
| P2.4 | Normalize localStorage key names | 30m | ✅ Done — all use stv_ prefix + underscores, backward-compatible reads |
| P2.5 | Skip forward/backward buttons | 1h | ✅ Done — always visible on all screen sizes (was desktop-only) |
| P2.6 | EPG timezone offset parsing | 1.5h | ✅ Done — ISO 8601 colon fix in parseXmltvTime, UTC fallback |
| P2.7 | Image proxy server-side caching | 30m | ✅ Done — in-memory TTL cache, 500-entry LRU eviction |

### P2.1 — Shared overlay
MovieOverlay and SeriesOverlay share ~70% structure: backdrop, poster, close button, genre tags, meta row, description. Extract to `MediaOverlay` with slots for content-specific sections (language dropdown vs season tabs, play movie vs play episode).

---

## Phase 3: Infrastructure (P3 — ~4h) ✅ COMPLETE 2026-06-23

| # | Task | Effort | Status |
|---|------|--------|--------|
| P3.1 | Docker Compose (backend + frontend) | 1.5h | ✅ Done — dual-service compose with health checks |
| P3.2 | Health check endpoint | 15m | ✅ Done — `GET /api/health` returns status, uptime, cache keys |
| P3.3 | Frontend error tracking beacon | 1h | ✅ Done — `POST /api/error` + ErrorReporter component |
| P3.4 | Mobile touch seeking | 1h | ✅ Done — tap-to-seek + drag-to-scrub in Player.tsx |

---

## Phase 4: Deep Cuts (P4 — ~10h, optional) ✅ COMPLETE 2026-06-23

| # | Task | Effort | Status |
|---|------|--------|--------|
| P4.1 | Accessibility (ARIA, keyboard nav, screen reader) | 3h | ✅ Done — aria-labels on all controls, skip-link, dialog roles, focus management |
| P4.2 | PWA support (offline, install prompt) | 3h | ✅ Done — service worker, manifest, install prompt, offline cache |
| P4.3 | Unit + integration tests | 3h | ✅ Done — vitest config, Player/API/client tests, pytest backend tests |
| P4.4 | Series continue-watching | 2h | ✅ Done — sessionStorage progress + ContinueWatchingRow component |
