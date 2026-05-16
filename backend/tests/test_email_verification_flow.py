"""Task 3 TDD — email verification flow tests.

All tests MUST FAIL before implementation and PASS after.

Covers:
  0. start_trial() hardening: no MultipleResultsFound when user has 2+ Subscription rows.
  1. verify-email endpoint: invalid token, expired naive datetime (regression guard),
     already-verified (idempotent), valid (sets verified + starts trial + clears token).
  2. resend-verification endpoint: unknown email, verified user, unverified user (regenerates
     token + fires email); rate-limiter invoked on every call.
  3. checkout gate: unverified non-admin → 403 email_not_verified; verified / admin /
     is_internal → gate passes (may fail later for other reasons; we only test the gate).
"""
from __future__ import annotations

import asyncio
import sys
import types
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from fastapi import HTTPException

# ---------------------------------------------------------------------------
# Stub resend BEFORE any app import that may trigger email_service
# ---------------------------------------------------------------------------

if "resend" not in sys.modules:
    _resend_stub = types.ModuleType("resend")
    _resend_stub.api_key = None
    _resend_stub.Emails = MagicMock()
    sys.modules["resend"] = _resend_stub

# ---------------------------------------------------------------------------
# App imports (after stubs)
# ---------------------------------------------------------------------------

from app.api.auth_routes import (  # noqa: E402
    start_trial,
    forgot_password_limiter,
)
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
# Helpers
# ---------------------------------------------------------------------------


def _make_user(db, *, username="u1", email="u1@x.com", email_verified=True,
               token=None, expires=None, is_admin=False, is_internal=False):
    """Create a minimal User without committing."""
    u = User(
        username=username,
        email=email,
        password_hash="x",
        is_admin=is_admin,
        max_devices=2,
        email_verified=email_verified,
        email_verification_token=token,
        email_verification_expires=expires,
    )
    if is_internal:
        u.is_internal = True
    db.add(u)
    return u


class _FakeClient:
    host = "127.0.0.1"


class _FakeRequest:
    client = _FakeClient()

    class _Headers(dict):
        def get(self, key, default=None):
            return default

    headers = _Headers()

    def __init__(self, body=None):
        self._body = body or {}

    async def json(self):
        return self._body


# ---------------------------------------------------------------------------
# § 0. start_trial() hardening — no raise when user has 2 Subscription rows
# ---------------------------------------------------------------------------


async def test_start_trial_no_raise_with_two_existing_subs(db):
    """start_trial() must be a safe no-op (no exception, no new rows) when
    the user already has 2 Subscription rows. Regression guard against
    MultipleResultsFound if the guard used scalar_one_or_none()."""

    c = Circuit(name="C1", ws_port=9100, for_sale=True, is_beta=False)
    db.add(c)

    user = User(
        username="dualsubuser",
        email="dualsub@x.com",
        password_hash="x",
        is_admin=False,
        max_devices=2,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Seed 2 Subscription rows manually
    now = datetime.now(timezone.utc)
    db.add(Subscription(
        user_id=user.id, plan_type="trial", status="trialing",
        current_period_start=now, current_period_end=now + timedelta(days=14),
    ))
    db.add(Subscription(
        user_id=user.id, plan_type="pro_monthly", status="active",
        current_period_start=now, current_period_end=now + timedelta(days=30),
    ))
    await db.commit()

    # Must NOT raise
    await start_trial(user, db, trial_days=14)
    await db.commit()

    subs = (
        await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    ).scalars().all()
    assert len(subs) == 2, (
        f"start_trial with 2 existing subs must remain at 2, got {len(subs)}"
    )


# ---------------------------------------------------------------------------
# § 1. verify-email endpoint
# ---------------------------------------------------------------------------


async def test_verify_email_invalid_token(db):
    """POST /api/auth/verify-email with a bogus token → 400."""
    from app.api.auth_routes import verify_email

    req = _FakeRequest({"token": "not-a-real-token"})
    with pytest.raises(HTTPException) as exc_info:
        await verify_email(request=req, db=db)
    assert exc_info.value.status_code == 400
    assert "inválido" in exc_info.value.detail or "invalido" in exc_info.value.detail.lower()


async def test_verify_email_expired_naive_datetime_returns_400_not_500(db):
    """Expired token where email_verification_expires is a NAIVE datetime
    must return 400, not 500 (regression guard for naive/aware comparison bug)."""
    from app.api.auth_routes import verify_email

    # Seed user with a NAIVE (no tzinfo) past expiry
    naive_past = datetime.utcnow() - timedelta(hours=1)
    assert naive_past.tzinfo is None, "Test setup error: must be naive"

    u = _make_user(
        db,
        username="expired_naive",
        email="expired@x.com",
        email_verified=False,
        token="expired-token-abc",
        expires=naive_past,
    )
    await db.commit()

    req = _FakeRequest({"token": "expired-token-abc"})
    with pytest.raises(HTTPException) as exc_info:
        await verify_email(request=req, db=db)
    assert exc_info.value.status_code == 400, (
        f"Expired naive datetime must return 400, got {exc_info.value.status_code}"
    )


async def test_verify_email_already_verified_returns_alreadyVerified(db):
    """If the user is already verified, verify-email must return
    {ok: True, alreadyVerified: True} without creating a new Subscription."""
    from app.api.auth_routes import verify_email

    c = Circuit(name="VerCircuit", ws_port=9101, for_sale=True, is_beta=False)
    db.add(c)

    u = _make_user(
        db,
        username="alreadyver",
        email="alreadyver@x.com",
        email_verified=True,
        token="already-verified-token",
        expires=datetime.now(timezone.utc) + timedelta(days=7),
    )
    await db.commit()
    await db.refresh(u)

    req = _FakeRequest({"token": "already-verified-token"})
    result = await verify_email(request=req, db=db)

    assert result == {"ok": True, "alreadyVerified": True}, (
        f"already-verified must return {{ok,alreadyVerified}}, got {result!r}"
    )

    # No Subscription should have been created
    subs = (
        await db.execute(select(Subscription).where(Subscription.user_id == u.id))
    ).scalars().all()
    assert len(subs) == 0, (
        f"already-verified must NOT create a Subscription, got {len(subs)}"
    )


async def test_verify_email_valid_token_sets_verified_and_starts_trial(db):
    """Valid token → email_verified=True, token cleared, exactly 1 trial sub,
    send_welcome_email attempted."""
    from app.api.auth_routes import verify_email

    c = Circuit(name="TrialCircuit", ws_port=9102, for_sale=True, is_beta=False)
    c_no = Circuit(name="NoSaleC", ws_port=9103, for_sale=False, is_beta=False)
    db.add_all([c, c_no])

    u = _make_user(
        db,
        username="toverify",
        email="toverify@x.com",
        email_verified=False,
        token="valid-token-xyz",
        expires=datetime.now(timezone.utc) + timedelta(days=7),
    )
    await db.commit()
    await db.refresh(u)
    await db.refresh(c)

    welcome_mock = AsyncMock()
    with (
        patch("asyncio.create_task", return_value=None) as ct_mock,
        patch("app.services.email_service.send_welcome_email", welcome_mock),
    ):
        req = _FakeRequest({"token": "valid-token-xyz"})
        result = await verify_email(request=req, db=db)

    assert result == {"ok": True}, f"Expected {{ok: True}}, got {result!r}"

    await db.refresh(u)
    assert u.email_verified is True, "email_verified must be True after verification"
    assert u.email_verification_token is None, "token must be cleared after verification"
    assert u.email_verification_expires is None, "expires must be cleared after verification"

    subs = (
        await db.execute(select(Subscription).where(Subscription.user_id == u.id))
    ).scalars().all()
    assert len(subs) == 1, f"Exactly 1 trial Subscription expected, got {len(subs)}"
    assert subs[0].plan_type == "trial"
    assert subs[0].status == "trialing"

    # send_welcome_email must have been fired (via asyncio.create_task)
    assert ct_mock.called, "asyncio.create_task must be called (for send_welcome_email)"


async def test_verify_email_valid_grants_only_for_sale_circuits(db):
    """Valid verify-email → UserCircuitAccess only for for_sale=True circuits."""
    from app.api.auth_routes import verify_email

    c_sale = Circuit(name="SaleC2", ws_port=9104, for_sale=True, is_beta=False)
    c_no = Circuit(name="NoSaleC2", ws_port=9105, for_sale=False, is_beta=False)
    db.add_all([c_sale, c_no])

    u = _make_user(
        db,
        username="granttest",
        email="granttest@x.com",
        email_verified=False,
        token="grant-token",
        expires=datetime.now(timezone.utc) + timedelta(days=7),
    )
    await db.commit()
    await db.refresh(u)
    await db.refresh(c_sale)

    with patch("asyncio.create_task", return_value=None):
        req = _FakeRequest({"token": "grant-token"})
        await verify_email(request=req, db=db)

    accesses = (
        await db.execute(
            select(UserCircuitAccess).where(UserCircuitAccess.user_id == u.id)
        )
    ).scalars().all()
    assert len(accesses) == 1, f"Expected 1 access (for_sale only), got {len(accesses)}"
    assert accesses[0].circuit_id == c_sale.id


# ---------------------------------------------------------------------------
# § 2. resend-verification endpoint
# ---------------------------------------------------------------------------


async def test_resend_verification_unknown_email_returns_ok_no_email(db):
    """Unknown email → generic {ok: True}, no email fired."""
    from app.api.auth_routes import resend_verification

    # Reset limiter state to avoid contamination across tests
    forgot_password_limiter._failures.clear()

    req = _FakeRequest({"email": "nobody@x.com"})
    with patch("asyncio.create_task", return_value=None) as ct_mock:
        result = await resend_verification(request=req, db=db)

    assert result == {"ok": True}
    assert not ct_mock.called, "No email task must be created for unknown email"


async def test_resend_verification_verified_user_returns_ok_no_email(db):
    """Verified user → generic {ok: True}, no email fired."""
    from app.api.auth_routes import resend_verification

    forgot_password_limiter._failures.clear()

    u = _make_user(
        db, username="ver2", email="ver2@x.com", email_verified=True,
        token=None, expires=None,
    )
    await db.commit()

    req = _FakeRequest({"email": "ver2@x.com"})
    with patch("asyncio.create_task", return_value=None) as ct_mock:
        result = await resend_verification(request=req, db=db)

    assert result == {"ok": True}
    assert not ct_mock.called, "No email task for already-verified user"


async def test_resend_verification_unverified_regenerates_token_and_emails(db):
    """Unverified user → token regenerated, expires reset, email task fired."""
    from app.api.auth_routes import resend_verification

    forgot_password_limiter._failures.clear()

    old_token = "old-token-123"
    u = _make_user(
        db,
        username="unver1",
        email="unver1@x.com",
        email_verified=False,
        token=old_token,
        expires=datetime.now(timezone.utc) + timedelta(days=1),
    )
    await db.commit()
    await db.refresh(u)

    req = _FakeRequest({"email": "unver1@x.com"})
    with patch("asyncio.create_task", return_value=None) as ct_mock:
        result = await resend_verification(request=req, db=db)

    assert result == {"ok": True}

    await db.refresh(u)
    assert u.email_verification_token != old_token, (
        "Token must be regenerated, but it is unchanged"
    )
    assert u.email_verification_token is not None
    assert u.email_verification_expires is not None

    exp = u.email_verification_expires
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    # Should be approximately now+7d (within 10 seconds tolerance)
    now = datetime.now(timezone.utc)
    assert exp > now + timedelta(days=6, hours=23), (
        f"New expiry must be ~7d from now, got {exp!r}"
    )

    assert ct_mock.called, "asyncio.create_task must be called (for send_verification_email)"


async def test_resend_verification_rate_limiter_invoked(db):
    """The forgot_password_limiter must be invoked (check + record_failure) on every call."""
    from app.api.auth_routes import resend_verification

    forgot_password_limiter._failures.clear()

    req = _FakeRequest({"email": "rate@x.com"})
    with (
        patch.object(forgot_password_limiter, "check") as mock_check,
        patch.object(forgot_password_limiter, "record_failure") as mock_record,
        patch("asyncio.create_task", return_value=None),
    ):
        await resend_verification(request=req, db=db)

    mock_check.assert_called_once()
    mock_record.assert_called_once()


async def test_resend_verification_rate_limit_blocks_after_limit(db):
    """After exceeding the limit, resend-verification returns 429."""
    from app.api.auth_routes import resend_verification

    forgot_password_limiter._failures.clear()
    ip = "10.0.0.99"

    # Exhaust the limit (5 attempts for forgot_password_limiter)
    for _ in range(5):
        forgot_password_limiter.record_failure(ip)

    req = _FakeRequest({"email": "spam@x.com"})
    req.client = type("C", (), {"host": ip})()

    with pytest.raises(HTTPException) as exc_info:
        await resend_verification(request=req, db=db)

    assert exc_info.value.status_code == 429

    # Clean up
    forgot_password_limiter._failures.clear()


# ---------------------------------------------------------------------------
# § 3. Checkout gate
# ---------------------------------------------------------------------------


async def test_checkout_gate_unverified_non_admin_returns_403(db):
    """Unverified non-admin/non-internal user → 403 email_not_verified before any Stripe work."""
    from app.api.stripe_routes import create_checkout_session

    u = _make_user(
        db, username="unver_pay", email="unverpay@x.com",
        email_verified=False, is_admin=False,
    )
    await db.commit()
    await db.refresh(u)

    req = _FakeRequest({"price_id": "price_fake"})
    with pytest.raises(HTTPException) as exc_info:
        await create_checkout_session(request=req, user=u, db=db)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "email_not_verified"


async def test_checkout_gate_verified_user_passes_gate(db):
    """Verified (non-admin) user → gate passes (may fail downstream for other reasons)."""
    from app.api.stripe_routes import create_checkout_session

    u = _make_user(
        db, username="ver_pay", email="verpay@x.com",
        email_verified=True, is_admin=False,
    )
    await db.commit()
    await db.refresh(u)

    req = _FakeRequest({"price_id": "price_fake"})
    # Gate passes → next failure is about Stripe/DB, not the email check.
    # We only assert it does NOT raise 403 email_not_verified.
    try:
        await create_checkout_session(request=req, user=u, db=db)
    except HTTPException as exc:
        assert exc.detail != "email_not_verified", (
            f"Verified user must not be blocked by email gate, got {exc.detail!r}"
        )
    except Exception:
        pass  # Other errors (Stripe, config) are acceptable — gate passed


async def test_checkout_gate_admin_bypasses_gate(db):
    """Admin user (even if somehow email_verified=False) → gate is bypassed."""
    from app.api.stripe_routes import create_checkout_session

    u = _make_user(
        db, username="admin_pay", email="adminpay@x.com",
        email_verified=False, is_admin=True,
    )
    await db.commit()
    await db.refresh(u)

    req = _FakeRequest({"price_id": "price_fake"})
    try:
        await create_checkout_session(request=req, user=u, db=db)
    except HTTPException as exc:
        assert exc.detail != "email_not_verified", (
            f"Admin must bypass email gate, got {exc.detail!r}"
        )
    except Exception:
        pass


async def test_checkout_gate_internal_user_bypasses_gate(db):
    """is_internal user → gate is bypassed regardless of email_verified."""
    from app.api.stripe_routes import create_checkout_session

    u = _make_user(
        db, username="int_pay", email="intpay@x.com",
        email_verified=False, is_admin=False, is_internal=True,
    )
    await db.commit()
    await db.refresh(u)

    req = _FakeRequest({"price_id": "price_fake"})
    try:
        await create_checkout_session(request=req, user=u, db=db)
    except HTTPException as exc:
        assert exc.detail != "email_not_verified", (
            f"is_internal must bypass email gate, got {exc.detail!r}"
        )
    except Exception:
        pass
