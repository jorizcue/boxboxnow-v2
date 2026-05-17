"""TDD — HTTP per-circuit & list endpoints honour an active all-grant."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.config_routes import _verify_circuit_access, list_my_circuits  # noqa: E402
from app.api.analytics_routes import _check_circuit_access, list_analytics_circuits  # noqa: E402
from app.api.stripe_routes import list_circuits_for_checkout  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base, User, Circuit, UserAllCircuitAccess,
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


async def _seed(db):
    now = datetime.now(timezone.utc)
    u = User(username="e", password_hash="x", is_admin=False)
    c_fs = Circuit(name="FS", ws_port=9002, for_sale=True, is_beta=False)
    c_beta = Circuit(name="BT", ws_port=9003, for_sale=False, is_beta=True)
    c_off = Circuit(name="OFF", ws_port=9004, for_sale=False, is_beta=False)
    db.add_all([u, c_fs, c_beta, c_off]); await db.flush()
    db.add(UserAllCircuitAccess(user_id=u.id,
                                valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=30)))
    await db.commit()
    return u, c_fs, c_beta, c_off


async def test_config_verify_allows_all_grant_for_sale(db):
    u, c_fs, c_beta, c_off = await _seed(db)
    await _verify_circuit_access(u, c_fs.id, db)
    await _verify_circuit_access(u, c_beta.id, db)
    with pytest.raises(HTTPException):
        await _verify_circuit_access(u, c_off.id, db)


async def test_analytics_check_allows_all_grant(db):
    u, c_fs, c_beta, c_off = await _seed(db)
    await _check_circuit_access(u, c_fs.id, db)
    with pytest.raises(HTTPException):
        await _check_circuit_access(u, c_off.id, db)


async def test_config_list_includes_all_grant_set(db):
    u, c_fs, c_beta, c_off = await _seed(db)
    out = await list_my_circuits(user=u, db=db)
    names = {c.name for c in out}
    assert "FS" in names and "BT" in names
    assert "OFF" not in names


async def test_analytics_list_includes_all_grant_set(db):
    u, c_fs, c_beta, c_off = await _seed(db)
    out = await list_analytics_circuits(user=u, db=db)
    names = {c.name for c in out}
    assert "FS" in names and "BT" in names and "OFF" not in names


async def test_checkout_list_excludes_when_all_grant(db):
    u, c_fs, c_beta, c_off = await _seed(db)
    out = await list_circuits_for_checkout(user=u, db=db)
    assert out == []
