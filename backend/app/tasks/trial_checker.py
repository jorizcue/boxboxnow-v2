"""Periodic task to check trial expirations and send reminder emails."""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from app.models.database import async_session
from app.models.schemas import Subscription, User, AppSetting

logger = logging.getLogger(__name__)

PLATFORM_DEFAULTS = {
    "trial_email_days": "3",
}


async def _get_setting(db, key: str) -> str:
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    return setting.value if setting else PLATFORM_DEFAULTS.get(key, "0")


async def check_trial_expirations():
    """Check for expiring trials and send reminder emails."""
    async with async_session() as db:
        now = datetime.now(timezone.utc)

        # Read configurable email reminder days
        email_days = int(await _get_setting(db, "trial_email_days"))

        if email_days > 0:
            # Find trials ending within the email_days window (1-day precision)
            upper = now + timedelta(days=email_days)
            lower = now + timedelta(days=email_days - 1)

            result = await db.execute(
                select(Subscription).where(
                    Subscription.plan_type == "trial",
                    Subscription.status == "trialing",
                    Subscription.current_period_end >= lower,
                    Subscription.current_period_end < upper,
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
        else:
            ending_trials = []

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
