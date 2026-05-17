"""TDD — _grant_all_circuits upserts a single all-grant per (user, sub)."""
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

from app.api.stripe_routes import _grant_all_circuits  # noqa: E402
from app.models.schemas import Base, User, UserAllCircuitAccess  # noqa: E402


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_creates_grant_with_period_grace(db):
    u = User(username="g1", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    pe = datetime.now(timezone.utc) + timedelta(days=30)
    await _grant_all_circuits(db, u.id, stripe_subscription_id="sub_A", period_end=pe)
    await db.commit()
    rows = (await db.execute(select(UserAllCircuitAccess).where(
        UserAllCircuitAccess.user_id == u.id))).scalars().all()
    assert len(rows) == 1
    vu = rows[0].valid_until
    if vu.tzinfo is None:
        vu = vu.replace(tzinfo=timezone.utc)
    assert vu >= pe + timedelta(days=3)
    assert rows[0].stripe_subscription_id == "sub_A"


async def test_renewal_extends_same_grant(db):
    u = User(username="g2", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    pe1 = datetime.now(timezone.utc) + timedelta(days=30)
    await _grant_all_circuits(db, u.id, stripe_subscription_id="sub_B", period_end=pe1)
    await db.commit()
    pe2 = datetime.now(timezone.utc) + timedelta(days=60)
    await _grant_all_circuits(db, u.id, stripe_subscription_id="sub_B", period_end=pe2)
    await db.commit()
    rows = (await db.execute(select(UserAllCircuitAccess).where(
        UserAllCircuitAccess.user_id == u.id))).scalars().all()
    assert len(rows) == 1
    vu = rows[0].valid_until
    if vu.tzinfo is None:
        vu = vu.replace(tzinfo=timezone.utc)
    assert vu >= pe2 + timedelta(days=3)


async def test_event_window_branch(db):
    u = User(username="g3", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    es = datetime.now(timezone.utc) + timedelta(days=1)
    ee = datetime.now(timezone.utc) + timedelta(days=3)
    await _grant_all_circuits(db, u.id, stripe_subscription_id=None,
                              event_start=es, event_end=ee)
    await db.commit()
    rows = (await db.execute(select(UserAllCircuitAccess).where(
        UserAllCircuitAccess.user_id == u.id))).scalars().all()
    assert len(rows) == 1
    vf, vu = rows[0].valid_from, rows[0].valid_until
    if vf.tzinfo is None: vf = vf.replace(tzinfo=timezone.utc)
    if vu.tzinfo is None: vu = vu.replace(tzinfo=timezone.utc)
    # event window used verbatim (no +3d grace on the event branch)
    assert abs((vf - es).total_seconds()) < 5
    assert abs((vu - ee).total_seconds()) < 5


async def test_second_call_lowers_valid_from_when_earlier(db):
    u = User(username="g4", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    base = datetime.now(timezone.utc)
    # First grant: event window starting in 10 days
    await _grant_all_circuits(db, u.id, stripe_subscription_id="sub_C",
                              event_start=base + timedelta(days=10),
                              event_end=base + timedelta(days=12))
    await db.commit()
    # Second grant SAME sub key, earlier start, later end → extend both ends
    await _grant_all_circuits(db, u.id, stripe_subscription_id="sub_C",
                              event_start=base + timedelta(days=1),
                              event_end=base + timedelta(days=20))
    await db.commit()
    rows = (await db.execute(select(UserAllCircuitAccess).where(
        UserAllCircuitAccess.user_id == u.id))).scalars().all()
    assert len(rows) == 1  # same key → upserted, not duplicated
    vf, vu = rows[0].valid_from, rows[0].valid_until
    if vf.tzinfo is None: vf = vf.replace(tzinfo=timezone.utc)
    if vu.tzinfo is None: vu = vu.replace(tzinfo=timezone.utc)
    assert abs((vf - (base + timedelta(days=1))).total_seconds()) < 5   # lowered
    assert abs((vu - (base + timedelta(days=20))).total_seconds()) < 5  # extended
