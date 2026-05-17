# Rate-limit hardening — Design

**Date:** 2026-05-17 · **Status:** approved. Auth/security-sensitive. No DB migration. Backend-only.

## Problem (confirmed in code)
All rate limiting lives in `backend/app/api/auth_routes.py` via an in-memory `RateLimiter` (class ~229-281; `self._failures: dict[str, list[float]]`). Two instances: `login_limiter` (10 failed/300 s, ~286) and `forgot_password_limiter` (5 per call/900 s, ~292).

Confirmed defects:
1. **Mis-keyed behind the proxy.** The limiters key on `request.client.host` (used directly ~992 login, ~1859/1868 forgot-password, ~2019/2025 resend-verification; `/register` ~853). The deployment fronts `backend:8000` with Caddy (`Caddyfile`, `reverse_proxy backend:8000`) and uvicorn is started WITHOUT `--proxy-headers` (`backend/Dockerfile`), so `request.client.host` is the **Caddy container IP — identical for every external user**. Effect: limits are effectively **global, not per-IP** → (a) 10 failed logins from anyone locks login for everyone 5 min (DoS); (b) 5 forgot/resend calls platform-wide blocks password reset for everyone 15 min; (c) weak per-account brute-force protection. (`_extract_device_info` ~375-377 already reads `X-Forwarded-For`, but only to store `DeviceSession.ip_address`, never for the limiter.)
2. **`/reset-password` (~1889-1923) and `/verify-email` (~1928-2007) have ZERO rate limiting.** Unlimited token submissions (only mitigated by `secrets.token_urlsafe(48)` entropy + expiry: reset 1 h ~1876-1878, verify 7 d `EMAIL_VERIFICATION_TTL` ~53).
3. **Per-IP only, no per-account.** A distributed attack (N IPs) against one account bypasses the per-IP limit entirely.
4. **`forgot_password_limiter` is shared** by `/forgot-password` and `/resend-verification` → one exhausts the other (cross-DoS of legitimate users).

## Fix (4 parts; in-memory storage kept by decision)

### 1. Real-client-IP key helper
Add `_client_ip(request) -> str`: return the first (left-most) entry of the `X-Forwarded-For` header, stripped; fall back to `request.client.host` when the header is absent/empty. Use it as the limiter key everywhere the code currently passes `request.client.host` to a limiter (login, register, forgot-password, resend-verification, and the new reset-password / verify-email). Trust model: only our own Caddy fronts `backend:8000` (not publicly reachable); Caddy sets `X-Forwarded-For`, so the left-most entry is the real client. DRY: if `_extract_device_info` (~375-377) can adopt the same helper as a zero-risk drop-in, do so; otherwise leave `_extract_device_info` untouched and only the limiter path uses `_client_ip` (minimizing blast radius takes priority over DRY).

### 2. Per-account dimension on login (in addition to per-IP)
On a **failed** login, increment two keys: the IP key (`_client_ip`) and an account key derived from the submitted identifier, normalized (`f"acct:{identifier.strip().lower()}"`). Block the attempt if **either** the IP bucket or the account bucket exceeds the threshold (reuse `login_limiter` semantics: 10 failures / 300 s, same window, for the account bucket too). On a **successful** login, clear **both** the IP and the account bucket for that request. This is a temporary in-memory throttle, **NOT a persistent account lockout** (explicit decision: no lockout/CAPTCHA). Documented tradeoff: an attacker spamming bad passwords for a known email can throttle that account's logins for the 300 s window (no persistent lock, auto-clears); accepted in exchange for stopping distributed brute force.

### 3. Rate-limit `/reset-password` and `/verify-email`
Add a dedicated `token_limiter` instance (10 per call / 300 s, keyed by `_client_ip`) and call its check at the top of both `/reset-password` (~1889) and `/verify-email` (~1928), before any token lookup. Lenient enough for legitimate use (a user clicks the link once; 10/5 min/IP is ample) while stopping token scanning. Token entropy/expiry unchanged.

### 4. Split forgot-password / resend-verification buckets
Give `/resend-verification` (~2020) its own limiter instance (`resend_verification_limiter`, same 5/900 s) so it no longer shares `forgot_password_limiter` with `/forgot-password` (~1860). Independent keys; exhausting one no longer blocks the other.

Storage: unchanged — the existing in-memory `RateLimiter`. Known, accepted limitations (documented in code comment): counters reset on every deploy/restart; assumes a single uvicorn worker (Dockerfile runs one, no `--workers`); not shared if ever scaled out.

## Testing (backend pytest; httpx `ASGITransport`, inject `X-Forwarded-For`)
1. **Keying:** two requests with the same `request.client.host` but different `X-Forwarded-For` IPs land in independent buckets; a request with no `X-Forwarded-For` falls back to `client.host`. Assert the limiter key resolves to the XFF first IP.
2. **Per-account login:** N (=threshold) failed logins for the same email from **different** `X-Forwarded-For` IPs → next attempt blocked by the account bucket (proves per-account counting independent of IP).
3. **Per-IP login still works:** N failed logins (any accounts) from one IP → blocked by IP bucket; a successful login clears both buckets.
4. **`/reset-password` limited:** > threshold calls from one IP → 429 (whatever status `RateLimiter` raises today — mirror it); under threshold unaffected.
5. **`/verify-email` limited:** same as (4).
6. **Bucket split:** exhausting `/forgot-password` does NOT block `/resend-verification` and vice-versa.
7. **No regression:** a normal single login / forgot-password / verify-email / reset-password succeeds; existing `login_limiter`/`forgot_password_limiter` behavior for the happy path unchanged. Full `cd backend && .venv/bin/python -m pytest tests -q` green (no regression to existing auth/email-verification/session tests; adjust only assertions tied to the old `request.client.host` keying and document).

## Scope / non-goals
- **Only** `backend/app/api/auth_routes.py` + one new backend test file. No DB migration, no schema change, no infra/Dockerfile/Caddyfile change (XFF handled in-app per decision).
- No frontend change planned. Verify during implementation that a 429 from the new endpoints surfaces a readable message client-side (these endpoints already returned the limiter error elsewhere; if the existing limiter raises a structured 429, the frontend's generic error handling already covers it — confirm, do not expand scope unless a real gap is found).
- **Not** doing: persistent/shared (Redis/SQLite) rate-limit storage, account lockout, exponential backoff, CAPTCHA (all explicitly deferred — YAGNI for a single-container single-worker deployment; the keying bug is the real exposure).
- **Flagged, out of scope (separate work):** OAuth iOS/iPad callbacks `/google/callback/ios` (~1497) and `/google/callback/ipad` (~1591) do not validate a CSRF `state`/nonce cookie (the web callback ~1244 does) — a distinct CSRF vulnerability, not rate limiting. Surface only; do not fix here.
- Token entropy/expiry (`token_urlsafe(48)`, reset 1 h, verify 7 d) is already strong — unchanged.
