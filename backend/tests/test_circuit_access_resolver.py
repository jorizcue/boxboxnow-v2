"""TDD — circuit-access resolver: per-circuit row OR active all-grant
covering a for_sale/beta circuit at access time."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.auth_routes import (  # noqa: E402
    user_has_circuit_access,
    user_has_any_active_circuit_access,
)
from app.models.schemas import Base, User, Circuit, UserCircuitAccess, UserAllCircuitAccess  # noqa: E402


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def _mk(db, *, for_sale=True, is_beta=False):
    c = Circuit(name=f"C{for_sale}{is_beta}", ws_port=9000, for_sale=for_sale, is_beta=is_beta)
    u = User(username=f"u{datetime.now().timestamp()}", password_hash="x", is_admin=False)
    db.add_all([c, u]); await db.flush()
    return u, c


async def test_per_circuit_row_grants(db):
    u, c = await _mk(db)
    now = datetime.now(timezone.utc)
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=c.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True


async def test_all_grant_covers_for_sale(db):
    u, c = await _mk(db, for_sale=True, is_beta=False)
    now = datetime.now(timezone.utc)
    db.add(UserAllCircuitAccess(user_id=u.id, valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True


async def test_all_grant_covers_beta(db):
    u, c = await _mk(db, for_sale=False, is_beta=True)
    now = datetime.now(timezone.utc)
    db.add(UserAllCircuitAccess(user_id=u.id, valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True


async def test_all_grant_excludes_offsale_nonbeta(db):
    u, c = await _mk(db, for_sale=False, is_beta=False)
    now = datetime.now(timezone.utc)
    db.add(UserAllCircuitAccess(user_id=u.id, valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is False


async def test_explicit_row_survives_offsale(db):
    u, c = await _mk(db, for_sale=False, is_beta=False)
    now = datetime.now(timezone.utc)
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=c.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is True


async def test_expired_all_grant_does_not_cover(db):
    u, c = await _mk(db, for_sale=True)
    now = datetime.now(timezone.utc)
    db.add(UserAllCircuitAccess(user_id=u.id, valid_from=now - timedelta(days=2),
                                valid_until=now - timedelta(days=1)))
    await db.commit()
    assert await user_has_circuit_access(db, u.id, c.id) is False


async def test_any_active_via_all_grant(db):
    u, c = await _mk(db, for_sale=True)
    now = datetime.now(timezone.utc)
    db.add(UserAllCircuitAccess(user_id=u.id, valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=1)))
    await db.commit()
    assert await user_has_any_active_circuit_access(db, u.id) is True


async def test_any_active_false_when_nothing(db):
    u, c = await _mk(db, for_sale=True)
    await db.commit()
    assert await user_has_any_active_circuit_access(db, u.id) is False
