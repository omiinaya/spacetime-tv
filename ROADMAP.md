# SpacetimeTV Roadmap v8 — Current State

> **Audit date:** 2026-07-30 (8th session — DVR record.py coverage closed to 100%)
> **Stack:** FastAPI + React 19 + Vite 8 + Tailwind v4 | 14 pages | 70+ components | 30+ hooks | 12 back-end route modules
> **Test counts:** 1,326 backend pass + 1,560 frontend pass | 0 TypeScript errors | 0 production `any` types
> **CI:** GitHub Actions (lint → test → tsc → build)
> **Hook test coverage:** 27/27 (100%) — all custom hooks have unit tests

## Current File Sizes (source only, no tests)

| File | Lines | Status |
|------|:-----:|--------|
| `web/src/hooks/useVideoPlayer.ts` | 816 | Down from 901 (-9.4%) — cleanup boilerplate unified |
| `web/src/pages/Series.tsx` | 407 | Decomposed ✅ |
| `web/src/pages/LiveTV.tsx` | 363 | Down from 493 (-26%) — inline components extracted ✅ |
| `web/src/components/MovieOverlay.tsx` | 254 | Down from 418 (-39%) — extracted 4 sub-components ✅ |
| `web/src/components/SeriesOverlay.tsx` | 396 | Down from 520 (-24%) — extracted shared components ✅ |
| `web/src/App.tsx` | 399 | Decomposed ✅ |
| `server/iptv_client.py` | 497 | Provider client — well-structured service module |
| `server/auth.py` | 371 | Auth utilities — stable |
| `server/routes/guide_routes.py` | 364 | EPG routes — stable |

All other files < 350 lines.

## Recent Improvements (session 7-8)

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
- E2E test count could grow for edge cases
- Full-suite runs show intermittent parallel-load flakes (rotating `waitFor`/`userEvent` timeouts in LiveTV/Search/Series/PlayerCenterControls); serial runs pass 100% — see IMPROVEMENTS.md pending item

### Backend
- Modules at full route coverage (25/25)
- record.py at **100% coverage** (was 87% — 7 error-path tests added: corrupt meta, EPG type errors, kill-on-timeout, finished-process refresh)
- state.py at **100% coverage** (cache cleanup loop fully tested)
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
