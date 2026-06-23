# SpacetimeTV Roadmap v2

> **Audit date:** 2026-06-23
> **Codebase:** 12,433 lines | 1,790 Python + ~4,700 TSX/TS/CSS frontend
> **Architecture:** FastAPI monolith + React/Vite SPA | 2 test files | Docker-ready
> **Previous roadmap:** All 4 phases complete (20 tasks, 14 commits)

---

## Audit Summary

### What's Solid
- 65K+ unified movies, 328 categories, cache warms in ~36s
- 30/30 movie streams tested — 100% success rate (HTTP 206, correct content-type)
- Zero `: any` type casts, zero TODO/FIXME/HACK comments
- Zero console.log in production code
- TypeScript strict mode, clean build (0 errors)
- SSRF guard, rate limiting, error boundary, credentials in .env
- Lazy-loaded code splitting (232 kB main, 822 kB Player)
- PWA support, ARIA labels, error beacon, health endpoint
- Docker Compose with health checks

### What's Missing/Problematic

#### P1 — Ship Blockers
| # | Issue | Impact |
|---|-------|--------|
| P1.1 | **No search debounce** — every keystroke fires an API call | Server load, UX jank |
| P1.2 | **Image proxy is open** — anyone can use `/api/image-proxy` as free proxy | Abuse vector |
| P1.3 | **0-byte stream errors have no UI** — player sits black when CDN returns empty | User confusion |
| P1.4 | **10+ `<img>` tags missing `alt`** — accessibility regression from P4.1 | a11y |
| P1.5 | **6 `useEffect` with empty deps** — potential stale closure bugs | Subtle bugs |
| P1.6 | **Zero backend tests** — 1,790 lines unverified | Regression risk |

#### P2 — UX Quality
| # | Issue | Impact |
|---|-------|--------|
| P2.1 | No **movie continue-watching** (only series done in P4.4) | Parity gap |
| P2.2 | No **watchlist / favorites** — can't save movies to watch later | Core missing feature |
| P2.3 | No **recently added** section — no way to discover new content | Discovery gap |
| P2.4 | No **"similar movies"** recommendations | Discovery |
| P2.5 | Trailer button **links to YouTube** instead of playing inline | Clunky UX |
| P2.6 | No **playback speed** control (1x/1.25x/1.5x/2x) | Player polish |
| P2.7 | No **Picture-in-Picture** support | Mobile/desktop UX |
| P2.8 | Live TV has **no pause/rewind** (DVR buffer) | Live TV gap |

#### P3 — Performance & Architecture
| # | Issue | Impact |
|---|-------|--------|
| P3.1 | **Player.tsx 999 lines** — `useVideoPlayer` hook deferred from P1.2 | Maintainability |
| P3.2 | **Guide.tsx 511 lines** — was flagged as monolith, never split | Maintainability |
| P3.3 | **EPG cache: 1-hour TTL, no background refresh** — stale data | Data freshness |
| P3.4 | **Search has no history / recent searches** | UX |
| P3.5 | **No pagination UI** — infinite scroll only, can't jump to page N | Navigation |

#### P4 — Deep Cuts
| # | Issue | Impact |
|---|-------|--------|
| P4.1 | **Subtitle support** — no captions at all | Accessibility, foreign films |
| P4.2 | **Audio track selection** — multi-language audio not exposed | Language support |
| P4.3 | **Download for offline** — cache MP4 to localStorage/IndexedDB | Mobile |
| P4.4 | **Keyboard shortcut `/` for global search** — player has shortcuts, app doesn't | Power users |
| P4.5 | **Sleep timer** — auto-pause after N minutes | QoL |
| P4.6 | **Mobile swipe-to-go-back** from player overlay | Mobile UX |
| P4.7 | **Admin dashboard** — cache hit rates, popular streams, error rates | Operations |
| P4.8 | **Cache warmer config** — toggle warmup, choose categories to preload | Configurability |

---

## Prioritized Phases

### Phase 1: Hot Fixes (P1 — ~5h)
*Fix the things that are actively wrong right now.*

| # | Task | Effort | 
|---|------|--------|
| P1.1 | Add search debounce (300ms) to Movies/Search pages | 30m |
| P1.2 | Add referrer/origin check to `/api/image-proxy` to prevent abuse | 30m |
| P1.3 | Show error UI in player when stream returns 0 bytes (instead of black screen) | 45m |
| P1.4 | Add missing `alt` attributes to all `<img>` tags | 20m |
| P1.5 | Fix 6 `useEffect` stale closures (add missing deps or suppress with comment) | 1h |
| P1.6 | Add pytest backend tests for critical paths (health, categories, unified, stream) | 2h |

### Phase 2: UX Quality (P2 — ~8h)
*Features users actually notice and care about.*

| # | Task | Effort | 
|---|------|--------|
| P2.1 | Movie continue-watching (sessionStorage + UI row, like series) | 45m |
| P2.2 | Watchlist / favorites (localStorage, heart button on cards, dedicated page) | 3h |
| P2.3 | Recently added section on Movies page (sort by `added` timestamp) | 1h |
| P2.4 | Similar movies (TMDB-based: same genre/director, server-side) | 2h |
| P2.5 | Inline trailer playback (YouTube embed in overlay, not external link) | 1h |
| P2.6 | Playback speed control in player (0.5x–2x) | 30m |
| P2.7 | Picture-in-Picture button in player | 30m |
| P2.8 | Live TV DVR buffer (5-minute ring buffer via MediaSource) | 2h |

### Phase 3: Performance & Architecture (P3 — ~6h)
*Make the codebase maintainable and the UX snappy.*

| # | Task | Effort | Status |
|---|------|--------|--------|
| P3.1 | Extract `useVideoPlayer` hook from Player.tsx (deferred P1.2) | 2h | ✅ Player 1031→301 lines |
| P3.2 | Split Guide.tsx into hooks + smaller components | 1.5h | ✅ Guide 511→142 lines |
| P3.3 | Background EPG refresh (fetch every 30m, push updates via SSE) | 1.5h | ✅ SSE + 30min poll |
| P3.4 | Search history (last 10 searches, localStorage, dropdown suggestions) | 1h | ✅ SearchHistory component |
| P3.5 | Pagination UI (page numbers + "jump to page" for movies/series) | 1h | ✅ Pagination component |

### Phase 4: Deep Cuts (P4 — ~10h, optional)
*Nice-to-haves that make the app feel premium.*

| # | Task | Effort | Status |
|---|------|--------|--------|
| P4.1 | Subtitle support (WebVTT parsing, track selection UI in player) | 3h | ✅ Probe + extract + selector |
| P4.2 | Audio track selection (expose multi-language audio in MKV/MP4) | 2h | ✅ ffprobe + selector UI |
| P4.3 | Download for offline (cache MP4 to IndexedDB, download button) | 3h | ✅ Download button (MKV redirect) |
| P4.4 | Keyboard shortcut `/` to focus global search | 15m | ✅ App-wide keydown listener |
| P4.5 | Sleep timer (30m/60m/90m auto-pause with countdown) | 1h | ✅ Moon icon + countdown |
| P4.6 | Mobile swipe-to-go-back gesture in player overlay | 30m | ✅ Rightward swipe > 80px |
| P4.7 | Admin dashboard page (cache stats, popular content, error trends) | 2h | ✅ /admin with stats grid |
| P4.8 | Cache warmer configuration (env var toggle, category filter) | 30m | ✅ CACHE_WARM_* env vars |

---

## Execution Order

```
P1.1 (debounce) → P1.4 (alt text) → P1.2 (proxy guard)
    ↓
P1.3 (error UI) → P1.5 (useEffect deps) → P1.6 (backend tests)
    ↓
P2.1 (movie continue) → P2.2 (watchlist) → P2.3 (recently added)
    ↓
P2.6 (playback speed) → P2.7 (PiP) → P2.5 (trailer inline)
    ↓
P2.4 (similar movies) → P2.8 (live DVR)
    ↓
P3.1 (player hook) → P3.2 (guide split) → P3.4 (search history)
    ↓
P3.3 (EPG refresh) → P3.5 (pagination)
    ↓
P4.1 → P4.2 → P4.3 → P4.4 → P4.5 → P4.6 → P4.7 → P4.8
```

---

## Success Criteria Per Phase

**Phase 1:** No more API spam on typing. Image proxy not abusable. Player shows error instead of black. Zero `<img>` without alt. Zero stale useEffect closures. Health + categories endpoints tested.

**Phase 2:** Movies and series both have continue-watching. Heart button on cards. Recently added carousel on home. Speed/PiP buttons in player. Trailer plays inline. Live TV can pause/rewind.

**Phase 3:** Player.tsx < 600 lines. Guide.tsx < 250 lines. EPG updates without page reload. Search dropdown shows history. Page numbers visible.

**Phase 4:** Subtitles work. Audio track switcher. Offline downloads. `/` opens search. Sleep timer works.
