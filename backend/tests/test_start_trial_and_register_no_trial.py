"""Task 2 TDD — email_verified columns + start_trial() + register no-trial.

All three groups MUST FAIL before implementation and PASS after.

(a) After register(): user has email_verified=False, non-null token, expires≈now+7d,
    NO Subscription row, NO UserCircuitAccess rows.
(b) start_trial(user, db, trial_days=N): creates exactly one Subscription (plan_type
    "trial", status "trialing") and UserCircuitAccess ONLY for for_sale=True circuits.
(c) start_trial is idempotent: a second call when the user already has a Subscription
    is a no-op (still exactly one sub, no extra circuit rows).
"""
from __future__ import annotations

import asyncio
import sys
import types
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Stub resend before any app import that may trigger email_service
if "resend" not in sys.modules:
    _resend_stub = types.ModuleType("resend")
    _resend_stub.api_key = None
    _resend_stub.Emails = MagicMock()
    sys.modules["resend"] = _resend_stub

from app.api.auth_routes import register, start_trial  # noqa: E402
from app.models.pydantic_models import RegisterRequest  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base,
    Circuit,
    Subscription,
    User,
    UserCircuitAccess,
)


# ---------------------------------------------------------------------------
# In-memory DB fixture
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
# Minimal stubs for register() dependencies (mirrors test_register_user_preferences)
# ---------------------------------------------------------------------------


class _FakeClient:
    host = "127.0.0.1"


class _FakeRequest:
    """Stand-in for starlette.requests.Request used by register()."""

    client = _FakeClient()

    class _Headers(dict):
        def get(self, key, default=None):
            return default

    headers = _Headers()


# ---------------------------------------------------------------------------
# Helper: call register() with all external I/O patched out
# ---------------------------------------------------------------------------


async def _call_register(db, username="testuser", email="test@example.com"):
    data = RegisterRequest(
        username=username,
        email=email,
        password="TestPassword1",
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
        await register(data=data, request=request, db=db)


# ---------------------------------------------------------------------------
# (a) register() creates NO trial — only email_verified=False + token + expires
# ---------------------------------------------------------------------------


async def test_register_no_trial_subscription(db):
    """After register(), there must be NO Subscription row for the user."""
    await _call_register(db)

    user_row = (
        await db.execute(select(User).where(User.username == "testuser"))
    ).scalar_one()

    subs = (
        await db.execute(
            select(Subscription).where(Subscription.user_id == user_row.id)
        )
    ).scalars().all()

    assert len(subs) == 0, (
        f"register() must NOT create any Subscription rows; got {len(subs)}"
    )


async def test_register_no_circuit_access(db):
    """After register(), there must be NO UserCircuitAccess rows for the user."""
    await _call_register(db, username="testuser2", email="test2@example.com")

    user_row = (
        await db.execute(select(User).where(User.username == "testuser2"))
    ).scalar_one()

    accesses = (
        await db.execute(
            select(UserCircuitAccess).where(UserCircuitAccess.user_id == user_row.id)
        )
    ).scalars().all()

    assert len(accesses) == 0, (
        f"register() must NOT create any UserCircuitAccess rows; got {len(accesses)}"
    )


async def test_register_email_verified_false(db):
    """After register(), user.email_verified must be False."""
    await _call_register(db, username="testuser3", email="test3@example.com")

    user_row = (
        await db.execute(select(User).where(User.username == "testuser3"))
    ).scalar_one()

    assert user_row.email_verified is False, (
        f"register() must set email_verified=False, got {user_row.email_verified!r}"
    )


async def test_register_email_verification_token_set(db):
    """After register(), email_verification_token must be non-null."""
    await _call_register(db, username="testuser4", email="test4@example.com")

    user_row = (
        await db.execute(select(User).where(User.username == "testuser4"))
    ).scalar_one()

    assert user_row.email_verification_token is not None, (
        "register() must set a non-null email_verification_token"
    )
    assert len(user_row.email_verification_token) > 10, (
        "email_verification_token must be a substantial random string"
    )


async def test_register_email_verification_expires_approx_7d(db):
    """After register(), email_verification_expires must be approximately now+7d (tz-aware)."""
    before = datetime.now(timezone.utc)
    await _call_register(db, username="testuser5", email="test5@example.com")
    after = datetime.now(timezone.utc)

    user_row = (
        await db.execute(select(User).where(User.username == "testuser5"))
    ).scalar_one()

    exp = user_row.email_verification_expires
    assert exp is not None, "email_verification_expires must be set"

    # Normalize naive datetime (SQLite stores without tzinfo)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    expected_low = before + timedelta(days=7) - timedelta(seconds=5)
    expected_high = after + timedelta(days=7) + timedelta(seconds=5)

    assert expected_low <= exp <= expected_high, (
        f"email_verification_expires={exp!r} is not approximately now+7d "
        f"(expected between {expected_low!r} and {expected_high!r})"
    )


# ---------------------------------------------------------------------------
# (b) start_trial() creates sub + circuit access only for for_sale=True circuits
# ---------------------------------------------------------------------------


async def test_start_trial_creates_subscription_and_access_for_sale_only(db):
    """start_trial() must create exactly one Subscription and UserCircuitAccess
    ONLY for for_sale=True circuits (not for_sale=False)."""

    # Seed two circuits: one for_sale=True, one for_sale=False
    c_sale = Circuit(name="SaleCircuit", ws_port=9001, for_sale=True, is_beta=False)
    c_no_sale = Circuit(name="NoSaleCircuit", ws_port=9002, for_sale=False, is_beta=False)
    db.add_all([c_sale, c_no_sale])
    await db.commit()
    await db.refresh(c_sale)
    await db.refresh(c_no_sale)

    # Create a user
    user = User(
        username="trialuser",
        email="trialuser@example.com",
        password_hash="x",
        is_admin=False,
        max_devices=2,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    await start_trial(user, db, trial_days=14)
    await db.commit()

    # Exactly one subscription
    subs = (
        await db.execute(
            select(Subscription).where(Subscription.user_id == user.id)
        )
    ).scalars().all()
    assert len(subs) == 1, f"start_trial must create exactly 1 Subscription, got {len(subs)}"
    assert subs[0].plan_type == "trial", f"plan_type must be 'trial', got {subs[0].plan_type!r}"
    assert subs[0].status == "trialing", f"status must be 'trialing', got {subs[0].status!r}"

    # UserCircuitAccess: only for the for_sale=True circuit
    accesses = (
        await db.execute(
            select(UserCircuitAccess).where(UserCircuitAccess.user_id == user.id)
        )
    ).scalars().all()
    assert len(accesses) == 1, (
        f"start_trial must create exactly 1 UserCircuitAccess (for_sale only), got {len(accesses)}"
    )
    assert accesses[0].circuit_id == c_sale.id, (
        f"UserCircuitAccess must be for the for_sale circuit (id={c_sale.id}), "
        f"got circuit_id={accesses[0].circuit_id}"
    )


# ---------------------------------------------------------------------------
# (c) start_trial() is idempotent
# ---------------------------------------------------------------------------


async def test_start_trial_idempotent(db):
    """Calling start_trial() when the user already has a Subscription must be a no-op."""

    # Seed one for_sale circuit
    c = Circuit(name="IdempCircuit", ws_port=9010, for_sale=True, is_beta=False)
    db.add(c)
    await db.commit()

    # Create a user
    user = User(
        username="idempuser",
        email="idempuser@example.com",
        password_hash="x",
        is_admin=False,
        max_devices=2,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # First call
    await start_trial(user, db, trial_days=14)
    await db.commit()

    # Second call — must be a no-op
    await start_trial(user, db, trial_days=14)
    await db.commit()

    subs = (
        await db.execute(
            select(Subscription).where(Subscription.user_id == user.id)
        )
    ).scalars().all()
    assert len(subs) == 1, (
        f"start_trial idempotent: expected 1 Subscription after 2 calls, got {len(subs)}"
    )

    accesses = (
        await db.execute(
            select(UserCircuitAccess).where(UserCircuitAccess.user_id == user.id)
        )
    ).scalars().all()
    assert len(accesses) == 1, (
        f"start_trial idempotent: expected 1 UserCircuitAccess after 2 calls, got {len(accesses)}"
    )
