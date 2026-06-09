"""TDD — auditoría de seguridad H2/H5/H7.

H2: /kill-session comparte el throttle de /login (no es un oráculo de
    contraseñas sin límite).
H5: reset/cambio de contraseña revoca DeviceSessions (reset = todas;
    set = todas menos la actual).
H7: POST /api/usage/events está rate-limited por IP.
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

if "resend" not in sys.modules:
    _r = types.ModuleType("resend")
    _r.api_key = None
    _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api import auth_routes, usage_routes  # noqa: E402
from app.api.auth_routes import create_token, hash_password  # noqa: E402
from app.models.database import get_db  # noqa: E402
from app.models.schemas import Base, User, DeviceSession  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_limiters():
    auth_routes.login_limiter._failures.clear()
    usage_routes.usage_limiter._failures.clear()
    yield
    auth_routes.login_limiter._failures.clear()
    usage_routes.usage_limiter._failures.clear()


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


# ── H2: /kill-session throttled (shared login bucket) ────────────────

async def test_kill_session_brute_force_throttled(db_and_client):
    Session, client = db_and_client
    async with Session() as s:
        s.add(User(username="kvictim", email="kv@example.com",
                    password_hash=hash_password("right-pw-1"),
                    is_admin=False, email_verified=True))
        await s.commit()

    # 10 wrong-password attempts from the same IP → 401, then 429.
    for i in range(10):
        r = await client.post(
            "/api/auth/kill-session?session_id=1",
            json={"username": "kvictim", "password": "wrong"},
            headers={"X-Forwarded-For": "11.11.11.11"},
        )
        assert r.status_code == 401, (i, r.status_code, r.text)

    r = await client.post(
        "/api/auth/kill-session?session_id=1",
        json={"username": "kvictim", "password": "wrong"},
        headers={"X-Forwarded-For": "11.11.11.11"},
    )
    assert r.status_code == 429, r.text


async def test_kill_session_shares_bucket_with_login(db_and_client):
    """Brute-force split across /login and /kill-session must NOT bypass
    the throttle: both feed the same per-account bucket."""
    Session, client = db_and_client
    async with Session() as s:
        s.add(User(username="shared", email="sh@example.com",
                    password_hash=hash_password("right-pw-2"),
                    is_admin=False, email_verified=True))
        await s.commit()

    # 5 fails on /login + 5 on /kill-session, each from a different IP so
    # only the ACCOUNT bucket accumulates.
    for i in range(5):
        await client.post("/api/auth/login",
                          json={"username": "shared", "password": "x"},
                          headers={"X-Forwarded-For": f"12.0.0.{i}"})
    for i in range(5):
        await client.post("/api/auth/kill-session?session_id=1",
                          json={"username": "shared", "password": "x"},
                          headers={"X-Forwarded-For": f"12.0.1.{i}"})
    # 11th attempt (either endpoint), fresh IP → account bucket trips.
    r = await client.post("/api/auth/login",
                          json={"username": "shared", "password": "x"},
                          headers={"X-Forwarded-For": "12.0.9.9"})
    assert r.status_code == 429, r.text


# ── H5: password reset/change revokes sessions ──────────────────────

async def test_reset_password_revokes_all_sessions(db_and_client):
    from datetime import datetime, timedelta, timezone
    Session, client = db_and_client
    async with Session() as s:
        u = User(username="reset1", email="r1@example.com",
                 password_hash=hash_password("old-pw-1"), is_admin=False,
                 email_verified=True,
                 password_reset_token="tok-reset-1",
                 password_reset_expires=datetime.now(timezone.utc) + timedelta(hours=1))
        s.add(u)
        await s.flush()
        s.add_all([
            DeviceSession(session_token="sess-a", user_id=u.id, client_kind="web"),
            DeviceSession(session_token="sess-b", user_id=u.id, client_kind="mobile"),
        ])
        await s.commit()

    r = await client.post("/api/auth/reset-password",
                          json={"token": "tok-reset-1", "password": "BrandNew123"},
                          headers={"X-Forwarded-For": "13.0.0.1"})
    assert r.status_code == 200, r.text

    async with Session() as s:
        remaining = (await s.execute(
            select(DeviceSession).where(DeviceSession.user_id.in_(
                select(User.id).where(User.username == "reset1"))))).scalars().all()
        assert remaining == [], "reset must revoke ALL device sessions"


async def test_set_password_keeps_current_revokes_others(db_and_client):
    Session, client = db_and_client
    async with Session() as s:
        u = User(username="setpw1", email="sp1@example.com",
                 password_hash=hash_password("old-pw-2"), is_admin=False,
                 email_verified=True)
        s.add(u)
        await s.flush()
        uid = u.id
        s.add_all([
            DeviceSession(session_token="current-sid", user_id=uid, client_kind="web"),
            DeviceSession(session_token="other-1", user_id=uid, client_kind="mobile"),
            DeviceSession(session_token="other-2", user_id=uid, client_kind="web"),
        ])
        await s.commit()

    token = create_token(uid, "setpw1", False, "current-sid")
    r = await client.post("/api/auth/set-password",
                          json={"password": "BrandNew123"},
                          headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text

    async with Session() as s:
        toks = set((await s.execute(
            select(DeviceSession.session_token).where(DeviceSession.user_id == uid)
        )).scalars().all())
        assert toks == {"current-sid"}, f"only current session kept, got {toks}"


# ── H7: usage/events rate-limited ────────────────────────────────────

async def test_usage_events_rate_limited(db_and_client, monkeypatch):
    _Session, client = db_and_client
    # Lower the cap so we don't fire 120 requests in the test.
    monkeypatch.setattr(usage_routes.usage_limiter, "max_attempts", 3)
    ua = {"User-Agent": "Mozilla/5.0", "X-Forwarded-For": "14.0.0.1"}
    body = {"events": [{"event_type": "test", "event_key": "k"}]}
    for i in range(3):
        r = await client.post("/api/usage/events", json=body, headers=ua)
        assert r.status_code == 200, (i, r.status_code, r.text)
    r = await client.post("/api/usage/events", json=body, headers=ua)
    assert r.status_code == 429, r.text


async def test_usage_events_limiter_is_per_ip(db_and_client, monkeypatch):
    _Session, client = db_and_client
    monkeypatch.setattr(usage_routes.usage_limiter, "max_attempts", 2)
    body = {"events": [{"event_type": "test", "event_key": "k"}]}
    for _ in range(2):
        await client.post("/api/usage/events", json=body,
                          headers={"User-Agent": "Mozilla/5.0", "X-Forwarded-For": "14.0.0.2"})
    # exhausted for .2; a different IP must still be accepted.
    r = await client.post("/api/usage/events", json=body,
                          headers={"User-Agent": "Mozilla/5.0", "X-Forwarded-For": "14.0.0.3"})
    assert r.status_code == 200, r.text
