# SpacetimeTV Security Audit Report

**Date:** 2026-07-01
**Auditor:** Hermes Agent (automated)
**Target:** FastAPI backend on `localhost:8720`

---

## OVERALL SCORE: 65/100 (⚠️ MODERATE RISK)

| Category | Score | Risk | Details |
|----------|-------|------|---------|
| **Admin Auth** | 85/100 | 🟡 Low | X-Admin-Key enforced. Dev-mode bypass (empty key) is a gap. |
| **Rate Limiting** | 65/100 | 🟡 Medium | Works but IP-based only. Search=100/min, Default=1000/min. Per-IP, no distributed. |
| **CSP Headers** | 0/100 | 🟢 Info | No CSP header — low impact (no user-generated content rendered). |
| **CORS Configuration** | 70/100 | 🟡 Medium | Configured origin list works. But OPTIONS returns 400 with no `Access-Control-Allow-Origin`. See findings. |
| **Request Body Limits** | 90/100 | 🟢 Info | 1MB limit enforced at middleware level. Works correctly. |
| **Error Response Leakage** | 80/100 | 🟢 Low | No stack traces leaked. Generic "Internal Server Error". Debug=False. |
| **Stream ACAO** | 60/100 | 🟡 Medium | No ACAO headers on stream endpoints — fine for direct use, but wildcards not an issue. |
| **Auth Coverage** | 50/100 | 🔴 **High** | Only `/admin/*` requires auth. **All other routes open.** |
| **Secrets in Code** | 70/100 | 🟡 Medium | GITHUB_TOKEN/ACC_GITHUB_TOKEN read at startup. IPTV creds in URL params. |
| **HTTPS/TLS** | 20/100 | 🔴 **High** | No HTTPS anywhere. Plain HTTP on port 8720. |
| **SSRF Protections** | 75/100 | 🟡 Medium | Image-proxy has host allowlist. But stream probe passes user-controlled URLs to ffprobe. |
| **Cloud Backup Auth** | 0/100 | 🔴 **Critical** | **Cloud backup/restore endpoints are completely unauthenticated.** |
| **Security Headers** | 10/100 | 🟡 Medium | No X-Content-Type-Options, X-Frame-Options, or other hardening headers. |

---

## DETAILED FINDINGS

### 1. ✅ Admin Endpoint Auth — Score: 85/100
- **X-Admin-Key IS enforced** — requests without it get 403 `{"detail":"Invalid or missing admin key"}`
- Wrong key also returns 403
- **BUT:** If `ADMIN_API_KEY` is empty (dev mode), **all admin endpoints are open**
- Default `.env.example` and default config have **empty ADMIN_API_KEY**
- **Risk:** If someone deploys without setting ADMIN_API_KEY, full admin access is available to anyone

### 2. ⚠️ Rate Limiting — Score: 65/100
- **Search endpoint:** Rate limit kicks in at exactly **101 requests in ~48s** (search = 100/min) ✅
- **Default endpoint:** Rate limit kicks in at **~901 requests in ~10s** (default = 1000/min) ✅
- **Issues:**
  - **IP-based only** — shared NAT IPs are blocked together
  - No distributed rate limiting (Redis/memcached)
  - Reset on restart (in-memory dictionary)
- **Risk:** Medium — a single attacker on the same network can exhaust the shared limit

### 3. ❌ CSP Headers — Score: 0/100
- **No Content-Security-Policy header** on any response
- **Mitigation:** App serves its own frontend (no UGC), uses inline Tailwind styles
- **Risk:** Lowered to informational — any XSS could be more impactful without CSP

### 4. ⚠️ CORS Configuration — Score: 70/100
- Origin list is **explicit** (8 specific origins) ✅
- ACAO returned correctly for allowed origins ✅
- **Issue:** OPTIONS preflight returns **400 Bad Request** (missing route handler for OPTIONS), but still includes CORS headers
- **Issue:** The CORSMiddleware sets headers but Starlette's routing returns 400 for OPTIONS on unmatched routes
- **Issue:** Response still includes `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` even on 400 — browser still blocks correctly
- **Tested:** `http://evil.com` → no ACAO returned → browser blocks ✅
- **Risk:** Low — CORS functions correctly for actual browsers

### 5. ✅ Request Body Limits — Score: 90/100
- 1MB POST body → **413 Request body too large** ✅
- Works correctly via middleware
- **Slight gap:** Only checks `Content-Length` header — chunked transfer encoding without Content-Length bypasses this check
- **Risk:** Low

### 6. ✅ Error Response Leakage — Score: 80/100
- `debug=False` — no stack trace dumping
- 500 errors return generic `"Internal Server Error"` ✅
- 400 errors return clean JSON `{"detail":"..."}` ✅
- **Issue:** `image-proxy` endpoint returns plaintext `"Internal Server Error"` with content-type `text/plain` instead of JSON — inconsistent
- **Issue:** Could still contain useful info in the 500 (we verified it doesn't, but code changes could change this)

### 7. ✅ No Streaming ACAO Wildcards — Score: 60/100
- Stream endpoints don't return ACAO headers at all
- For browser-based HLS playback this means some CDN fetches might be blocked if serving cross-origin
- No `Access-Control-Allow-Origin: *` on stream resources

### 8. 🔴 **CRITICAL: Auth Coverage** — Score: 50/100
ONLY admin routes require authentication. Everything else is open:

| Route | Auth | Notes |
|-------|------|-------|
| `/admin/*` | ✅ X-Admin-Key | Protected |
| `/cloud/backup` | ❌ **NONE** | ⚠️ Read/write any user's backup data |
| `/cloud/merge` | ❌ **NONE** | ⚠️ Modify any user's favorites |
| `/watchlist/*` | ❌ NONE | Read/write any watchlist |
| `/search/enrich` | ❌ NONE | CPU-intensive batch enrichment |
| `/stream/*` | ❌ NONE | Stream proxying (bandwidth cost) |
| `/iptv/*` | ❌ NONE | Raw IPTV proxy to upstream provider |
| `/image-proxy` | ❌ NONE | SSRF-capable image fetching |
| `/*` (SPA) | ❌ NONE | SPA catch-all |

### 9. ⚠️ Secrets in Code — Score: 70/100
- **Found:** GITHUB_TOKEN and ACC_GITHUB_TOKEN read at startup for auto-starring repo
- IPTV_USER and IPTV_PASS appear in **URL query parameters** of stream URLs (e.g., `{base}/live/{user}/{pass}/{id}.ts`)
- **Risk:** Medium — credentials exposed in URL params could leak in server logs/referrer headers

### 10. 🔴 **HIGH: No HTTPS** — Score: 20/100
- Server runs on **plain HTTP** on port 8720
- No TLS termination at FastAPI level
- Nginx frontend (normally on 8722) not running
- docker-compose has no TLS config
- **Risk:** All traffic in transit is unencrypted — IPTV credentials, TMDB API keys, user data

### 11. ⚠️ SSRF Protections — Score: 75/100
- **Image proxy:** Has host allowlist (`image.tmdb.org`, `cmc.exchange-cdn.com`) ✅
- Blocked: `127.0.0.1`, `169.254.169.254`, `malware.com` → 400 ✅
- **BUT:** Image proxy returns **500** for valid allowed hosts that fail — no error detail leaked though
- **Stream probe:** `build_stream_url` takes `stream_id` (int) and `stream_type` — not directly user-controllable for SSRF ✅
- **IPTV proxy:** `/api/v1/iptv/{path}` passes path directly to upstream — path like `../../../etc/passwd` doesn't traverse (blocked by URL join), but upstream could be abused
- **Risk:** Low — but the iptv proxy is a blind pass-through

### 12. 🔴 **CRITICAL: Cloud Backup Unauthenticated** — Score: 0/100
- `POST /api/v1/cloud/backup` — **No auth.** Anyone can read/write any device_id's backup
- `GET /api/v1/cloud/backup?device_id=xxx` — **No auth.** Anyone can read any device_id's backup
- `POST /api/v1/cloud/merge` — **No auth.** Anyone can merge favorites into any device_id
- **Confirmed:** Wrote backup with `test-device-12345`, read it back successfully with no auth
- **Risk:** Critical — user favorites, watchlist, and settings data exposed

### 13. ⚠️ Missing Security Headers — Score: 10/100
Response headers from server:
```
date: ...
server: uvicorn
content-length: ...
content-type: application/json
```

**Missing:**
- ❌ `X-Content-Type-Options: nosniff`
- ❌ `X-Frame-Options: DENY`
- ❌ `Content-Security-Policy: ...`
- ❌ `Strict-Transport-Security: max-age=...`
- ❌ `X-XSS-Protection: 1; mode=block`
- ❌ `Referrer-Policy: strict-origin-when-cross-origin`
- ❌ `Permissions-Policy: ...`

### 14. Query Injection Risk — Score: 80/100
- No SQL database in this project — all data is from in-memory cache + external APIs
- Search queries are lowercased and matched against `.lower()` strings — no injection vector
- All FastAPI route parameters are typed (int, str with regex validation)
- **Risk:** Very low for SQL injection. Only risk is regex ReDoS on search patterns.

---

## PRIORITIZED REMEDIATION

### 🔴 Critical (Fix Immediately)
1. **Add auth to Cloud Backup endpoints** — at minimum require a per-device secret or X-Admin-Key
2. **Add HTTPS** — TLS termination at nginx or use self-signed + reverse proxy

### 🔴 High
3. **Add auth to all write endpoints** — watchlist, cloud merge, sync-progress should require at minimum device-level auth
4. **Add security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`

### 🟡 Medium
5. **Add CSP header** — even a basic `default-src 'self'` for defense-in-depth
6. **Warn on empty ADMIN_API_KEY** — don't silently allow dev-mode bypass in production
7. **Move IPTV credentials from URL path to headers** — avoid credential exposure in logs
8. **Add distributed rate limiting** — Redis-backed for multi-instance deployments
9. **Add CORS exception handler** — return 204 instead of 400 for OPTIONS preflight

### 🟢 Low
10. **Make 500 errors return JSON** — consistent content-type
11. **Remove auto-star logic or move to separate script** — GITHUB_TOKEN in main.py
12. **Add request ID tracking** — for correlating errors across the pipeline

---

## Methodology

All tests performed with curl against the running server at `http://localhost:8720`. Tests included:
- Direct endpoint access with/without auth headers
- Rapid-fire requests to test rate limiting
- Large payloads to test body limits
- Cross-origin request simulation
- Path traversal and injection attempts
- SSRF attempts against internal/cloud metadata endpoints
- Response header inspection
- Source code review for secrets and auth gaps
