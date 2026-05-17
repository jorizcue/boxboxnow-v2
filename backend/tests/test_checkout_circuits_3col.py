"""TDD — /api/stripe/circuits returns for_sale + includes beta&¬for_sale;
owned-exclusion stays scoped to purchasable (for_sale) circuits;
F2 has_all→[] preserved."""
from __future__ import annotations

import sys, types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.stripe_routes import list_circuits_for_checkout  # noqa: E402
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


async def test_returns_for_sale_field_and_includes_study(db):
    u = User(username="c", password_hash="x", is_admin=False)
    c_av = Circuit(name="AAA", ws_port=9101, for_sale=True, is_beta=False)
    c_test = Circuit(name="BBB", ws_port=9102, for_sale=True, is_beta=True)
    c_study = Circuit(name="CCC", ws_port=9103, for_sale=False, is_beta=True)
    c_hidden = Circuit(name="DDD", ws_port=9104, for_sale=False, is_beta=False)
    db.add_all([u, c_av, c_test, c_study, c_hidden]); await db.commit()

    out = await list_circuits_for_checkout(user=u, db=db)
    by_name = {r["name"]: r for r in out}

    assert set(by_name) == {"AAA", "BBB", "CCC"}
    assert by_name["AAA"]["for_sale"] is True and by_name["AAA"]["is_beta"] is False
    assert by_name["BBB"]["for_sale"] is True and by_name["BBB"]["is_beta"] is True
    assert by_name["CCC"]["for_sale"] is False and by_name["CCC"]["is_beta"] is True
    assert [r["name"] for r in out] == ["AAA", "BBB", "CCC"]


async def test_owned_exclusion_only_for_sale(db):
    now = datetime.now(timezone.utc)
    u = User(username="o", password_hash="x", is_admin=False)
    c_av = Circuit(name="AAA", ws_port=9111, for_sale=True, is_beta=False)
    c_study = Circuit(name="CCC", ws_port=9112, for_sale=False, is_beta=True)
    db.add_all([u, c_av, c_study]); await db.flush()
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=c_av.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=10)))
    db.add(UserCircuitAccess(user_id=u.id, circuit_id=c_study.id,
                             valid_from=now - timedelta(hours=1),
                             valid_until=now + timedelta(days=10)))
    await db.commit()

    out = await list_circuits_for_checkout(user=u, db=db)
    names = {r["name"] for r in out}
    assert "AAA" not in names
    assert "CCC" in names


async def test_all_grant_returns_empty_preserved(db):
    now = datetime.now(timezone.utc)
    u = User(username="a", password_hash="x", is_admin=False)
    c = Circuit(name="AAA", ws_port=9121, for_sale=True, is_beta=False)
    db.add_all([u, c]); await db.flush()
    db.add(UserAllCircuitAccess(user_id=u.id,
                                valid_from=now - timedelta(hours=1),
                                valid_until=now + timedelta(days=30)))
    await db.commit()
    assert await list_circuits_for_checkout(user=u, db=db) == []
