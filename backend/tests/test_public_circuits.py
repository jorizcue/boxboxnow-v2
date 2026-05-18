"""TDD — public /api/public/circuits: no auth, returns for_sale|is_beta
circuits with {name,is_beta,for_sale}, excludes neither-flag circuits,
ordered by name."""
from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.public_routes import list_public_circuits  # noqa: E402
from app.models.schemas import Base, Circuit  # noqa: E402


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


async def test_public_circuits_groups_and_shape(db):
    db.add_all([
        Circuit(name="BBB", ws_port=9201, for_sale=True, is_beta=False),    # disponible
        Circuit(name="AAA", ws_port=9202, for_sale=True, is_beta=True),     # en pruebas
        Circuit(name="CCC", ws_port=9203, for_sale=False, is_beta=True),    # en estudio
        Circuit(name="DDD", ws_port=9204, for_sale=False, is_beta=False),   # hidden
    ])
    await db.commit()

    out = await list_public_circuits(db=db)

    assert [r["name"] for r in out] == ["AAA", "BBB", "CCC"]  # ordered, DDD excluded
    by = {r["name"]: r for r in out}
    assert set(by["BBB"]) == {"name", "is_beta", "for_sale"}
    assert by["BBB"]["for_sale"] is True and by["BBB"]["is_beta"] is False
    assert by["AAA"]["for_sale"] is True and by["AAA"]["is_beta"] is True
    assert by["CCC"]["for_sale"] is False and by["CCC"]["is_beta"] is True


async def test_public_circuits_empty(db):
    db.add(Circuit(name="HID", ws_port=9205, for_sale=False, is_beta=False))
    await db.commit()
    assert await list_public_circuits(db=db) == []
