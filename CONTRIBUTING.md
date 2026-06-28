# Contributing to SpacetimeTV

Thank you for your interest! This is an IPTV cable TV dashboard built with FastAPI + React.

## Getting Started

```bash
git clone https://github.com/omiinaya/spacetime-tv.git
cd spacetime-tv

# Backend
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Edit with IPTV credentials
python3 main.py       # Starts on :8720

# Frontend (separate terminal)
cd web
npm install
npm run dev           # Starts on :5183
```

## AI Agent Contributors

This project welcomes contributions from AI coding agents. Before starting work, read [AGENTS.md](./AGENTS.md) for project context, structure, commands, task-to-file mapping, and conventions. For Claude Code specifically, also see [CLAUDE.md](./CLAUDE.md).

## Project Structure

- **server/** — FastAPI backend (40+ .py files), entry: `main.py`, routes in `routes/`
- **web/** — React 19 + Vite 8 + Tailwind frontend (11 pages, 45+ tests)
- **No SpacetimeDB** — Data comes from IPTV provider API + TMDB metadata

## Commit Messages

```
type: concise subject
```

Types: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `perf:`

## Code Standards

- Python: type hints, async/await, FastAPI patterns
- TypeScript: strict mode, React 19 patterns
- Tailwind CSS for styling (dark theme)
- No API keys hardcoded — all credentials via `.env`
- Tests required for new routes and components
