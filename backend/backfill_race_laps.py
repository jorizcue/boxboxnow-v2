#!/usr/bin/env python3
"""
Backfill race_logs and kart_laps from existing replay recordings.

Parses all .log files in data/recordings/{circuit_dir}/ and extracts
lap data for historical kart analytics.

Usage:
    python3 backfill_race_laps.py [--dry-run]
"""

import asyncio
import sys
import os
import logging
from datetime import datetime, timezone
from pathlib import Path

# Ensure the backend is importable
sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


async def main():
    dry_run = "--dry-run" in sys.argv

    from app.models.database import init_db, async_session
    from app.models.schemas import Circuit, RaceLog, KartLap
    from app.apex.parser import ApexMessageParser, EventType, time_to_ms
    from app.apex.replay import ReplayEngine
    from sqlalchemy import select

    await init_db()

    recordings_dir = Path("data/recordings")
    if not recordings_dir.exists():
        logger.error(f"No recordings directory found at {recordings_dir}")
        return

    # Load circuits mapping
    async with async_session() as db:
        result = await db.execute(select(Circuit))
        circuits = {c.name.lower(): c for c in result.scalars().all()}

        # Check existing race_logs to avoid duplicates
        result = await db.execute(select(RaceLog))
        existing_logs = set()
        for rl in result.scalars().all():
            key = (rl.circuit_id, rl.race_date.strftime("%Y-%m-%d") if rl.race_date else "")
            existing_logs.add(key)

    total_races = 0
    total_laps = 0

    for circuit_dir in sorted(recordings_dir.iterdir()):
        if not circuit_dir.is_dir():
            continue

        circuit_name = circuit_dir.name
        # Try to find circuit in DB
        circuit = None
        for name, c in circuits.items():
            if name == circuit_name.lower() or circuit_name.lower() in name:
                circuit = c
                break

        if not circuit:
            logger.warning(f"No circuit found for '{circuit_name}', skipping")
            continue

        logger.info(f"Processing circuit: {circuit_name} (id={circuit.id})")

        for log_file in sorted(circuit_dir.glob("*.log")):
            date_str = log_file.stem  # e.g. "2025-03-29"
            try:
                race_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                logger.warning(f"  Skipping non-date file: {log_file.name}")
                continue

            # Check if already backfilled
            key = (circuit.id, date_str)
            if key in existing_logs:
                logger.info(f"  Already exists: {log_file.name}, skipping")
                continue

            logger.info(f"  Processing: {log_file.name}")

            # Parse the replay file to extract all laps
            parser = ApexMessageParser()
            kart_data = {}  # kart_number -> {team_name, all_laps[], valid_laps set}

            try:
                content = log_file.read_text(encoding="utf-8", errors="replace")
            except Exception as e:
                logger.error(f"  Error reading {log_file}: {e}")
                continue

            # Parse blocks (timestamp + message)
            blocks = []
            current_lines = []
            current_ts = None

            for line in content.split("\n"):
                line_stripped = line.strip()
                if not line_stripped:
                    if current_lines and current_ts:
                        blocks.append((current_ts, "\n".join(current_lines)))
                    current_lines = []
                    current_ts = None
                    continue

                # Try to parse as timestamp
                try:
                    ts = datetime.strptime(line_stripped, "%Y-%m-%d %H:%M:%S")
                    if current_lines and current_ts:
                        blocks.append((current_ts, "\n".join(current_lines)))
                    current_ts = ts
                    current_lines = []
                    continue
                except ValueError:
                    pass

                current_lines.append(line_stripped)

            if current_lines and current_ts:
                blocks.append((current_ts, "\n".join(current_lines)))

            # Process blocks through parser
            laps_discard = circuit.laps_discard or 2
            lap_differential = circuit.lap_differential or 3000

            # Track state per kart
            class SimpleKart:
                def __init__(self):
                    self.kart_number = 0
                    self.team_name = ""
                    self.driver_name = ""
                    self.total_laps = 0
                    self.last_lap_ms = 0
                    self.pit_count = 0
                    self.last_pit_lap = 0
                    self.all_laps = []
                    self.valid_laps = set()  # (totalLap, lapTime) tuples

            karts = {}  # row_id -> SimpleKart

            for ts, message in blocks:
                events = parser.parse(message)
                for event in events:
                    row_id = event.row_id

                    if event.type == EventType.INIT and event.value == "init":
                        karts.clear()
                        continue

                    if event.type == EventType.INIT and event.value == "kart":
                        k = SimpleKart()
                        k.kart_number = event.extra.get("kart_number", 0)
                        k.team_name = event.extra.get("team_name", "")
                        k.total_laps = int(event.extra.get("total_laps", "0") or "0")
                        k.pit_count = int(event.extra.get("pit_count", "0") or "0")
                        last_str = event.extra.get("last_lap", "")
                        if last_str:
                            k.last_lap_ms = time_to_ms(last_str)
                        karts[row_id] = k
                        continue

                    kart = karts.get(row_id)
                    if not kart:
                        continue

                    if event.type == EventType.LAP:
                        lap_ms = time_to_ms(event.value)
                        if lap_ms <= 0:
                            continue
                        if lap_ms == kart.last_lap_ms and kart.total_laps > 0:
                            continue  # Skip CSS repaint

                        kart.total_laps += 1
                        lap_record = {
                            "lapTime": lap_ms,
                            "totalLap": kart.total_laps,
                            "driverName": kart.driver_name,
                        }
                        kart.all_laps.append(lap_record)

                        # Validity check
                        is_valid = True
                        if kart.total_laps <= kart.last_pit_lap + laps_discard:
                            is_valid = False
                        elif kart.last_lap_ms > 0:
                            if lap_ms > kart.last_lap_ms + lap_differential:
                                is_valid = False

                        if is_valid:
                            kart.valid_laps.add((kart.total_laps, lap_ms))

                        kart.last_lap_ms = lap_ms

                    elif event.type == EventType.PIT_IN:
                        kart.pit_count += 1
                        kart.last_pit_lap = kart.total_laps

                    elif event.type == EventType.DRIVER_TEAM:
                        kart.driver_name = event.value

                    elif event.type == EventType.TEAM:
                        kart.team_name = event.value

            # Collect all laps across all karts
            total_race_laps = sum(len(k.all_laps) for k in karts.values())
            if total_race_laps < 10:
                logger.info(f"    Only {total_race_laps} laps, skipping")
                continue

            if dry_run:
                logger.info(f"    [DRY RUN] Would save: {len(karts)} karts, {total_race_laps} laps")
                total_races += 1
                total_laps += total_race_laps
                continue

            # Save to DB
            async with async_session() as db:
                race_log = RaceLog(
                    circuit_id=circuit.id,
                    user_id=None,
                    race_date=race_date,
                    session_name=f"{circuit_name} {date_str}",
                    duration_min=0,
                    total_karts=len(karts),
                )
                db.add(race_log)
                await db.flush()

                for kart in karts.values():
                    if not kart.all_laps:
                        continue
                    for lap in kart.all_laps:
                        kart_lap = KartLap(
                            race_log_id=race_log.id,
                            kart_number=kart.kart_number,
                            team_name=kart.team_name,
                            driver_name=lap.get("driverName", ""),
                            lap_number=lap["totalLap"],
                            lap_time_ms=lap["lapTime"],
                            is_valid=(lap["totalLap"], lap["lapTime"]) in kart.valid_laps,
                        )
                        db.add(kart_lap)

                await db.commit()
                logger.info(f"    Saved race_log #{race_log.id}: {total_race_laps} laps from {len(karts)} karts")
                total_races += 1
                total_laps += total_race_laps

    logger.info(f"\nDone! Processed {total_races} races, {total_laps} laps total")
    if dry_run:
        logger.info("(Dry run — no data was saved)")


if __name__ == "__main__":
    asyncio.run(main())
