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


@router.post("/create-checkout-session")
async def create_checkout_session(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.json()
    price_id = body.get("price_id")
    circuit_id = body.get("circuit_id")

    if not price_id:
        raise HTTPException(400, "price_id required")

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
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    settings = get_settings()
    s = get_stripe()

    try:
        event = s.Webhook.construct_event(payload, sig_header, settings.stripe_webhook_secret)
    except ValueError:
        raise HTTPException(400, "Invalid payload")
    except s.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")

    event_type = event["type"]
    data = event["data"]["object"]

    logger.info(f"Stripe webhook: {event_type}")

    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(data, db, s)
    elif event_type == "invoice.paid":
        await _handle_invoice_paid(data, db)
    elif event_type == "customer.subscription.updated":
        await _handle_subscription_updated(data, db)
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(data, db)

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

            sub = Subscription(
                user_id=user_id,
                stripe_subscription_id=sub_id,
                plan_type=plan_type,
                status="active",
                circuit_id=circuit_id,
            )
            db.add(sub)

            # Grant circuit access
            if circuit_id:
                access = UserCircuitAccess(
                    user_id=user_id,
                    circuit_id=circuit_id,
                    valid_from=datetime.now(timezone.utc),
                    valid_until=datetime.now(timezone.utc) + timedelta(days=365 * 10),  # Far future, managed by sub
                )
                db.add(access)

            # Update user plan capabilities
            await _apply_plan_to_user(user_id, plan_type, db)
            await db.commit()

            # Send confirmation email
            user_result = await db.execute(select(User).where(User.id == user_id))
            _user = user_result.scalar_one_or_none()
            if _user and _user.email:
                from app.services.email_service import send_subscription_confirmation_email
                import asyncio
                plan_names = {"basic_monthly": "Basico Mensual", "basic_annual": "Basico Anual",
                              "pro_monthly": "Pro Mensual", "pro_annual": "Pro Anual", "event": "Evento"}
                asyncio.create_task(send_subscription_confirmation_email(
                    _user.email, _user.username, plan_names.get(plan_type, plan_type)))

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
            access = UserCircuitAccess(
                user_id=user_id,
                circuit_id=circuit_id,
                valid_from=datetime.now(timezone.utc),
                valid_until=datetime.now(timezone.utc) + timedelta(hours=48),
            )
            db.add(access)

        await _apply_plan_to_user(user_id, plan_type, db)
        await db.commit()


async def _handle_invoice_paid(invoice_data: dict, db: AsyncSession):
    sub_id = invoice_data.get("subscription")
    if not sub_id:
        return

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == sub_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        period_start = invoice_data.get("period_start")
        period_end = invoice_data.get("period_end")
        if period_start:
            sub.current_period_start = datetime.fromtimestamp(period_start, tz=timezone.utc)
        if period_end:
            sub.current_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)
        sub.status = "active"

        # Extend circuit access
        if sub.circuit_id and sub.current_period_end:
            result2 = await db.execute(
                select(UserCircuitAccess).where(
                    UserCircuitAccess.user_id == sub.user_id,
                    UserCircuitAccess.circuit_id == sub.circuit_id,
                )
            )
            access = result2.scalar_one_or_none()
            if access:
                access.valid_until = sub.current_period_end + timedelta(days=3)  # Grace period

        await db.commit()


async def _handle_subscription_updated(sub_data: dict, db: AsyncSession):
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

        await db.commit()


async def _handle_subscription_deleted(sub_data: dict, db: AsyncSession):
    sub_id = sub_data.get("id")
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == sub_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = "canceled"
        await db.commit()


async def _apply_plan_to_user(user_id: int, plan_type: str, db: AsyncSession):
    """Apply plan capabilities to user (max_devices, tab access)."""
    from app.models.schemas import UserTabAccess

    config = PLAN_CONFIG.get(plan_type)
    if not config:
        return

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return

    user.max_devices = max(user.max_devices, config["max_devices"])

    # Add tabs (don't remove existing)
    for tab in config["tabs"]:
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
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user.id)
        .options(selectinload(Subscription.circuit))
        .order_by(Subscription.created_at.desc())
    )
    subs = result.scalars().all()
    return [
        {
            "id": s.id,
            "plan_type": s.plan_type,
            "status": s.status,
            "circuit_id": s.circuit_id,
            "circuit_name": s.circuit.name if s.circuit else None,
            "current_period_start": s.current_period_start.isoformat() if s.current_period_start else None,
            "current_period_end": s.current_period_end.isoformat() if s.current_period_end else None,
            "cancel_at_period_end": s.cancel_at_period_end,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in subs
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
