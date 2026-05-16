"""Task 1 TDD — Circuit for_sale/is_beta flags.

Tests (a), (b), (c) MUST FAIL before implementation and PASS after.

(a) Circuit() created without flags defaults for_sale=True, is_beta=False.
(b) list_circuits_for_checkout filters out for_sale=False circuits and
    includes for_sale=True circuits (even is_beta=True) with is_beta in dict.
(c) CircuitOut.model_validate round-trips for_sale/is_beta.
"""
from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select

# Stub resend before any app import that may trigger email_service
if "resend" not in sys.modules:
    _resend_stub = types.ModuleType("resend")
    _resend_stub.api_key = None
    _resend_stub.Emails = MagicMock()
    sys.modules["resend"] = _resend_stub

from app.models.schemas import Base, Circuit  # noqa: E402
from app.models.pydantic_models import CircuitOut  # noqa: E402
from app.api.stripe_routes import list_circuits_for_checkout  # noqa: E402


# ---------------------------------------------------------------------------
# In-memory DB fixture (mirrors ranking/conftest.py)
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


# ---------------------------------------------------------------------------
# Stub user with no circuit access (user.id just needs to exist in the DB
# but no UserCircuitAccess rows — so the exclusion logic finds nothing)
# ---------------------------------------------------------------------------

class _StubUser:
    id = 99999  # no rows in user_circuit_access for this id


# ---------------------------------------------------------------------------
# (a) Default flag values
# ---------------------------------------------------------------------------

async def test_circuit_defaults(db_session):
    """A Circuit created without explicit flags must default for_sale=True,
    is_beta=False."""
    c = Circuit(name="TestCircuit", ws_port=8000)
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)

    assert c.for_sale is True, f"Expected for_sale=True, got {c.for_sale!r}"
    assert c.is_beta is False, f"Expected is_beta=False, got {c.is_beta!r}"


# ---------------------------------------------------------------------------
# (b) list_circuits_for_checkout filters for_sale and exposes is_beta
# ---------------------------------------------------------------------------

async def test_list_circuits_for_checkout_filters(db_session):
    """for_sale=False circuit must be absent; for_sale=True,is_beta=True
    must be present with is_beta:True in the returned dict."""
    # Seed circuits
    not_for_sale = Circuit(name="Hidden", ws_port=8001, for_sale=False, is_beta=False)
    beta = Circuit(name="BetaCircuit", ws_port=8002, for_sale=True, is_beta=True)
    normal = Circuit(name="Normal", ws_port=8003, for_sale=True, is_beta=False)
    db_session.add_all([not_for_sale, beta, normal])
    await db_session.commit()

    stub_user = _StubUser()
    result = await list_circuits_for_checkout(user=stub_user, db=db_session)

    names = [item["name"] for item in result]

    assert "Hidden" not in names, \
        "for_sale=False circuit must be excluded from checkout list"

    beta_items = [item for item in result if item["name"] == "BetaCircuit"]
    assert len(beta_items) == 1, \
        "for_sale=True, is_beta=True circuit must be present in checkout list"
    assert beta_items[0]["is_beta"] is True, \
        f"is_beta must be True in dict, got {beta_items[0]!r}"

    normal_items = [item for item in result if item["name"] == "Normal"]
    assert len(normal_items) == 1, "Normal for_sale circuit must be present"
    assert normal_items[0]["is_beta"] is False, \
        "is_beta must be False for non-beta circuit"


# ---------------------------------------------------------------------------
# (c) CircuitOut round-trips for_sale / is_beta
# ---------------------------------------------------------------------------

async def test_circuit_out_roundtrip(db_session):
    """CircuitOut.model_validate must expose for_sale and is_beta correctly."""
    c = Circuit(name="RoundTrip", ws_port=8004, for_sale=False, is_beta=True)
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)

    out = CircuitOut.model_validate(c)
    assert out.for_sale is False, f"Expected for_sale=False, got {out.for_sale!r}"
    assert out.is_beta is True, f"Expected is_beta=True, got {out.is_beta!r}"
