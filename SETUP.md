# Setup — for agents

## Prerequisites

- Python 3.12+
- Node.js 20+
- ffmpeg (for VOD remux)
- IPTV provider credentials

## Step-by-Step

```bash
# 1. Clone the repo
git clone https://github.com/omiinaya/spacetime-tv.git
cd spacetime-tv

# 2. Backend setup
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your IPTV_USER and IPTV_PASS

# 3. Start backend (port 8720)
python3 main.py

# 4. Frontend setup (separate terminal)
cd web
npm install
npm run dev

# 5. Open http://localhost:5183
```

## Verify

```bash
curl http://localhost:8720/api/health
# → {"status":"healthy","uptime":...}
```

For more details, see [AGENTS.md](./AGENTS.md).
