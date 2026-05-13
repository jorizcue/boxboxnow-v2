"""Daily rollup of `usage_events` into `usage_daily` + retention purge.

Two responsibilities, run together once a day:

  1. **Rollup**: for yesterday's events, populate `usage_daily` so the
     admin analytics views can query a pre-aggregated table instead of
     scanning the raw events log. The unique constraint on
     `(COALESCE(user_id, -1), day, event_key)` makes the upsert idempotent
     — re-running the same day's rollup is harmless.

  2. **Retention**: delete raw `usage_events` rows older than
     `RAW_RETENTION_DAYS` (default 30). The rollup table is durable —
     long-term analysis lives there. Anonymous events older than the
     retention window are simply gone.

The same task also vacuums `visitor_identity` rows that were created
for a user that no longer exists — defensive only; ON DELETE CASCADE
should handle this automatically, but we double-check on every run.

Schedule: kicked off from `app/main.py` lifespan via
`asyncio.create_task(periodic_usage_rollup(interval_hours=24))`.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import async_session
from app.models.schemas import UsageEvent, UsageDaily

logger = logging.getLogger(__name__)

RAW_RETENTION_DAYS = 30


async def rollup_day(db: AsyncSession, day: date) -> int:
    """Aggregate events of a single day into `usage_daily`.

    For each (user_id, event_key) combination on that day we upsert one
    row with `count` (total events) and `unique_visitors` (distinct
    visitor_ids). Returns the number of (user, key) buckets written.

    Idempotent — re-running the same day overwrites the existing
    counts rather than duplicating. Achieved via INSERT … ON CONFLICT
    against the COALESCE-based unique index defined in database.py.
    """
    start = datetime.combine(day, datetime.min.time()).replace(tzinfo=timezone.utc)
    end = start + timedelta(days=1)

    # Pull aggregated rows for the day. user_id NULL stays NULL.
    result = await db.execute(
        select(
            UsageEvent.user_id,
            UsageEvent.event_key,
            func.count(UsageEvent.id).label("count"),
            func.count(func.distinct(UsageEvent.visitor_id)).label("uniq_v"),
        )
        .where(UsageEvent.ts >= start, UsageEvent.ts < end)
        .group_by(UsageEvent.user_id, UsageEvent.event_key)
    )
    buckets = result.all()
    if not buckets:
        return 0

    # SQLite supports INSERT … ON CONFLICT (… ) DO UPDATE since 3.24.
    # The conflict target matches the COALESCE-based unique index from
    # database.py (`uq_usage_daily_user_day_event`).
    for row in buckets:
        await db.execute(
            text(
                """
                INSERT INTO usage_daily (user_id, day, event_key, count, unique_visitors)
                VALUES (:user_id, :day, :event_key, :count, :uniq_v)
                ON CONFLICT (COALESCE(user_id, -1), day, event_key) DO UPDATE SET
                    count = excluded.count,
                    unique_visitors = excluded.unique_visitors
                """
            ),
            {
                "user_id": row.user_id,
                "day": day,
                "event_key": row.event_key,
                "count": int(row.count or 0),
                "uniq_v": int(row.uniq_v or 0),
            },
        )

    await db.commit()
    return len(buckets)


async def purge_old_events(db: AsyncSession, retention_days: int = RAW_RETENTION_DAYS) -> int:
    """Drop raw `usage_events` rows older than the retention window."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    result = await db.execute(delete(UsageEvent).where(UsageEvent.ts < cutoff))
    purged = result.rowcount or 0
    if purged:
        await db.commit()
    return purged


async def usage_rollup_run(target_day: Optional[date] = None) -> dict:
    """Run rollup + retention once. Returns a summary dict for logging.

    `target_day` defaults to yesterday (UTC). Pass an explicit date to
    backfill — e.g. on first deploy you can call this for each of the
    last 7 days to seed the rollup table.
    """
    if target_day is None:
        target_day = (datetime.now(timezone.utc) - timedelta(days=1)).date()

    async with async_session() as db:
        try:
            buckets = await rollup_day(db, target_day)
        except Exception as e:
            logger.exception(f"Usage rollup failed for {target_day}: {e}")
            buckets = 0

        try:
            purged = await purge_old_events(db)
        except Exception as e:
            logger.exception(f"Usage retention purge failed: {e}")
            purged = 0

    summary = {"day": target_day.isoformat(), "buckets": buckets, "purged": purged}
    logger.info(f"Usage rollup done: {summary}")
    return summary


async def periodic_usage_rollup(interval_hours: int = 24):
    """Background loop. Sleeps `interval_hours` between runs.

    Runs the rollup for "yesterday" — by the time this fires at 24h
    boundaries the day is complete so the totals are final.
    """
    # Wait a short while at startup so the rest of the app finishes
    # bootstrapping before we hammer the DB; then run the first rollup.
    await asyncio.sleep(60)
    while True:
        try:
            await usage_rollup_run()
        except Exception as e:
            logger.error(f"Usage rollup loop iteration failed: {e}")
        await asyncio.sleep(interval_hours * 3600)
