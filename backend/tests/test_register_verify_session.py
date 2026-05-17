"""TDD — register() creates NO session/token; verify_email() auto-logs-in.

Regression guard for the "phantom session blocks the user's first login"
bug: after the verify-first rework, register() still minted a DeviceSession
+ token that nobody used client-side but which occupied the user's single
device slot, so the first real /login hit 409 "device limit".

Contract under test (must FAIL before impl, PASS after):

  register()
    - returns 200 with NO access_token / session_token (just {"ok": True})
    - user.email_verified is False
    - ZERO DeviceSession rows for the user
    - no Subscription yet (trial starts at verify)

  verify_email() — fresh valid token
    - email_verified True, token + expires cleared
    - exactly ONE trial Subscription
    - exactly ONE DeviceSession for the user
    - response has non-empty access_token + session_token + a user object

  verify_email() — alreadyVerified
    - {"ok": True, "alreadyVerified": True}
    - NO new DeviceSession, no 2nd Subscription

  end-to-end regression
    - register -> 0 sessions -> verify -> exactly 1 session
"""
from __future__ import annotations

import sys
import types
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# ---------------------------------------------------------------------------
# Stub `resend` before any app import that may trigger email_service
# ---------------------------------------------------------------------------

if "resend" not in sys.modules:
    _resend_stub = types.ModuleType("resend")
    _resend_stub.api_key = None
    _resend_stub.Emails = MagicMock()
    sys.modules["resend"] = _resend_stub

# ---------------------------------------------------------------------------
# App imports (after stubs)
# ---------------------------------------------------------------------------

from app.api.auth_routes import register, verify_email  # noqa: E402
from app.models.pydantic_models import RegisterRequest  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base,
    Circuit,
    DeviceSession,
    Subscription,
    User,
)


# ---------------------------------------------------------------------------
# In-memory DB fixture (mirrors test_register_user_preferences /
# test_email_verification_flow)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


# ---------------------------------------------------------------------------
# Stubs for request (mirrors existing email-verification tests)
# ---------------------------------------------------------------------------


class _FakeClient:
    host = "127.0.0.1"


class _FakeRequest:
    """Stand-in for starlette.requests.Request used by register/verify_email."""

    client = _FakeClient()

    class _Headers(dict):
        def get(self, key, default=None):
            return default

    headers = _Headers()

    def __init__(self, body=None):
        self._body = body or {}

    async def json(self):
        return self._body


async def _call_register(db, username="sessuser", email="sess@example.com"):
    """Call register() with all external I/O stubbed out."""
    data = RegisterRequest(
        username=username,
        email=email,
        password="SessionPass1",
    )
    request = _FakeRequest()
    with (
        patch("asyncio.create_task", return_value=None),
        patch(
            "app.services.usage_events.link_visitor_to_user",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.services.usage_events.record_event",
            new=AsyncMock(return_value=None),
        ),
    ):
        return await register(data=data, request=request, db=db)


async def _call_verify_email(db, token: str):
    """Call verify_email() with the welcome-email fire-and-forget stubbed."""
    req = _FakeRequest({"token": token})
    with patch("asyncio.create_task", return_value=None):
        return await verify_email(request=req, db=db)


def _as_dict(resp):
    """verify_email returns a plain dict; register returns a plain dict.

    Be tolerant of either a plain dict or a pydantic model just in case.
    """
    if isinstance(resp, dict):
        return resp
    if hasattr(resp, "model_dump"):
        return resp.model_dump()
    if hasattr(resp, "dict"):
        return resp.dict()
    return dict(resp)


# ---------------------------------------------------------------------------
# A. register() creates NO session / token
# ---------------------------------------------------------------------------


async def test_register_returns_no_token_no_session(db):
    """register() must return 200 with NO access_token / session_token."""
    resp = await _call_register(db, username="noses1", email="noses1@example.com")
    body = _as_dict(resp)

    assert body == {"ok": True}, (
        f"register() must return exactly {{'ok': True}}, got {body!r}"
    )
    assert "access_token" not in body, "register() must NOT return an access_token"
    assert "session_token" not in body, "register() must NOT return a session_token"


async def test_register_user_email_verified_false(db):
    """register()'d user must have email_verified=False."""
    await _call_register(db, username="noses2", email="noses2@example.com")

    user = (
        await db.execute(select(User).where(User.username == "noses2"))
    ).scalar_one()

    assert user.email_verified is False, (
        f"register() must set email_verified=False, got {user.email_verified!r}"
    )


async def test_register_creates_zero_device_sessions(db):
    """register() must create ZERO DeviceSession rows (no phantom session)."""
    await _call_register(db, username="noses3", email="noses3@example.com")

    user = (
        await db.execute(select(User).where(User.username == "noses3"))
    ).scalar_one()

    sessions = (
        await db.execute(
            select(DeviceSession).where(DeviceSession.user_id == user.id)
        )
    ).scalars().all()

    assert len(sessions) == 0, (
        f"register() must create ZERO DeviceSession rows (phantom-session bug); "
        f"got {len(sessions)}"
    )


async def test_register_creates_no_subscription_yet(db):
    """register() must not start the trial (no Subscription before verify)."""
    await _call_register(db, username="noses4", email="noses4@example.com")

    user = (
        await db.execute(select(User).where(User.username == "noses4"))
    ).scalar_one()

    subs = (
        await db.execute(
            select(Subscription).where(Subscription.user_id == user.id)
        )
    ).scalars().all()

    assert len(subs) == 0, (
        f"register() must NOT create a Subscription yet; got {len(subs)}"
    )


# ---------------------------------------------------------------------------
# B. verify_email() — fresh valid token auto-logs-in
# ---------------------------------------------------------------------------


async def test_verify_email_fresh_auto_login(db):
    """Fresh verify: verified+token cleared, 1 trial sub, 1 DeviceSession,
    response carries access_token + session_token + user."""
    c = Circuit(name="VerifySessC", ws_port=9300, for_sale=True, is_beta=False)
    db.add(c)

    await _call_register(db, username="freshver", email="freshver@example.com")
    user = (
        await db.execute(select(User).where(User.username == "freshver"))
    ).scalar_one()
    token = user.email_verification_token
    assert token is not None, "Setup error: register() must set a token"

    resp = await _call_verify_email(db, token)
    body = _as_dict(resp)

    # Response shape: auth payload on the fresh path
    assert body.get("ok") is True, f"expected ok=True, got {body!r}"
    assert "alreadyVerified" not in body or body.get("alreadyVerified") in (None, False), (
        f"fresh verify must NOT be alreadyVerified, got {body!r}"
    )
    assert body.get("access_token"), (
        f"fresh verify must return a non-empty access_token, got {body!r}"
    )
    assert body.get("session_token"), (
        f"fresh verify must return a non-empty session_token, got {body!r}"
    )
    assert body.get("user") is not None, (
        f"fresh verify must return a user object, got {body!r}"
    )

    # User state
    await db.refresh(user)
    assert user.email_verified is True
    assert user.email_verification_token is None
    assert user.email_verification_expires is None

    # Exactly one trial Subscription
    subs = (
        await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    ).scalars().all()
    assert len(subs) == 1, f"expected exactly 1 trial sub, got {len(subs)}"
    assert subs[0].plan_type == "trial"
    assert subs[0].status == "trialing"

    # Exactly one DeviceSession, and the returned session_token matches it
    sessions = (
        await db.execute(
            select(DeviceSession).where(DeviceSession.user_id == user.id)
        )
    ).scalars().all()
    assert len(sessions) == 1, (
        f"verify_email must create exactly ONE DeviceSession, got {len(sessions)}"
    )
    assert sessions[0].session_token == body["session_token"], (
        "returned session_token must match the persisted DeviceSession row"
    )


async def test_verify_email_already_verified_no_session(db):
    """alreadyVerified path: {ok, alreadyVerified}, no new DeviceSession,
    no 2nd Subscription."""
    c = Circuit(name="AlreadyVerC", ws_port=9301, for_sale=True, is_beta=False)
    db.add(c)

    await _call_register(db, username="alver", email="alver@example.com")
    user = (
        await db.execute(select(User).where(User.username == "alver"))
    ).scalar_one()
    token = user.email_verification_token

    # First verify (fresh) — creates the one session + sub
    await _call_verify_email(db, token)
    await db.refresh(user)

    # Manually re-arm a token pointing at the (now already-verified) user so
    # we can drive the alreadyVerified branch deterministically.
    user.email_verification_token = "replayed-token-xyz"
    user.email_verification_expires = datetime.now(timezone.utc) + timedelta(days=7)
    await db.commit()

    sessions_before = (
        await db.execute(
            select(DeviceSession).where(DeviceSession.user_id == user.id)
        )
    ).scalars().all()
    subs_before = (
        await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    ).scalars().all()

    resp = await _call_verify_email(db, "replayed-token-xyz")
    body = _as_dict(resp)

    assert body == {"ok": True, "alreadyVerified": True}, (
        f"alreadyVerified must return exactly {{ok,alreadyVerified}}, got {body!r}"
    )

    sessions_after = (
        await db.execute(
            select(DeviceSession).where(DeviceSession.user_id == user.id)
        )
    ).scalars().all()
    subs_after = (
        await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    ).scalars().all()

    assert len(sessions_after) == len(sessions_before), (
        f"alreadyVerified must NOT create a new DeviceSession; "
        f"before={len(sessions_before)} after={len(sessions_after)}"
    )
    assert len(subs_after) == len(subs_before) == 1, (
        f"alreadyVerified must NOT create a 2nd Subscription; "
        f"before={len(subs_before)} after={len(subs_after)}"
    )


# ---------------------------------------------------------------------------
# End-to-end regression: register -> 0 sessions -> verify -> exactly 1 session
# (the phantom-session "blocks first login" scenario is gone)
# ---------------------------------------------------------------------------


async def test_register_then_verify_yields_exactly_one_session(db):
    """register() leaves 0 sessions; the FIRST session is created at verify."""
    c = Circuit(name="E2ESessC", ws_port=9302, for_sale=True, is_beta=False)
    db.add(c)

    await _call_register(db, username="e2eses", email="e2eses@example.com")
    user = (
        await db.execute(select(User).where(User.username == "e2eses"))
    ).scalar_one()

    sessions_after_register = (
        await db.execute(
            select(DeviceSession).where(DeviceSession.user_id == user.id)
        )
    ).scalars().all()
    assert len(sessions_after_register) == 0, (
        f"after register() the user must have ZERO sessions (no phantom), "
        f"got {len(sessions_after_register)}"
    )

    await _call_verify_email(db, user.email_verification_token)

    sessions_after_verify = (
        await db.execute(
            select(DeviceSession).where(DeviceSession.user_id == user.id)
        )
    ).scalars().all()
    assert len(sessions_after_verify) == 1, (
        f"after verify the user must have EXACTLY ONE session (the verify one); "
        f"got {len(sessions_after_verify)}"
    )
