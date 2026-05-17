"""TDD — UserAllCircuitAccess model auto-creates and relates to User."""
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


async def test_all_circuit_access_table_and_relationship(db):
    now = datetime.now(timezone.utc)
    u = User(username="acu", email="acu@x.com", password_hash="x", is_admin=False)
    db.add(u)
    await db.flush()
    db.add(UserAllCircuitAccess(
        user_id=u.id, valid_from=now, valid_until=now + timedelta(days=30),
        stripe_subscription_id="sub_test_1",
    ))
    await db.commit()

    rows = (await db.execute(
        select(UserAllCircuitAccess).where(UserAllCircuitAccess.user_id == u.id)
    )).scalars().all()
    assert len(rows) == 1
    assert rows[0].stripe_subscription_id == "sub_test_1"

    reloaded = (await db.execute(
        select(User).where(User.id == u.id)
    )).scalar_one()
    await db.refresh(reloaded, ["all_circuit_access"])
    assert len(reloaded.all_circuit_access) == 1
