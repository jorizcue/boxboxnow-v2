"""
Multi-tenant state registry.
Maps user_id -> (RaceStateManager, ApexClient, FifoManager, parser)
so each user has their own isolated race state and Apex connection.
"""

import asyncio
import json
import logging
from app.engine.state import RaceStateManager
from app.engine.fifo import FifoManager
from app.engine.clustering import compute_clustering
from app.engine.classification import compute_classification
from app.apex.parser import ApexMessageParser, EventType
from app.apex.client import ApexClient
from app.apex.api_client import ApexApiClient, DEFAULT_PHP_API_URL
from app.apex.recorder import RaceRecorder
from app.config import get_settings

logger = logging.getLogger(__name__)


class UserSession:
    """All runtime state for a single user's active race."""

    def __init__(self, user_id: int, ws_url: str):
        self.user_id = user_id
        self.parser = ApexMessageParser()
        self.state = RaceStateManager()
        self.fifo = FifoManager()
        self.recorder = RaceRecorder()
        self.api_client: ApexApiClient | None = None
        self._load_drivers_task: asyncio.Task | None = None

        async def on_events(events):
            # Track which karts were NOT in pit before processing
            pre_pit_status = {
                row_id: kart.pit_status
                for row_id, kart in self.state.karts.items()
            }
            await self.state.handle_events(events)

            # Detect init kart batch → trigger driver loading from PHP API
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

                for kart in pit_in_karts:
                    logger.info(
                        f"FIFO entry: kart #{kart.kart_number} pit_in "
                        f"tier_score={kart.tier_score}"
                    )
                    self.fifo.add_entry(
                        kart.tier_score,
                        kart_number=kart.kart_number,
                        team_name=kart.team_name,
                        driver_name=kart.driver_name,
                    )

        self.on_events = on_events
        self.apex_client = ApexClient(ws_url, self.parser, on_events, recorder=self.recorder)
        self._analytics_task: asyncio.Task | None = None

    async def start(self):
        """Start Apex connection and analytics loop."""
        await self.apex_client.start()
        self._analytics_task = asyncio.create_task(self._analytics_loop())
        logger.info(f"User session started (user_id={self.user_id})")

    async def stop(self):
        """Stop all tasks."""
        await self.apex_client.stop()
        if self.recorder.is_recording:
            self.recorder.stop()
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

    def configure(self, circuit_length_m: int, pit_time_s: int, laps_discard: int,
                  lap_differential: float, rain: bool, our_kart: int, min_pits: int,
                  max_stint_min: int, min_stint_min: int, box_lines: int,
                  box_karts: int, duration_min: int, refresh_s: int):
        """Apply race session config to state and fifo."""
        self.state.circuit_length_m = circuit_length_m or 1100
        self.state.pit_time_s = pit_time_s or 120
        self.state.laps_discard = laps_discard
        self.state.lap_differential = int(lap_differential)  # diferencial_vueltas in ms (absolute offset)
        self.state.rain_mode = rain
        self.state.our_kart_number = our_kart
        self.state.min_pits = min_pits
        self.state.max_stint_min = max_stint_min
        self.state.min_stint_min = min_stint_min
        self.state.box_lines = box_lines
        self.state.box_karts = box_karts
        self.state.duration_min = duration_min
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
        """Set driver differentials and team positions for clustering.

        Args:
            differentials: {kart_number: {driver_name_lower: differential_ms}}
            team_positions: {kart_number: theoretical_position}
        """
        self._driver_differentials = differentials
        self._team_positions = team_positions

    async def _load_drivers_from_api(self):
        """Fetch drivers from PHP API for all karts, save to DB, notify frontend.

        Called when init kart events arrive (race starts / grid reload).
        """
        if not self.api_client:
            return

        # Small delay to ensure all init events have been processed
        await asyncio.sleep(1.0)

        logger.info(f"Loading drivers from PHP API for {len(self.state.karts)} karts "
                     f"(user_id={self.user_id})")

        teams_data = []  # List of {position, kart, team_name, drivers: [{driver_name, differential_ms}]}

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
                            "differential_ms": 0,  # Will be merged with existing
                        })
                    if drivers:
                        logger.info(f"  Kart #{kart.kart_number} ({kart.team_name}): "
                                     f"{len(drivers)} drivers")
            except Exception as e:
                logger.warning(f"  Failed to load drivers for kart #{kart.kart_number}: {e}")

            teams_data.append(team_entry)

        if not teams_data:
            return

        # Save to DB, preserving existing differentials
        try:
            await self._save_teams_to_db(teams_data)
            logger.info(f"Saved {len(teams_data)} teams to DB (user_id={self.user_id})")
        except Exception as e:
            logger.error(f"Failed to save teams to DB: {e}", exc_info=True)

        # Notify frontend to reload teams
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
            # Get active session
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

            # Build map of existing differentials: {kart_number: {driver_name_lower: diff_ms}}
            existing_diffs: dict[int, dict[str, int]] = {}
            for tp in session.team_positions:
                kart_diffs = {}
                for d in tp.drivers:
                    kart_diffs[d.driver_name.strip().lower()] = d.differential_ms
                existing_diffs[tp.kart] = kart_diffs

            # Delete existing teams
            await db.execute(
                delete(TeamPosition).where(TeamPosition.race_session_id == session.id)
            )

            # Insert new teams with merged differentials
            for t in teams_data:
                team = TeamPosition(
                    race_session_id=session.id,
                    position=t["position"],
                    kart=t["kart"],
                    team_name=t["team_name"],
                )
                kart_diffs = existing_diffs.get(t["kart"], {})
                for d in t["drivers"]:
                    # Preserve existing differential if driver already had one
                    name = d["driver_name"]
                    diff = kart_diffs.get(name.strip().lower(), d.get("differential_ms", 0))
                    driver = TeamDriver(
                        driver_name=name,
                        differential_ms=diff,
                    )
                    team.drivers.append(driver)
                db.add(team)

            await db.commit()

            # Update in-memory differentials for clustering
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

    async def broadcast_snapshot(self):
        """Broadcast a full snapshot to all connected WS clients.
        Used when config changes so the frontend gets updated immediately."""
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


class SessionRegistry:
    """Registry of active user sessions."""

    def __init__(self):
        self._sessions: dict[int, UserSession] = {}

    def get(self, user_id: int) -> UserSession | None:
        return self._sessions.get(user_id)

    async def start_session(self, user_id: int, ws_port: int, **config) -> UserSession:
        """Start or restart a user's race session."""
        # Stop existing session if any
        if user_id in self._sessions:
            await self._sessions[user_id].stop()

        settings = get_settings()
        ws_url = f"wss://{settings.apex_ws_host}:{ws_port}"

        session = UserSession(user_id, ws_url)
        session.configure(**config)
        await session.start()

        self._sessions[user_id] = session
        return session

    async def stop_session(self, user_id: int):
        """Stop a user's race session."""
        session = self._sessions.pop(user_id, None)
        if session:
            await session.stop()

    async def stop_all(self):
        """Stop all sessions (shutdown)."""
        for session in self._sessions.values():
            await session.stop()
        self._sessions.clear()
