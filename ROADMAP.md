# SpacetimeTV Roadmap v3

> **Audit date:** 2026-06-25
> **Architecture:** FastAPI monolith + React/Vite SPA | 28 backend tests | Docker-ready

---

## What's Solid

- 65K+ unified movies, 328 categories, cache warms in ~36s
- 24/7 live TV with auto-reconnect (mpegts.js STATISTICS_INFO monitoring + exponential backoff)
- TMDB enrichment (movie details, similar, trending, series)
- Watchlist, continue-watching, recently added, similar movies
- Inline trailer playback, playback speed, PiP, sleep timer
- Search with 300ms debounce + history dropdown
- Keyboard shortcuts (/ for search, space/j/k/f/m for player)
- Subtitle + audio track selection, download button
- Admin dashboard (cache stats, error log, popular content)
- PWA support, ARIA labels, error beacon, health endpoint
- Lazy-loaded code splitting (238 kB main, 38 kB Player component)
- TypeScript strict mode, clean build (0 errors)
- Zero `: any` type casts, zero TODO/FIXME/HACK, zero console.log in production
- Docker Compose with health checks
- 28 pytest backend tests (health, categories, search, streams, cache, URL building)

## What's Still Open

### P1.3 — 0-byte stream error UI (~45 min)
The player has a 20s loading timeout that shows "Stream unavailable" generically.
When the CDN returns 0 bytes (truncated content) without closing the connection,
the player shows the generic error. No dedicated UI for "empty stream" vs
"connection refused" vs "transcode timeout". Improvement: detect the specific
failure mode and show a contextual message.

### P2.8 — Live TV DVR buffer (~2h)
Live TV can't pause or rewind. A 5-minute ring buffer via MediaSource
Extension (MSE appendWindow) would let users pause live TV and seek back
within the buffer window. Complex: requires managing the MSE source buffer
append window and coordinating with mpegts.js.

---

## Completed (previous sessions)

| Area | Items |
|------|-------|
| **P1 — Hot Fixes** | Search debounce (300ms) ✅ | Image proxy referrer guard ✅ | Alt text on all `<img>` ✅ | useEffect empty deps audited ✅ | 28 backend tests ✅ |
| **P2 — UX Quality** | Movie continue-watching ✅ | Watchlist/favorites ✅ | Recently added ✅ | Similar movies (TMDB) ✅ | Inline trailer ✅ | Playback speed ✅ | PiP button ✅ |
| **P3 — Architecture** | Player hook extracted ✅ | Guide split ✅ | EPG background refresh ✅ | Search history ✅ | Pagination UI ✅ |
| **P4 — Deep Cuts** | Subtitles ✅ | Audio tracks ✅ | Download offline ✅ | `/` keyboard shortcut ✅ | Sleep timer ✅ | Mobile swipe-back ✅ | Admin dashboard ✅ | Cache warmer config ✅ |
| **Perf** | Split mpegts.js/hls.js → async chunks (882 kB -> 38 kB Player) ✅ | IntersectionObserver root fix for LiveTV infinite scroll ✅ |
| **Stability** | `retryStream` wired to error button for live TV recovery ✅ |
