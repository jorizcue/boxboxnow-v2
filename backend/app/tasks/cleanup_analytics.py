"""
Periodic cleanup of old kart analytics data.

Deletes race_logs (and cascading kart_laps) older than the configured
retention period (app_settings.kart_analytics_retention_days, default 30).

Runs once daily as a background task.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select, delete, func

from app.models.database import async_session
from app.models.schemas import AppSetting, RaceLog

logger = logging.getLogger(__name__)

DEFAULT_RETENTION_DAYS = 30


async def cleanup_old_analytics():
    """Delete race_logs older than the configured retention period."""
    async with async_session() as db:
        # Read retention setting
        result = await db.execute(
            select(AppSetting.value).where(AppSetting.key == "kart_analytics_retention_days")
        )
        row = result.scalar_one_or_none()
        try:
            retention_days = int(row) if row else DEFAULT_RETENTION_DAYS
        except (ValueError, TypeError):
            retention_days = DEFAULT_RETENTION_DAYS

        if retention_days <= 0:
            logger.info("Analytics retention disabled (0 days), skipping cleanup")
            return 0

        cutoff = datetime.utcnow() - timedelta(days=retention_days)

        # Count before deleting
        count_result = await db.execute(
            select(func.count(RaceLog.id)).where(RaceLog.race_date < cutoff)
        )
        count = count_result.scalar() or 0

        if count == 0:
            logger.debug("No old analytics data to clean up")
            return 0

        # Delete old race_logs (kart_laps cascade via FK)
        await db.execute(
            delete(RaceLog).where(RaceLog.race_date < cutoff)
        )
        await db.commit()

        logger.info(f"Analytics cleanup: deleted {count} race logs older than {retention_days} days (before {cutoff.date()})")
        return count


async def periodic_analytics_cleanup(interval_hours: int = 24):
    """Background loop that runs cleanup once per day."""
    while True:
        await asyncio.sleep(interval_hours * 3600)
        try:
            await cleanup_old_analytics()
        except Exception as e:
            logger.error(f"Analytics cleanup failed: {e}")
