# SpacetimeTV — Agent Guide

This file is read by AI coding agents (Claude Code, Cursor, Hermes, Copilot, etc.) to bootstrap project context. For Claude Code specifically, also see [CLAUDE.md](./CLAUDE.md). Complements [README.md](./README.md) and [ROADMAP.md](./ROADMAP.md).

---

## Identity

**SpacetimeTV** is an IPTV cable TV dashboard — Live TV streaming, EPG guide with schedule, Movies & Series catalog with search and watchlist, and VOD streaming with remux.

- ~40 Python source files (server/)
- 45+ TypeScript/React frontend tests (web/)
- 22+ Python backend tests (server/tests/)
- 12 API route modules
- 11 frontend page components
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
│   ├── tests/            # pytest tests (22 test files)
│   └── Dockerfile        # Production backend container
│
├── web/                  # React/Vite frontend
│   ├── src/
│   │   ├── main.tsx      # Entry point (React 19 + React Router)
│   │   ├── App.tsx       # Router definition
│   │   ├── lib/          # API client, utils, hooks data layer
│   │   ├── hooks/        # Custom hooks (player, keyboard, favorites)
│   │   ├── components/   # UI components (Player, ChannelRow, overlays)
│   │   ├── pages/        # Route pages (11 total)
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

The backend is a single `main.py` entry point that includes 12 route modules from `server/routes/`. Each module is a FastAPI `APIRouter` with `prefix=""` (routes define their own full path). All modules are included via `app.include_router()` in `main.py`.

Configuration comes from `config.py` (reads `.env` file). Key env vars:

| Env Var | Purpose | Default |
|---|---|---|
| `IPTV_BASE` | IPTV provider base URL | http://iptv-provider.example.com |
| `IPTV_USER` | IPTV username | — |
| `IPTV_PASS` | IPTV password | — |
| `TMDB_API_KEY` | TMDB metadata enrichment | (optional) |

### Frontend (React)

Vite dev server on port 5183 proxies `/api/*` requests to `http://127.0.0.1:8720`. The production build serves via nginx on port 8722 (docker-compose), also proxying `/api` to the backend.

---

## Critical Conventions

1. **No API keys in code** — All credentials via `.env` file (server/.env), never hardcoded.
2. **IPTV provider traffic uses curl_cffi** — The IPTV provider blocks httpx with HTTP 405. Use `curl_cffi` with `impersonate="chrome120"` for IPTV proxy requests. Installed in the Hermes venv.
3. **Blocking calls in async context** — Use `asyncio.to_thread()` for sync `curl_cffi` calls inside async FastAPI routes.
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
3. **curl_cffi import errors** — It's NOT in the requirements.txt. Must be installed separately (it's in the Hermes venv). If running outside Hermes, `pip install curl_cffi`.
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
