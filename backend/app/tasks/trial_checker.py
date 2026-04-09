"""Periodic task to check trial expirations and send reminder emails."""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from app.models.database import async_session
from app.models.schemas import Subscription, User

logger = logging.getLogger(__name__)


async def check_trial_expirations():
    """Check for expiring trials and send reminder emails."""
    async with async_session() as db:
        now = datetime.now(timezone.utc)

        # Find trials ending in 3 days (send reminder)
        three_days = now + timedelta(days=3)
        two_days = now + timedelta(days=2)

        result = await db.execute(
            select(Subscription).where(
                Subscription.plan_type == "trial",
                Subscription.status == "trialing",
                Subscription.current_period_end >= two_days,
                Subscription.current_period_end < three_days,
            )
        )
        ending_trials = result.scalars().all()

        for trial in ending_trials:
            user_result = await db.execute(select(User).where(User.id == trial.user_id))
            user = user_result.scalar_one_or_none()
            if user and user.email:
                days_left = max(1, int((trial.current_period_end - now).total_seconds() / 86400))
                from app.services.email_service import send_trial_ending_email
                await send_trial_ending_email(user.email, user.username, days_left)

        # Mark expired trials as expired
        result = await db.execute(
            select(Subscription).where(
                Subscription.plan_type == "trial",
                Subscription.status == "trialing",
                Subscription.current_period_end < now,
            )
        )
        expired_trials = result.scalars().all()
        for trial in expired_trials:
            trial.status = "expired"
            logger.info(f"Trial expired for user_id={trial.user_id}")

        if expired_trials:
            await db.commit()

        logger.info(f"Trial check complete: {len(ending_trials)} reminders, {len(expired_trials)} expired")


async def periodic_trial_check(interval_hours: int = 24):
    """Run trial check periodically."""
    while True:
        try:
            await check_trial_expirations()
        except Exception as e:
            logger.error(f"Trial check error: {e}")
        await asyncio.sleep(interval_hours * 3600)
