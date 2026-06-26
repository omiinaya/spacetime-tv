# SpacetimeTV — Improvement Backlog

Living queue managed by the continuous-improvement cron. The cron reads this file,
cleans up completed items, researches new improvement opportunities, adds them,
and works the top pending item each tick.

---

## Status: PENDING

### P3.2 — Tailwind CSS v4 migration planning
tailwind-merge v3+ requires Tailwind CSS v4 (it drops v3 support). We're on
Tailwind 3.4.10 and tailwind-merge 2.6.0. Latest npm versions as of this tick:
Tailwind CSS v4.3.1, tailwind-merge v3.6.0.
- Migration path: install `@tailwindcss/vite` (replaces postcss plugin), update
  `vite.config.ts`, replace `@tailwind` directives with `@import "tailwindcss"`,
  migrate `tailwind.config.js` to CSS-based config, bump `tailwind-merge` to 3.x.
- This is a significant refactor — best done in a dedicated session with UI
  verification. For now: stay on tailwind-merge ^2.6.x — no action needed.

### P3.8 — Explore: ManagedMediaSource API for MSE optimization
Modern browsers support `ManagedMediaSource` (Chrome 120+, Safari 17+) which
handles MSE SourceBuffer management more efficiently. Research this tick:
- hls.js v1.7.0-beta.1 (what we're on) includes ManagedMediaSource recovery
  support: tracks "sourceended" event for ManagedMediaSource recovery (#7697)
- mpegts.js v1.8.0 — needs investigation for ManagedMediaSource support
- **Not Baseline yet** — some widely-used browsers lack support
- Path forward: once hls.js v1.7.0 stable ships, upgrade from beta. For the
  direct MPEG-TS player (mpegts.js), investigate if ManagedMediaSource is
  supported or worth adding as an optimization pass.
- Best approached together with the Tailwind v4 / player refresh cycle.

### P3.x — Channel favorites UX: filter/view toggle (done — see Recently Completed)

### P3.x — Vite 6 upgrade evaluation
Current: vite ^5.4.2. Vite 6 has been stable for several months and brings
faster builds, better CSS handling, and improved HMR. Also upgrade companion
plugins (@vitejs/plugin-react, @vitest/ui, vitest) to compatible versions.
- Risk: low — Vite 6 migration is usually straightforward
- Check: @vitest/ui ^4.1.9 may need version alignment with Vite 6
- Worth doing before the Tailwind v4 migration to reduce upgrade complexity

### P3.x — Home dashboard: quick-link sections polish
The newly-added HomePage has continue-watching, TMDB trending rows, and quick
links. Potential polish items:
- Loading skeletons for trending rows
- Empty states for continue-watching
- "View all" links for trending rows that navigate to full Movies/Series pages
- Section-specific keyboard shortcuts (e.g. 'm' for movies, 's' for series)

---

## Recently Completed

### Home dashboard landing page
New HomePage with continue-watching rows (series + movies), TMDB trending
movies row, TMDB trending series row, and quick-link cards to Live TV,
Movies, Series, and Guide. Wired into App.tsx as the "/" route.
✅ Done: web/src/pages/HomePage.tsx, web/src/App.tsx — committed and pushed.

### Live TV favorites-only filter toggle
Toggle button (star icon with count badge) next to search bar on LiveTV.
When active, channel grid shows only favorited channels. Category tabs and
the separate Favorites section are hidden. Header text reflects filter mode.
✅ Done: web/src/pages/LiveTV.tsx — part of Home dashboard commit, TypeScript clean.

### Live TV channel favorites
Star button on channel cards and guide rows to favorite channels. Favorites
section appears above the channel grid. localStorage-backed persistence via
`useChannelFavorites` hook (Set<stream_id>).
✅ Done: web/src/hooks/useChannelFavorites.ts, ChannelRow.tsx, LiveTV.tsx
   — TypeScript clean, 28 backend tests pass, committed and pushed.

### P3.5 — Multi-language audio track switching for VOD
Backend `/api/audio/stream/...` ffmpeg remux with -map for selected audio track.
Frontend AudioSelector now functional — switchAudioTrack() destroys/recreates
player with audio-stream proxy URL and seeks to current position.
✅ Done: server/main.py, AudioSelector.tsx, Player.tsx, useVideoPlayer.ts
   — TypeScript clean, 28 backend tests pass, committed and pushed.

### P2.8 — Live TV DVR buffer
5-min ring buffer via mpegts.js auto-cleanup. Pause, seek back, rewind/forward,
Go Live button. Requires MSE/SourceBuffer support.
✅ Done: useVideoPlayer.ts, Player.tsx — committed and pushed.

### P3.7 — EPG programme TMDB enrichment (tmdb-enrich CLI)
Browserless tmdb-enrich CLI tool mines TMDB website JSON-LD (no API key needed).
Backend `/api/guide/enrich` shells out to tmdb-enrich. Frontend ProgrammeCard
popover shows poster, rating, overview with 400ms debounce. Graceful fallback.
✅ Done: server/main.py, ChannelRow.tsx — TypeScript clean, committed and pushed.

### TMDB enrichment for MovieOverlay + series season data
MovieOverlay fetches TMDB movie details in parallel (poster, rating, plot,
genres, year, runtime, director, cast). SeriesOverlay shows TMDB season
overviews, air dates, episode counts as badges in season tab headers.
✅ Done: MovieOverlay.tsx, SeriesOverlay.tsx — TypeScript clean, committed and pushed.

### Episode thumbnail fallback + count badges
Missing episode thumbnails fall back to TMDB season poster. Season tab buttons
get poster thumbnails. Episode cards show count badges.
✅ Done: SeriesOverlay.tsx — committed and pushed.

### Stream hit tracking persistence
Admin dashboard popular content persists across server restarts via
`/tmp/stv_stream_hits.json`. Loaded on startup, saved on every stream play.
✅ Done: server/main.py — 28 tests pass, committed and pushed.

### P3.6 — SSE heartbeat for stale-session recovery
EPG SSE keepalive upgraded to `event: ping` with server timestamp. Frontend
force-closes/reconnects EventSource if no heartbeat within 90 seconds.
✅ Done: server/main.py, useGuideData.ts — TypeScript clean, committed and pushed.

### P3.3 — Image proxy server-side disk caching
Disk-backed L2 cache (`/tmp/stv_cache/images/`) for `/api/image-proxy` that
persists across restarts. 24-hour TTL, 500 MB budget, 10 MB per-file limit.
✅ Done: server/main.py — committed and pushed.

### Search→series nav, admin cache controls, auto-advance, Recently Completed row
Search results navigate to series page. Admin dashboard gets cache controls
(clear, warm). Player auto-advances to next episode at ≥95% progress. Series
page shows "Recently Completed" row split from "Continue Watching".
✅ Done: Multiple files — TypeScript clean, committed and pushed.

*(Older completed entries purged per cleanup policy)*
