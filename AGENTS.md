---
name: SpacetimeTV
description: "IPTV cable TV dashboard — Live TV, EPG guide, Movies & Series from iptv-provider"
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
Users ── HTTPS ──┬── Vite Dev :5183 ──proxy──→ FastAPI :8720 ──┬── iptv-provider.example.com (IPTV)
                  │                                              ├── TMDB API (metadata)
                  │                                              ├── ffmpeg (VOD remux)
                  │                                              └── epg_cache.json (disk)
                  └── nginx :8722 ──proxy──→ FastAPI :8720
```

**Layers:**
- **Frontend** (React 19 + Vite 8 + Tailwind) — 11 pages, custom HLS/mpegts player. Proxies `/api/*` to backend.
- **Backend** (FastAPI Python) — 12 route modules. Handles live TV streaming, VOD remux (ffmpeg), EPG parsing, search, watchlists.
- **External:** IPTV provider (iptv-provider.example.com via curl_cffi chrome120), TMDB API for metadata.

---

## Workspace Layout
2|
3|This file is read by AI coding agents (Claude Code, Cursor, Hermes, Copilot, etc.) to bootstrap project context. For Claude Code specifically, also see [CLAUDE.md](./CLAUDE.md). Complements [README.md](./README.md) and [ROADMAP.md](./ROADMAP.md).
4|
5|---
6|
7|## Identity
8|
**SpacetimeTV** is an IPTV cable TV dashboard — Live TV streaming, EPG guide with schedule, Movies & Series catalog with search and watchlist, and VOD streaming with remux.

- ~40 Python source files (server/, 4,579 lines)
- 66 TypeScript/React frontend test files (17,479 lines)
- 32 Python backend test files (server/tests/)
- 12 API route modules
- 13 frontend page components (was 11)
- Stack: FastAPI + React 19 + Vite 8 + Tailwind + nginx + ffmpeg
17|
18|---
19|
20|## Workspace Layout
21|
22|```
23|spacetime-tv/
24|├── server/               # FastAPI backend (Python 3.12)
25|│   ├── main.py           # Entry point, includes all route modules
26|│   ├── config.py         # Environment config (IPTV, TMDB, paths)
27|│   ├── state.py          # Server state, stream hit tracking
28|│   ├── requirements.txt  # pip deps
29|│   ├── routes/           # API route modules
30|│   │   ├── health.py     # GET /api/health, POST /api/error
31|│   │   ├── guide.py      # EPG guide endpoints (~3K lines)
32|│   │   ├── search.py     # Search + enrich endpoints
33|│   │   ├── live.py       # Live TV categories, channels, info
34|│   │   ├── stream.py     # Live/VOD streaming + remux + MPD (~47KB)
35|│   │   ├── vod.py        # Movies & Series catalog (pagination)
36|│   │   ├── media.py      # Subtitle & audio track endpoints
37|│   │   ├── tmdb.py       # TMDB metadata integration
38|│   │   ├── admin.py      # Admin: stats, cache, EPG refresh
39|│   │   ├── misc.py       # IPTV proxy, image proxy, SPA fallback
40|│   │   └── watchlist.py  # Watchlist CRUD
41|│   ├── tests/            # pytest tests (34 test files)
42|│   └── Dockerfile        # Production backend container
43|│
44|├── web/                  # React/Vite frontend
45|│   ├── src/
46|│   │   ├── main.tsx      # Entry point (React 19 + React Router)
47|│   │   ├── App.tsx       # Router definition
48|│   │   ├── lib/          # API client, utils, hooks data layer
49|│   │   ├── hooks/        # Custom hooks (player, keyboard, favorites)
50|│   │   ├── components/   # UI components (Player, ChannelRow, overlays)
51|│   │   ├── pages/        # Route pages (11 total)
52|│   │   ├── context/      # React context (SettingsContext)
53|│   │   └── mocks/        # MSW test mocks
54|│   ├── vite.config.ts    # Vite config (port 5183, /api proxy :8720)
55|│   └── Dockerfile        # Production nginx frontend container
56|│
57|├── docker-compose.yml    # Backend + frontend containers
58|├── ROADMAP.md            # Current status and priorities
59|├── IMPROVEMENTS.md       # Known issues and refactoring targets
60|├── AGENTS.md             # ← YOU ARE HERE
61|├── CLAUDE.md             # Claude Code signpost
62|└── README.md             # Human-readable start guide
63|```
64|
65|---
66|
67|## Quick Reference
68|
69|```bash
70|# === Backend ===
71|cd server
72|
73|# Install dependencies
74|pip install -r requirements.txt
75|
76|# Run backend dev server (port 8720)
77|python main.py
78|
79|# Run backend tests
80|python -m pytest tests/ -v                     # All tests
81|python -m pytest tests/test_health.py -v       # Single test file
82|python -m pytest tests/ -m integration -v      # Integration tests only
83|
84|# Run backend tests without live IPTV (no .env needed)
85|python -m pytest tests/ -v --ignore=tests/test_live.py
86|
87|# Check backend health
88|curl http://localhost:8720/api/health
89|
90|# === Frontend ===
91|cd web
92|
93|# Install dependencies
94|npm install
95|
96|# Start dev server (port 5183, proxies /api → :8720)
97|npm run dev
98|
99|# Run frontend tests
100|npm test                  # vitest run
101|
102|# Build production bundle
103|npm run build             # tsc -b && vite build → web/dist/
104|```
105|
106|---
107|
108|## Task → File Mapping
109|
110|| Task | Files to Open First | Why |
111||------|-------------------|-----|
112|| Fix a streaming issue | `server/routes/stream.py` | Live/VOD streaming, remux, MPD |
113|| Fix EPG guide data | `server/routes/guide.py` | XMLTV parsing, schedule, enrich |
114|| Fix search | `server/routes/search.py` | Full-text + metadata search |
115|| Fix VOD catalog | `server/routes/vod.py` | Movies & Series pagination |
116|| Fix Live TV channels | `server/routes/live.py` | Categories, channel list, info |
117|| Fix subtitles/audio | `server/routes/media.py` | Subtitle probe/stream, audio tracks |
118|| Fix admin dashboard | `server/routes/admin.py` | Stats, cache warm, EPG refresh |
119|| Fix TMDB integration | `server/routes/tmdb.py` | Metadata enrichment |
120|| Fix rate limiting | `server/main.py` (middleware) | Token bucket rate limiter |
121|| Add a new UI page | `web/src/pages/` + `web/src/App.tsx` | Route page + router registration |
122|| Fix player component | `web/src/components/Player.tsx` | Video player wrapper |
123|| Fix video player logic | `web/src/hooks/useVideoPlayer.ts` | HLS, mpegts, remux player logic |
124|| Fix UI layout | `web/src/App.tsx` | Overall layout + routing |
125|| Fix CSS/Tailwind | `web/src/index.css` | Global styles, Tailwind base |
126|| Fix config/ports | `server/config.py` | Environment config |
127|| | `web/vite.config.ts` | Vite dev server port, proxy |
128|
129|---
130|
131|## Code Structure
132|
133|### Backend (FastAPI)
134|
135|The backend is a single `main.py` entry point that includes 12 route modules from `server/routes/`. Each module is a FastAPI `APIRouter` with `prefix=""` (routes define their own full path). All modules are included via `app.include_router()` in `main.py`.
136|
137|Configuration comes from `config.py` (reads `.env` file). Key env vars:
138|
139|| Env Var | Purpose | Default |
140||---|---|---|
141|| `IPTV_BASE` | IPTV provider base URL | http://iptv-provider.example.com |
142|| `IPTV_USER` | IPTV username | — |
143|| `IPTV_PASS` | IPTV password | — |
144|| `TMDB_API_KEY` | TMDB metadata enrichment | (optional) |
145|
146|### Frontend (React)
147|
148|Vite dev server on port 5183 proxies `/api/*` requests to `http://127.0.0.1:8720`. The production build serves via nginx on port 8722 (docker-compose), also proxying `/api` to the backend.
149|
150|---
151|
152|## Critical Conventions
153|
154|1. **No API keys in code** — All credentials via `.env` file (server/.env), never hardcoded.
155|2. **IPTV provider traffic uses curl_cffi** — The IPTV provider blocks httpx with HTTP 405. Use `curl_cffi` with `impersonate="chrome120"` for IPTV proxy requests. Installed in the Hermes venv.
156|3. **Blocking calls in async context** — Use `asyncio.to_thread()` for sync `curl_cffi` calls inside async FastAPI routes.
157|4. **VOD remux uses ffmpeg** — ffmpeg is required on the backend for VOD remux (installed in Dockerfile).
158|5. **Cache EPG to disk** — `epg_cache.json` avoids re-parsing XMLTV on every restart. TTL is 1 hour.
159|6. **Stream/firehose endpoints have rate limits** — `/api/live/all` (2 req/min) and `/api/search` (30 req/min) are rate-limited. Test with moderation.
160|7. **Test with `-m integration`** — Integration tests need a running server on :8720. Skip with `-m "not integration"` for offline testing.
161|
162|---
163|
164|## Ports and Services
165|
166|| Service | Port | Run Command | Access URL |
167||---------|------|-------------|------------|
168|| FastAPI backend | 8720 | `cd server && python main.py` | http://localhost:8720 |
169|| Vite dev server | 5183 | `cd web && npm run dev` | http://localhost:5183 |
170|| nginx (prod) | 8722 | `docker compose up` | http://localhost:8722 |
171|
172|---
173|
174|## Common Pitfalls
175|
176|1. **Running both vite dev + docker at once** — Port 8720 conflicts. Stop one before starting the other.
177|2. **Missing IPTV credentials** — The .env file needs IPTV_USER/IPTV_PASS. Without them, live TV and VOD endpoints return empty data.
178|3. **curl_cffi import errors** — It's NOT in the requirements.txt. Must be installed separately (it's in the Hermes venv). If running outside Hermes, `pip install curl_cffi`.
179|4. **EPG cache stale** — `epg_cache.json` may have stale data. Hit `POST /api/admin/epg/refresh` or delete the file to force a reload.
180|5. **Test flakiness with live IPTV** — `test_live.py` requires an active IPTV connection. Run `pytest tests/ --ignore=tests/test_live.py` for offline-safe testing.
181|
182|---
183|
184|## Documentation Index
185|
186|| Document | Link |
187||---|---|
188|| README (human docs) | [README.md](./README.md) |
189|| Claude Code quickstart | [CLAUDE.md](./CLAUDE.md) |
190|| Roadmap and priorities | [ROADMAP.md](./ROADMAP.md) |
191|| Known issues and improvements | [IMPROVEMENTS.md](./IMPROVEMENTS.md) |
192|