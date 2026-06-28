# SpacetimeTV — Claude Code Quickstart

**First, read [AGENTS.md](./AGENTS.md)** — the full agent guide with task-to-file mapping, commands, and conventions.

## One-Line Setup

```bash
cd server && pip install -r requirements.txt && python main.py &
cd web && npm install && npm run dev
```

## Critical Rules

- **No API keys in code** — all credentials via `.env` in `server/.env`
- **IPTV calls use `curl_cffi`** (not httpx) — the provider blocks standard HTTP libs
- **Rate limits apply** — `/api/live/all` 2 req/min, `/api/search` 30 req/min

## Structure

```
server/      FastAPI backend (40 .py files), entry: main.py, routes in routes/
web/         React 19 + Vite 8 frontend, entry: src/main.tsx, pages in src/pages/
```

## Ports

| Port | What |
|------|------|
| 8720 | FastAPI backend |
| 5183 | Vite dev server |
| 8722 | nginx production |

## Quick Tasks

- **Fix stream issue** → `server/routes/stream.py`
- **Fix guide/EPG** → `server/routes/guide.py`
- **Add UI page** → `web/src/pages/` + `web/src/App.tsx`
- **Fix player** → `web/src/components/Player.tsx` + `web/src/hooks/useVideoPlayer.ts`
