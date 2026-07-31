# SpacetimeTV Roadmap v8 — Current State

> **Audit date:** 2026-07-31 (10th session — LAN auth bypass flag + preflight cache)
> **Stack:** FastAPI + React 19 + Vite 8 + Tailwind v4 | 13 pages | 133 components | 31 hooks | 25 back-end route modules
> **Test counts:** 1,379 backend pass (17 skipped, 3 xfail) + 1,500+ frontend pass | 0 TypeScript errors | 0 production `any` types
> **CI:** GitHub Actions (lint → test → tsc → build)
> **Hook test coverage:** 31/31 (100%) — all custom hooks have unit tests

## Current File Sizes (source only, no tests)

| File | Lines | Status |
|------|:-----:|--------|
| `web/src/hooks/useVideoPlayer.ts` | 816 | Down from 901 (-9.4%) — cleanup boilerplate unified |
| `web/src/App.tsx` | 476 | Grew back from 399 — layout/settings wiring; candidate for extraction (see kanban-suggestions.json) |
| `web/src/hooks/useSearchPage.ts` | 460 | Filter/search-state orchestration; candidate for extraction |
| `web/src/lib/types.ts` | 445 | Type definitions — flat, low churn |
| `web/src/pages/Series.tsx` | 429 | Decomposed ✅ (was 957) |
| `server/main.py` | 413 | Entry point + middleware — stable |
| `web/src/pages/LiveTV.tsx` | 363 | Down from 493 (-26%) — inline components extracted ✅ |
| `server/iptv_client.py` | 502 | Provider client — well-structured service module |
| `server/auth.py` | 371 | Auth utilities — stable |
| `server/routes/guide_routes.py` | 364 | EPG routes — stable |

Largest remaining files are all documented extraction candidates or
deliberately flat data/type modules. useVideoPlayer.ts (816) is documented
as diminishing returns for further splitting.

## Recent Improvements (sessions 7-10)

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
- `App.tsx` (476) and `useSearchPage.ts` (460) grew back — extraction candidates (see kanban-suggestions.json)
- E2E test count could grow for edge cases; 13 Playwright specs exist but are NOT wired into CI (see kanban-suggestions.json)
- Full-suite parallel-load flakiness was fixed in session 9 (asyncUtilTimeout 4000ms + SeriesOverlay play gating + usePlayerUtils sessionStorage guard); if flakes reappear, revisit the rotating waitFor/userEvent timeouts

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
- **0 TypeScript errors** in production code
- **0 pre-existing test failures** (1,500+ frontend tests)
- **0 `any` types** in production source
- **Clean build** with proper code splitting (hls.js, shaka-player in separate chunks)
- **Good accessibility:** alt text, aria-labels, skip-to-content, roles
- **No circular imports** in backend
- **No secrets in code**
