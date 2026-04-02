"""
Periodic cleanup of old kart analytics data.

Deletes race_logs (and cascading kart_laps) older than the per-circuit
retention_days setting (default 30). Runs once daily as a background task.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import select, delete

from app.models.database import async_session
from app.models.schemas import Circuit, RaceLog

logger = logging.getLogger(__name__)


async def cleanup_old_analytics():
    """Delete race_logs older than each circuit's retention period."""
    async with async_session() as db:
        result = await db.execute(select(Circuit))
        circuits = result.scalars().all()

        total_deleted = 0
        for circuit in circuits:
            retention_days = circuit.retention_days or 30
            if retention_days <= 0:
                continue

            cutoff = datetime.utcnow() - timedelta(days=retention_days)
            result = await db.execute(
                delete(RaceLog).where(
                    RaceLog.circuit_id == circuit.id,
                    RaceLog.race_date < cutoff,
                )
            )
            total_deleted += result.rowcount

        if total_deleted > 0:
            await db.commit()
            logger.info(f"Analytics cleanup: deleted {total_deleted} old race logs across {len(circuits)} circuits")

        return total_deleted


async def periodic_analytics_cleanup(interval_hours: int = 24):
    """Background loop that runs cleanup once per day."""
    while True:
        await asyncio.sleep(interval_hours * 3600)
        try:
            await cleanup_old_analytics()
        except Exception as e:
            logger.error(f"Analytics cleanup failed: {e}")
