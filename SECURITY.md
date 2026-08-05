# Security Policy

## Supported Versions

Security fixes are applied to the latest release on `master` and backported to the
current `dev` branch. Only the latest release is actively supported for security
updates.

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities. Report them
privately.

**Preferred:** email the maintainer and use the GitHub private vulnerability
reporting workflow (Security tab → **Report a vulnerability**), if available.

- **How to report:** Send a private report describing the vulnerability, the
  affected component (backend endpoint, streaming path, settings UI, auth, …), a
  minimal reproduction, and the impact you believe it has.
- **Scope:** Anything in `server/` (FastAPI backend), `web/src/` (React frontend),
  and the deployment configs (Docker, nginx, systemd).
- **Excluded:** Known, intentional behavior documented in `.env.example` (e.g.
  disabling auth or encryption for local/LAN use) is not a vulnerability when used
  as documented.

### Response SLA

- **Acknowledgment:** within 3 business days.
- **Triage (is it a real vuln?):** within 10 business days.
- **Fix / workaround:** for confirmed critical/high issues, a patched release is
  aimed for within 30 days of confirmation.
- **Disclosure:** we ask that details be withheld for **60 days** after a fix is
  released so users can upgrade.

## Security Notes for Deployers

This project is an IPTV dashboard that can hold real provider credentials and
has a browser-facing UI. A few settings materially change your exposure — read
`server/.env.example` and `server/config.py` and decide consciously:

- **`ADMIN_API_KEY`** — protects the `/api/v1/admin/*` routes. If unset, a random
  64-hex key is generated on first start (see startup logs). Set it explicitly in
  production.
- **`ENCRYPT_CREDENTIALS`** — `true` (default) Fernet-encrypts provider passwords
  at rest. Set to `false` only if you intentionally store plaintext.
- **`ENFORCE_HTTPS`** — `true` (default) rejects plain-HTTP requests. Disable only
  when running behind a TLS-terminating proxy or on loopback.
- **`ALLOW_LAN_BYPASS`** / **`LAN_BYPASS_HOSTS`** — Default `true` plus a
  localhost-only host list lets admin requests from loopback skip auth for local
  convenience. For a hardened public deployment, set `ALLOW_LAN_BYPASS=false`.
- **`RATE_WINDOW`** / **`RATE_SEARCH_LIMIT`** / **`RATE_DEFAULT_LIMIT`** — token-bucket
  style limits on general and search/proxy endpoints; reach for these before letting
  the UI hit an arbitrary upstream.
- **`REDIS_URL`** — optional distributed rate limiting across workers; leave empty
  for single-process (in-memory) limiting.

Do **not** put a real `IPTV_BASE`/user/pass or provider credentials in the
repository — the repo ships only `*env.example` placeholders.

## Security-relevant environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_API_KEY` | auto-gen 64-hex | Admin route bearer auth |
| `ENCRYPT_CREDENTIALS` | `true` | Fernet-encrypt provider passwords at rest |
| `ENFORCE_HTTPS` | `true` | Reject plain HTTP |
| `ALLOW_LAN_BYPASS` | `true` | Loopback auth bypass for local dashboards |
| `LAN_BYPASS_HOSTS` | localhost | Exact hosts exempt while bypass is on |
| `RATE_WINDOW` | `60` | Rate-limit window (s) |
| `RATE_SEARCH_LIMIT` | `300` | Requests/window for search/proxy |
| `RATE_DEFAULT_LIMIT` | `1000` | Requests/window for other endpoints |
| `REDIS_URL` | (empty) | Distributed rate limiting when set |

## Security-related commands

```bash
cd server
python -m pytest tests/test_auth.py tests/test_rate_limit.py -q   # auth + rate limits
```