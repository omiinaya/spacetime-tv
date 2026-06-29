# SpacetimeTV

**IPTV cable TV dashboard** — Live TV, EPG guide, Movies & Series from iptv-provider. FastAPI backend + React/Vite frontend + nginx reverse proxy.

## Stack

- **FastAPI** (Python 3.12) — backend API, IPTV proxy, EPG parser, VOD streaming
- **React 19 + Vite 8 + Tailwind CSS** — modern SPA frontend
- **nginx** — serves frontend build, proxies `/api` to backend
- **ffmpeg** — VOD remux for browser-playable MP4
- **TMDB API** — optional metadata enrichment

## Quick Start (Development)

```bash
# Backend
cd server
pip install -r requirements.txt
cp .env.example .env   # then edit with IPTV credentials
python main.py         # starts on :8720

# Frontend (separate terminal)
cd web
npm install
npm run dev            # starts on :5183, proxies /api to :8720
```

## Ports

| Port | Service | Notes |
|---|---|---|
| 8720 | FastAPI backend | API, IPTV proxy, VOD streaming |
| 8722 | nginx (production) | Serves built frontend, proxied to backend |
| 5183 | Vite dev server | Frontend hot-reload |

## Documentation

38|| Document | Audience | Purpose |
39||---|---|---|
40|| [AGENTS.md](./AGENTS.md) | AI coding agents | Full agent onboarding |
41|| [CLAUDE.md](./CLAUDE.md) | Claude Code | Short signpost |
42|| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contributors | How to contribute |
43|| [ROADMAP.md](./ROADMAP.md) | Planning | Current status, priorities, audit |
44|| [IMPROVEMENTS.md](./IMPROVEMENTS.md) | Development | Known issues, refactoring targets |
45|

| [SETUP.md](./SETUP.md) | AI agents | Zero-to-running setup guide |