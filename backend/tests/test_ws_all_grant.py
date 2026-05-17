"""TDD — the WS circuit-access predicate honours an active all-grant."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.auth_routes import user_has_any_active_circuit_access  # noqa: E402
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


async def test_ws_predicate_true_with_all_grant(db):
    now = datetime.now(timezone.utc)
    u = User(username="ws1", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    db.add(UserAllCircuitAccess(user_id=u.id,
                                valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_any_active_circuit_access(db, u.id) is True


async def test_ws_predicate_false_without_any(db):
    u = User(username="ws2", password_hash="x", is_admin=False)
    db.add(u); await db.flush()
    await db.commit()
    assert await user_has_any_active_circuit_access(db, u.id) is False
