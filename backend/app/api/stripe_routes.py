"""Stripe payment integration: checkout sessions, webhooks, customer portal."""

import logging
import stripe
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.models.database import get_db
from app.models.schemas import User, Subscription, UserCircuitAccess, Circuit
from app.api.auth_routes import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stripe", tags=["stripe"])


def get_stripe():
    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key
    return stripe


# Plan config mapping
PLAN_CONFIG = {
    "basic_monthly": {"max_devices": 2, "tabs": ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config"]},
    "basic_annual": {"max_devices": 2, "tabs": ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config"]},
    "pro_monthly": {"max_devices": 5, "tabs": ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config", "replay", "analytics", "insights"]},
    "pro_annual": {"max_devices": 5, "tabs": ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config", "replay", "analytics", "insights"]},
    "event": {"max_devices": 3, "tabs": ["race", "pit", "live", "config", "adjusted", "adjusted-beta", "driver", "driver-config", "replay", "analytics", "insights"]},
}


def _price_to_plan(price_id: str) -> str | None:
    settings = get_settings()
    mapping = {
        settings.stripe_basic_monthly_price_id: "basic_monthly",
        settings.stripe_basic_annual_price_id: "basic_annual",
        settings.stripe_pro_monthly_price_id: "pro_monthly",
        settings.stripe_pro_annual_price_id: "pro_annual",
        settings.stripe_event_price_id: "event",
    }
    return mapping.get(price_id)


def _plan_to_price(plan: str) -> str | None:
    settings = get_settings()
    mapping = {
        "basic_monthly": settings.stripe_basic_monthly_price_id,
        "basic_annual": settings.stripe_basic_annual_price_id,
        "pro_monthly": settings.stripe_pro_monthly_price_id,
        "pro_annual": settings.stripe_pro_annual_price_id,
        "event": settings.stripe_event_price_id,
    }
    return mapping.get(plan)


def _calc_plan_valid_until(plan_type: str, from_date: datetime) -> datetime:
    """Calculate valid_until using exact calendar month/year arithmetic."""
    from dateutil.relativedelta import relativedelta

    if plan_type in ("basic_monthly", "pro_monthly"):
        return from_date + relativedelta(months=1)
    elif plan_type in ("basic_annual", "pro_annual"):
        return from_date + relativedelta(years=1)
    elif plan_type == "event":
        return from_date + timedelta(hours=48)
    else:
        return from_date + relativedelta(months=1)


async def _grant_circuit_access(
    db: AsyncSession, user_id: int, circuit_id: int, plan_type: str,
    period_end: datetime | None = None,
):
    """Grant or extend circuit access for a user based on plan type."""
    now = datetime.now(timezone.utc)

    # If we have an explicit period_end from Stripe invoice, use it + 3 days grace
    if period_end:
        valid_until = period_end + timedelta(days=3)
    else:
        # Initial grant: exact calendar month/year from now
        valid_until = _calc_plan_valid_until(plan_type, now)

    # Upsert: update existing or create new
    result = await db.execute(
        select(UserCircuitAccess).where(
            UserCircuitAccess.user_id == user_id,
            UserCircuitAccess.circuit_id == circuit_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        # Extend: use the later of current valid_until or new valid_until
        # Normalize naive datetimes from SQLite to UTC-aware before comparing
        ex_until = existing.valid_until
        if ex_until and ex_until.tzinfo is None:
            ex_until = ex_until.replace(tzinfo=timezone.utc)
        existing.valid_until = max(ex_until, valid_until) if ex_until else valid_until
        ex_from = existing.valid_from
        if ex_from and ex_from.tzinfo is None:
            ex_from = ex_from.replace(tzinfo=timezone.utc)
        if ex_from and ex_from > now:
            existing.valid_from = now
    else:
        db.add(UserCircuitAccess(
            user_id=user_id,
            circuit_id=circuit_id,
            valid_from=now,
            valid_until=valid_until,
        ))


@router.get("/circuits")
async def list_circuits_for_checkout(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List circuits available for subscription — excludes circuits the user already has an active subscription for."""
    # Get circuit IDs with active subscriptions
    active_result = await db.execute(
        select(Subscription.circuit_id).where(
            Subscription.user_id == user.id,
            Subscription.status.in_(("active", "trialing")),
            Subscription.circuit_id.isnot(None),
        )
    )
    active_circuit_ids = {row[0] for row in active_result.fetchall()}

    result = await db.execute(select(Circuit).order_by(Circuit.name))
    return [
        {"id": c.id, "name": c.name}
        for c in result.scalars().all()
        if c.id not in active_circuit_ids
    ]


@router.post("/create-checkout-session")
async def create_checkout_session(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    price_id = body.get("price_id")
    plan = body.get("plan")  # Alternative: accept plan name like "pro_monthly"
    circuit_id = body.get("circuit_id")

    # Resolve plan name to price_id if provided
    if not price_id and plan:
        price_id = _plan_to_price(plan)
        if not price_id:
            raise HTTPException(400, f"Unknown plan: {plan}")

    if not price_id:
        raise HTTPException(400, "price_id or plan required")

    if not circuit_id:
        raise HTTPException(400, "circuit_id required")

    # Prevent duplicate subscription for same circuit
    existing = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user.id,
            Subscription.circuit_id == circuit_id,
            Subscription.status.in_(("active", "trialing")),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Ya tienes una suscripcion activa para este circuito")

    settings = get_settings()
    s = get_stripe()

    # Get or create Stripe customer
    if not user.stripe_customer_id:
        customer = s.Customer.create(
            email=user.email or f"{user.username}@boxboxnow.local",
            name=user.username,
            metadata={"user_id": str(user.id)},
        )
        user.stripe_customer_id = customer.id
        await db.commit()

    plan_type = _price_to_plan(price_id)
    is_one_time = plan_type == "event"

    session_params = {
        "customer": user.stripe_customer_id,
        "line_items": [{"price": price_id, "quantity": 1}],
        "mode": "payment" if is_one_time else "subscription",
        "success_url": f"{settings.frontend_url}/dashboard?checkout=success",
        "cancel_url": f"{settings.frontend_url}/dashboard?checkout=cancel",
        "metadata": {
            "user_id": str(user.id),
            "plan_type": plan_type or "unknown",
            "circuit_id": str(circuit_id) if circuit_id else "",
        },
    }

    if not is_one_time:
        session_params["subscription_data"] = {
            "metadata": {
                "user_id": str(user.id),
                "plan_type": plan_type or "unknown",
                "circuit_id": str(circuit_id) if circuit_id else "",
            }
        }

    checkout_session = s.checkout.Session.create(**session_params)

    return {"checkout_url": checkout_session.url, "session_id": checkout_session.id}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Stripe webhook events."""
    import json as _json

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    settings = get_settings()
    s = get_stripe()

    try:
        s.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except ValueError:
        raise HTTPException(400, "Invalid payload")
    except Exception as e:
        if "SignatureVerification" in type(e).__name__:
            raise HTTPException(400, "Invalid signature")
        logger.error(f"Stripe webhook signature error: {e}")
        raise HTTPException(400, "Webhook verification failed")

    # Parse raw JSON to plain dicts — stripe-python v15 StripeObjects don't support .get()
    raw_event = _json.loads(payload)
    event_type = raw_event["type"]
    data = raw_event["data"]["object"]

    logger.info(f"Stripe webhook received: {event_type} (id={raw_event.get('id', '?')})")

    try:
        if event_type == "checkout.session.completed":
            await _handle_checkout_completed(data, db, s)
        elif event_type == "invoice.paid":
            await _handle_invoice_paid(data, db)
        elif event_type == "customer.subscription.updated":
            await _handle_subscription_updated(data, db)
        elif event_type == "customer.subscription.deleted":
            await _handle_subscription_deleted(data, db)
    except Exception as e:
        logger.error(f"Stripe webhook handler error ({event_type}): {e}", exc_info=True)
        raise HTTPException(500, f"Webhook handler error: {e}")

    return {"received": True}


async def _handle_checkout_completed(session_data: dict, db: AsyncSession, s):
    metadata = session_data.get("metadata", {})
    user_id = int(metadata.get("user_id", 0))
    plan_type = metadata.get("plan_type", "")
    circuit_id = int(metadata.get("circuit_id")) if metadata.get("circuit_id") else None

    if not user_id:
        return

    if session_data.get("mode") == "subscription":
        # Subscription: details come from subscription.updated webhook
        sub_id = session_data.get("subscription")
        if sub_id:
            # Cancel any trial subscription for this user
            trial_result = await db.execute(
                select(Subscription).where(
                    Subscription.user_id == user_id,
                    Subscription.plan_type == "trial",
                    Subscription.status == "trialing",
                )
            )
            for trial_sub in trial_result.scalars().all():
                trial_sub.status = "canceled"

            # Retrieve subscription from Stripe for price_id and calculate period
            stripe_price_id = None
            period_start = datetime.now(timezone.utc)
            period_end = None
            try:
                sub_obj = s.Subscription.retrieve(sub_id, expand=["items.data"])
                if sub_obj.get("start_date"):
                    period_start = datetime.fromtimestamp(sub_obj["start_date"], tz=timezone.utc)
                # Calculate period_end from plan interval (Stripe v15+ removed current_period_end)
                period_end = _calc_plan_valid_until(plan_type, period_start)
                if sub_obj.items and sub_obj.items.data:
                    stripe_price_id = sub_obj.items.data[0].price.id
            except Exception as e:
                logger.warning(f"Could not retrieve subscription details: {e}")
                period_end = _calc_plan_valid_until(plan_type, period_start)

            sub = Subscription(
                user_id=user_id,
                stripe_subscription_id=sub_id,
                plan_type=plan_type,
                status="active",
                circuit_id=circuit_id,
                current_period_start=period_start,
                current_period_end=period_end,
            )
            db.add(sub)

            # Grant circuit access for the selected circuit
            if circuit_id:
                await _grant_circuit_access(db, user_id, circuit_id, plan_type)

            await _apply_plan_to_user(user_id, plan_type, db, stripe_price_id=stripe_price_id)
            await db.commit()

            # Send confirmation email with circuit name
            user_result = await db.execute(select(User).where(User.id == user_id))
            _user = user_result.scalar_one_or_none()
            circuit_name = None
            if circuit_id:
                circuit_result = await db.execute(select(Circuit).where(Circuit.id == circuit_id))
                _circuit = circuit_result.scalar_one_or_none()
                circuit_name = _circuit.name if _circuit else None
            if _user and _user.email:
                from app.services.email_service import send_subscription_confirmation_email
                import asyncio
                plan_names = {"basic_monthly": "Basico Mensual", "basic_annual": "Basico Anual",
                              "pro_monthly": "Pro Mensual", "pro_annual": "Pro Anual", "event": "Evento"}
                asyncio.create_task(send_subscription_confirmation_email(
                    _user.email, _user.username, plan_names.get(plan_type, plan_type), circuit_name))

    elif session_data.get("mode") == "payment":
        # One-time payment (event)
        sub = Subscription(
            user_id=user_id,
            plan_type=plan_type,
            status="active",
            circuit_id=circuit_id,
            current_period_start=datetime.now(timezone.utc),
            current_period_end=datetime.now(timezone.utc) + timedelta(hours=48),
        )
        db.add(sub)

        if circuit_id:
            await _grant_circuit_access(db, user_id, circuit_id, plan_type)

        # Extract price_id from checkout session line items
        stripe_price_id = None
        checkout_id = session_data.get("id")
        if checkout_id:
            try:
                line_items = s.checkout.Session.list_line_items(checkout_id)
                if line_items.data:
                    stripe_price_id = line_items.data[0].price.id
            except Exception as e:
                logger.warning(f"Could not retrieve checkout price_id: {e}")

        await _apply_plan_to_user(user_id, plan_type, db, stripe_price_id=stripe_price_id)
        await db.commit()

        # Send event confirmation email
        user_result = await db.execute(select(User).where(User.id == user_id))
        _user = user_result.scalar_one_or_none()
        circuit_name = None
        if circuit_id:
            circuit_result = await db.execute(select(Circuit).where(Circuit.id == circuit_id))
            _circuit = circuit_result.scalar_one_or_none()
            circuit_name = _circuit.name if _circuit else None
        if _user and _user.email:
            from app.services.email_service import send_subscription_confirmation_email
            import asyncio
            asyncio.create_task(send_subscription_confirmation_email(
                _user.email, _user.username, "Evento", circuit_name))


async def _handle_invoice_paid(invoice_data: dict, db: AsyncSession):
    """Handle recurring invoice payment — extend subscription and circuit access."""
    sub_id = invoice_data.get("subscription")
    if not sub_id:
        return

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == sub_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        # Calculate period from Stripe subscription start_date + plan interval
        # (Stripe v15+ removed current_period_start/end from Subscription object)
        import stripe as s
        now = datetime.now(timezone.utc)
        try:
            stripe_sub = s.Subscription.retrieve(sub_id)
            if stripe_sub.get("start_date"):
                sub.current_period_start = datetime.fromtimestamp(stripe_sub["start_date"], tz=timezone.utc)
            else:
                sub.current_period_start = now
            sub.current_period_end = _calc_plan_valid_until(sub.plan_type, sub.current_period_start)
        except Exception as e:
            logger.warning(f"Could not retrieve subscription from Stripe: {e}")
            sub.current_period_start = now
            sub.current_period_end = _calc_plan_valid_until(sub.plan_type, now)

        sub.status = "active"

        # Extend circuit access with new period end
        if sub.circuit_id and sub.current_period_end:
            await _grant_circuit_access(
                db, sub.user_id, sub.circuit_id, sub.plan_type,
                period_end=sub.current_period_end,
            )

        await db.commit()
        logger.info(f"Invoice paid: user={sub.user_id} plan={sub.plan_type} circuit={sub.circuit_id} until={sub.current_period_end}")


async def _handle_subscription_updated(sub_data: dict, db: AsyncSession):
    """Handle subscription status changes — sync circuit access dates."""
    sub_id = sub_data.get("id")
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == sub_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = sub_data.get("status", sub.status)
        sub.cancel_at_period_end = sub_data.get("cancel_at_period_end", False)

        current_period_end = sub_data.get("current_period_end")
        if current_period_end:
            sub.current_period_end = datetime.fromtimestamp(current_period_end, tz=timezone.utc)

        current_period_start = sub_data.get("current_period_start")
        if current_period_start:
            sub.current_period_start = datetime.fromtimestamp(current_period_start, tz=timezone.utc)

        # Sync circuit access if subscription is still active
        if sub.circuit_id and sub.current_period_end and sub.status in ("active", "trialing"):
            await _grant_circuit_access(
                db, sub.user_id, sub.circuit_id, sub.plan_type,
                period_end=sub.current_period_end,
            )

        await db.commit()
        logger.info(f"Subscription updated: sub={sub_id} status={sub.status} cancel_at_end={sub.cancel_at_period_end}")


async def _handle_subscription_deleted(sub_data: dict, db: AsyncSession):
    """Handle subscription cancellation — expire circuit access immediately."""
    sub_id = sub_data.get("id")
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == sub_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = "canceled"

        # Expire circuit access (set valid_until to now — immediate revocation)
        if sub.circuit_id:
            access_result = await db.execute(
                select(UserCircuitAccess).where(
                    UserCircuitAccess.user_id == sub.user_id,
                    UserCircuitAccess.circuit_id == sub.circuit_id,
                )
            )
            access = access_result.scalar_one_or_none()
            if access:
                access.valid_until = datetime.now(timezone.utc)

        await db.commit()
        logger.info(f"Subscription deleted: sub={sub_id} user={sub.user_id} circuit={sub.circuit_id}")


async def _apply_plan_to_user(user_id: int, plan_type: str, db: AsyncSession, stripe_price_id: str | None = None):
    """Apply plan capabilities to user (max_devices, tab access).

    Looks up product_tab_config by stripe_price_id first.
    Falls back to plan_type lookup, then hardcoded PLAN_CONFIG.
    """
    import json as _json
    from app.models.schemas import UserTabAccess, ProductTabConfig

    tabs: list[str] = []
    max_devices: int = 1

    # Try DB config first (by stripe_price_id)
    if stripe_price_id:
        result = await db.execute(
            select(ProductTabConfig).where(ProductTabConfig.stripe_price_id == stripe_price_id)
        )
        config_row = result.scalar_one_or_none()
        if config_row:
            tabs = _json.loads(config_row.tabs) if config_row.tabs else []
            max_devices = config_row.max_devices
        else:
            logger.warning(f"No product_tab_config for stripe_price_id={stripe_price_id}, trying plan_type")

    # Try DB config by plan_type
    if not tabs and plan_type:
        result = await db.execute(
            select(ProductTabConfig).where(ProductTabConfig.plan_type == plan_type)
        )
        config_row = result.scalar_one_or_none()
        if config_row:
            tabs = _json.loads(config_row.tabs) if config_row.tabs else []
            max_devices = config_row.max_devices
        else:
            logger.warning(f"No product_tab_config for plan_type={plan_type}, falling back to PLAN_CONFIG")

    # Fallback to hardcoded PLAN_CONFIG if DB didn't match
    if not tabs:
        config = PLAN_CONFIG.get(plan_type)
        if not config:
            logger.warning(f"No config found for plan_type={plan_type}")
            return
        tabs = config["tabs"]
        max_devices = config["max_devices"]

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return

    user.max_devices = max(user.max_devices, max_devices)

    # Add tabs (don't remove existing)
    for tab in tabs:
        existing = await db.execute(
            select(UserTabAccess).where(
                UserTabAccess.user_id == user_id,
                UserTabAccess.tab == tab,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(UserTabAccess(user_id=user_id, tab=tab))


@router.get("/subscriptions")
async def list_subscriptions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List user's subscriptions."""
    from sqlalchemy.orm import selectinload

    # Fetch prices from Stripe for active subscriptions
    s = get_stripe()
    stripe_prices: dict[str, dict] = {}  # stripe_sub_id -> {amount, currency, interval}
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user.id)
        .options(selectinload(Subscription.circuit))
        .order_by(Subscription.created_at.desc())
    )
    subs = result.scalars().all()

    # Batch-fetch Stripe subscription data for price info
    for sub in subs:
        if sub.stripe_subscription_id and sub.status in ("active", "trialing"):
            try:
                stripe_sub = s.Subscription.retrieve(sub.stripe_subscription_id)
                if stripe_sub.get("items") and stripe_sub["items"]["data"]:
                    item = stripe_sub["items"]["data"][0]
                    price = item.get("price", {})
                    stripe_prices[sub.stripe_subscription_id] = {
                        "amount": price.get("unit_amount", 0) / 100,
                        "currency": price.get("currency", "eur"),
                        "interval": price.get("recurring", {}).get("interval", "month"),
                    }
            except Exception:
                pass

    return [
        {
            "id": s_row.id,
            "plan_type": s_row.plan_type,
            "status": s_row.status,
            "circuit_id": s_row.circuit_id,
            "circuit_name": s_row.circuit.name if s_row.circuit else None,
            "current_period_start": s_row.current_period_start.isoformat() if s_row.current_period_start else None,
            "current_period_end": s_row.current_period_end.isoformat() if s_row.current_period_end else None,
            "cancel_at_period_end": s_row.cancel_at_period_end,
            "created_at": s_row.created_at.isoformat() if s_row.created_at else None,
            **(stripe_prices.get(s_row.stripe_subscription_id, {})),
        }
        for s_row in subs
    ]


@router.post("/customer-portal")
async def customer_portal(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create Stripe Customer Portal session."""
    settings = get_settings()
    s = get_stripe()

    if not user.stripe_customer_id:
        raise HTTPException(400, "No Stripe customer found")

    portal_session = s.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=f"{settings.frontend_url}/dashboard",
    )

    return {"url": portal_session.url}


@router.post("/subscriptions/{sub_id}/cancel")
async def cancel_subscription(
    sub_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel subscription at end of billing period (don't renew)."""
    s = get_stripe()
    result = await db.execute(
        select(Subscription).where(Subscription.id == sub_id, Subscription.user_id == user.id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Subscription not found")
    if sub.status not in ("active", "trialing"):
        raise HTTPException(400, "Subscription is not active")
    if not sub.stripe_subscription_id:
        raise HTTPException(400, "No Stripe subscription linked")

    s.Subscription.modify(sub.stripe_subscription_id, cancel_at_period_end=True)
    sub.cancel_at_period_end = True
    await db.commit()
    return {"ok": True, "cancel_at_period_end": True}


@router.post("/subscriptions/{sub_id}/reactivate")
async def reactivate_subscription(
    sub_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reactivate a subscription that was set to cancel at period end."""
    s = get_stripe()
    result = await db.execute(
        select(Subscription).where(Subscription.id == sub_id, Subscription.user_id == user.id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Subscription not found")
    if not sub.cancel_at_period_end:
        raise HTTPException(400, "Subscription is not set to cancel")
    if not sub.stripe_subscription_id:
        raise HTTPException(400, "No Stripe subscription linked")

    s.Subscription.modify(sub.stripe_subscription_id, cancel_at_period_end=False)
    sub.cancel_at_period_end = False
    await db.commit()
    return {"ok": True, "cancel_at_period_end": False}


@router.post("/subscriptions/{sub_id}/switch-plan")
async def switch_plan(
    sub_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Switch subscription plan (e.g. monthly↔annual). Applies at next renewal."""
    body = await request.json()
    new_plan = body.get("plan")  # e.g. "basic_annual", "pro_monthly"
    if not new_plan:
        raise HTTPException(400, "plan required")

    new_price_id = _plan_to_price(new_plan)
    if not new_price_id:
        raise HTTPException(400, f"Unknown plan: {new_plan}")

    s = get_stripe()
    result = await db.execute(
        select(Subscription).where(Subscription.id == sub_id, Subscription.user_id == user.id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Subscription not found")
    if sub.status not in ("active", "trialing"):
        raise HTTPException(400, "Subscription is not active")
    if not sub.stripe_subscription_id:
        raise HTTPException(400, "No Stripe subscription linked")

    # Get current subscription item ID from Stripe
    try:
        stripe_sub = s.Subscription.retrieve(sub.stripe_subscription_id, expand=["items"])
    except Exception as e:
        raise HTTPException(400, f"Could not retrieve Stripe subscription: {e}")
    if not stripe_sub.get("items") or not stripe_sub["items"]["data"]:
        raise HTTPException(400, "No subscription items found")

    item_id = stripe_sub["items"]["data"][0]["id"]

    # Change price immediately without proration
    try:
        s.Subscription.modify(
            sub.stripe_subscription_id,
            items=[{"id": item_id, "price": new_price_id}],
            proration_behavior="none",
        )
    except Exception as e:
        raise HTTPException(400, f"Stripe error: {e}")

    # Update local record
    sub.plan_type = new_plan
    sub.stripe_price_id = new_price_id
    await db.commit()

    return {"ok": True, "new_plan": new_plan}


@router.get("/invoices")
async def list_invoices(
    user: User = Depends(get_current_user),
):
    """List user's Stripe invoices."""
    s = get_stripe()
    if not user.stripe_customer_id:
        return []

    invoices = s.Invoice.list(customer=user.stripe_customer_id, limit=50)
    return [
        {
            "id": inv.id,
            "number": inv.number,
            "amount_paid": inv.amount_paid / 100,
            "currency": inv.currency,
            "status": inv.status,
            "created": datetime.fromtimestamp(inv.created, tz=timezone.utc).isoformat(),
            "invoice_pdf": inv.invoice_pdf,
            "hosted_invoice_url": inv.hosted_invoice_url,
        }
        for inv in invoices.data
        if inv.status == "paid"
    ]
