"""TDD — cancelling a cross-circuit sub now expires its all-grant
(regression for the silent no-op bug)."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.stripe_routes import _handle_subscription_deleted  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base, User, Subscription, UserAllCircuitAccess, UserCircuitAccess, Circuit,
)


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_cancel_cross_circuit_expires_all_grant(db):
    now = datetime.now(timezone.utc)
    u = User(username="cx", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    db.add(Subscription(
        user_id=u.id, stripe_subscription_id="sub_X", plan_type="endurance",
        status="active", circuit_id=None,
        current_period_start=now, current_period_end=now + timedelta(days=30),
    ))
    db.add(UserAllCircuitAccess(
        user_id=u.id, stripe_subscription_id="sub_X",
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
    ))
    await db.commit()

    await _handle_subscription_deleted({"id": "sub_X", "metadata": {}}, db)

    row = (await db.execute(select(UserAllCircuitAccess).where(
        UserAllCircuitAccess.user_id == u.id))).scalar_one()
    vu = row.valid_until
    if vu.tzinfo is None:
        vu = vu.replace(tzinfo=timezone.utc)
    assert vu <= datetime.now(timezone.utc) + timedelta(seconds=5)


async def test_cancel_per_circuit_unaffected_for_all_grant(db):
    """A per-circuit sub cancel must still expire the per-circuit row as
    before and must not create/leave any all-grant rows."""
    now = datetime.now(timezone.utc)
    u = User(username="pc", password_hash="x", is_admin=False)
    c = Circuit(name="PC", ws_port=9001, for_sale=True)
    db.add_all([u, c]); await db.flush()
    db.add(Subscription(
        user_id=u.id, stripe_subscription_id="sub_Y", plan_type="circuit",
        status="active", circuit_id=c.id,
        current_period_start=now, current_period_end=now + timedelta(days=30),
    ))
    db.add(UserCircuitAccess(
        user_id=u.id, circuit_id=c.id,
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
    ))
    await db.commit()

    await _handle_subscription_deleted({"id": "sub_Y", "metadata": {}}, db)

    uca = (await db.execute(select(UserCircuitAccess).where(
        UserCircuitAccess.user_id == u.id))).scalar_one()
    vu = uca.valid_until
    if vu.tzinfo is None:
        vu = vu.replace(tzinfo=timezone.utc)
    assert vu <= datetime.now(timezone.utc) + timedelta(seconds=5)
    assert (await db.execute(select(UserAllCircuitAccess))).scalars().all() == []


async def test_cancel_one_sub_does_not_revoke_other_all_grant(db):
    """User with TWO active all-circuit subs: cancelling one must NOT
    expire the other's all-grant (keyed by stripe_subscription_id)."""
    now = datetime.now(timezone.utc)
    u = User(username="two", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    db.add(Subscription(
        user_id=u.id, stripe_subscription_id="sub_X", plan_type="endurance",
        status="active", circuit_id=None,
        current_period_start=now, current_period_end=now + timedelta(days=30),
    ))
    db.add(Subscription(
        user_id=u.id, stripe_subscription_id="sub_Z", plan_type="endurance",
        status="active", circuit_id=None,
        current_period_start=now, current_period_end=now + timedelta(days=30),
    ))
    db.add(UserAllCircuitAccess(
        user_id=u.id, stripe_subscription_id="sub_X",
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
    ))
    db.add(UserAllCircuitAccess(
        user_id=u.id, stripe_subscription_id="sub_Z",
        valid_from=now - timedelta(days=1), valid_until=now + timedelta(days=30),
    ))
    await db.commit()

    await _handle_subscription_deleted({"id": "sub_X", "metadata": {}}, db)

    rows = {r.stripe_subscription_id: r for r in (await db.execute(
        select(UserAllCircuitAccess).where(
            UserAllCircuitAccess.user_id == u.id))).scalars().all()}
    vx = rows["sub_X"].valid_until
    vz = rows["sub_Z"].valid_until
    if vx.tzinfo is None: vx = vx.replace(tzinfo=timezone.utc)
    if vz.tzinfo is None: vz = vz.replace(tzinfo=timezone.utc)
    assert vx <= datetime.now(timezone.utc) + timedelta(seconds=5)   # cancelled → expired
    assert vz > datetime.now(timezone.utc) + timedelta(days=20)      # other → untouched
