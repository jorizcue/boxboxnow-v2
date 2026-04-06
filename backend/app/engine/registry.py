"""
Multi-tenant state registry.
Maps user_id -> UserSession with isolated race state.
CircuitHub feeds messages to subscribed sessions.
"""

import asyncio
import json
import logging
from app.engine.state import RaceStateManager
from app.engine.fifo import FifoManager
from app.engine.clustering import compute_clustering
from app.engine.classification import compute_classification
from app.apex.parser import ApexMessageParser, EventType
from app.apex.api_client import ApexApiClient, DEFAULT_PHP_API_URL
from app.config import get_settings

logger = logging.getLogger(__name__)


class UserSession:
    """All runtime state for a single user's active race."""

    def __init__(self, user_id: int, circuit_id: int):
        self.user_id = user_id
        self.circuit_id = circuit_id
        self.parser = ApexMessageParser()
        self.state = RaceStateManager()
        self.fifo = FifoManager()
        self.api_client: ApexApiClient | None = None
        self._load_drivers_task: asyncio.Task | None = None
        self._analytics_task: asyncio.Task | None = None
        self._race_log_id: int | None = None
        self._saved_laps_per_kart: dict[int, int] = {}  # kart_number -> count of saved laps
        self._save_lock = asyncio.Lock()

        async def on_events(events):
            # Track which karts were NOT in pit before processing
            pre_pit_status = {
                row_id: kart.pit_status
                for row_id, kart in self.state.karts.items()
            }
            await self.state.handle_events(events)

            # Detect init kart batch -> trigger driver loading from PHP API
            init_kart_events = [e for e in events
                                if e.type == EventType.INIT and e.value == "kart"]
            if init_kart_events and self.api_client and self.api_client.php_api_port:
                # Cancel any previous load task
                if self._load_drivers_task and not self._load_drivers_task.done():
                    self._load_drivers_task.cancel()
                self._load_drivers_task = asyncio.create_task(
                    self._load_drivers_from_api()
                )

            # Only add to FIFO karts that TRANSITIONED to in_pit (not already in pit)
            pit_in_karts = []
            for row_id, kart in self.state.karts.items():
                if (kart.pit_status == "in_pit"
                        and pre_pit_status.get(row_id) != "in_pit"):
                    pit_in_karts.append(kart)

            if pit_in_karts:
                # Re-compute clustering BEFORE adding to FIFO so tier_score
                # is fresh (not stale from the last analytics cycle).
                try:
                    team_pos = getattr(self, "_team_positions", {})
                    driver_diffs = getattr(self, "_driver_differentials", {})
                    compute_clustering(self.state, team_pos, driver_diffs)
                except Exception as e:
                    logger.warning(f"Clustering before FIFO entry failed: {e}")

                # Compute avg-position ranking once for all pit-in karts
                sorted_by_avg = sorted(
                    self.state.karts.values(),
                    key=lambda k: k.avg_lap_ms if k.avg_lap_ms > 0 else float("inf"),
                )
                avg_pos_map = {k.kart_number: idx + 1 for idx, k in enumerate(sorted_by_avg)}

                for kart in pit_in_karts:
                    logger.info(
                        f"FIFO entry: kart #{kart.kart_number} pit_in "
                        f"tier_score={kart.tier_score}"
                    )
                    recent = [
                        {"lapTime": l["lapTime"], "totalLap": l["totalLap"],
                         "driverName": l.get("driverName", "")}
                        for l in kart.valid_laps[-5:]
                    ]
                    self.fifo.add_entry(
                        kart.tier_score,
                        kart_number=kart.kart_number,
                        team_name=kart.team_name,
                        driver_name=kart.driver_name,
                        avg_lap_ms=kart.avg_lap_ms,
                        avg_position=avg_pos_map.get(kart.kart_number, 0),
                        recent_laps=recent,
                        pit_count=kart.pit_count,
                    )

                # Broadcast FIFO immediately so the box tab updates in real-time
                self.fifo.apply_to_state(self.state)
                await self._broadcast_fifo()

            # Real-time lap saving
            lap_events = [e for e in events if e.type == EventType.LAP]
            if lap_events:
                asyncio.create_task(self._save_realtime_laps())

        self._on_events = on_events

    async def process_message(self, message: str):
        """Called by CircuitHub for each incoming message."""
        try:
            events = self.parser.parse(message)
            if events:
                await self._on_events(events)
        except Exception as e:
            logger.error(f"Error processing message (user={self.user_id}): {e}",
                         exc_info=True)

    async def start(self):
        """Start analytics loop."""
        self._analytics_task = asyncio.create_task(self._analytics_loop())
        logger.info(f"User session started (user_id={self.user_id}, circuit={self.circuit_id})")

    async def stop(self):
        """Stop all tasks and save race data."""
        # Save race laps before stopping
        try:
            await self.save_race_laps()
        except Exception as e:
            logger.error(f"Failed to save race laps on stop (user={self.user_id}): {e}")

        if self._analytics_task:
            self._analytics_task.cancel()
            try:
                await self._analytics_task
            except asyncio.CancelledError:
                pass
        if self._load_drivers_task and not self._load_drivers_task.done():
            self._load_drivers_task.cancel()
        if self.api_client:
            await self.api_client.close()
        logger.info(f"User session stopped (user_id={self.user_id})")

    async def _save_realtime_laps(self):
        """Save newly arrived laps to DB in real-time."""
        from app.models.database import async_session
        from app.models.schemas import RaceLog, KartLap
        from datetime import datetime, timezone
        from sqlalchemy import select

        try:
            async with self._save_lock:
                async with async_session() as db:
                    # Create or reuse race_log
                    if self._race_log_id is None:
                        session_name = self.state.track_name or f"Race {datetime.now().strftime('%Y-%m-%d %H:%M')}"
                        today_start = datetime.now(timezone.utc).replace(
                            hour=0, minute=0, second=0, microsecond=0)

                        # Check for existing RaceLog with same session today
                        existing = (await db.execute(
                            select(RaceLog).where(
                                RaceLog.circuit_id == self.circuit_id,
                                RaceLog.user_id == self.user_id,
                                RaceLog.session_name == session_name,
                                RaceLog.race_date >= today_start,
                            )
                        )).scalar_one_or_none()

                        if existing:
                            self._race_log_id = existing.id
                            from sqlalchemy import func as sqlfunc
                            rows = (await db.execute(
                                select(KartLap.kart_number, sqlfunc.max(KartLap.lap_number))
                                .where(KartLap.race_log_id == existing.id)
                                .group_by(KartLap.kart_number)
                            )).all()
                            for kart_number, max_lap in rows:
                                self._saved_laps_per_kart[kart_number] = max_lap
                            logger.info(f"Reusing race_log #{existing.id} for '{session_name}' (user={self.user_id})")
                        else:
                            race_log = RaceLog(
                                circuit_id=self.circuit_id,
                                user_id=self.user_id,
                                race_date=datetime.now(timezone.utc),
                                session_name=session_name,
                                duration_min=self.state.duration_min,
                                total_karts=len(self.state.karts),
                            )
                            db.add(race_log)
                            await db.flush()
                            self._race_log_id = race_log.id
                            logger.info(f"Created race_log #{race_log.id} for '{session_name}' (user={self.user_id})")

                    # Save only NEW laps per kart (track count per kart_number)
                    new_count = 0
                    for kart in self.state.karts.values():
                        saved = self._saved_laps_per_kart.get(kart.kart_number, 0)
                        if len(kart.all_laps) <= saved:
                            continue
                        valid_set = {(vl["totalLap"], vl["lapTime"]) for vl in kart.valid_laps}
                        for lap in kart.all_laps[saved:]:
                            kart_lap = KartLap(
                                race_log_id=self._race_log_id,
                                kart_number=kart.kart_number,
                                team_name=kart.team_name,
                                driver_name=lap.get("driverName", ""),
                                lap_number=lap["totalLap"],
                                lap_time_ms=lap["lapTime"],
                                is_valid=(lap["totalLap"], lap["lapTime"]) in valid_set,
                                recorded_at=datetime.now(timezone.utc),
                            )
                            db.add(kart_lap)
                            new_count += 1
                        self._saved_laps_per_kart[kart.kart_number] = len(kart.all_laps)

                    if new_count == 0:
                        return

                    await db.commit()
        except Exception as e:
            logger.error(f"Real-time lap save failed (user={self.user_id}): {e}")

    async def save_race_laps(self):
        """Final save: persist any remaining unsaved laps and update race_log metadata."""
        from datetime import datetime, timezone
        from app.models.database import async_session
        from app.models.schemas import RaceLog, KartLap
        from sqlalchemy import update

        total_laps = sum(len(k.all_laps) for k in self.state.karts.values())

        if self._race_log_id is not None:
            # Already saving in real-time, just flush remaining laps and update metadata
            try:
                await self._save_realtime_laps()  # Flush any pending
                async with async_session() as db:
                    await db.execute(
                        update(RaceLog)
                        .where(RaceLog.id == self._race_log_id)
                        .values(
                            total_karts=len(self.state.karts),
                            duration_min=self.state.duration_min,
                        )
                    )
                    await db.commit()
                logger.info(f"Updated race_log #{self._race_log_id} on stop: {total_laps} total laps")
            except Exception as e:
                logger.error(f"Failed to finalize race_log on stop: {e}")
            return

        # Fallback: bulk save if real-time wasn't active
        if total_laps < 10:
            logger.info(f"Skipping race save: only {total_laps} laps (user={self.user_id})")
            return

        from sqlalchemy import select, func as sqlfunc

        async with async_session() as db:
            # Dedup: check for existing RaceLog with same session today
            session_name = self.state.track_name or f"Race {datetime.now().strftime('%Y-%m-%d %H:%M')}"
            today_start = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0)

            existing = (await db.execute(
                select(RaceLog).where(
                    RaceLog.circuit_id == self.circuit_id,
                    RaceLog.user_id == self.user_id,
                    RaceLog.session_name == session_name,
                    RaceLog.race_date >= today_start,
                )
            )).scalar_one_or_none()

            if existing:
                race_log_id = existing.id
                # Rebuild saved counts to know which laps already exist
                rows = (await db.execute(
                    select(KartLap.kart_number, sqlfunc.max(KartLap.lap_number))
                    .where(KartLap.race_log_id == existing.id)
                    .group_by(KartLap.kart_number)
                )).all()
                saved_per_kart = {kart_number: max_lap for kart_number, max_lap in rows}
                logger.info(f"Reusing race_log #{existing.id} for fallback save '{session_name}' (user={self.user_id})")
            else:
                race_log = RaceLog(
                    circuit_id=self.circuit_id,
                    user_id=self.user_id,
                    race_date=datetime.now(timezone.utc),
                    session_name=session_name,
                    duration_min=self.state.duration_min,
                    total_karts=len(self.state.karts),
                )
                db.add(race_log)
                await db.flush()
                race_log_id = race_log.id
                saved_per_kart = {}
                logger.info(f"Created race_log #{race_log.id} for fallback save '{session_name}' (user={self.user_id})")

            # Collect valid lap times from valid_laps set for quick lookup
            new_count = 0
            for kart in self.state.karts.values():
                saved = saved_per_kart.get(kart.kart_number, 0)
                valid_lap_set = set()
                for vl in kart.valid_laps:
                    valid_lap_set.add((vl["totalLap"], vl["lapTime"]))

                for lap in kart.all_laps[saved:]:
                    kart_lap = KartLap(
                        race_log_id=race_log_id,
                        kart_number=kart.kart_number,
                        team_name=kart.team_name,
                        driver_name=lap.get("driverName", ""),
                        lap_number=lap["totalLap"],
                        lap_time_ms=lap["lapTime"],
                        is_valid=(lap["totalLap"], lap["lapTime"]) in valid_lap_set,
                        recorded_at=datetime.now(timezone.utc),
                    )
                    db.add(kart_lap)
                    new_count += 1

            if new_count > 0:
                await db.commit()
            logger.info(f"Fallback save race_log #{race_log_id}: {new_count} new laps, "
                        f"{len(self.state.karts)} karts (user={self.user_id}, "
                        f"circuit={self.circuit_id})")

    def configure(self, circuit_length_m: int, pit_time_s: int, laps_discard: int,
                  lap_differential: float, rain: bool, our_kart: int, min_pits: int,
                  max_stint_min: int, min_stint_min: int, box_lines: int,
                  box_karts: int, duration_min: int, refresh_s: int,
                  min_driver_time_min: int = 30,
                  pit_closed_start_min: int = 0, pit_closed_end_min: int = 0):
        """Apply race session config to state and fifo."""
        self.state.circuit_length_m = circuit_length_m or 1100
        self.state.pit_time_s = pit_time_s or 120
        self.state.laps_discard = laps_discard
        self.state.lap_differential = int(lap_differential)
        self.state.rain_mode = rain
        self.state.our_kart_number = our_kart
        self.state.min_pits = min_pits
        self.state.max_stint_min = max_stint_min
        self.state.min_stint_min = min_stint_min
        self.state.min_driver_time_min = min_driver_time_min
        self.state.pit_closed_start_min = pit_closed_start_min
        self.state.pit_closed_end_min = pit_closed_end_min
        self.state.box_lines = box_lines
        self.state.box_karts = box_karts
        self.state.update_duration(duration_min)
        self._refresh_s = refresh_s
        self.fifo.update_config(box_karts, box_lines)

    def set_php_api(self, php_api_url: str, php_api_port: int):
        """Configure the PHP API client for driver loading."""
        if php_api_port:
            url = php_api_url or DEFAULT_PHP_API_URL
            self.api_client = ApexApiClient(url, php_api_port)
            logger.info(f"PHP API configured: port={php_api_port}, url={url}")

    def set_driver_differentials(self, differentials: dict[int, dict[str, int]],
                                  team_positions: dict[int, int]):
        self._driver_differentials = differentials
        self._team_positions = team_positions

    async def _load_drivers_from_api(self):
        """Fetch drivers from PHP API for all karts, save to DB, notify frontend."""
        if not self.api_client:
            return

        await asyncio.sleep(1.0)

        logger.info(f"Loading drivers from PHP API for {len(self.state.karts)} karts "
                     f"(user_id={self.user_id})")

        teams_data = []

        for i, kart in enumerate(
            sorted(self.state.karts.values(), key=lambda k: k.position or 999)
        ):
            row_id = kart.row_id
            team_entry = {
                "position": i + 1,
                "kart": kart.kart_number,
                "team_name": kart.team_name,
                "drivers": [],
            }

            try:
                html = await self.api_client.request_api(row_id, "INF")
                if html:
                    drivers = self.api_client.extract_drivers(html)
                    for d in drivers:
                        team_entry["drivers"].append({
                            "driver_name": d["name"],
                            "differential_ms": 0,
                        })
                    if drivers:
                        logger.info(f"  Kart #{kart.kart_number} ({kart.team_name}): "
                                     f"{len(drivers)} drivers")
            except Exception as e:
                logger.warning(f"  Failed to load drivers for kart #{kart.kart_number}: {e}")

            teams_data.append(team_entry)

        if not teams_data:
            return

        try:
            await self._save_teams_to_db(teams_data)
            logger.info(f"Saved {len(teams_data)} teams to DB (user_id={self.user_id})")
        except Exception as e:
            logger.error(f"Failed to save teams to DB: {e}", exc_info=True)

        if self.state._ws_clients:
            msg = json.dumps({"type": "teams_updated", "data": {"teams": teams_data}})
            dead = set()
            for client in self.state._ws_clients:
                try:
                    await client.send_text(msg)
                except Exception:
                    dead.add(client)
            for c in dead:
                self.state._ws_clients.discard(c)

    async def _save_teams_to_db(self, teams_data: list[dict]):
        """Save teams and drivers to DB, merging differentials from existing entries."""
        from app.models.database import async_session
        from app.models.schemas import RaceSession, TeamPosition, TeamDriver
        from sqlalchemy import select, delete
        from sqlalchemy.orm import selectinload

        async with async_session() as db:
            result = await db.execute(
                select(RaceSession)
                .options(
                    selectinload(RaceSession.team_positions)
                    .selectinload(TeamPosition.drivers)
                )
                .where(
                    RaceSession.user_id == self.user_id,
                    RaceSession.is_active == True,
                )
            )
            session = result.scalar_one_or_none()
            if not session:
                logger.warning(f"No active session for user {self.user_id}, skipping team save")
                return

            existing_diffs: dict[int, dict[str, int]] = {}
            for tp in session.team_positions:
                kart_diffs = {}
                for d in tp.drivers:
                    kart_diffs[d.driver_name.strip().lower()] = d.differential_ms
                existing_diffs[tp.kart] = kart_diffs

            await db.execute(
                delete(TeamPosition).where(TeamPosition.race_session_id == session.id)
            )

            for t in teams_data:
                team = TeamPosition(
                    race_session_id=session.id,
                    position=t["position"],
                    kart=t["kart"],
                    team_name=t["team_name"],
                )
                kart_diffs = existing_diffs.get(t["kart"], {})
                for d in t["drivers"]:
                    name = d["driver_name"]
                    diff = kart_diffs.get(name.strip().lower(), d.get("differential_ms", 0))
                    driver = TeamDriver(
                        driver_name=name,
                        differential_ms=diff,
                    )
                    team.drivers.append(driver)
                db.add(team)

            await db.commit()

            new_team_positions = {}
            new_driver_diffs = {}
            for t in teams_data:
                new_team_positions[t["kart"]] = t["position"]
                kart_diffs = existing_diffs.get(t["kart"], {})
                if t["drivers"]:
                    new_driver_diffs[t["kart"]] = {}
                    for d in t["drivers"]:
                        name = d["driver_name"]
                        diff = kart_diffs.get(name.strip().lower(), 0)
                        new_driver_diffs[t["kart"]][name.strip().lower()] = diff

            self._driver_differentials = new_driver_diffs
            self._team_positions = new_team_positions

    async def _broadcast_fifo(self):
        """Broadcast only FIFO data immediately after a pit entry."""
        if not self.state._ws_clients:
            return
        msg = json.dumps({
            "type": "fifo_update",
            "data": {
                "fifo": {
                    "queue": self.state.fifo_queue,
                    "score": self.state.fifo_score,
                    "history": self.state.fifo_history[-10:],
                },
            },
        })
        dead = set()
        for client in self.state._ws_clients:
            try:
                await client.send_text(msg)
            except Exception:
                dead.add(client)
        for c in dead:
            self.state._ws_clients.discard(c)

    async def broadcast_snapshot(self):
        """Broadcast a full snapshot to all connected WS clients."""
        if self.state._ws_clients:
            snapshot = self.state.get_snapshot()
            data = json.dumps(snapshot)
            dead = set()
            for client in self.state._ws_clients:
                try:
                    await client.send_text(data)
                except Exception:
                    dead.add(client)
            for c in dead:
                self.state._ws_clients.discard(c)

    async def _analytics_loop(self):
        refresh = getattr(self, "_refresh_s", 30)
        while True:
            await asyncio.sleep(max(5, refresh))
            try:
                if len(self.state.karts) > 0:
                    team_pos = getattr(self, "_team_positions", {})
                    driver_diffs = getattr(self, "_driver_differentials", {})
                    compute_clustering(self.state, team_pos, driver_diffs)
                    self.fifo.apply_to_state(self.state)
                    compute_classification(self.state)

                    if self.state._ws_clients:
                        update = {
                            "type": "analytics",
                            "data": {
                                "karts": [k.to_dict() for k in sorted(
                                    self.state.karts.values(), key=lambda k: k.position or 999
                                )],
                                "fifo": {
                                    "queue": self.state.fifo_queue,
                                    "score": self.state.fifo_score,
                                    "history": self.state.fifo_history[-10:],
                                },
                                "classification": self.state.classification,
                                "config": {
                                    "circuitLengthM": self.state.circuit_length_m,
                                    "pitTimeS": self.state.pit_time_s,
                                    "ourKartNumber": self.state.our_kart_number,
                                    "minPits": self.state.min_pits,
                                    "maxStintMin": self.state.max_stint_min,
                                    "minStintMin": self.state.min_stint_min,
                                    "durationMin": self.state.duration_min,
                                    "boxLines": self.state.box_lines,
                                    "boxKarts": self.state.box_karts,
                                    "minDriverTimeMin": self.state.min_driver_time_min,
                                    "pitClosedStartMin": self.state.pit_closed_start_min,
                                    "pitClosedEndMin": self.state.pit_closed_end_min,
                                },
                            },
                        }
                        data = json.dumps(update)
                        dead = set()
                        for client in self.state._ws_clients:
                            try:
                                await client.send_text(data)
                            except Exception:
                                dead.add(client)
                        for c in dead:
                            self.state._ws_clients.discard(c)
            except Exception as e:
                logger.error(f"Analytics error (user={self.user_id}): {e}", exc_info=True)


class ReplaySession:
    """Per-user replay session with isolated state, engine, FIFO and analytics."""

    def __init__(self, user_id: int):
        self.user_id = user_id
        self.parser = ApexMessageParser()
        self.state = RaceStateManager()
        self.fifo = FifoManager()
        self.differentials: dict = {"team_positions": {}, "driver_differentials": {}}
        self._analytics_task: asyncio.Task | None = None

        self._init_teams_loaded = False  # Track if we already auto-loaded teams

        from app.apex.replay import ReplayEngine

        async def on_events(events):
            # Keep state aware of replay speed for lap-based race countdown simulation
            self.state._replay_speed = getattr(self.engine, '_speed', 1.0)

            # Broadcast replay status (time + progress) to clients
            if self.state._ws_clients:
                status = self.engine.status
                if status.get("currentTime"):
                    rs_msg = json.dumps({
                        "type": "replay_status",
                        "data": {
                            "progress": status["progress"],
                            "currentTime": status["currentTime"],
                            "paused": status["paused"],
                            "active": status["active"],
                            "speed": status.get("speed", 1),
                        },
                    })
                    dead = set()
                    for client in self.state._ws_clients:
                        try:
                            await client.send_text(rs_msg)
                        except Exception:
                            dead.add(client)
                    for c in dead:
                        self.state._ws_clients.discard(c)

            # Track pit transitions
            pre_pit_status = {
                row_id: kart.pit_status
                for row_id, kart in self.state.karts.items()
            }
            await self.state.handle_events(events)

            # Detect init kart batch -> auto-load teams into config
            init_kart_events = [e for e in events
                                if e.type == EventType.INIT and e.value == "kart"]
            if init_kart_events and not self._init_teams_loaded:
                self._init_teams_loaded = True
                asyncio.create_task(self._auto_load_teams())

            pit_in_karts = []
            for row_id, kart in self.state.karts.items():
                if (kart.pit_status == "in_pit"
                        and pre_pit_status.get(row_id) != "in_pit"):
                    pit_in_karts.append(kart)

            if pit_in_karts:
                try:
                    compute_clustering(
                        self.state,
                        self.differentials["team_positions"],
                        self.differentials["driver_differentials"],
                    )
                except Exception as e:
                    logger.warning(f"Replay clustering before FIFO entry failed: {e}")

                sorted_by_avg = sorted(
                    self.state.karts.values(),
                    key=lambda k: k.avg_lap_ms if k.avg_lap_ms > 0 else float("inf"),
                )
                avg_pos_map = {k.kart_number: idx + 1 for idx, k in enumerate(sorted_by_avg)}

                for kart in pit_in_karts:
                    recent = [
                        {"lapTime": l["lapTime"], "totalLap": l["totalLap"],
                         "driverName": l.get("driverName", "")}
                        for l in kart.valid_laps[-5:]
                    ]
                    self.fifo.add_entry(
                        kart.tier_score,
                        kart_number=kart.kart_number,
                        team_name=kart.team_name,
                        driver_name=kart.driver_name,
                        avg_lap_ms=kart.avg_lap_ms,
                        avg_position=avg_pos_map.get(kart.kart_number, 0),
                        recent_laps=recent,
                        pit_count=kart.pit_count,
                    )

                self.fifo.apply_to_state(self.state)
                await self._broadcast_fifo()

        self.engine = ReplayEngine(self.parser, on_events, logs_dir="data/logs")

    async def start_analytics(self):
        if self._analytics_task and not self._analytics_task.done():
            return
        self._analytics_task = asyncio.create_task(self._analytics_loop())

    async def _auto_load_teams(self):
        """Auto-load karts from replay init as teams, save to DB, notify frontend.
        Merges with existing driver differentials from the user's config."""
        await asyncio.sleep(0.5)  # Wait for all init karts to arrive

        if not self.state.karts:
            return

        teams_data = []
        for i, kart in enumerate(
            sorted(self.state.karts.values(), key=lambda k: k.position or 999)
        ):
            teams_data.append({
                "position": i + 1,
                "kart": kart.kart_number,
                "team_name": kart.team_name,
                "drivers": [],
            })

        if not teams_data:
            return

        # Save to DB (merging existing differentials)
        try:
            from app.models.database import async_session
            from app.models.schemas import RaceSession, TeamPosition, TeamDriver
            from sqlalchemy import select, delete
            from sqlalchemy.orm import selectinload

            async with async_session() as db:
                result = await db.execute(
                    select(RaceSession)
                    .options(
                        selectinload(RaceSession.team_positions)
                        .selectinload(TeamPosition.drivers)
                    )
                    .where(
                        RaceSession.user_id == self.user_id,
                        RaceSession.is_active == True,
                    )
                )
                session = result.scalar_one_or_none()
                if not session:
                    logger.warning(f"No active session for user {self.user_id}, "
                                   f"skipping replay team auto-load")
                    return

                # Preserve existing differentials
                existing_diffs: dict[int, dict[str, int]] = {}
                for tp in session.team_positions:
                    kart_diffs = {}
                    for d in tp.drivers:
                        kart_diffs[d.driver_name.strip().lower()] = d.differential_ms
                    existing_diffs[tp.kart] = kart_diffs

                # Replace teams
                await db.execute(
                    delete(TeamPosition).where(TeamPosition.race_session_id == session.id)
                )

                for t in teams_data:
                    team = TeamPosition(
                        race_session_id=session.id,
                        position=t["position"],
                        kart=t["kart"],
                        team_name=t["team_name"],
                    )
                    # Re-attach existing drivers with their differentials
                    kart_diffs = existing_diffs.get(t["kart"], {})
                    for name, diff in kart_diffs.items():
                        driver = TeamDriver(driver_name=name, differential_ms=diff)
                        team.drivers.append(driver)
                    db.add(team)

                await db.commit()

            # Update in-memory differentials
            new_team_positions = {}
            new_driver_diffs = {}
            for t in teams_data:
                new_team_positions[t["kart"]] = t["position"]
                kart_diffs = existing_diffs.get(t["kart"], {})
                if kart_diffs:
                    new_driver_diffs[t["kart"]] = dict(kart_diffs)

            self.differentials["team_positions"] = new_team_positions
            self.differentials["driver_differentials"] = new_driver_diffs

            logger.info(f"Replay auto-loaded {len(teams_data)} teams "
                        f"(user_id={self.user_id})")

        except Exception as e:
            logger.error(f"Replay auto-load teams failed (user={self.user_id}): {e}",
                         exc_info=True)

        # Broadcast teams_updated to frontend so TeamEditor reloads
        if self.state._ws_clients:
            msg = json.dumps({"type": "teams_updated", "data": {"teams": teams_data}})
            dead = set()
            for client in self.state._ws_clients:
                try:
                    await client.send_text(msg)
                except Exception:
                    dead.add(client)
            for c in dead:
                self.state._ws_clients.discard(c)

    async def stop(self):
        await self.engine.stop()
        self._init_teams_loaded = False
        if self._analytics_task:
            self._analytics_task.cancel()
            try:
                await self._analytics_task
            except asyncio.CancelledError:
                pass
        self.state.reset()
        await self.state._broadcast(self.state.get_snapshot())
        logger.info(f"Replay session stopped (user_id={self.user_id})")

    def apply_config(self, session, circuit=None):
        def _val(v, default):
            return v if v is not None else default

        self.state.box_karts = _val(session.box_karts, 30)
        self.state.box_lines = _val(session.box_lines, 2)
        self.state.our_kart_number = _val(session.our_kart_number, 0)
        self.state.duration_min = _val(session.duration_min, 180)
        self.state.max_stint_min = _val(session.max_stint_min, 40)
        self.state.min_stint_min = _val(session.min_stint_min, 15)
        self.state.min_pits = _val(session.min_pits, 3)
        self.state.pit_time_s = _val(session.pit_time_s, 120)
        self.state.min_driver_time_min = _val(session.min_driver_time_min, 30)
        self.state.rain_mode = _val(getattr(session, 'rain', False), False)
        self.state.pit_closed_start_min = _val(getattr(session, 'pit_closed_start_min', 0), 0)
        self.state.pit_closed_end_min = _val(getattr(session, 'pit_closed_end_min', 0), 0)
        if circuit:
            self.state.circuit_length_m = _val(circuit.length_m, 1100)
            self.state.laps_discard = _val(circuit.laps_discard, 2)
            self.state.lap_differential = _val(circuit.lap_differential, 3000)

    def update_config_fields(self, session, circuit=None):
        self.state.our_kart_number = session.our_kart_number
        self.state.min_pits = session.min_pits
        self.state.max_stint_min = session.max_stint_min
        self.state.min_stint_min = session.min_stint_min
        self.state.box_lines = session.box_lines
        self.state.box_karts = session.box_karts
        self.state.update_duration(session.duration_min)
        self.state.pit_time_s = session.pit_time_s
        self.state.min_driver_time_min = session.min_driver_time_min
        self.state.rain_mode = getattr(session, 'rain', False) or False
        self.state.pit_closed_start_min = getattr(session, 'pit_closed_start_min', 0) or 0
        self.state.pit_closed_end_min = getattr(session, 'pit_closed_end_min', 0) or 0
        if circuit:
            self.state.circuit_length_m = circuit.length_m or self.state.circuit_length_m
        if (self.fifo.queue_size != session.box_karts
                or self.fifo.box_lines != session.box_lines):
            self.fifo.update_config(session.box_karts, session.box_lines)

    async def _broadcast_fifo(self):
        if not self.state._ws_clients:
            return
        msg = json.dumps({
            "type": "fifo_update",
            "data": {
                "fifo": {
                    "queue": self.state.fifo_queue,
                    "score": self.state.fifo_score,
                    "history": self.state.fifo_history[-10:],
                },
            },
        })
        dead = set()
        for client in self.state._ws_clients:
            try:
                await client.send_text(msg)
            except Exception:
                dead.add(client)
        for c in dead:
            self.state._ws_clients.discard(c)

    async def _analytics_loop(self):
        while True:
            await asyncio.sleep(10)
            try:
                if len(self.state.karts) > 0:
                    compute_clustering(
                        self.state,
                        self.differentials["team_positions"],
                        self.differentials["driver_differentials"],
                    )
                    self.fifo.apply_to_state(self.state)
                    compute_classification(self.state)

                    if self.state._ws_clients:
                        update = {
                            "type": "analytics",
                            "data": {
                                "karts": [k.to_dict() for k in sorted(
                                    self.state.karts.values(), key=lambda k: k.position or 999
                                )],
                                "fifo": {
                                    "queue": self.state.fifo_queue,
                                    "score": self.state.fifo_score,
                                    "history": self.state.fifo_history[-10:],
                                },
                                "classification": self.state.classification,
                                "config": {
                                    "circuitLengthM": self.state.circuit_length_m,
                                    "pitTimeS": self.state.pit_time_s,
                                    "ourKartNumber": self.state.our_kart_number,
                                    "minPits": self.state.min_pits,
                                    "maxStintMin": self.state.max_stint_min,
                                    "minStintMin": self.state.min_stint_min,
                                    "durationMin": self.state.duration_min,
                                    "boxLines": self.state.box_lines,
                                    "boxKarts": self.state.box_karts,
                                    "minDriverTimeMin": self.state.min_driver_time_min,
                                    "pitClosedStartMin": self.state.pit_closed_start_min,
                                    "pitClosedEndMin": self.state.pit_closed_end_min,
                                },
                            },
                        }
                        data = json.dumps(update)
                        dead = set()
                        for client in self.state._ws_clients:
                            try:
                                await client.send_text(data)
                            except Exception:
                                dead.add(client)
                        for c in dead:
                            self.state._ws_clients.discard(c)
            except Exception as e:
                logger.error(f"Replay analytics error (user={self.user_id}): {e}", exc_info=True)


class ReplayRegistry:
    """Registry of per-user replay sessions."""

    def __init__(self):
        self._sessions: dict[int, ReplaySession] = {}

    def get(self, user_id: int) -> ReplaySession | None:
        return self._sessions.get(user_id)

    def get_or_create(self, user_id: int) -> ReplaySession:
        if user_id not in self._sessions:
            self._sessions[user_id] = ReplaySession(user_id)
        return self._sessions[user_id]

    async def stop_session(self, user_id: int):
        session = self._sessions.pop(user_id, None)
        if session:
            await session.stop()

    async def stop_all(self):
        for session in self._sessions.values():
            await session.stop()
        self._sessions.clear()


class SessionRegistry:
    """Registry of active user sessions."""

    def __init__(self):
        self._sessions: dict[int, UserSession] = {}

    def get(self, user_id: int) -> UserSession | None:
        return self._sessions.get(user_id)

    async def start_session(self, user_id: int, circuit_id: int,
                            circuit_hub, **config) -> UserSession:
        """Start or restart a user's race session.
        Subscribes to CircuitHub for the given circuit."""
        # Stop existing session if any
        if user_id in self._sessions:
            old = self._sessions[user_id]
            circuit_hub.unsubscribe(old.circuit_id, user_id)
            await old.stop()

        session = UserSession(user_id, circuit_id)
        session.configure(**config)

        # Subscribe to circuit hub
        circuit_hub.subscribe(circuit_id, user_id, session.process_message)

        # Start analytics
        await session.start()

        self._sessions[user_id] = session
        return session

    async def stop_session(self, user_id: int, circuit_hub=None):
        """Stop a user's race session."""
        session = self._sessions.pop(user_id, None)
        if session:
            if circuit_hub:
                circuit_hub.unsubscribe(session.circuit_id, user_id)
            await session.stop()

    async def stop_all(self):
        """Stop all sessions (shutdown)."""
        for session in self._sessions.values():
            await session.stop()
        self._sessions.clear()
