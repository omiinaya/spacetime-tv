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

## Phase 1: Reliability (P1 — ~7h)

Things that silently fail today.

| # | Task | Effort | Why |
|---|------|--------|-----|
| P1.1 | Fix backend silent error swallowers | 1h | 44 except blocks, many with no logging |
| P1.2 | Extract Player.tsx into 3 hooks | 2h | 966-line monolith: player, fullscreen, keyboard |
| P1.3 | Split backend into route files | 2h | 1,672-line single file |
| P1.4 | Fix 6 `: any` type casts | 30m | Player.tsx, Search.tsx, LiveTV.tsx, Guide.tsx |
| P1.5 | Replace direct DOM manipulation | 30m | SeriesOverlay.tsx (body overflow), Player.tsx (fullscreen) |
| P1.6 | Fix search cache ordering bug | 1h | server/main.py `_search_cached` |

### P1.2 — Player.tsx extraction (966 → ~400 + 3 hooks)
```
web/src/hooks/useVideoPlayer.ts  (~200 lines)
  - HLS/mpegts player init, source switching, quality detection
  - Play/pause/seek/volume logic
web/src/hooks/useFullscreen.ts   (~80 lines)
  - Fullscreen enter/exit, change listeners
web/src/hooks/useKeyboard.ts     (~60 lines)
  - Keyboard shortcuts (space, arrows, f, m)
web/src/components/Player.tsx    (~400 lines)
  - UI rendering only: controls, progress bar, overlay
```

### P1.3 — Backend modularization
```
server/main.py       (~200 lines) — app factory, middleware, startup
server/config.py     (~30 lines)  — settings, env loading
server/cache.py      (~80 lines)  — cached_fetch, cache warming, cleanup
server/routes/live.py    (~150 lines)
server/routes/movies.py  (~250 lines)
server/routes/series.py  (~200 lines)
server/routes/stream.py  (~300 lines)
server/routes/guide.py   (~80 lines)
server/routes/search.py  (~100 lines)
server/routes/proxy.py   (~50 lines)
```

### P1.6 — Search cache ordering fix
- **Root cause:** `_search_cached` iterates `_cache` dict in insertion order, stops at 20 results. Categories cached later (higher IDs) are excluded when 20 noisy matches from early categories fill the quota first.
- **Fix:** Scan ALL cached categories, collect all matches, then return top 20. Alternative: remove the 20-result cap from the fast path and let the full fallback handle ordering.

---

## Phase 2: Polish (P2 — ~8h)

| # | Task | Effort | Why |
|---|------|--------|-----|
| P2.1 | Extract shared MediaOverlay component | 2h | Movie + Series overlays share ~70% structure |
| P2.2 | Lazy-load pages (code splitting) | 1h | 1.1MB JS bundle, no splitting |
| P2.3 | Cache download progress in player | 1.5h | No visibility into 5-10min VOD downloads |
| P2.4 | Normalize localStorage key names | 30m | Mix of `stv_`, `stv-`, `stv.` prefixes |
| P2.5 | Skip intro/outro buttons | 1h | Series player has no skip shortcuts |
| P2.6 | EPG timezone support | 1.5h | Guide always shows UTC times |
| P2.7 | Image proxy response caching | 30m | Every request re-fetches from CDN |

### P2.1 — Shared overlay
MovieOverlay and SeriesOverlay share ~70% structure: backdrop, poster, close button, genre tags, meta row, description. Extract to `MediaOverlay` with slots for content-specific sections (language dropdown vs season tabs, play movie vs play episode).

---

## Phase 3: Infrastructure (P3 — ~4h)

| # | Task | Effort |
|---|------|--------|
| P3.1 | Docker Compose (backend + frontend) | 1.5h |
| P3.2 | Health check endpoint | 15m |
| P3.3 | Frontend error tracking beacon | 1h |
| P3.4 | Mobile touch seeking | 1h |

---

## Phase 4: Deep Cuts (P4 — ~10h, optional)

| # | Task | Effort |
|---|------|--------|
| P4.1 | Accessibility (ARIA, keyboard nav, screen reader) | 3h |
| P4.2 | PWA support (offline, install prompt) | 3h |
| P4.3 | Unit + integration tests | 3h |
| P4.4 | Series continue-watching | 2h |
