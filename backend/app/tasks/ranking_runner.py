"""Daily driver-ranking processor.

Runs once at startup and then every `interval_hours` afterwards. Each
invocation scans `data/recordings/` for log files not yet in
`processed_logs` and processes them in date order, populating
`session_results`, `driver_ratings` and `rating_history`.

The first run on a fresh DB processes the whole historical corpus
(~1000 logs ≈ a few minutes). Subsequent runs only see the last day's
recordings — typically a handful of files, finishes in seconds.

Failures inside the processor are caught + logged; we keep retrying
the next interval. The task lifecycle is managed from `app/main.py`
lifespan and cancelled on shutdown.
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.models.database import async_session
from app.services.ranking.processor import process_pending

logger = logging.getLogger(__name__)


def _recordings_dir() -> Path | None:
    """Same locator as `app/api/ranking_routes.py::_recordings_dir`."""
    for c in (Path("/app/data/recordings"),
              Path(__file__).resolve().parents[3] / "data" / "recordings"):
        if c.is_dir():
            return c
    return None


async def _run_once():
    rec_dir = _recordings_dir()
    if rec_dir is None:
        logger.warning("ranking_runner: no recordings directory found, skipping")
        return
    async with async_session() as db:
        try:
            result = await process_pending(db, rec_dir)
            if result.get("processed", 0):
                logger.info(
                    "ranking_runner: processed %d new logs (skipped %d, total candidates %d)",
                    result.get("processed", 0),
                    result.get("skipped", 0),
                    result.get("total_candidates", 0),
                )
            else:
                logger.debug("ranking_runner: nothing new")
        except Exception:
            logger.exception("ranking_runner: process_pending failed")


async def periodic_ranking_run(interval_hours: float = 24):
    """Background task entry point. Runs once immediately (with a small
    warm-up delay so the rest of the lifespan tasks settle first) and
    then on a fixed interval."""
    # Initial delay — let the rest of the lifespan finish wiring up
    # routes / WS hub / etc before we start hammering the disk.
    await asyncio.sleep(30)
    while True:
        try:
            await _run_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("ranking_runner: unexpected error")
        try:
            await asyncio.sleep(interval_hours * 3600)
        except asyncio.CancelledError:
            raise
