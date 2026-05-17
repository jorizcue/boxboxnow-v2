"""TDD — a circuit added AFTER an all-grant is immediately covered; one
flipped off-sale (non-beta) drops off for all-grant holders but an
explicit per-circuit row still covers it."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.auth_routes import user_has_circuit_access  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base, User, Circuit, UserCircuitAccess, UserAllCircuitAccess,
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


async def test_new_circuit_auto_covered_by_all_grant(db):
    now = datetime.now(timezone.utc)
    u = User(username="p", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    db.add(UserAllCircuitAccess(user_id=u.id,
                                valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=30)))
    await db.commit()
    c_new = Circuit(name="NEW", ws_port=9100, for_sale=True, is_beta=False)
    db.add(c_new); await db.commit()
    assert await user_has_circuit_access(db, u.id, c_new.id) is True


async def test_offsale_drops_all_grant_but_not_explicit_row(db):
    now = datetime.now(timezone.utc)
    u = User(username="p2", password_hash="x", is_admin=False)
    c = Circuit(name="X", ws_port=9101, for_sale=True, is_beta=False)
    db.add_all([u, c]); await db.flush()
    db.add(UserAllCircuitAccess(user_id=u.id,
                                valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=30)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True
    c.for_sale = False
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is False
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=c.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=30)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True
