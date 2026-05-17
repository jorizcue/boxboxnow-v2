"""Guard: block deleting the last payment method while a Stripe subscription
will renew, and preserve a usable invoice default otherwise.

Spec: docs/superpowers/specs/2026-05-17-payment-method-delete-guard-design.md

Tests hit the FastAPI app directly via httpx.AsyncClient + ASGITransport.
- `get_current_user` is overridden to return a real seeded User row (so the
  Subscription FK `user_id` is consistent and the DB query is exercised).
- `get_db` is overridden to yield the in-memory SQLite session.
- `app.api.stripe_routes.get_stripe` is monkeypatched to a FakeStripe.

Covers all 9 cases from the spec's Testing section.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.models.schemas import Base, User, Subscription
from app.models.database import get_db
from app.api.auth_routes import get_current_user


# ---------------------------------------------------------------------------
# Fixtures / fakes
# ---------------------------------------------------------------------------

CUSTOMER_ID = "cus_test"


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        yield s
    await engine.dispose()


@pytest_asyncio.fixture
async def stub_user(db_session):
    """A real persisted user with a stripe_customer_id."""
    u = User(
        username="payer",
        password_hash="x",
        email="payer@test.local",
        stripe_customer_id=CUSTOMER_ID,
    )
    db_session.add(u)
    await db_session.flush()
    return u


class FakeStripeError(Exception):
    pass


class FakeStripe:
    """Minimal stand-in for the `stripe` module used by stripe_routes.

    Configure:
      - pm_ids:        ids returned by PaymentMethod.list(...).data
      - pm_customer:   value of PaymentMethod.retrieve(id).customer
      - default_pm:    customer.invoice_settings.default_payment_method
    Records:
      - detached:      list of pm ids passed to PaymentMethod.detach
      - modify_calls:  list of (customer_id, invoice_settings) from Customer.modify
    """

    def __init__(self, pm_ids, pm_customer=CUSTOMER_ID, default_pm=None):
        self._pm_ids = list(pm_ids)
        self._pm_customer = pm_customer
        self._default_pm = default_pm
        self.detached: list[str] = []
        self.modify_calls: list[tuple[str, dict]] = []
        self._detach_seen_at_modify_count: list[int] = []

        outer = self

        class PaymentMethod:
            @staticmethod
            def list(customer=None, type=None):
                assert customer == CUSTOMER_ID
                assert type == "card"
                return SimpleNamespace(
                    data=[SimpleNamespace(id=i) for i in outer._pm_ids]
                )

            @staticmethod
            def retrieve(pm_id):
                return SimpleNamespace(customer=outer._pm_customer)

            @staticmethod
            def detach(pm_id):
                outer.detached.append(pm_id)
                return SimpleNamespace(id=pm_id)

        class Customer:
            @staticmethod
            def retrieve(cid):
                return SimpleNamespace(
                    invoice_settings=SimpleNamespace(
                        default_payment_method=outer._default_pm
                    )
                )

            @staticmethod
            def modify(cid, invoice_settings=None):
                # Record the modify call AND whether a detach already happened,
                # so tests can assert modify ran BEFORE detach.
                outer.modify_calls.append((cid, invoice_settings))
                outer._detach_seen_at_modify_count.append(len(outer.detached))
                return SimpleNamespace(id=cid)

        self.PaymentMethod = PaymentMethod
        self.Customer = Customer


def _app(db_session, stub_user, monkeypatch, fake_stripe):
    from app.main import app
    import app.api.stripe_routes as sr

    async def _override_get_db():
        yield db_session

    async def _override_get_current_user():
        return stub_user

    monkeypatch.setattr(sr, "get_stripe", lambda: fake_stripe)
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _override_get_current_user
    return app


async def _delete(app, pm_id):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.delete(f"/api/stripe/payment-methods/{pm_id}")


def _sub(user_id, **kw):
    base = dict(
        user_id=user_id,
        stripe_subscription_id="sub_123",
        plan_type="pro_monthly",
        status="active",
        cancel_at_period_end=False,
    )
    base.update(kw)
    return Subscription(**base)


# ---------------------------------------------------------------------------
# Cases (numbered per spec Testing section)
# ---------------------------------------------------------------------------


async def test_case1_last_card_renewing_sub_blocks_409_no_detach(
    db_session, stub_user, monkeypatch
):
    """1. Last card + renewing recurring sub → 409, detach NOT called."""
    db_session.add(_sub(stub_user.id))
    await db_session.flush()
    fake = FakeStripe(pm_ids=["pm_only"])
    app = _app(db_session, stub_user, monkeypatch, fake)
    try:
        resp = await _delete(app, "pm_only")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 409
    assert resp.json()["detail"] == "payment_method_required"
    assert fake.detached == []


async def test_case2_last_card_cancel_at_period_end_true_allowed(
    db_session, stub_user, monkeypatch
):
    """2. Last card + sub cancel_at_period_end=True → allowed (detach called)."""
    db_session.add(_sub(stub_user.id, cancel_at_period_end=True))
    await db_session.flush()
    fake = FakeStripe(pm_ids=["pm_only"])
    app = _app(db_session, stub_user, monkeypatch, fake)
    try:
        resp = await _delete(app, "pm_only")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert fake.detached == ["pm_only"]


async def test_case3_last_card_internal_trial_no_sub_id_allowed(
    db_session, stub_user, monkeypatch
):
    """3. Last card + only internal trial (no stripe_subscription_id) → allowed."""
    db_session.add(
        _sub(stub_user.id, stripe_subscription_id=None, plan_type="trial",
             status="trialing")
    )
    await db_session.flush()
    fake = FakeStripe(pm_ids=["pm_only"])
    app = _app(db_session, stub_user, monkeypatch, fake)
    try:
        resp = await _delete(app, "pm_only")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert fake.detached == ["pm_only"]


async def test_case4_last_card_one_time_event_allowed(
    db_session, stub_user, monkeypatch
):
    """4. Last card + only one-time/event (sub_id NULL, plan_type='event') → allowed."""
    db_session.add(
        _sub(stub_user.id, stripe_subscription_id=None, plan_type="event",
             status="active")
    )
    await db_session.flush()
    fake = FakeStripe(pm_ids=["pm_only"])
    app = _app(db_session, stub_user, monkeypatch, fake)
    try:
        resp = await _delete(app, "pm_only")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert fake.detached == ["pm_only"]


async def test_case5_last_card_no_subscriptions_allowed(
    db_session, stub_user, monkeypatch
):
    """5. Last card + no subscription rows → allowed."""
    fake = FakeStripe(pm_ids=["pm_only"])
    app = _app(db_session, stub_user, monkeypatch, fake)
    try:
        resp = await _delete(app, "pm_only")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert fake.detached == ["pm_only"]


async def test_case6_non_last_card_renewing_sub_allowed(
    db_session, stub_user, monkeypatch
):
    """6. Non-last card + renewing sub → allowed (detach called); 409 NOT raised."""
    db_session.add(_sub(stub_user.id))
    await db_session.flush()
    # Two cards; deleting one leaves another → not the last card.
    fake = FakeStripe(pm_ids=["pm_a", "pm_b"], default_pm="pm_b")
    app = _app(db_session, stub_user, monkeypatch, fake)
    try:
        resp = await _delete(app, "pm_a")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert fake.detached == ["pm_a"]
    # We deleted a non-default card → no default promotion needed.
    assert fake.modify_calls == []


async def test_case7_delete_default_with_others_promotes_then_detaches(
    db_session, stub_user, monkeypatch
):
    """7. Deleting the default card while ≥1 other remains → Customer.modify sets
    remaining[0] as default BEFORE detach; detach called."""
    fake = FakeStripe(pm_ids=["pm_default", "pm_other"], default_pm="pm_default")
    app = _app(db_session, stub_user, monkeypatch, fake)
    try:
        resp = await _delete(app, "pm_default")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    # modify called once, with remaining[0] == "pm_other"
    assert fake.modify_calls == [
        (CUSTOMER_ID, {"default_payment_method": "pm_other"})
    ]
    # modify happened BEFORE detach (0 detaches recorded at modify time)
    assert fake._detach_seen_at_modify_count == [0]
    assert fake.detached == ["pm_default"]


async def test_case8_ownership_mismatch_403_no_detach(
    db_session, stub_user, monkeypatch
):
    """8. PM ownership mismatch → 403 (unchanged), detach NOT called."""
    fake = FakeStripe(pm_ids=["pm_x"], pm_customer="cus_someone_else")
    app = _app(db_session, stub_user, monkeypatch, fake)
    try:
        resp = await _delete(app, "pm_x")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 403
    assert fake.detached == []
    assert fake.modify_calls == []


async def test_case9_cancel_at_period_end_null_legacy_still_blocks(
    db_session, stub_user, monkeypatch
):
    """9. cancel_at_period_end NULL legacy row treated as not-cancelling → still
    blocks (case 1 variant with NULL)."""
    db_session.add(_sub(stub_user.id, cancel_at_period_end=None))
    await db_session.flush()
    fake = FakeStripe(pm_ids=["pm_only"])
    app = _app(db_session, stub_user, monkeypatch, fake)
    try:
        resp = await _delete(app, "pm_only")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 409
    assert resp.json()["detail"] == "payment_method_required"
    assert fake.detached == []
