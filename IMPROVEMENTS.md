# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.8 — ManagedMediaSource API for MSE optimization
Research update (2026-06-27):
- hls.js still at v1.7.0-beta.1 (June 2, 2026). Latest canary `1.7.0-beta.1.0.canary.11864`
  (verified 2026-06-27). No stable v1.7.0 shipped yet.
- mpegts.js v1.8.0 ✅ — supports ManagedMediaSource API for iOS Safari
  (iOS 17.1+). Already installed (^1.8.0). MMS is automatically used
  when available; no config changes needed.
- shaka-player v5.1.11 (June 27, 2026) confirmed as latest — robust
  DRM, Offline playback, ManagedMediaSource support. Integrated as
  hls.js fallback (P3.45 ✅). DASH streaming support added (P3.47 ✅).
- **Action**: upgrade hls.js from beta once v1.7.0 stable ships. Monitor
  hls.js releases for "sourceended" event recovery for ManagedMediaSource.
  Evaluate whether DASH via shaka-player needs mimeType auto-detection.

---

## Recently Completed

### P3.47 — Add DASH streaming support via shaka-player
Added MPD manifest generation on the server (`generate_live_mpd`,
`generate_vod_mpd`) and three new endpoints:
- `/api/stream/live/{stream_id}/manifest.mpd` (dynamic DASH profile)
- `/api/stream/movie/{stream_id}/manifest.mpd` (static onDemand profile)
- `/api/stream/series/{series_id}/{episode_id}/manifest.mpd`
Frontend `useVideoPlayer` hook now computes `dashUrl` and the HLS fatal
error fallback tries DASH MPD (`application/dash+xml`) via shaka-player
before falling back to HLS. 11 new server-side tests for MPD validation.
✅ Done: server/main.py, web/src/hooks/useVideoPlayer.ts,
       server/tests/test_dash.py
— 49 backend + 85 frontend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.48 — Resolve StarletteDeprecationWarning in test suite
Added `httpx2>=2.0.0` to `server/requirements.txt`. Starlette's TestClient
auto-detects httpx2 and prefers it over httpx, eliminating the warning.
✅ Done: server/requirements.txt
— 38 tests pass with zero warnings, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.46 — Eliminate remaining `as any` type casts (done)
Replaced 3 `as any` casts with proper TypeScript types:
- `usePlayerUtils.ts`: Declared `SyncManager` + `ServiceWorkerRegistrationWithSync`
  interfaces for the Background Sync API sync.register() call.
- `useShakaPlayer.ts`: Used `CustomEvent<shaka.util.Error>` for error event detail.
- `Search.tsx`: Created `SearchResultsWithTotals` interface extending SearchResults
  with optional `totals`. Simplified cache-hit totals access.
✅ Done: web/src/hooks/usePlayerUtils.ts, web/src/hooks/useShakaPlayer.ts,
       web/src/pages/Search.tsx
— Zero `as any` casts remaining. TypeScript clean, 38 backend tests pass, committed and pushed.
**Filed**: 2026-06-27

### P3.45 — shaka-player integration as hls.js fallback
✅ Done: installed shaka-player@5.1.11, created useShakaPlayer sub-hook
(wireframe), integrated as automatic fallback when hls.js encounters an
unrecoverable fatal error. The fallback is transparent — hls.js tries first,
and if it fails with a non-recoverable error (e.g. manifest parse failure,
codec not supported), `useShakaPlayer` takes over with the same playlist URL.
shaka-player offers native ManagedMediaSource for iOS, robust DRM support
(Widevine, PlayReady, FairPlay), and DASH/CMAF capability.
**Filed**: 2026-06-27

### P3.44 — Add .gitignore for pytest worker temp directories
Added `web/[0-9]*/` and `server/[0-9]*/` patterns to `.gitignore`
to prevent pytest worker temp directories from appearing in `git status`.
✅ Done: .gitignore
— All existing tests pass, committed and pushed.
**Filed**: 2026-06-27

### P3.43 — Stale server integration test file cleanup
Added `pytest.mark.integration` marker to all 284-line integration
test file. Created `pytest.ini` to register the marker and set
default `testpaths`. Integration tests are now excluded from
`pytest server/tests/` and can be run with `pytest -m integration`.
✅ Done: server/test_server.py, pytest.ini
— 38 backend + 85 frontend tests pass, committed and pushed.
**Filed**: 2026-06-27

### P3.42 — useVideoPlayer refactor Phase 2: extract playback paths (DONE)
Phase 2 extracted the actual playback setup/teardown logic for each path
into sub-hooks: `useMpegtsPlayer` (live MPEG-TS), `useHlsPlayer` (HLS VOD),
`useRemuxPlayer` (VOD remux). The main hook now delegates all playback paths
to sub-hooks and uses sub-hook-owned refs & cleanup. Removed ~250 lines of
inline code and 4 unused imports (mpegts.js, hls.js, continueWatching, watchProgressSync).
— 85 frontend + 38 backend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.41 — Add tests for loadServerProgress() merge helper
Added 6 vitest tests covering merge logic: happy path, conflict
resolution (newer wins for both series and movies), server fallback,
empty server response, and MAX_ITEMS cap. Also fixed a bug where an
early return on empty server response skipped merging with local data.
✅ Done: web/src/lib/continueWatching.test.ts, web/src/lib/continueWatching.ts
— 38 backend + 85 frontend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.40 — Episode number badges in SeriesOverlay episode grid
Added "E{num}" overlay badge (padded to 2 digits) at the top-right
of each episode thumbnail in SeriesOverlay's episode selection grid.
The badge uses black/70 background matching the existing duration
badge style, and appears alongside the watched indicator (top-left)
and duration (bottom-right).
✅ Done: web/src/components/SeriesOverlay.tsx
— 38 backend + 79 frontend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

### P3.39 — TMDB responsive images with srcset for posters
Added `tmdbImageUrl`, `tmdbSrcset`, `tmdbImgProps` helpers to api.ts.
Updated all components (HomePage, Movies, Series, MovieOverlay,
SeriesOverlay, TmdbSimilarMovies, Search) to use responsive srcset
for TMDB poster/backdrop images. Added 14 new unit tests for the
helpers. Mobile browsers now download only the image size needed.
✅ Done: web/src/lib/api.ts, web/src/lib/api.test.ts,
       web/src/pages/{Movies,Series,HomePage,Search}.tsx,
       web/src/components/{MovieOverlay,SeriesOverlay,
         MediaOverlay,TmdbSimilarMovies}.tsx
— 38 backend + 79 frontend tests pass, TypeScript clean, committed and pushed.
**Filed**: 2026-06-27

