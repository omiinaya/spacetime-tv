# SpacetimeTV

**IPTV cable TV dashboard** — Live TV, EPG guide, Movies & Series from **your** IPTV provider. FastAPI backend + React/Vite frontend + nginx reverse proxy.

Bring your own Xtream Codes provider: enter your base URL, username and password once (env file or Admin UI) and SpacetimeTV handles the rest — live streaming, EPG schedule, VOD catalog with search and watchlists.

## Features

- 📺 **Live TV** — categories, channel grid, favorites, now-playing badges
- 📋 **EPG guide** — schedule with enrichment
- 🎬 **Movies & Series** — catalog, search, watchlist, VOD streaming with ffmpeg remux
- 🔀 **Multi-provider** — add several Xtream accounts, enable/disable, priority order, automatic health-based failover
- 🔒 **Credential safety** — provider passwords encrypted at rest (Fernet), never returned by the API, admin endpoints gated by an API key

## Quick Start (Development)

```bash
# 1. Backend — configure YOUR provider
cd server
pip install -r requirements.txt
cp .env.example .env
#   edit .env → set IPTV_BASE, IPTV_USER, IPTV_PASS
#   (or PROVIDERS_JSON for multiple providers)
python main.py         # starts on :8720

# 2. Frontend (separate terminal)
cd web
npm install
npm run dev            # starts on :5183, proxies /api to :8720
```

Open http://localhost:5183 — you're in. No channels? The app shows a first-run prompt linking to the Admin dashboard where you can add your provider in the UI.

## Configuration

All configuration is environment-based — **nothing is hardcoded**. Copy `server/.env.example` to `server/.env` and fill in your own values:

| Variable | Purpose |
|---|---|
| `IPTV_BASE` / `IPTV_USER` / `IPTV_PASS` | Your Xtream Codes provider credentials (single provider) |
| `PROVIDERS_JSON` | JSON array of providers — overrides single-provider vars for multi-account setups |
| `TMDB_API_KEY` | Optional TMDB metadata enrichment |
| `ADMIN_API_KEY` | Admin API key — auto-generated (and logged) on first start if unset |
| `ENCRYPT_CREDENTIALS` | Fernet-encrypt provider passwords at rest (default `true`) |
| `ALLOW_LAN_BYPASS` | Skip admin/device auth for localhost + RFC1918 LAN (default `true` for dev; set `false` to harden) |
| `STV_HOST` | The IP/domain you open the dashboard on — its CORS origins are allowlisted automatically |

### Adding / configuring providers in the UI

There are two places to configure providers:

1. **Settings → IPTV Provider** — the quick path for a single-user setup.
   Enter provider name, base URL, username and password, then **Test
   connection** before saving. The password is stored encrypted and never
   shown again (leave the field blank to keep the existing one).
2. **Admin dashboard → IPTV Providers → Add Provider** — full multi-provider
   management: add several Xtream accounts, toggle on/off, reorder for
   priority, edit or delete anytime (health-based automatic failover).

Providers configured in the UI are persisted to `server/data/providers.json`
(gitignored, passwords encrypted when `ENCRYPT_CREDENTIALS=true`).

## Production Deployment

```bash
docker compose up -d --build
```

- nginx serves the frontend build on :8722 and proxies `/api` to the backend
- Set `ACME_DOMAIN` / `ACME_EMAIL` in `.env` for real Let's Encrypt certs (self-signed fallback otherwise)
- Set `ADMIN_API_KEY` explicitly, `ALLOW_LAN_BYPASS=false`, and `STV_HOST` to your public host
- All credentials live in your `.env` / `server/data/` — both gitignored

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

`web/e2e/` contains 22 Playwright specs (`npm run test:e2e`) covering every
route — including the IPTV Provider settings form, Admin dashboard, Agent
Access, Person page, watch movie/series/recording players, the keyboard
shortcuts overlay, the parental-controls PIN lifecycle, and the 404 page.
They run against a live backend (`baseURL http://127.0.0.1:8720`) across 4
projects (chromium, Mobile Chrome, Mobile Safari, Tablet): **497 passed /
0 failed** on the current suite.

They are **deliberately excluded from CI**: the specs exercise the real UI
against a live backend and the live-tv / movies / series / search flows need
real IPTV credentials, so a CI job would require `IPTV_USER`/`IPTV_PASS` (and
the admin key file used by the Admin/Agent specs) as GitHub secrets, or a
full mock backend, to be non-flaky. Run them locally against a running
backend with valid credentials:

```bash
cd web && npm run test:e2e            # all 4 projects
npx playwright test --config e2e/playwright.config.ts --project=chromium   # single project
```

The Admin/Agent specs read the admin key at runtime from the systemd
`EnvironmentFile` (`~/.hermes/auth/projects/spacetime-tv.env`) falling back
to `server/.env`, and skip their authenticated tests if no key is found.
Install the WebKit browser before running the full matrix:
`npx playwright install webkit` (needs the `libevent-2.1-7` host library).

## Security Notes

- **No secrets in the repo** — the history is gitleaks-clean; `.env`, `server/data/`, and `web/e2e/.auth/` are gitignored.
- **Admin endpoints** require `X-Admin-Key: <your ADMIN_API_KEY>`; the key is auto-generated (64-hex) on first startup if you don't set one.
- **Passwords at rest** are Fernet-encrypted (key auto-generated in `server/data/.encrypt_key` or set via `STV_ENCRYPT_KEY`).
- For a public deployment set `ALLOW_LAN_BYPASS=false` so every API request must authenticate, and terminate TLS (nginx handles this).

## Documentation

| Document | Audience | Purpose |
|----------|----------|---------|
| [AGENTS.md](./AGENTS.md) | AI coding agents | Full agent onboarding |
| [CLAUDE.md](./CLAUDE.md) | Claude Code | Short signpost |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contributors | How to contribute |
| [ROADMAP.md](./ROADMAP.md) | Planning | Current status, priorities, audit |
| [IMPROVEMENTS.md](./IMPROVEMENTS.md) | Development | Known issues, refactoring targets |
| [SETUP.md](./SETUP.md) | AI agents | Zero-to-running setup guide |
