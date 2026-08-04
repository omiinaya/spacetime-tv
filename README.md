# SpacetimeTV

**IPTV cable TV dashboard** — Live TV, EPG guide, Movies & Series from your IPTV provider. FastAPI backend + React/Vite frontend + nginx reverse proxy.

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
## Testing

```bash
cd web && npm test          # frontend unit tests (vitest)
cd server && python -m pytest tests/ --ignore=tests/test_live.py   # backend unit tests
```

### E2E tests (not wired into CI)

`web/e2e/` contains 13 Playwright specs (`npm run test:e2e`), but they are
**deliberately excluded from CI**: the specs exercise the real UI against a
live backend (`baseURL http://127.0.0.1:8720`) and the live-tv / movies /
series / search flows need real IPTV credentials, so a CI job would require
`IPTV_USER`/`IPTV_PASS` as GitHub secrets (or a full mock backend) to be
non-flaky. Run them locally against a running backend with valid
credentials:
```bash
cd web && npm run test:e2e
```

## Documentation

| Document | Audience | Purpose |
|----------|----------|---------|
| [AGENTS.md](./AGENTS.md) | AI coding agents | Full agent onboarding |
| [CLAUDE.md](./CLAUDE.md) | Claude Code | Short signpost |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contributors | How to contribute |
| [ROADMAP.md](./ROADMAP.md) | Planning | Current status, priorities, audit |
| [IMPROVEMENTS.md](./IMPROVEMENTS.md) | Development | Known issues, refactoring targets |
| [SETUP.md](./SETUP.md) | AI agents | Zero-to-running setup guide |