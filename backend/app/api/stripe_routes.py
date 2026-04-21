"""Stripe payment integration: checkout sessions, webhooks, customer portal."""

import logging
import stripe
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.models.database import get_db
from app.models.schemas import User, Subscription, UserCircuitAccess, Circuit, ProductTabConfig
from app.api.auth_routes import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stripe", tags=["stripe"])


def get_stripe():
    settings = get_settings()
    stripe.api_key = settings.stripe_secret_key
    return stripe


# ProductTabConfig is the single source of truth for plan capabilities,
# billing interval and per-circuit behaviour. The legacy PLAN_CONFIG dict
# and env-var price mappings have been removed — everything is looked up
# against the DB via stripe_price_id.


async def _get_config_by_price(db: AsyncSession, price_id: str | None) -> ProductTabConfig | None:
    """Resolve a ProductTabConfig row from a Stripe price id."""
    if not price_id:
        return None
    result = await db.execute(
        select(ProductTabConfig).where(ProductTabConfig.stripe_price_id == price_id)
    )
    return result.scalar_one_or_none()


async def _get_config_by_plan_type(db: AsyncSession, plan_type: str | None) -> ProductTabConfig | None:
    """Resolve a ProductTabConfig row from a plan_type label.

    plan_type is no longer unique, so this returns the first matching row
    (sorted by id) for legacy callers that only know the label.
    """
    if not plan_type:
        return None
    result = await db.execute(
        select(ProductTabConfig)
        .where(ProductTabConfig.plan_type == plan_type)
        .order_by(ProductTabConfig.id)
    )
    return result.scalars().first()


def _calc_valid_until(config: ProductTabConfig | None, from_date: datetime) -> datetime:
    """Calculate valid_until from the config's billing_interval.

    Falls back to a 1-month window when no config/interval is available,
    matching the legacy default used to be applied for subscriptions.
    """
    from dateutil.relativedelta import relativedelta

    interval = (config.billing_interval if config and config.billing_interval else "month").lower()
    if interval == "year":
        return from_date + relativedelta(years=1)
    if interval in ("one_time", "event"):
        return from_date + timedelta(hours=48)
    return from_date + relativedelta(months=1)


async def _grant_circuit_access(
    db: AsyncSession, user_id: int, circuit_id: int,
    config: ProductTabConfig | None = None,
    period_end: datetime | None = None,
    event_start: datetime | None = None,
    event_end: datetime | None = None,
):
    """Grant or extend circuit access for a user based on a ProductTabConfig row."""
    now = datetime.now(timezone.utc)

    if event_start and event_end:
        # Event with specific dates
        valid_from = event_start
        valid_until = event_end
    elif period_end:
        # Renewal from Stripe invoice: use period_end + 3 days grace
        valid_from = now
        valid_until = period_end + timedelta(days=3)
    else:
        # Initial grant: derive window from config billing_interval
        valid_from = now
        valid_until = _calc_valid_until(config, now)

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
        if ex_from and ex_from > valid_from:
            existing.valid_from = valid_from
    else:
        db.add(UserCircuitAccess(
            user_id=user_id,
            circuit_id=circuit_id,
            valid_from=valid_from,
            valid_until=valid_until,
        ))


def _config_is_per_circuit(config: ProductTabConfig | None) -> bool:
    """Return the per_circuit flag for a config row (defaults to True if unknown)."""
    if not config:
        return True
    return bool(config.per_circuit) if config.per_circuit is not None else True


async def _grant_all_circuits_access(
    db: AsyncSession, user_id: int,
    config: ProductTabConfig | None = None,
    period_end: datetime | None = None,
    event_start: datetime | None = None,
    event_end: datetime | None = None,
):
    """Grant circuit access to every existing circuit (for products sold cross-circuit)."""
    result = await db.execute(select(Circuit.id))
    circuit_ids = [row[0] for row in result.all()]
    for cid in circuit_ids:
        await _grant_circuit_access(
            db, user_id, cid,
            config=config,
            period_end=period_end,
            event_start=event_start,
            event_end=event_end,
        )


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
    plan = body.get("plan")  # Legacy: accept plan label like "pro_monthly" (resolved via DB)
    circuit_id = body.get("circuit_id")
    event_dates = body.get("event_dates")  # e.g. ["2026-04-15"] or ["2026-04-15", "2026-04-16"]

    # Legacy plan-label path — find the first matching row with that label
    if not price_id and plan:
        legacy_config = await _get_config_by_plan_type(db, plan)
        if not legacy_config:
            raise HTTPException(400, f"Unknown plan: {plan}")
        price_id = legacy_config.stripe_price_id

    if not price_id:
        raise HTTPException(400, "price_id or plan required")

    # Resolve everything we need from the ProductTabConfig row
    config = await _get_config_by_price(db, price_id)
    if not config:
        raise HTTPException(400, f"No product config found for price {price_id}")

    plan_type = config.plan_type
    needs_circuit = _config_is_per_circuit(config)
    is_one_time = (config.billing_interval or "").lower() in ("one_time", "event")

    if needs_circuit and not circuit_id:
        raise HTTPException(400, "circuit_id required")
    if not needs_circuit:
        circuit_id = None  # Ignore any circuit hint for cross-circuit products

    # Prevent duplicate subscription for same circuit (only meaningful for per-circuit plans)
    if needs_circuit:
        existing = await db.execute(
            select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.circuit_id == circuit_id,
                Subscription.status.in_(("active", "trialing")),
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(400, "Ya tienes una suscripcion activa para este circuito")
    else:
        # For global plans, prevent duplicate active subscription at the same price
        existing = await db.execute(
            select(Subscription).where(
                Subscription.user_id == user.id,
                Subscription.stripe_price_id == price_id,
                Subscription.circuit_id.is_(None),
                Subscription.status.in_(("active", "trialing")),
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(400, "Ya tienes una suscripcion activa para este plan")

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

    # Validate event_dates for event plans
    if is_one_time and event_dates:
        if not isinstance(event_dates, list) or len(event_dates) < 1 or len(event_dates) > 2:
            raise HTTPException(400, "event_dates must be a list of 1 or 2 dates")
        # Validate format and consecutiveness
        from datetime import date as date_type
        parsed = []
        for d in event_dates:
            try:
                parsed.append(date_type.fromisoformat(d))
            except (ValueError, TypeError):
                raise HTTPException(400, f"Invalid date format: {d}")
        parsed.sort()
        if len(parsed) == 2 and (parsed[1] - parsed[0]).days != 1:
            raise HTTPException(400, "Event dates must be consecutive")
        today = date_type.today()
        if parsed[0] < today:
            raise HTTPException(400, "Event dates cannot be in the past")

    metadata = {
        "user_id": str(user.id),
        "plan_type": plan_type or "unknown",
        "stripe_price_id": price_id,
        "circuit_id": str(circuit_id) if circuit_id else "",
    }
    if is_one_time and event_dates:
        metadata["event_dates"] = ",".join(event_dates)

    session_params = {
        "customer": user.stripe_customer_id,
        "line_items": [{"price": price_id, "quantity": 1}],
        "mode": "payment" if is_one_time else "subscription",
        "success_url": f"{settings.frontend_url}/dashboard?checkout=success",
        "cancel_url": f"{settings.frontend_url}/dashboard?checkout=cancel",
        "metadata": metadata,
    }

    if not is_one_time:
        session_params["subscription_data"] = {
            "metadata": {
                "user_id": str(user.id),
                "plan_type": plan_type or "unknown",
                "stripe_price_id": price_id,
                "circuit_id": str(circuit_id) if circuit_id else "",
            }
        }

    # Use embedded UI mode — returns client_secret for frontend Stripe.js
    session_params["ui_mode"] = "embedded_page"
    session_params["return_url"] = f"{settings.frontend_url}/dashboard?checkout=success&session_id={{CHECKOUT_SESSION_ID}}"
    # Remove success/cancel URLs (not used in embedded mode)
    session_params.pop("success_url", None)
    session_params.pop("cancel_url", None)

    # Optional tax ID collection so users can request a VAT invoice.
    # Stripe shows a collapsible "Add billing information" field in the
    # checkout form — the user fills it only if they want a fiscal receipt.
    session_params["tax_id_collection"] = {"enabled": True}
    # Collecting billing address is required for tax ID to work properly.
    session_params["billing_address_collection"] = "required"
    # Allow users to update their billing address / tax ID through the
    # Customer Portal as well (applies retroactively to future invoices).
    session_params["customer_update"] = {
        "address": "auto",
        "name": "auto",
    }
    # Automatic tax calculation — Stripe Tax determines the applicable VAT
    # rate based on the customer's billing address collected above.
    # Requires Stripe Tax to be enabled in the dashboard.
    session_params["automatic_tax"] = {"enabled": True}

    checkout_session = s.checkout.Session.create(**session_params)

    return {"client_secret": checkout_session.client_secret, "session_id": checkout_session.id}


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
    circuit_id = int(metadata.get("circuit_id")) if metadata.get("circuit_id") else None
    # Prefer the explicit stripe_price_id stamped into metadata at checkout.
    stripe_price_id = metadata.get("stripe_price_id") or None

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

            # Retrieve subscription from Stripe to pin down price_id + start date
            period_start = datetime.now(timezone.utc)
            try:
                sub_obj = s.Subscription.retrieve(sub_id, expand=["items.data"])
                if sub_obj.get("start_date"):
                    period_start = datetime.fromtimestamp(sub_obj["start_date"], tz=timezone.utc)
                if not stripe_price_id and sub_obj.items and sub_obj.items.data:
                    stripe_price_id = sub_obj.items.data[0].price.id
            except Exception as e:
                logger.warning(f"Could not retrieve subscription details: {e}")

            config = await _get_config_by_price(db, stripe_price_id)
            plan_type = config.plan_type if config else metadata.get("plan_type", "")
            period_end = _calc_valid_until(config, period_start)

            sub = Subscription(
                user_id=user_id,
                stripe_subscription_id=sub_id,
                stripe_price_id=stripe_price_id,
                plan_type=plan_type,
                status="active",
                circuit_id=circuit_id,
                current_period_start=period_start,
                current_period_end=period_end,
            )
            db.add(sub)

            # Grant circuit access: either the selected circuit, or all circuits
            # when the plan is sold cross-circuit (per_circuit=false).
            if circuit_id:
                await _grant_circuit_access(db, user_id, circuit_id, config=config)
            elif not _config_is_per_circuit(config):
                await _grant_all_circuits_access(
                    db, user_id, config=config, period_end=period_end
                )

            if config:
                await _apply_config_to_user(user_id, config, db)
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
                display_label = config.display_name if config and config.display_name else plan_type
                email_tpl = config.email_template if config else None
                asyncio.create_task(send_subscription_confirmation_email(
                    _user.email, _user.username, display_label, circuit_name,
                    email_template=email_tpl))

    elif session_data.get("mode") == "payment":
        # One-time payment (event)
        # Parse event dates from metadata to determine access window
        now = datetime.now(timezone.utc)
        event_dates_str = metadata.get("event_dates", "")
        if event_dates_str:
            from datetime import date as date_type
            dates = sorted([date_type.fromisoformat(d) for d in event_dates_str.split(",")])
            # Access starts at midnight of first day, ends at 23:59:59 of last day
            event_start = datetime(dates[0].year, dates[0].month, dates[0].day, 0, 0, 0, tzinfo=timezone.utc)
            event_end = datetime(dates[-1].year, dates[-1].month, dates[-1].day, 23, 59, 59, tzinfo=timezone.utc)
        else:
            # Fallback: 48h from now
            event_start = now
            event_end = now + timedelta(hours=48)

        # Extract price_id from checkout session line items if not in metadata
        if not stripe_price_id:
            checkout_id = session_data.get("id")
            if checkout_id:
                try:
                    line_items = s.checkout.Session.list_line_items(checkout_id)
                    if line_items.data:
                        stripe_price_id = line_items.data[0].price.id
                except Exception as e:
                    logger.warning(f"Could not retrieve checkout price_id: {e}")

        config = await _get_config_by_price(db, stripe_price_id)
        plan_type = config.plan_type if config else metadata.get("plan_type", "")

        sub = Subscription(
            user_id=user_id,
            stripe_price_id=stripe_price_id,
            plan_type=plan_type,
            status="active",
            circuit_id=circuit_id,
            current_period_start=event_start,
            current_period_end=event_end,
        )
        db.add(sub)

        if circuit_id:
            await _grant_circuit_access(
                db, user_id, circuit_id, config=config,
                event_start=event_start, event_end=event_end,
            )
        elif not _config_is_per_circuit(config):
            await _grant_all_circuits_access(
                db, user_id, config=config,
                event_start=event_start, event_end=event_end,
            )

        if config:
            await _apply_config_to_user(user_id, config, db)
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
            display_label = config.display_name if config and config.display_name else (plan_type or "Evento")
            email_tpl = config.email_template if config else None
            asyncio.create_task(send_subscription_confirmation_email(
                _user.email, _user.username, display_label, circuit_name,
                email_template=email_tpl))


async def _handle_invoice_paid(invoice_data: dict, db: AsyncSession):
    """Handle recurring invoice payment — extend subscription and circuit access."""
    sub_id = invoice_data.get("subscription")
    if not sub_id:
        return

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == sub_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        return

    import stripe as s
    now = datetime.now(timezone.utc)

    # Resolve current config — starts from whatever price is on the subscription row
    config = await _get_config_by_price(db, sub.stripe_price_id)

    try:
        stripe_sub = s.Subscription.retrieve(sub_id, expand=["items"])
        if hasattr(stripe_sub, "start_date") and stripe_sub.start_date:
            sub.current_period_start = datetime.fromtimestamp(stripe_sub.start_date, tz=timezone.utc)
        else:
            sub.current_period_start = now

        # Sync config from Stripe's current price (handles deferred plan switches)
        items = stripe_sub.items.data if stripe_sub.items else []
        if items:
            price_id = items[0].price.id if items[0].price else None
            if price_id and price_id != sub.stripe_price_id:
                new_config = await _get_config_by_price(db, price_id)
                if new_config:
                    old_label = sub.plan_type
                    logger.info(
                        f"Plan changed on renewal: {old_label} → {new_config.plan_type} "
                        f"(user={sub.user_id} price={price_id})"
                    )
                    sub.stripe_price_id = price_id
                    sub.plan_type = new_config.plan_type
                    config = new_config
                    await _apply_config_to_user(sub.user_id, new_config, db)
                else:
                    logger.warning(
                        f"Renewal price {price_id} has no ProductTabConfig row; keeping existing plan"
                    )

        # Clear pending plan since renewal applied it
        sub.pending_plan = None

        sub.current_period_end = _calc_valid_until(config, sub.current_period_start)
    except Exception as e:
        logger.warning(f"Could not retrieve subscription from Stripe: {e}")
        sub.current_period_start = now
        sub.current_period_end = _calc_valid_until(config, now)

    sub.status = "active"

    # Extend circuit access with new period end
    if sub.circuit_id and sub.current_period_end:
        await _grant_circuit_access(
            db, sub.user_id, sub.circuit_id, config=config,
            period_end=sub.current_period_end,
        )
    elif sub.current_period_end and not _config_is_per_circuit(config):
        await _grant_all_circuits_access(
            db, sub.user_id, config=config,
            period_end=sub.current_period_end,
        )

    await db.commit()
    logger.info(
        f"Invoice paid: user={sub.user_id} plan={sub.plan_type} "
        f"circuit={sub.circuit_id} until={sub.current_period_end}"
    )


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

        config = await _get_config_by_price(db, sub.stripe_price_id)

        # Sync circuit access if subscription is still active
        if sub.current_period_end and sub.status in ("active", "trialing"):
            if sub.circuit_id:
                await _grant_circuit_access(
                    db, sub.user_id, sub.circuit_id, config=config,
                    period_end=sub.current_period_end,
                )
            elif not _config_is_per_circuit(config):
                await _grant_all_circuits_access(
                    db, sub.user_id, config=config,
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


async def _apply_config_to_user(user_id: int, config: ProductTabConfig, db: AsyncSession):
    """Apply a ProductTabConfig row to a user: tab access + max_devices +
    per-kind concurrency (concurrency_web / concurrency_mobile).

    This is the single entry point for turning a paid plan into user
    capabilities. ProductTabConfig is the source of truth — no fallback
    to hardcoded defaults.

    Concurrency semantics (matches the product requirement):
      * User's concurrency_web / concurrency_mobile are re-derived from
        the union of all ACTIVE subscriptions' plan configs (plus the
        config being applied right now, in case its Subscription row
        isn't committed yet).
      * "Don't downgrade" only applies when another active subscription
        still provides the higher value. If a user used to have a higher
        value from a plan that is no longer active (expired / cancelled)
        — or that was set manually in the admin panel without a backing
        plan — the new plan's value wins.
      * NULL on the plan means "that plan doesn't care about this kind";
        the value is simply excluded from the max calculation.
      * If NO active plan defines a concurrency for a kind, the user's
        field is set back to NULL so the resolver falls through to
        max_devices (no stale value).

    `max_devices` keeps its upgrade-only semantics for now — it's the
    legacy single-field limit and lots of admin flows set it manually;
    we don't want subscription events to clobber a manual bump on it.
    """
    import json as _json
    from app.models.schemas import UserTabAccess

    if not config:
        logger.warning(f"_apply_config_to_user called with no config (user_id={user_id})")
        return

    try:
        tabs = _json.loads(config.tabs) if config.tabs else []
    except Exception:
        logger.warning(f"Invalid tabs JSON on product_tab_config id={config.id}")
        tabs = []
    max_devices = config.max_devices or 1

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return

    # max_devices: upgrade-only (see docstring).
    user.max_devices = max(user.max_devices, max_devices)

    # Recompute per-kind concurrency from all active subs + this config.
    # Use `db.flush()` first so the Subscription row that the caller just
    # added becomes visible in this session's SELECTs.
    try:
        await db.flush()
    except Exception:
        # If the caller already flushed / failed, don't crash — we'll
        # just fall back to whatever the session currently sees.
        pass

    sub_rows = await db.execute(
        select(Subscription.stripe_price_id, Subscription.plan_type).where(
            Subscription.user_id == user_id,
            Subscription.status.in_(("active", "trialing")),
        )
    )
    active_keys = sub_rows.all()

    webs: list[int] = []
    mobiles: list[int] = []

    # Include the config being applied right now (covers the case where
    # the Subscription row was just staged but not yet visible, and the
    # case where an admin manually triggered a config apply outside the
    # normal subscribe flow).
    if config.concurrency_web is not None and config.concurrency_web > 0:
        webs.append(config.concurrency_web)
    if config.concurrency_mobile is not None and config.concurrency_mobile > 0:
        mobiles.append(config.concurrency_mobile)

    for price_id, plan_type in active_keys:
        plan_cfg = None
        if price_id:
            row = await db.execute(
                select(
                    ProductTabConfig.concurrency_web,
                    ProductTabConfig.concurrency_mobile,
                ).where(ProductTabConfig.stripe_price_id == price_id)
            )
            plan_cfg = row.first()
        if not plan_cfg and plan_type:
            row = await db.execute(
                select(
                    ProductTabConfig.concurrency_web,
                    ProductTabConfig.concurrency_mobile,
                ).where(ProductTabConfig.plan_type == plan_type)
                .order_by(ProductTabConfig.id)
                .limit(1)
            )
            plan_cfg = row.first()
        if not plan_cfg:
            continue
        cw, cm = plan_cfg
        if cw is not None and cw > 0:
            webs.append(cw)
        if cm is not None and cm > 0:
            mobiles.append(cm)

    # Set to the max across all active plans, or None when no plan
    # provides a value (so the resolver falls back to max_devices).
    user.concurrency_web = max(webs) if webs else None
    user.concurrency_mobile = max(mobiles) if mobiles else None

    # Add tabs (don't remove existing — users accumulate access across plans)
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
                items = stripe_sub.items.data if stripe_sub.items else []
                if items:
                    price_obj = items[0].price
                    recurring = price_obj.recurring
                    stripe_prices[sub.stripe_subscription_id] = {
                        "amount": (price_obj.unit_amount or 0) / 100,
                        "currency": price_obj.currency or "eur",
                        "interval": recurring.interval if recurring else "month",
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
            "pending_plan": s_row.pending_plan,
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


@router.get("/payment-methods")
async def list_payment_methods(
    user: User = Depends(get_current_user),
):
    """List user's saved payment methods."""
    s = get_stripe()
    if not user.stripe_customer_id:
        return {"methods": [], "default_method": None}

    methods = s.PaymentMethod.list(customer=user.stripe_customer_id, type="card")
    # Get default payment method from customer
    customer = s.Customer.retrieve(user.stripe_customer_id)
    default_pm = None
    if customer.invoice_settings and customer.invoice_settings.default_payment_method:
        default_pm = customer.invoice_settings.default_payment_method

    return {
        "methods": [
            {
                "id": pm.id,
                "brand": pm.card.brand if pm.card else "unknown",
                "last4": pm.card.last4 if pm.card else "????",
                "exp_month": pm.card.exp_month if pm.card else 0,
                "exp_year": pm.card.exp_year if pm.card else 0,
                "is_default": pm.id == default_pm,
            }
            for pm in methods.data
        ],
        "default_method": default_pm,
    }


@router.post("/setup-intent")
async def create_setup_intent(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a SetupIntent for adding a new payment method."""
    s = get_stripe()

    # Ensure customer exists
    if not user.stripe_customer_id:
        customer = s.Customer.create(
            email=user.email or f"{user.username}@boxboxnow.local",
            name=user.username,
            metadata={"user_id": str(user.id)},
        )
        user.stripe_customer_id = customer.id
        await db.commit()

    setup_intent = s.SetupIntent.create(
        customer=user.stripe_customer_id,
        payment_method_types=["card"],
    )

    return {"client_secret": setup_intent.client_secret}


@router.post("/payment-methods/{pm_id}/default")
async def set_default_payment_method(
    pm_id: str,
    user: User = Depends(get_current_user),
):
    """Set a payment method as the default for invoices."""
    s = get_stripe()
    if not user.stripe_customer_id:
        raise HTTPException(400, "No Stripe customer found")

    s.Customer.modify(
        user.stripe_customer_id,
        invoice_settings={"default_payment_method": pm_id},
    )
    return {"ok": True}


@router.delete("/payment-methods/{pm_id}")
async def delete_payment_method(
    pm_id: str,
    user: User = Depends(get_current_user),
):
    """Detach a payment method from the customer."""
    s = get_stripe()
    if not user.stripe_customer_id:
        raise HTTPException(400, "No Stripe customer found")

    # Verify it belongs to this customer
    pm = s.PaymentMethod.retrieve(pm_id)
    if pm.customer != user.stripe_customer_id:
        raise HTTPException(403, "Payment method does not belong to this customer")

    s.PaymentMethod.detach(pm_id)
    return {"ok": True}


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
        # One-time payment (event): cancel immediately — revoke access
        sub.status = "canceled"
        if sub.circuit_id:
            access_result = await db.execute(
                select(UserCircuitAccess).where(
                    UserCircuitAccess.user_id == user.id,
                    UserCircuitAccess.circuit_id == sub.circuit_id,
                )
            )
            access = access_result.scalar_one_or_none()
            if access:
                access.valid_until = datetime.now(timezone.utc)
        await db.commit()
        return {"ok": True, "canceled": True}

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
    new_price_id = body.get("price_id")
    new_plan = body.get("plan")  # Legacy label path (e.g. "pro_monthly")

    # Resolve the target ProductTabConfig — price_id wins, fall back to label.
    target_config: ProductTabConfig | None = None
    if new_price_id:
        target_config = await _get_config_by_price(db, new_price_id)
        if not target_config:
            raise HTTPException(400, f"No product config found for price {new_price_id}")
    elif new_plan:
        target_config = await _get_config_by_plan_type(db, new_plan)
        if not target_config:
            raise HTTPException(400, f"Unknown plan: {new_plan}")
        new_price_id = target_config.stripe_price_id
    else:
        raise HTTPException(400, "price_id or plan required")

    new_plan = target_config.plan_type

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
    items = stripe_sub.items.data if stripe_sub.items else []
    if not items:
        raise HTTPException(400, "No subscription items found")

    item_id = items[0].id

    # Tell Stripe to use the new price on the next invoice (no proration, no immediate charge).
    # We do NOT update the local plan_type yet — that happens when the renewal
    # webhook (invoice.paid / customer.subscription.updated) fires.
    try:
        s.Subscription.modify(
            sub.stripe_subscription_id,
            items=[{"id": item_id, "price": new_price_id}],
            proration_behavior="none",
        )
    except Exception as e:
        raise HTTPException(400, f"Stripe error: {e}")

    # Store pending plan so the UI can show it, but don't change plan_type yet
    sub.pending_plan = new_plan
    await db.commit()

    return {"ok": True, "new_plan": new_plan, "pending": True}


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
