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
from app.api.stripe_routes import list_circuits_for_checkout, create_checkout_session  # noqa: E402
from app.api.replay_routes import list_recordings  # noqa: E402
from app.apex.circuit_hub import _safe_name  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base, User, Circuit, UserAllCircuitAccess, ProductTabConfig,
)


class _FakeRequest:
    """Stand-in for starlette.requests.Request (mirrors
    tests/test_register_verify_trial_integration.py)."""

    class _Client:
        host = "127.0.0.1"

    client = _Client()

    class _Headers(dict):
        def get(self, key, default=None):
            return default

    headers = _Headers()

    def __init__(self, body=None):
        self._body = body or {}

    async def json(self):
        return self._body


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


# ---------------------------------------------------------------------------
# replay list_recordings — active all-grant unions for_sale ∪ is_beta
# ---------------------------------------------------------------------------


async def test_replay_list_includes_all_grant_set(db, tmp_path, monkeypatch):
    """A non-admin user with an active all-grant must see recordings for
    every for_sale OR is_beta circuit, but NOT off-sale-non-beta ones.

    Drives the real list_recordings against a faked recordings root
    (tmp dir + monkeypatched RECORDINGS_BASE_DIR) — the same shape the
    function reads at call time: data/recordings/<safe_name>/<DATE>.log.
    """
    u, c_fs, c_beta, c_off = await _seed(db)

    # Fake recordings root: one dated .log file per circuit dir, named via
    # _safe_name(circuit.name) (exactly what list_recordings maps against).
    rec_root = tmp_path / "recordings"
    rec_root.mkdir()
    for c in (c_fs, c_beta, c_off):
        d = rec_root / _safe_name(c.name)
        d.mkdir()
        (d / "2026-05-17.log").write_text("x\n")

    # list_recordings reads `Path(RECORDINGS_BASE_DIR)` at call time, so
    # monkeypatching the module-level constant redirects it to our tmp dir.
    monkeypatch.setattr(
        "app.api.replay_routes.RECORDINGS_BASE_DIR", str(rec_root)
    )

    out = await list_recordings(user=u, db=db)

    returned_ids = {c["circuit_id"] for c in out["circuits"]}
    returned_names = {c["circuit_name"] for c in out["circuits"]}

    assert c_fs.id in returned_ids, (
        f"for_sale circuit must be visible via all-grant union; "
        f"got ids={returned_ids}"
    )
    assert c_beta.id in returned_ids, (
        f"is_beta circuit must be visible via all-grant union; "
        f"got ids={returned_ids}"
    )
    assert c_off.id not in returned_ids, (
        f"off-sale non-beta circuit must NOT be unioned in by the "
        f"all-grant; got ids={returned_ids}"
    )
    assert "OFF" not in returned_names
    assert {"FS", "BT"}.issubset(returned_names)


# ---------------------------------------------------------------------------
# create_checkout_session — per-circuit purchase blocked by an ACTIVE
# all-grant; an EXPIRED all-grant must NOT trip that guard.
# ---------------------------------------------------------------------------


async def _seed_per_circuit_product(db, *, price_id: str) -> None:
    """Seed a per-circuit ProductTabConfig so create_checkout_session
    resolves it, sets needs_circuit=True, and reaches the all-grant guard."""
    db.add(ProductTabConfig(
        stripe_product_id="prod_test",
        stripe_price_id=price_id,
        plan_type="basic_monthly",
        per_circuit=True,         # -> needs_circuit True
        circuits_to_select=1,     # -> required_count 1 (matches 1 circuit_id)
    ))
    await db.commit()


async def test_checkout_create_blocked_by_active_all_grant(db):
    """Verified non-admin with an ACTIVE all-grant who tries to buy a
    per-circuit plan must hit the 400 'todos los circuitos' guard — which
    fires BEFORE any Stripe SDK call, so no Stripe mock is needed."""
    u, c_fs, c_beta, c_off = await _seed(db)  # u has an ACTIVE all-grant
    u.email_verified = True
    await db.commit()

    await _seed_per_circuit_product(db, price_id="price_pc_active")

    req = _FakeRequest({
        "price_id": "price_pc_active",
        "circuit_ids": [c_fs.id],  # exists; len == circuits_to_select
    })

    with pytest.raises(HTTPException) as exc_info:
        await create_checkout_session(request=req, user=u, db=db)

    assert exc_info.value.status_code == 400, (
        f"Active all-grant must block per-circuit checkout with 400; "
        f"got {exc_info.value.status_code} / {exc_info.value.detail!r}"
    )
    assert "todos los circuitos" in str(exc_info.value.detail), (
        f"Must be the all-grant guard, not another 400; "
        f"got detail={exc_info.value.detail!r}"
    )


async def test_checkout_create_allowed_when_all_grant_expired(db):
    """Same per-circuit purchase, but the only all-grant is EXPIRED
    (valid_until in the past). The all-grant guard must NOT fire — the
    user is allowed to proceed (any later failure must be a DIFFERENT
    error, e.g. the Stripe SDK, never the 'todos los circuitos' 400)."""
    now = datetime.now(timezone.utc)

    u = User(username="exp_all", password_hash="x", is_admin=False,
             email_verified=True)
    c = Circuit(name="EXP", ws_port=9100, for_sale=True, is_beta=False)
    db.add_all([u, c])
    await db.flush()
    # EXPIRED all-grant: valid_until strictly in the past.
    db.add(UserAllCircuitAccess(
        user_id=u.id,
        valid_from=now - timedelta(days=30),
        valid_until=now - timedelta(hours=1),
    ))
    await db.commit()

    await _seed_per_circuit_product(db, price_id="price_pc_expired")

    req = _FakeRequest({
        "price_id": "price_pc_expired",
        "circuit_ids": [c.id],
    })

    raised = None
    try:
        await create_checkout_session(request=req, user=u, db=db)
    except HTTPException as exc:
        raised = exc
    except Exception:
        # Non-HTTP failure (Stripe SDK / config) => guard did NOT fire. OK.
        raised = None

    if raised is not None:
        assert not (
            raised.status_code == 400
            and "todos los circuitos" in str(raised.detail)
        ), (
            "EXPIRED all-grant must NOT trip the 'todos los circuitos' "
            f"guard; got {raised.status_code} / {raised.detail!r}"
        )
