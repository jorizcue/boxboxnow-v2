# Rate-limit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix rate limiters that are mis-keyed behind the Caddy proxy (effectively global), add per-account login throttling, rate-limit the previously-unlimited `/reset-password` and `/verify-email`, and split the shared forgot-password/resend-verification bucket.

**Architecture:** All changes are in `backend/app/api/auth_routes.py`. Introduce one helper `_client_ip(request)` (real client IP from `X-Forwarded-For`, the existing `_extract_device_info` logic, with a fallback) and use it as the limiter key everywhere. Reuse the existing in-memory `RateLimiter` class (string-keyed; account keys are namespaced `acct:<id>`). Add two new `RateLimiter` instances. In-memory storage is kept by explicit decision (single uvicorn worker, single container). No DB migration, no frontend, no infra change.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy async, SQLite, pytest + pytest-asyncio + httpx `ASGITransport`. Test runner: `cd backend && .venv/bin/python -m pytest`.

**Context every implementer must know (verified against current code):**
- `RateLimiter` class is at `backend/app/api/auth_routes.py` ~229-281. Generic string-keyed API: `check(key)` (raises `HTTPException(status_code=429, ...)` when `len >= max_attempts`), `record_failure(key)`, `reset(key)`. State: `self._failures: dict[str, list[float]]`.
- Existing module-level singletons (~286, ~292): `login_limiter = RateLimiter(max_attempts=10, window_seconds=300)`, `forgot_password_limiter = RateLimiter(max_attempts=5, window_seconds=900)`.
- Call sites that key on the socket peer today (the bug): `register` ~853 `login_limiter.check(request.client.host if request.client else "unknown")`; `login` ~992 `ip = request.client.host if request.client else "unknown"` then `.check(ip)` ~993, `.record_failure(ip)` ~1017 and ~1032, `.reset(ip)` ~1038; `forgot_password` ~1859 `ip = request.client.host ...`, `.check(ip)` ~1860, `.record_failure(ip)` ~1868; `resend_verification` ~2019 `ip = request.client.host ...`, `.check(ip)` ~2020, `.record_failure(ip)` ~2025.
- `_extract_device_info` ~340-379 already derives the real IP at ~373-377 (`request.client.host` then override with first `x-forwarded-for` entry) — this is exactly the helper logic; refactor it to call the new helper (zero-risk: identical value, plus an empty-entry guard).
- `login(data: LoginRequest, request: Request, db=..., device: str = "")` ~970. `LoginRequest` (`backend/app/models/pydantic_models.py:8`) = `username: str`, `password: str`, `mfa_code: str | None`. Login matches `User.email == identifier.lower()` if `"@" in identifier` else `User.username == identifier`; `identifier = data.username.strip()` ~1004.
- `reset_password(request: Request, db=...)` ~1890 (no limiter today); `verify_email(request: Request, db=...)` ~1929 (no limiter today). Both do `body = await request.json()` as their first body line.
- Line numbers drift — match on the quoted code, not the number. Use Read before editing.

---

### Task 1: `_client_ip` helper + fix keying everywhere

**Files:**
- Modify: `backend/app/api/auth_routes.py`
- Create: `backend/tests/test_rate_limit_hardening.py`

- [ ] **Step 1: Write failing unit tests (create the shared test file with harness)**

Create `backend/tests/test_rate_limit_hardening.py` with exactly:

```python
"""TDD — rate-limit hardening.

Covers: _client_ip keys on X-Forwarded-For (fix for limiters being
mis-keyed on the Caddy container IP), per-account login throttle,
token_limiter on /reset-password & /verify-email, and the split
forgot-password / resend-verification buckets.
"""
from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Stub `resend` before any app import that transitively loads email_service.
if "resend" not in sys.modules:
    _resend_stub = types.ModuleType("resend")
    _resend_stub.api_key = None
    _resend_stub.Emails = MagicMock()
    sys.modules["resend"] = _resend_stub

from app.api import auth_routes  # noqa: E402
from app.api.auth_routes import _client_ip, hash_password  # noqa: E402
from app.models.database import get_db  # noqa: E402
from app.models.schemas import Base, User  # noqa: E402


class _FakeReq:
    """Minimal stand-in for starlette Request for _client_ip unit tests."""

    def __init__(self, xff: str | None, peer: str | None):
        self.headers = {} if xff is None else {"x-forwarded-for": xff}

        class _C:
            host = peer

        self.client = _C() if peer is not None else None


@pytest.fixture(autouse=True)
def _reset_limiters():
    """Module-level limiters are singletons shared across tests — clear
    their state before each test so counts don't bleed between tests."""
    for name in (
        "login_limiter",
        "forgot_password_limiter",
        "token_limiter",
        "resend_verification_limiter",
    ):
        getattr(auth_routes, name)._failures.clear()
    yield
    for name in (
        "login_limiter",
        "forgot_password_limiter",
        "token_limiter",
        "resend_verification_limiter",
    ):
        getattr(auth_routes, name)._failures.clear()


@pytest_asyncio.fixture
async def db_and_client():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    from app.main import app

    async def _override_get_db():
        async with Session() as s:
            yield s

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield Session, client
    app.dependency_overrides.clear()
    await engine.dispose()


# ---- Task 1: _client_ip keying ------------------------------------------

def test_client_ip_prefers_first_xff_entry():
    req = _FakeReq("1.2.3.4, 10.0.0.1", "172.18.0.5")
    assert _client_ip(req) == "1.2.3.4"


def test_client_ip_falls_back_to_socket_when_no_xff():
    req = _FakeReq(None, "203.0.113.9")
    assert _client_ip(req) == "203.0.113.9"


def test_client_ip_empty_xff_falls_back_to_socket():
    req = _FakeReq("   ", "203.0.113.9")
    assert _client_ip(req) == "203.0.113.9"


def test_client_ip_unknown_when_no_xff_and_no_client():
    req = _FakeReq(None, None)
    assert _client_ip(req) == "unknown"


def test_extract_device_info_still_returns_first_xff_ip():
    req = _FakeReq("8.8.8.8, 10.0.0.2", "172.18.0.5")
    req.headers["user-agent"] = "Mozilla/5.0"
    _device, ip = auth_routes._extract_device_info(req)
    assert ip == "8.8.8.8"
```

- [ ] **Step 2: Run the tests to verify they FAIL (red)**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_rate_limit_hardening.py -v`
Expected: collection/import error or failures — `ImportError: cannot import name '_client_ip'` (helper doesn't exist yet), and `_reset_limiters` references `token_limiter`/`resend_verification_limiter` which don't exist yet.

- [ ] **Step 3: Add the helper + two new limiters**

In `backend/app/api/auth_routes.py`, immediately after the line `forgot_password_limiter = RateLimiter(max_attempts=5, window_seconds=900)` (and its comment block), insert:

```python


# Token-confirm endpoints (/reset-password, /verify-email) were previously
# unlimited. High token entropy (token_urlsafe(48)) mitigated brute force,
# but nothing stopped scanning. 10 calls / 5 min per real client IP: ample
# for a legit single link click, tight enough to kill scanning. Counts
# every call (no success/failure distinction is meaningful here).
token_limiter = RateLimiter(max_attempts=10, window_seconds=300)

# /resend-verification gets its own bucket so it no longer shares
# forgot_password_limiter with /forgot-password (one used to exhaust the
# other, locking legitimate users out of the unrelated flow).
resend_verification_limiter = RateLimiter(max_attempts=5, window_seconds=900)


def _client_ip(request: Request) -> str:
    """Best-effort real client IP, used as the rate-limit key.

    Behind our Caddy reverse proxy (the only hop in front of
    backend:8000, not publicly reachable) `request.client.host` is the
    Caddy container IP — identical for every external user, which made
    every limiter effectively global. Caddy sets `X-Forwarded-For`, so
    the left-most entry is the real client. Falls back to the socket
    peer when the header is absent/empty (direct/local calls, tests).
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"
```

- [ ] **Step 4: Refactor `_extract_device_info` to use the helper**

In `_extract_device_info`, replace this block:

```python
    ip = request.client.host if request.client else "unknown"
    # Check for proxy headers
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()

    return device, ip
```

with:

```python
    return device, _client_ip(request)
```

- [ ] **Step 5: Swap all limiter keys to `_client_ip(request)`**

Make these exact replacements in `backend/app/api/auth_routes.py`:

In `register` — replace:
```python
    login_limiter.check(request.client.host if request.client else "unknown")
```
with:
```python
    login_limiter.check(_client_ip(request))
```

In `login` — replace:
```python
    ip = request.client.host if request.client else "unknown"
    login_limiter.check(ip)
```
with:
```python
    ip = _client_ip(request)
    login_limiter.check(ip)
```

In `forgot_password` — replace:
```python
    ip = request.client.host if request.client else "unknown"
    forgot_password_limiter.check(ip)
```
with:
```python
    ip = _client_ip(request)
    forgot_password_limiter.check(ip)
```

In `resend_verification` — replace:
```python
    ip = request.client.host if request.client else "unknown"
    forgot_password_limiter.check(ip)
```
with:
```python
    ip = _client_ip(request)
    forgot_password_limiter.check(ip)
```
(The `forgot_password_limiter` → `resend_verification_limiter` swap for this endpoint is Task 4; here only the key changes.)

- [ ] **Step 6: Run the tests to verify they PASS (green)**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_rate_limit_hardening.py -v`
Expected: the 5 Task-1 tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/app/api/auth_routes.py backend/tests/test_rate_limit_hardening.py
git commit -m "$(cat <<'EOF'
fix(auth): key rate limiters on real client IP (X-Forwarded-For)

Behind Caddy, request.client.host is the proxy container IP, identical
for every user, so login/forgot-password limits were effectively global.
Add _client_ip() (reusing the existing _extract_device_info XFF logic)
and use it as the limiter key in register/login/forgot-password/
resend-verification. Also adds token_limiter + resend_verification_limiter
instances (wired up in later tasks).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Per-account login throttle

**Files:**
- Modify: `backend/app/api/auth_routes.py` (`login`)
- Modify: `backend/tests/test_rate_limit_hardening.py` (append)

- [ ] **Step 1: Append failing tests**

Append to `backend/tests/test_rate_limit_hardening.py`:

```python
# ---- Task 2: per-account login throttle ---------------------------------

async def test_login_blocked_by_account_bucket_across_changing_ips(db_and_client):
    Session, client = db_and_client
    async with Session() as s:
        s.add(User(username="victim", email="victim@example.com",
                    password_hash=hash_password("correct horse"),
                    is_admin=False, email_verified=True))
        await s.commit()

    # 10 failed logins for the same account, each from a DIFFERENT client
    # IP (so the per-IP bucket never trips) — the account bucket should.
    for i in range(10):
        r = await client.post(
            "/api/auth/login",
            json={"username": "victim", "password": "wrong"},
            headers={"X-Forwarded-For": f"9.9.9.{i}"},
        )
        assert r.status_code == 401, (i, r.status_code, r.text)

    # 11th attempt, yet another fresh IP → blocked by the ACCOUNT bucket.
    r = await client.post(
        "/api/auth/login",
        json={"username": "victim", "password": "wrong"},
        headers={"X-Forwarded-For": "9.9.9.250"},
    )
    assert r.status_code == 429, r.text


async def test_login_other_account_not_affected(db_and_client):
    Session, client = db_and_client
    async with Session() as s:
        s.add(User(username="alice", email="a@example.com",
                    password_hash=hash_password("pw"), is_admin=False,
                    email_verified=True))
        s.add(User(username="bob", email="b@example.com",
                    password_hash=hash_password("pw"), is_admin=False,
                    email_verified=True))
        await s.commit()

    for i in range(10):
        await client.post(
            "/api/auth/login",
            json={"username": "alice", "password": "wrong"},
            headers={"X-Forwarded-For": f"7.7.7.{i}"},
        )
    # alice's account bucket is full; bob (fresh IP) must still be allowed
    # to attempt (gets 401 for wrong pw, NOT 429).
    r = await client.post(
        "/api/auth/login",
        json={"username": "bob", "password": "wrong"},
        headers={"X-Forwarded-For": "7.7.7.200"},
    )
    assert r.status_code == 401, r.text


def test_account_bucket_reset_clears_it():
    lim = auth_routes.login_limiter
    key = "acct:victim@example.com"
    for _ in range(lim.max_attempts):
        lim.record_failure(key)
    lim.reset(key)
    # check() must not raise after reset
    lim.check(key)
```

- [ ] **Step 2: Run to verify FAIL (red)**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_rate_limit_hardening.py -k "account or other_account" -v`
Expected: `test_login_blocked_by_account_bucket_across_changing_ips` FAILS (11th attempt returns 401, not 429 — no per-account counting yet). `test_account_bucket_reset_clears_it` passes already (generic limiter behavior). `test_login_other_account_not_affected` passes already.

- [ ] **Step 3: Add per-account key to `login`**

In `login`, locate:

```python
    # Validate credentials — accept username OR email
    identifier = data.username.strip()
```

Immediately after that line add:

```python
    acct_key = f"acct:{identifier.lower()}"
    login_limiter.check(acct_key)
```

Then, the function has two `login_limiter.record_failure(ip)` lines (bad credentials, and invalid MFA code). Change EACH of them from:

```python
        login_limiter.record_failure(ip)
```
to:
```python
        login_limiter.record_failure(ip)
        login_limiter.record_failure(acct_key)
```

(Apply to both occurrences. They are inside the `if not user or not verify_password(...)` block and the invalid-MFA block — both have `acct_key` in scope because it is defined right after `identifier`.)

Finally, change:

```python
    login_limiter.reset(ip)
```
to:
```python
    login_limiter.reset(ip)
    login_limiter.reset(acct_key)
```

- [ ] **Step 4: Run to verify PASS (green)**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_rate_limit_hardening.py -v`
Expected: all Task 1 + Task 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/app/api/auth_routes.py backend/tests/test_rate_limit_hardening.py
git commit -m "$(cat <<'EOF'
feat(auth): per-account login throttle (defense vs distributed brute force)

Failed logins now also increment a namespaced acct:<identifier> bucket
(reusing login_limiter, 10/300s), checked before credential verification
and cleared on success. A distributed attack (many IPs, one account) is
now throttled by the account bucket. Temporary in-memory throttle, NOT a
persistent lockout.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rate-limit `/reset-password` and `/verify-email`

**Files:**
- Modify: `backend/app/api/auth_routes.py` (`reset_password`, `verify_email`)
- Modify: `backend/tests/test_rate_limit_hardening.py` (append)

- [ ] **Step 1: Append failing tests**

Append to `backend/tests/test_rate_limit_hardening.py`:

```python
# ---- Task 3: token_limiter on /reset-password & /verify-email -----------

async def test_reset_password_rate_limited(db_and_client):
    _Session, client = db_and_client
    last = None
    for _ in range(11):
        last = await client.post(
            "/api/auth/reset-password",
            json={"token": "bogus", "password": "longenough123"},
            headers={"X-Forwarded-For": "5.5.5.5"},
        )
    assert last.status_code == 429, last.text


async def test_verify_email_rate_limited(db_and_client):
    _Session, client = db_and_client
    last = None
    for _ in range(11):
        last = await client.post(
            "/api/auth/verify-email",
            json={"token": "bogus"},
            headers={"X-Forwarded-For": "5.5.5.6"},
        )
    assert last.status_code == 429, last.text


async def test_token_limiter_is_per_ip(db_and_client):
    _Session, client = db_and_client
    for _ in range(11):
        await client.post("/api/auth/reset-password",
                          json={"token": "x", "password": "longenough123"},
                          headers={"X-Forwarded-For": "5.5.5.7"})
    # A different client IP must still be allowed (gets 400 bad token,
    # NOT 429).
    r = await client.post("/api/auth/reset-password",
                          json={"token": "x", "password": "longenough123"},
                          headers={"X-Forwarded-For": "5.5.5.8"})
    assert r.status_code == 400, r.text
```

- [ ] **Step 2: Run to verify FAIL (red)**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_rate_limit_hardening.py -k "reset_password or verify_email or token_limiter_is_per_ip" -v`
Expected: `test_reset_password_rate_limited` and `test_verify_email_rate_limited` FAIL (11th call returns 400 "Token invalido o expirado" / "Enlace inválido", not 429 — no limiter yet). `test_token_limiter_is_per_ip` passes trivially (all return 400 currently) — it will remain green after impl too.

- [ ] **Step 3: Add `token_limiter` to both endpoints**

In `reset_password`, the body starts with:

```python
async def reset_password(request: Request, db: AsyncSession = Depends(get_db)):
    """Reset password with token from email."""
    body = await request.json()
```

Insert two lines so it becomes:

```python
async def reset_password(request: Request, db: AsyncSession = Depends(get_db)):
    """Reset password with token from email."""
    _ip = _client_ip(request)
    token_limiter.check(_ip)
    token_limiter.record_failure(_ip)
    body = await request.json()
```

In `verify_email`, the body starts with:

```python
    body = await request.json()
    token = body.get("token", "").strip()
```

Insert so it becomes:

```python
    _ip = _client_ip(request)
    token_limiter.check(_ip)
    token_limiter.record_failure(_ip)
    body = await request.json()
    token = body.get("token", "").strip()
```

(`verify_email(request: Request, ...)` already has `request` in scope. Place the three lines as the first statements of the function body, before `body = await request.json()`.)

- [ ] **Step 4: Run to verify PASS (green)**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_rate_limit_hardening.py -v`
Expected: all Task 1-3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/app/api/auth_routes.py backend/tests/test_rate_limit_hardening.py
git commit -m "$(cat <<'EOF'
fix(auth): rate-limit /reset-password and /verify-email (token scanning)

Both token-confirm endpoints were unlimited. Add token_limiter
(10/5min per real client IP, counts every call) at the top of each,
before any token lookup. Lenient for a legit single link click; kills
token scanning.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Split forgot-password / resend-verification buckets

**Files:**
- Modify: `backend/app/api/auth_routes.py` (`resend_verification`)
- Modify: `backend/tests/test_rate_limit_hardening.py` (append)

- [ ] **Step 1: Append failing tests**

Append to `backend/tests/test_rate_limit_hardening.py`:

```python
# ---- Task 4: split forgot-password / resend-verification buckets --------

async def test_exhausting_forgot_password_does_not_block_resend(db_and_client):
    _Session, client = db_and_client
    # forgot_password_limiter is 5/900s; exhaust it (6 calls → last 429).
    last_fp = None
    for _ in range(6):
        last_fp = await client.post("/api/auth/forgot-password",
                                    json={"email": "x@example.com"},
                                    headers={"X-Forwarded-For": "4.4.4.4"})
    assert last_fp.status_code == 429, last_fp.text
    # Same IP, /resend-verification must still work (separate bucket).
    r = await client.post("/api/auth/resend-verification",
                          json={"email": "x@example.com"},
                          headers={"X-Forwarded-For": "4.4.4.4"})
    assert r.status_code == 200, r.text


async def test_exhausting_resend_does_not_block_forgot_password(db_and_client):
    _Session, client = db_and_client
    last_rv = None
    for _ in range(6):
        last_rv = await client.post("/api/auth/resend-verification",
                                    json={"email": "y@example.com"},
                                    headers={"X-Forwarded-For": "4.4.4.5"})
    assert last_rv.status_code == 429, last_rv.text
    r = await client.post("/api/auth/forgot-password",
                          json={"email": "y@example.com"},
                          headers={"X-Forwarded-For": "4.4.4.5"})
    assert r.status_code == 200, r.text
```

- [ ] **Step 2: Run to verify FAIL (red)**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_rate_limit_hardening.py -k "exhausting" -v`
Expected: both FAIL — because `/resend-verification` still uses `forgot_password_limiter`, exhausting one trips the other (the "still works" assertion gets 429 instead of 200).

- [ ] **Step 3: Point `resend_verification` at its own bucket**

In `resend_verification`, replace:

```python
    ip = _client_ip(request)
    forgot_password_limiter.check(ip)
```
with:
```python
    ip = _client_ip(request)
    resend_verification_limiter.check(ip)
```

and replace:

```python
    forgot_password_limiter.record_failure(ip)
```
with:
```python
    resend_verification_limiter.record_failure(ip)
```

(Both lines are inside `resend_verification` only. `/forgot-password` keeps using `forgot_password_limiter` unchanged.)

- [ ] **Step 4: Run to verify PASS (green) + full suite**

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests/test_rate_limit_hardening.py -v`
Expected: all rate-limit tests PASS.

Run: `cd /Users/jizcue/boxboxnow-v2/backend && .venv/bin/python -m pytest tests -q`
Expected: full suite green. If a pre-existing auth/session test fails *because* it relied on the old `request.client.host` keying (e.g. asserted a specific limiter behavior with no `X-Forwarded-For`), note that `_client_ip` falls back to `request.client.host` when no XFF header is present, so behavior is unchanged for header-less requests — investigate before editing any test, and only adjust assertions genuinely tied to the old keying, documenting which and why. Do not modify production code beyond this plan.

- [ ] **Step 5: Commit**

```bash
cd /Users/jizcue/boxboxnow-v2
git add backend/app/api/auth_routes.py backend/tests/test_rate_limit_hardening.py
git commit -m "$(cat <<'EOF'
fix(auth): give /resend-verification its own rate-limit bucket

It shared forgot_password_limiter with /forgot-password, so exhausting
one DoS'd the other for legitimate users. Use the dedicated
resend_verification_limiter (5/900s) instead.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Notes / Out of Scope (do not implement)

- In-memory limiter storage kept by decision (resets on deploy; single uvicorn worker — Dockerfile runs one, no `--workers`). No Redis/SQLite persistence.
- No account lockout, no exponential backoff, no CAPTCHA (explicitly deferred — YAGNI).
- No frontend change. The `RateLimiter` already raises `HTTPException(429, detail="Demasiados intentos...")` with a `Retry-After` header; the new endpoints reuse it, so the client sees the same shape. If implementation finds the SPA does not surface a 429 on reset-password/verify-email at all, note it as a concern — do NOT expand scope.
- No DB migration, no schema change, no Dockerfile/Caddyfile change.
- **Flagged, out of scope (separate work):** OAuth iOS/iPad callbacks `/google/callback/ios` and `/google/callback/ipad` lack a CSRF `state`/nonce check that the web callback has — a distinct CSRF vulnerability, not rate limiting. Surface only.
- Deployment is the user's call (post-merge), per the established workflow.
```
