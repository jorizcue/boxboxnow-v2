"""
Multi-tenant state registry.
Maps user_id -> (RaceStateManager, ApexClient, FifoManager, parser)
so each user has their own isolated race state and Apex connection.
"""

import asyncio
import logging
from app.engine.state import RaceStateManager
from app.engine.fifo import FifoManager
from app.engine.clustering import compute_clustering
from app.engine.classification import compute_classification
from app.apex.parser import ApexMessageParser
from app.apex.client import ApexClient
from app.config import get_settings

logger = logging.getLogger(__name__)


class UserSession:
    """All runtime state for a single user's active race."""

    def __init__(self, user_id: int, ws_url: str):
        self.user_id = user_id
        self.parser = ApexMessageParser()
        self.state = RaceStateManager()
        self.fifo = FifoManager()

        async def on_events(events):
            await self.state.handle_events(events)
            for event in events:
                if event.type.value == "pit_in":
                    kart = self.state.karts.get(event.row_id)
                    if kart:
                        self.fifo.add_entry(kart.tier_score)

        self.on_events = on_events
        self.apex_client = ApexClient(ws_url, self.parser, on_events)
        self._analytics_task: asyncio.Task | None = None

    async def start(self):
        """Start Apex connection and analytics loop."""
        await self.apex_client.start()
        self._analytics_task = asyncio.create_task(self._analytics_loop())
        logger.info(f"User session started (user_id={self.user_id})")

    async def stop(self):
        """Stop all tasks."""
        await self.apex_client.stop()
        if self._analytics_task:
            self._analytics_task.cancel()
            try:
                await self._analytics_task
            except asyncio.CancelledError:
                pass
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

    def set_driver_differentials(self, differentials: dict[int, dict[str, int]],
                                  team_positions: dict[int, int]):
        """Set driver differentials and team positions for clustering.

        Args:
            differentials: {kart_number: {driver_name_lower: differential_ms}}
            team_positions: {kart_number: theoretical_position}
        """
        self._driver_differentials = differentials
        self._team_positions = team_positions

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
                        import json
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
