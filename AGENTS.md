---
name: SpacetimeTV
description: "IPTV cable TV dashboard — Live TV, EPG guide, Movies & Series from any Xtream Codes IPTV provider"
stack: [python, fastapi, react, typescript, tailwindcss]
ports:
  backend: 8720
  frontend: 5183
  nginx: 8722
deps: [python3, node, npm, ffmpeg]
stdb: false
---

# SpacetimeTV — Agent Guide

This file is read by AI coding agents (Claude Code, Cursor, Hermes, Copilot, etc.) to bootstrap project context. For Claude Code specifically, also see [CLAUDE.md](./CLAUDE.md). Complements [README.md](./README.md) and [ROADMAP.md](./ROADMAP.md).

---

## Architecture

```
Users ── HTTPS ──┬── Vite Dev :5183 ──proxy──→ FastAPI :8720 ──┬── IPTV provider (Xtream)
                  │                                              ├── TMDB API (metadata)
                  │                                              ├── ffmpeg (VOD remux)
                  │                                              └── epg_cache.json (disk)
                  └── nginx :8722 ──proxy──→ FastAPI :8720
```

**Layers:**
- **Frontend** (React 19 + Vite 8 + Tailwind) — 13 pages, custom HLS/mpegts player. Proxies `/api/*` to backend.
- **Backend** (FastAPI Python) — 25 route modules. Handles live TV streaming, VOD remux (ffmpeg), EPG parsing, search, watchlists.
- **External:** IPTV provider (any Xtream Codes host via aiohttp), TMDB API for metadata.

---

## Workspace Layout

This file is read by AI coding agents (Claude Code, Cursor, Hermes, Copilot, etc.) to bootstrap project context. For Claude Code specifically, also see [CLAUDE.md](./CLAUDE.md). Complements [README.md](./README.md) and [ROADMAP.md](./ROADMAP.md).

---

## Identity

**SpacetimeTV** is an IPTV cable TV dashboard — Live TV streaming, EPG guide with schedule, Movies & Series catalog with search and watchlist, and VOD streaming with remux.

- 34 Python source files (server/, ~7,200 lines)
- 101 TypeScript/React frontend test files (101 files, 1,571 tests)
- 55 Python backend test files (server/tests/, 1,400 passing, 17 skipped, 3 xfail)
- 20 API route modules
- 14 frontend page components
- Stack: FastAPI + React 19 + Vite 8 + Tailwind + nginx + ffmpeg

---

## Workspace Layout

```
spacetime-tv/
├── server/               # FastAPI backend (Python 3.12)
│   ├── main.py           # Entry point, includes all route modules
│   ├── config.py         # Environment config (IPTV, TMDB, paths)
│   ├── state.py          # Server state, stream hit tracking
│   ├── requirements.txt  # pip deps
│   ├── routes/           # API route modules
│   │   ├── health.py     # GET /api/health, POST /api/error
│   │   ├── guide.py      # EPG guide endpoints (~3K lines)
│   │   ├── search.py     # Search + enrich endpoints
│   │   ├── live.py       # Live TV categories, channels, info
│   │   ├── stream.py     # Live/VOD streaming + remux + MPD (~47KB)
│   │   ├── vod.py        # Movies & Series catalog (pagination)
│   │   ├── media.py      # Subtitle & audio track endpoints
│   │   ├── tmdb.py       # TMDB metadata integration
│   │   ├── admin.py      # Admin: stats, cache, EPG refresh
│   │   ├── misc.py       # IPTV proxy, image proxy, SPA fallback
│   │   └── watchlist.py  # Watchlist CRUD
│   ├── tests/            # pytest tests (55 test files)
│   └── Dockerfile        # Production backend container
│
├── web/                  # React/Vite frontend
│   ├── src/
│   │   ├── main.tsx      # Entry point (React 19 + React Router)
│   │   ├── App.tsx       # Router definition
│   │   ├── lib/          # API client, utils, hooks data layer
│   │   ├── hooks/        # Custom hooks (player, keyboard, favorites)
│   │   ├── components/   # UI components (Player, ChannelRow, overlays)
│   │   ├── pages/        # Route pages (13 total)
│   │   ├── context/      # React context (SettingsContext)
│   │   └── mocks/        # MSW test mocks
│   ├── vite.config.ts    # Vite config (port 5183, /api proxy :8720)
│   └── Dockerfile        # Production nginx frontend container
│
├── docker-compose.yml    # Backend + frontend containers
├── ROADMAP.md            # Current status and priorities
├── IMPROVEMENTS.md       # Known issues and refactoring targets
├── AGENTS.md             # ← YOU ARE HERE
├── CLAUDE.md             # Claude Code signpost
└── README.md             # Human-readable start guide
```

---

## Quick Reference

```bash
# === Backend ===
cd server

# Install dependencies
pip install -r requirements.txt

# Run backend dev server (port 8720)
python main.py

# Run backend tests
python -m pytest tests/ -v                     # All tests
python -m pytest tests/test_health.py -v       # Single test file
python -m pytest tests/ -m integration -v      # Integration tests only

# Run backend tests without live IPTV (no .env needed)
python -m pytest tests/ -v --ignore=tests/test_live.py

# Check backend health
curl http://localhost:8720/api/health

# === Frontend ===
cd web

# Install dependencies
npm install

# Start dev server (port 5183, proxies /api → :8720)
npm run dev

# Run frontend tests
npm test                  # vitest run

# Build production bundle
npm run build             # tsc -b && vite build → web/dist/
```

---

## Task → File Mapping

| Task | Files to Open First | Why |
|------|-------------------|-----|
| Fix a streaming issue | `server/routes/stream.py` | Live/VOD streaming, remux, MPD |
| Fix EPG guide data | `server/routes/guide.py` | XMLTV parsing, schedule, enrich |
| Fix search | `server/routes/search.py` | Full-text + metadata search |
| Fix VOD catalog | `server/routes/vod.py` | Movies & Series pagination |
| Fix Live TV channels | `server/routes/live.py` | Categories, channel list, info |
| Fix subtitles/audio | `server/routes/media.py` | Subtitle probe/stream, audio tracks |
| Fix admin dashboard | `server/routes/admin.py` | Stats, cache warm, EPG refresh |
| Fix TMDB integration | `server/routes/tmdb.py` | Metadata enrichment |
| Fix rate limiting | `server/main.py` (middleware) | Token bucket rate limiter |
| Add a new UI page | `web/src/pages/` + `web/src/App.tsx` | Route page + router registration |
| Fix player component | `web/src/components/Player.tsx` | Video player wrapper |
| Fix video player logic | `web/src/hooks/useVideoPlayer.ts` | HLS, mpegts, remux player logic |
| Fix UI layout | `web/src/App.tsx` | Overall layout + routing |
| Fix CSS/Tailwind | `web/src/index.css` | Global styles, Tailwind base |
| Fix config/ports | `server/config.py` | Environment config |
| | `web/vite.config.ts` | Vite dev server port, proxy |

---

## Code Structure

### Backend (FastAPI)

The backend is a single `main.py` entry point that includes 25 route modules from `server/routes/`. Each module is a FastAPI `APIRouter` with `prefix=""` (routes define their own full path). All modules are included via `app.include_router()` in `main.py`.

Configuration comes from `config.py` (reads `.env` file). Key env vars:

| Env Var | Purpose | Default |
|---|---|---|
| `IPTV_BASE` | IPTV provider base URL (legacy single-provider) | (set by user) |
| `IPTV_USER` | IPTV username (legacy single-provider) | — |
| `IPTV_PASS` | IPTV password (legacy single-provider) | — |
| `PROVIDERS_JSON` | JSON array of providers (overrides single-provider vars) | — |
| `STV_ENV_FILE` | .env file that provider saves are written back to as `PROVIDERS_JSON` (durable store — creds survive data-dir wipes) | `server/.env` |
| `TMDB_API_KEY` | TMDB metadata enrichment | (optional) |
| `ADMIN_API_KEY` | Admin API key — auto-generated 64-hex on first start if unset | auto |
| `ENCRYPT_CREDENTIALS` | Fernet-encrypt provider passwords at rest | true |
| `ALLOW_LAN_BYPASS` | Skip auth for localhost/private-network requests (false = hardened) | true |
| `LAN_BYPASS_HOSTS` | Exact-match hosts exempt from auth while bypass is on | 127.0.0.1,::1,localhost |
| `STV_HOST` | Serve host — its CORS origins are allowlisted automatically | (empty) |
| `REDIS_URL` | Distributed rate limiting — set to share the fixed-window counter across all instances (multi-instance deployments). Unset keeps the in-process per-IP counter | (empty) |
| `STREAM_PREFLIGHT_TIMEOUT` | Per-call CDN preflight timeout (seconds) | 10 |
| `STREAM_PREFLIGHT_SUCCESS_TTL` | Preflight success cache TTL (seconds) | 30 |
| `STREAM_PREFLIGHT_FAILURE_TTL` | Preflight failure cache TTL (seconds) | 5 |

**Provider persistence:** the Settings menu → IPTV Providers manages ANY number of
Xtream services (add/edit/delete/toggle/test). Every save persists to BOTH
`server/data/providers.json` AND `PROVIDERS_JSON` in `STV_ENV_FILE` (default
`server/.env`) — so creds/endpoints are never lost on data-dir wipes or
container recreates. The user-facing routes live in
`server/routes/provider_config.py` (`/api/v1/provider`, `/api/v1/providers`,
`/api/v1/providers/{idx}`, `/api/v1/providers/{idx}/toggle`,
`/api/v1/provider/test`); admin-key-gated multi-provider CRUD mirrors them at
`/api/v1/admin/providers*`.

### Frontend (React)

Vite dev server on port 5183 proxies `/api/*` requests to `http://127.0.0.1:8720`. The production build serves via nginx on port 8722 (docker-compose), also proxying `/api` to the backend.

---

## Critical Conventions

1. **No API keys in code** — All credentials via `.env` file (server/.env), never hardcoded.
2. **IPTV streaming uses aiohttp** — DO NOT switch to httpx or subprocess curl without reading the docstring in ``server/routes/stream_core.py::_http_iter_chunks()``. httpx has a compatibility bug with the provider's CDN (hangs after redirect). Subprocess curl has 55% throughput penalty. aiohttp works at 90% of direct speed.
3. **IPTV raw proxy** — ``/api/v1/iptv/{path}`` uses ``iptv_client.client`` (httpx) for API data calls. This is separate from streaming — API data calls work fine with httpx.
4. **VOD remux uses ffmpeg** — ffmpeg is required on the backend for VOD remux (installed in Dockerfile).
5. **Cache EPG to disk** — `epg_cache.json` avoids re-parsing XMLTV on every restart. TTL is 1 hour.
6. **Stream/firehose endpoints have rate limits** — `/api/live/all` (2 req/min) and `/api/search` (30 req/min) are rate-limited. Test with moderation.
7. **Test with `-m integration`** — Integration tests need a running server on :8720. Skip with `-m "not integration"` for offline testing.

---

## Ports and Services

| Service | Port | Run Command | Access URL |
|---------|------|-------------|------------|
| FastAPI backend | 8720 | `cd server && python main.py` | http://localhost:8720 |
| Vite dev server | 5183 | `cd web && npm run dev` | http://localhost:5183 |
| nginx (prod) | 8722 | `docker compose up` | http://localhost:8722 |

---

## Common Pitfalls

1. **Running both vite dev + docker at once** — Port 8720 conflicts. Stop one before starting the other.
2. **Missing IPTV credentials** — The .env file needs IPTV_USER/IPTV_PASS. Without them, live TV and VOD endpoints return empty data.
3. **aiohttp required for streaming** — Make sure ``aiohttp`` is installed (it's in ``requirements.txt``). The streaming routes in ``stream_core.py`` use aiohttp exclusively — httpx cannot read from the provider's CDN after the Cloudflare 302 redirect.
4. **EPG cache stale** — `epg_cache.json` may have stale data. Hit `POST /api/admin/epg/refresh` or delete the file to force a reload.
5. **Test flakiness with live IPTV** — `test_live.py` requires an active IPTV connection. Run `pytest tests/ --ignore=tests/test_live.py` for offline-safe testing.

---

## Documentation Index

| Document | Link |
|---|---|
| README (human docs) | [README.md](./README.md) |
| Claude Code quickstart | [CLAUDE.md](./CLAUDE.md) |
| Roadmap and priorities | [ROADMAP.md](./ROADMAP.md) |
| Known issues and improvements | [IMPROVEMENTS.md](./IMPROVEMENTS.md) |
