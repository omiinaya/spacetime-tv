# SpacetimeTV Roadmap v7 — Current State

> **Audit date:** 2026-07-30 (7th session — cleanup unification + backend disconnect handling)
> **Stack:** FastAPI + React 19 + Vite 8 + Tailwind v4 | 14 pages | 70+ components | 30+ hooks | 12 back-end route modules
> **Test counts:** 1,313 backend pass + 1,412 frontend pass | 0 TypeScript errors | 0 production `any` types
> **CI:** GitHub Actions (lint → test → tsc → build)

## Current File Sizes (source only, no tests)

| File | Lines | Status |
|------|:-----:|--------|
| `web/src/hooks/useVideoPlayer.ts` | 825 | Down from 901 (-8.4%) — cleanup boilerplate unified |
| `web/src/pages/Series.tsx` | 407 | Decomposed ✅ |
| `web/src/pages/LiveTV.tsx` | 363 | Down from 493 (-26%) — inline components extracted ✅ |
| `web/src/components/MovieOverlay.tsx` | 418 | Dense metadata overlay, could split cast/language menu |
| `web/src/pages/SettingsPage.tsx` | 259 | Decomposed ✅ |
| `web/src/App.tsx` | 399 | Decomposed ✅ |
| `server/iptv_client.py` | 497 | Provider client — well-structured service module |
| `server/auth.py` | 371 | Auth utilities — stable |
| `server/routes/guide_routes.py` | 364 | EPG routes — stable |

All other files < 350 lines.

## Recent Improvements (session 7)

### Bug Fixes
| Bug | File | Fix |
|-----|------|-----|
| LiveTV sessionStorage cache not restoring | `LiveTV.tsx` | `setAllStreams(allStreams)` → `setAllStreams(parsed.a)` |
| Native playback event listeners leak | `useVideoPlayer.ts` | Self-cleaning mechanism via `__stv_native_listeners__` flag |
| VOD ffmpeg orphaned on disconnect | `stream_vod.py` | Added `request.is_disconnected()` check to all VOD routes (remux, transcode, proxy) |

### Refactoring
| File | Before | After | Δ |
|------|:------:|:-----:|:-:|
| **LiveTV.tsx** | 493 | **363** | **−26%** |
| **useVideoPlayer.ts** | 901 | **825** | **−8.4%** |

**New files:**
- `web/src/components/live/LiveSearchBar.tsx` — extracted from LiveTV.tsx
- `web/src/components/live/CategoryTabs.tsx` — extracted from LiveTV.tsx  
- `web/src/hooks/usePlayerCleanup.ts` — unified destroyAll() / destroyAllExcept() player cleanup

### New Tests
| File | Tests | 
|------|:----:|
| `hooks/__tests__/usePlayerCleanup.test.ts` | 14 |

## Remaining Work

### Frontend
- `useVideoPlayer.ts` (825 lines) — main effect still dense; further sub-hook extraction possible
- `MovieOverlay.tsx` (418 lines) — language menu, cast info, metadata sections could be extracted
- E2E test count could grow for edge cases

### Backend
- record.py at 24% coverage (runtime-only ffmpeg subprocess — hard to unit test)
- state.py at 72% coverage (cache cleanup loop — runtime-only)
- Consider extracting service layer from route modules if routes grow

### Infrastructure
- ✅ CI with GitHub Actions (lint + test + tsc + build)
- ✅ Docker Compose for deployment
- ✅ Nginx + self-signed TLS
- Pre-commit hooks not auto-installed

## What's Solid
- **0 TypeScript errors** in 18k lines of production code
- **0 pre-existing test failures** in 1,412 frontend tests
- **0 `any` types** in production source
- **Clean build** with proper code splitting (hls.js, shaka-player in separate chunks)
- **Good accessibility:** alt text, aria-labels, skip-to-content, roles
- **No circular imports** in backend
- **No secrets in code**
