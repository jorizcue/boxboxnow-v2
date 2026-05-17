"""Task 7 — End-to-end acceptance test: register → verify-email → trial (for_sale circuits).

Covers the full integrated behaviour of Tasks 1-6 working together:

1. Two Circuit rows seeded: one for_sale=True/is_beta=True, one for_sale=False.
2. register() → no Subscription, no UserCircuitAccess; email_verified=False; token+expires set.
3. verify_email(token) → email_verified=True; token cleared; exactly one trial Subscription;
   UserCircuitAccess ONLY for the for_sale=True circuit (not the for_sale=False one).
4. Idempotency:
   a. Re-calling verify_email with the (now-cleared) token → 400 (token was cleared).
   b. Calling start_trial again → no-op (still exactly one sub, no duplicate circuit rows).
5. Checkout gate:
   - Unverified non-admin → HTTPException(403, "email_not_verified").
   - Verified user → gate passes (may fail downstream for other reasons; only the gate is tested).
   - Admin (email_verified=False) → gate bypassed.
   - is_internal (email_verified=False) → gate bypassed.
6. OAuth / Google-register path: user created with email_verified=True then start_trial() called
   directly → exactly one trial sub, UserCircuitAccess ONLY for the for_sale=True circuit.
   (Approach: unit-level invariant rather than full OAuth handler, because the OAuth handler
   requires a live Google token round-trip; we exercise the exact sub-path that the handler
   calls — start_trial() — on a pre-verified user, which captures the OAuth contract in the
   in-memory harness without driving the full OAuth handler.)
"""
from __future__ import annotations

import sys
import types
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# ---------------------------------------------------------------------------
# Stub `resend` before any app import that may trigger email_service
# ---------------------------------------------------------------------------

if "resend" not in sys.modules:
    _resend_stub = types.ModuleType("resend")
    _resend_stub.api_key = None
    _resend_stub.Emails = MagicMock()
    sys.modules["resend"] = _resend_stub

# ---------------------------------------------------------------------------
# App imports (after stubs)
# ---------------------------------------------------------------------------

from app.api.auth_routes import register, start_trial, verify_email  # noqa: E402
from app.models.pydantic_models import RegisterRequest  # noqa: E402
from app.models.schemas import (  # noqa: E402
    Base,
    Circuit,
    Subscription,
    User,
    UserCircuitAccess,
)

# ---------------------------------------------------------------------------
# In-memory DB fixture
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


# ---------------------------------------------------------------------------
# Shared helpers (mirror test_start_trial_and_register_no_trial.py pattern)
# ---------------------------------------------------------------------------


class _FakeClient:
    host = "127.0.0.1"


class _FakeRequest:
    """Stand-in for starlette.requests.Request."""

    client = _FakeClient()

    class _Headers(dict):
        def get(self, key, default=None):
            return default

    headers = _Headers()

    def __init__(self, body=None):
        self._body = body or {}

    async def json(self):
        return self._body


async def _call_register(db, username="integration_user", email="integration@example.com"):
    """Call register() with all external I/O stubbed out (mirrors existing test pattern)."""
    data = RegisterRequest(
        username=username,
        email=email,
        password="IntegrationPass1",
    )
    request = _FakeRequest()
    with (
        patch("asyncio.create_task", return_value=None),
        patch(
            "app.services.usage_events.link_visitor_to_user",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.services.usage_events.record_event",
            new=AsyncMock(return_value=None),
        ),
    ):
        await register(data=data, request=request, db=db)


async def _call_verify_email(db, token: str):
    """Call verify_email() with asyncio.create_task stubbed out."""
    req = _FakeRequest({"token": token})
    with patch("asyncio.create_task", return_value=None):
        return await verify_email(request=req, db=db)


# ---------------------------------------------------------------------------
# §1  Two Circuit rows seeded; confirmed at the top of each test
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def two_circuits(db):
    """Seed one for_sale=True/is_beta=True circuit and one for_sale=False circuit."""
    c_sale = Circuit(name="ForSaleCircuit", ws_port=9200, for_sale=True, is_beta=True)
    c_no_sale = Circuit(name="NotForSaleCircuit", ws_port=9201, for_sale=False, is_beta=False)
    db.add_all([c_sale, c_no_sale])
    await db.commit()
    await db.refresh(c_sale)
    await db.refresh(c_no_sale)
    return c_sale, c_no_sale


# ---------------------------------------------------------------------------
# §2  register() assertions
# ---------------------------------------------------------------------------


async def test_register_creates_no_subscription(db, two_circuits):
    """After register(), the user must have NO Subscription row."""
    await _call_register(db)

    user_row = (
        await db.execute(select(User).where(User.username == "integration_user"))
    ).scalar_one()

    subs = (
        await db.execute(select(Subscription).where(Subscription.user_id == user_row.id))
    ).scalars().all()

    assert len(subs) == 0, (
        f"register() must NOT create any Subscription rows; got {len(subs)}"
    )


async def test_register_creates_no_circuit_access(db, two_circuits):
    """After register(), the user must have NO UserCircuitAccess rows."""
    await _call_register(db, username="user_access_check", email="access@example.com")

    user_row = (
        await db.execute(select(User).where(User.username == "user_access_check"))
    ).scalar_one()

    accesses = (
        await db.execute(
            select(UserCircuitAccess).where(UserCircuitAccess.user_id == user_row.id)
        )
    ).scalars().all()

    assert len(accesses) == 0, (
        f"register() must NOT create any UserCircuitAccess rows; got {len(accesses)}"
    )


async def test_register_email_verified_false(db, two_circuits):
    """After register(), user.email_verified must be False."""
    await _call_register(db, username="user_ver_false", email="verfalse@example.com")

    user_row = (
        await db.execute(select(User).where(User.username == "user_ver_false"))
    ).scalar_one()

    assert user_row.email_verified is False, (
        f"register() must set email_verified=False, got {user_row.email_verified!r}"
    )


async def test_register_token_and_expires_set(db, two_circuits):
    """After register(), email_verification_token is non-null and expires is ~now+7d (tz-aware)."""
    before = datetime.now(timezone.utc)
    await _call_register(db, username="user_token_check", email="tokencheck@example.com")
    after = datetime.now(timezone.utc)

    user_row = (
        await db.execute(select(User).where(User.username == "user_token_check"))
    ).scalar_one()

    # Token must be set
    assert user_row.email_verification_token is not None, (
        "register() must set a non-null email_verification_token"
    )
    assert len(user_row.email_verification_token) > 10, (
        "email_verification_token must be a substantial random string"
    )

    # Expires must be set and approximately now+7d (tz-aware normalization for SQLite)
    exp = user_row.email_verification_expires
    assert exp is not None, "email_verification_expires must be set"
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    expected_low = before + timedelta(days=7) - timedelta(seconds=5)
    expected_high = after + timedelta(days=7) + timedelta(seconds=5)

    assert expected_low <= exp <= expected_high, (
        f"email_verification_expires={exp!r} not in expected ~now+7d window "
        f"({expected_low!r} … {expected_high!r})"
    )


# ---------------------------------------------------------------------------
# §3  verify_email() assertions — the main integrated flow
# ---------------------------------------------------------------------------


async def test_verify_email_full_flow(db, two_circuits):
    """Full integrated flow: register → verify_email → check all post-verify invariants.

    Asserts:
    - email_verified is True
    - token and expires are cleared
    - exactly one Subscription(plan_type="trial", status="trialing")
    - UserCircuitAccess only for the for_sale=True circuit (NOT for the for_sale=False one)
    """
    c_sale, c_no_sale = two_circuits

    await _call_register(db, username="full_flow_user", email="fullflow@example.com")

    user_row = (
        await db.execute(select(User).where(User.username == "full_flow_user"))
    ).scalar_one()

    # Capture the token that was set at registration
    token = user_row.email_verification_token
    assert token is not None, "Setup error: token must be set after register()"

    # Call verify_email
    result = await _call_verify_email(db, token)
    # New contract (register-no-session / verify-auto-login): a fresh verify
    # now auto-logs-in and returns the auth payload (ok + access_token +
    # session_token + user) instead of a bare {ok: True}. The single
    # DeviceSession created here is asserted in test_register_verify_session.py;
    # this integration test only re-checks the response shape + trial/circuit
    # invariants below.
    assert result["ok"] is True, f"verify_email must return ok=True, got {result!r}"
    assert result.get("access_token"), (
        f"fresh verify must return an access_token, got {result!r}"
    )
    assert result.get("session_token"), (
        f"fresh verify must return a session_token, got {result!r}"
    )
    assert result.get("user") is not None, (
        f"fresh verify must return a user object, got {result!r}"
    )

    # Reload user state
    await db.refresh(user_row)

    # --- email_verified is True ---
    assert user_row.email_verified is True, (
        f"email_verified must be True after verify_email; got {user_row.email_verified!r}"
    )

    # --- token and expires cleared ---
    assert user_row.email_verification_token is None, (
        f"email_verification_token must be None after verify_email; "
        f"got {user_row.email_verification_token!r}"
    )
    assert user_row.email_verification_expires is None, (
        f"email_verification_expires must be None after verify_email; "
        f"got {user_row.email_verification_expires!r}"
    )

    # --- exactly one Subscription(plan_type="trial", status="trialing") ---
    subs = (
        await db.execute(
            select(Subscription).where(Subscription.user_id == user_row.id)
        )
    ).scalars().all()

    assert len(subs) == 1, (
        f"Exactly 1 trial Subscription expected after verify_email; got {len(subs)}"
    )
    assert subs[0].plan_type == "trial", (
        f"Subscription.plan_type must be 'trial'; got {subs[0].plan_type!r}"
    )
    assert subs[0].status == "trialing", (
        f"Subscription.status must be 'trialing'; got {subs[0].status!r}"
    )

    # --- UserCircuitAccess only for for_sale=True circuit ---
    accesses = (
        await db.execute(
            select(UserCircuitAccess).where(UserCircuitAccess.user_id == user_row.id)
        )
    ).scalars().all()

    assert len(accesses) == 1, (
        f"Exactly 1 UserCircuitAccess expected (for_sale=True only); got {len(accesses)}\n"
        f"  circuit_ids granted: {[a.circuit_id for a in accesses]}\n"
        f"  for_sale circuit id: {c_sale.id}, not-for-sale id: {c_no_sale.id}"
    )
    assert accesses[0].circuit_id == c_sale.id, (
        f"UserCircuitAccess must be for the for_sale circuit (id={c_sale.id}); "
        f"got circuit_id={accesses[0].circuit_id}"
    )


# ---------------------------------------------------------------------------
# §4  Idempotency
# ---------------------------------------------------------------------------


async def test_verify_email_cleared_token_returns_400(db, two_circuits):
    """Re-calling verify_email with the now-cleared token must raise 400 (token was cleared)."""
    await _call_register(db, username="idem_user", email="idem@example.com")

    user_row = (
        await db.execute(select(User).where(User.username == "idem_user"))
    ).scalar_one()
    token = user_row.email_verification_token
    assert token is not None, "Setup error: token must be set"

    # First verify — should succeed
    await _call_verify_email(db, token)

    # Second verify with the (now-cleared) original token — must 400
    req = _FakeRequest({"token": token})
    with (
        patch("asyncio.create_task", return_value=None),
        pytest.raises(HTTPException) as exc_info,
    ):
        await verify_email(request=req, db=db)

    assert exc_info.value.status_code == 400, (
        f"Re-verify with cleared token must return 400; got {exc_info.value.status_code}"
    )


async def test_start_trial_idempotent_after_verify(db, two_circuits):
    """After verify_email already ran start_trial, calling start_trial again is a no-op.

    Must remain at exactly one Subscription and one UserCircuitAccess.
    """
    c_sale, _ = two_circuits

    await _call_register(db, username="idem_trial_user", email="idtrial@example.com")

    user_row = (
        await db.execute(select(User).where(User.username == "idem_trial_user"))
    ).scalar_one()
    token = user_row.email_verification_token
    assert token is not None

    # First verify (starts trial)
    await _call_verify_email(db, token)

    # Call start_trial again directly — must be a no-op
    await start_trial(user_row, db, trial_days=14)
    await db.commit()

    subs = (
        await db.execute(
            select(Subscription).where(Subscription.user_id == user_row.id)
        )
    ).scalars().all()
    assert len(subs) == 1, (
        f"start_trial idempotent: expected 1 Subscription, got {len(subs)}"
    )

    accesses = (
        await db.execute(
            select(UserCircuitAccess).where(UserCircuitAccess.user_id == user_row.id)
        )
    ).scalars().all()
    assert len(accesses) == 1, (
        f"start_trial idempotent: expected 1 UserCircuitAccess, got {len(accesses)}"
    )
    assert accesses[0].circuit_id == c_sale.id, (
        f"Idempotent access must still be for the for_sale circuit (id={c_sale.id}); "
        f"got {accesses[0].circuit_id}"
    )


# ---------------------------------------------------------------------------
# §5  Checkout gate
# ---------------------------------------------------------------------------


async def test_checkout_gate_unverified_non_admin_raises_403(db, two_circuits):
    """Unverified non-admin user must get HTTPException(403, 'email_not_verified')."""
    from app.api.stripe_routes import create_checkout_session

    u = User(
        username="unver_gate",
        email="unvergate@example.com",
        password_hash="x",
        is_admin=False,
        max_devices=2,
        email_verified=False,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)

    req = _FakeRequest({"price_id": "price_fake"})
    with pytest.raises(HTTPException) as exc_info:
        await create_checkout_session(request=req, user=u, db=db)

    assert exc_info.value.status_code == 403, (
        f"Unverified non-admin must get 403; got {exc_info.value.status_code}"
    )
    assert exc_info.value.detail == "email_not_verified", (
        f"Detail must be 'email_not_verified'; got {exc_info.value.detail!r}"
    )


async def test_checkout_gate_verified_user_passes(db, two_circuits):
    """Verified user must pass the email gate (may fail downstream for other reasons)."""
    from app.api.stripe_routes import create_checkout_session

    u = User(
        username="ver_gate",
        email="vergate@example.com",
        password_hash="x",
        is_admin=False,
        max_devices=2,
        email_verified=True,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)

    req = _FakeRequest({"price_id": "price_fake"})
    try:
        await create_checkout_session(request=req, user=u, db=db)
    except HTTPException as exc:
        assert exc.detail != "email_not_verified", (
            f"Verified user must NOT be blocked by email gate; got detail={exc.detail!r}"
        )
    except Exception:
        pass  # Stripe / config failure — gate passed


async def test_checkout_gate_admin_bypasses(db, two_circuits):
    """Admin user (even with email_verified=False) must bypass the email gate."""
    from app.api.stripe_routes import create_checkout_session

    u = User(
        username="admin_gate",
        email="admingate@example.com",
        password_hash="x",
        is_admin=True,
        max_devices=2,
        email_verified=False,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)

    req = _FakeRequest({"price_id": "price_fake"})
    try:
        await create_checkout_session(request=req, user=u, db=db)
    except HTTPException as exc:
        assert exc.detail != "email_not_verified", (
            f"Admin must bypass email gate; got detail={exc.detail!r}"
        )
    except Exception:
        pass


async def test_checkout_gate_internal_user_bypasses(db, two_circuits):
    """is_internal user must bypass the email gate regardless of email_verified."""
    from app.api.stripe_routes import create_checkout_session

    u = User(
        username="internal_gate",
        email="internalgate@example.com",
        password_hash="x",
        is_admin=False,
        is_internal=True,
        max_devices=2,
        email_verified=False,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)

    req = _FakeRequest({"price_id": "price_fake"})
    try:
        await create_checkout_session(request=req, user=u, db=db)
    except HTTPException as exc:
        assert exc.detail != "email_not_verified", (
            f"is_internal must bypass email gate; got detail={exc.detail!r}"
        )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# §6  OAuth path (unit-level invariant approach)
#
# The full OAuth handler (google_callback) requires a live Google ID token
# round-trip, a Redis-backed PKCE state store, and cookie manipulation — all
# impractical to invoke in the in-memory harness. Instead we exercise the
# exact sub-path the handler calls: create a user with email_verified=True and
# call start_trial() directly. This captures the full OAuth contract
# (pre-verified + immediate trial start + for_sale-only circuit access) without
# driving the OAuth HTTP handler.
# ---------------------------------------------------------------------------


async def test_oauth_path_verified_user_gets_trial_and_for_sale_access(db, two_circuits):
    """OAuth contract: user created with email_verified=True + start_trial → trial sub
    and UserCircuitAccess only for the for_sale=True circuit.

    Approach: unit-level invariant (create the user as the OAuth handler does, call
    start_trial as the handler does) rather than full OAuth handler invocation. The
    handler is impractical to unit-test because it requires a live Google ID-token
    round-trip, PKCE state, and cookie handling. This assertion captures every
    observable outcome of the OAuth path in the in-memory harness.
    """
    c_sale, c_no_sale = two_circuits

    # Simulate the OAuth handler: user created with email_verified=True
    oauth_user = User(
        username="oauth_user",
        email="oauth@example.com",
        password_hash="x",
        is_admin=False,
        max_devices=2,
        email_verified=True,  # Google already verified — OAuth sets this
    )
    db.add(oauth_user)
    await db.commit()
    await db.refresh(oauth_user)

    # The handler calls: await start_trial(user, db, trial_days=trial_days)
    await start_trial(oauth_user, db, trial_days=14)
    await db.commit()

    # --- exactly one trial Subscription ---
    subs = (
        await db.execute(
            select(Subscription).where(Subscription.user_id == oauth_user.id)
        )
    ).scalars().all()

    assert len(subs) == 1, (
        f"OAuth path: expected 1 trial Subscription; got {len(subs)}"
    )
    assert subs[0].plan_type == "trial", (
        f"OAuth path: Subscription.plan_type must be 'trial'; got {subs[0].plan_type!r}"
    )
    assert subs[0].status == "trialing", (
        f"OAuth path: Subscription.status must be 'trialing'; got {subs[0].status!r}"
    )

    # --- UserCircuitAccess only for the for_sale=True circuit ---
    accesses = (
        await db.execute(
            select(UserCircuitAccess).where(UserCircuitAccess.user_id == oauth_user.id)
        )
    ).scalars().all()

    assert len(accesses) == 1, (
        f"OAuth path: expected 1 UserCircuitAccess (for_sale=True only); got {len(accesses)}\n"
        f"  circuit_ids granted: {[a.circuit_id for a in accesses]}\n"
        f"  for_sale circuit id: {c_sale.id}, not-for-sale id: {c_no_sale.id}"
    )
    assert accesses[0].circuit_id == c_sale.id, (
        f"OAuth path: UserCircuitAccess must be for the for_sale circuit (id={c_sale.id}); "
        f"got circuit_id={accesses[0].circuit_id}"
    )
