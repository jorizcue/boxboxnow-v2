"""Regression: circuit-access existence checks must not raise when a
user has MULTIPLE active access rows.

`user_has_any_active_circuit_access` / `user_has_circuit_access` used
`.scalar_one_or_none()` on existence queries. A user legitimately has
many active `UserCircuitAccess` rows (one per circuit) and/or several
`UserAllCircuitAccess` grants → scalar_one_or_none raised
`MultipleResultsFound`, which crashed the WebSocket handshake gate for
EVERY non-admin with 2+ circuit accesses (≈ all paying multi-circuit
users): WS accepted then 1006, infinite "Off" reconnect loop. Admin
worked only because the gate is skipped for admins.
"""
from __future__ import annotations

import sys
import types
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.auth_routes import (  # noqa: E402
    user_has_any_active_circuit_access,
    user_has_circuit_access,
)
from app.models.schemas import (  # noqa: E402
    Base, Circuit, UserCircuitAccess, UserAllCircuitAccess,
)

NOW = datetime.now(timezone.utc)
FROM = NOW - timedelta(days=1)
UNTIL = NOW + timedelta(days=30)


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_any_access_true_with_many_per_circuit_rows(db):
    # The exact prod case: izcue had ~20 active UserCircuitAccess rows.
    db.add_all([
        UserCircuitAccess(user_id=83, circuit_id=c,
                          valid_from=FROM, valid_until=UNTIL)
        for c in range(1, 21)
    ])
    await db.commit()
    assert await user_has_any_active_circuit_access(db, 83) is True


async def test_any_access_true_with_multiple_all_grants(db):
    db.add_all([
        UserAllCircuitAccess(user_id=7, valid_from=FROM, valid_until=UNTIL,
                             stripe_subscription_id="sub_a"),
        UserAllCircuitAccess(user_id=7, valid_from=FROM, valid_until=UNTIL,
                             stripe_subscription_id="sub_b"),
    ])
    await db.commit()
    assert await user_has_any_active_circuit_access(db, 7) is True


async def test_any_access_false_with_no_rows(db):
    assert await user_has_any_active_circuit_access(db, 999) is False


async def test_specific_access_true_with_duplicate_rows_same_circuit(db):
    # Overlapping/renewed grants for the same (user, circuit).
    db.add_all([
        UserCircuitAccess(user_id=5, circuit_id=3,
                          valid_from=FROM, valid_until=UNTIL),
        UserCircuitAccess(user_id=5, circuit_id=3,
                          valid_from=FROM, valid_until=UNTIL),
    ])
    await db.commit()
    assert await user_has_circuit_access(db, 5, 3) is True


async def test_specific_access_true_via_multiple_all_grants(db):
    db.add(Circuit(name="X", ws_port=9401, for_sale=True, is_beta=False))
    db.add_all([
        UserAllCircuitAccess(user_id=9, valid_from=FROM, valid_until=UNTIL,
                             stripe_subscription_id="s1"),
        UserAllCircuitAccess(user_id=9, valid_from=FROM, valid_until=UNTIL,
                             stripe_subscription_id="s2"),
    ])
    await db.commit()
    circuit = (await db.execute(
        __import__("sqlalchemy").select(Circuit.id)
    )).scalar_one()
    assert await user_has_circuit_access(db, 9, circuit) is True
