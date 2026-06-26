# SpacetimeTV Roadmap v3

> **Audit date:** 2026-06-26
> **Architecture:** FastAPI monolith + React/Vite SPA | 28 backend tests | Docker-ready

---

## What's Solid

- 65K+ unified movies, 328 categories, cache warms in ~36s
- 24/7 live TV with auto-reconnect (mpegts.js STATISTICS_INFO monitoring + exponential backoff)
- TMDB enrichment (movie details, similar, trending, series)
- Watchlist, continue-watching, recently added, similar movies
- Inline trailer playback, playback speed, PiP, sleep timer
- Search with 300ms debounce + history dropdown
- Keyboard shortcuts (`/` for search, `?` for help, space/j/k/f/m for player)
- Subtitle + audio track selection, download button
- Admin dashboard (cache stats, error log, popular content)
- PWA support, ARIA labels, error beacon, health endpoint
- Lazy-loaded code splitting (238 kB main, 38 kB Player component)
- TypeScript strict mode, clean build (0 errors)
- Zero `: any` type casts, zero TODO/FIXME/HACK, zero console.log in production
- Docker Compose with health checks
- 28 pytest backend tests (health, categories, search, streams, cache, URL building)

## What's Still Open

### P1 — Priorities

| Item | Status |
|------|--------|
| P1.3 — 0-byte stream error UI | ✅ **Done** — Added `errorType` system (timeout, transcode_timeout, retry_exhausted, stream_error, not_supported, empty_stream). Player shows contextual icon + message + secondary help text per error mode. |
| P1.5 — Series continue-watching data | ✅ **Done** — `SeriesOverlay` now stores rich metadata (season, episode num, title, image, duration) to sessionStorage. `useVideoPlayer` reads it when saving progress. Movies similarly store poster/name. |

### P2 — UX Quality

| Item | Status |
|------|--------|
| P2.8 — Live TV DVR buffer | ✅ **Shipped** — 5-min ring buffer via mpegts.js auto-cleanup. Pause, seek back, rewind/forward, Go Live button. Requires MSE/SourceBuffer support (Chrome, Firefox, Safari). |

### P3 — Architecture & Technical Debt

| Item | Status |
|------|--------|
| P3.2 — Tailwind CSS v4 migration planning | tailwind-merge v3+ requires Tailwind CSS v4. Currently on Tailwind 3.4.10. Migration path known but significant refactor. |
| P3.4 — Rich EPG with program metadata | ✅ **Done** — TMDB enrichment on hover + fallback images via tmdb-enrich CLI. Guide also has search + programme descriptions. |
| P3.5 — Multi-language audio track selector for VOD | ✅ **Done** — Backend ffmpeg remux + frontend switchAudioTrack(). Click a track in the AudioSelector to switch — player recreates with selected audio, seeks to current position. |
| P3.7 — EPG programme → TMDB enrichment | Lazy enrichment endpoint `/api/epg/enrich` for programme title → TMDB metadata lookup. |
| P3.8 — ManagedMediaSource API for MSE optimization | Modern browsers support ManagedMediaSource (Chrome 120+, Safari 17+). hls.js v1.6+ has partial support. |
| **P3.9 — Auto-advance next episode (series)** | ✅ **Done** — Player auto-navigates to next episode in season at ≥95% progress. Stores episode list + index in sessionStorage. |
| **Bug: unified endpoint limit** | ✅ **Fixed** — `/api/movies/unified` raised 422 for limit >100. Backend bumped to 1000. Watchlist page now uses 1000. |
| **Bug: nested buttons** | ✅ **Fixed** — Card wrappers changed from `<button>` to `<div role="button">` to fix `validateDOMNesting` warnings on Movies, Series, Watchlist pages. |

### P4 — Deep Cuts

| Item | Status |
|------|--------|
| Report from CW | Keyboard shortcut help overlay (`?`) — ✅ **Done** |

---

## Completed (this session)

| Item | Description |
|------|-------------|
| **Channel favorites** | Star/toggle favorite Live TV channels. Persisted to localStorage. Dedicated "⭐ Favorites" section at top of LiveTV page. Star buttons on channel cards in both LiveTV grid and EPG Guide. |
| P1.3 — Error differentiation | Added `errorType` enum (retry_exhausted, timeout, transcode_timeout, stream_error, not_supported, empty_stream). Player shows contextual icon + error message + secondary tip per error type. |
| P1.5 — Series CW metadata | `SeriesOverlay.playEpisode()` stores season/episode/title/duration to sessionStorage. `useVideoPlayer` reads it for `saveSeriesProgress()`. Same pattern for movie CW metadata. |
| Keyboard shortcut help | New `KeyboardShortcuts` component — press `?` to toggle overlay showing all global + player shortcuts with icons. Wired in App.tsx. |
| EPG programme descriptions | Hover any programme card in the Guide to see a popover with full XMLTV description, subtitle (italic), and category tags. Info icon indicator on cards with descriptions. |
| Guide search | Search bar filters programmes across all channels by title, subtitle, category, or description. Shows match count badge, hides non-matching channels. |
| Shortcuts in player menu | "Shortcuts" button in player's More menu dispatches custom event to toggle keyboard shortcut overlay. |
| Backend config dedup | `main.py` now imports from `config.py` instead of re-defining IPTV_BASE, UA_STR, rate limits, etc. |
| Frontend test coverage | Added 38 vitest tests for `guideUtils` (XMLTV timestamp parsing, time formatting, programme progress) and `continueWatching` (series/movie progress CRUD, expiry, ordering, edge cases). |
| Recently Completed row | Series page now shows a "Recently Completed" row with green checkmark overlay for episodes watched >=90%. Splits from "Continue Watching" which only shows in-progress (<90%) items. |
| EPG programme TMDB enrichment (P3.7) | Browserless tmdb-enrich CLI (no API key) wired into `/api/guide/enrich` — hover popovers show poster + rating + overview. |
| Persistent stream hit tracking | Popular content in admin dashboard survives restarts via `/tmp/stv_stream_hits.json`. |
| Episode thumbnail fallback to season poster | Missing thumbnails fall back to TMDB season poster; season tab buttons get poster thumbnails. |

## Completed (previous sessions)

| Area | Items |
|------|-------|
| **P1 — Hot Fixes** | Search debounce (300ms) ✅ | Image proxy referrer guard ✅ | Alt text on all `<img>` ✅ | useEffect empty deps audited ✅ | 28 backend tests ✅ |
| **P2 — UX Quality** | Movie continue-watching ✅ | Watchlist/favorites ✅ | Recently added ✅ | Similar movies (TMDB) ✅ | Inline trailer ✅ | Playback speed ✅ | PiP button ✅ |
| **P3 — Architecture** | Player hook extracted ✅ | Guide split ✅ | EPG background refresh ✅ | Search history ✅ | Pagination UI ✅ |
| **P4 — Deep Cuts** | Subtitles ✅ | Audio tracks ✅ | Download offline ✅ | `/` keyboard shortcut ✅ | Sleep timer ✅ | Mobile swipe-back ✅ | Admin dashboard ✅ | Cache warmer config ✅ |
| **Perf** | Split mpegts.js/hls.js → async chunks (882 kB -> 38 kB Player) ✅ | IntersectionObserver root fix for LiveTV infinite scroll ✅ |
| **Stability** | `retryStream` wired to error button for live TV recovery ✅ | SSE heartbeat for stale-session recovery ✅ | Image proxy disk cache (L2, 24h TTL, 500MB) ✅ |
| **Series** | TMDB Trending This Week row ✅ | TMDB TV/series proxy endpoints ✅ | TMDB series detail enrichment in SeriesOverlay ✅ | Series continue-watching ✅ |
