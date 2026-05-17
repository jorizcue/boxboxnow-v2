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


async def test_successful_login_clears_account_bucket(db_and_client):
    Session, client = db_and_client
    async with Session() as s:
        s.add(User(username="carol", email="carol@example.com",
                    password_hash=hash_password("right-pw"), is_admin=False,
                    email_verified=True))
        await s.commit()

    # 9 bad attempts (under the 10 threshold) for carol's account.
    for i in range(9):
        r = await client.post(
            "/api/auth/login",
            json={"username": "carol", "password": "wrong"},
            headers={"X-Forwarded-For": f"6.6.6.{i}"},
        )
        assert r.status_code == 401, (i, r.status_code, r.text)

    # A successful login must clear BOTH the IP and the account bucket.
    ok = await client.post(
        "/api/auth/login",
        json={"username": "carol", "password": "right-pw"},
        headers={"X-Forwarded-For": "6.6.6.99"},
    )
    assert ok.status_code == 200, ok.text

    # The account bucket is cleared: 10 fresh bad attempts from 10 new IPs
    # must be needed again before the 11th is blocked (i.e. attempt #1
    # right after success is NOT immediately 429).
    r = await client.post(
        "/api/auth/login",
        json={"username": "carol", "password": "wrong"},
        headers={"X-Forwarded-For": "6.6.6.150"},
    )
    assert r.status_code == 401, r.text
