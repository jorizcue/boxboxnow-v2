"""
Central race state manager.
Maintains all race state in memory and dispatches updates to browser clients.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from app.apex.parser import RaceEvent, EventType, time_to_ms

logger = logging.getLogger(__name__)


@dataclass
class KartState:
    row_id: str
    kart_number: int
    team_name: str = ""
    driver_name: str = ""
    driver_time: str = ""
    position: int = 0
    total_laps: int = 0
    last_lap_ms: int = 0
    best_lap_ms: int = 0
    gap: str = ""
    interval: str = ""
    pit_count: int = 0
    pit_status: str = "racing"  # "racing" | "in_pit"
    pit_time: str = ""
    visual_status: str = ""     # gs, gf, gm, gl
    arrow_status: str = ""      # su, sd, sf, sr
    stint_start_time: float = 0.0
    stint_laps: list[int] = field(default_factory=list)
    all_laps: list[int] = field(default_factory=list)
    last_pit_lap: int = 0

    # Analytics results (set by engines)
    tier_score: int = 50
    avg_lap_ms: float = 0.0
    best_avg_ms: float = 0.0
    cluster: int = 2
    driver_differential_ms: int = 0  # current driver's differential applied

    def stint_duration_s(self) -> float:
        if self.stint_start_time <= 0:
            return 0.0
        return time.time() - self.stint_start_time

    def to_dict(self) -> dict:
        return {
            "rowId": self.row_id,
            "kartNumber": self.kart_number,
            "teamName": self.team_name,
            "driverName": self.driver_name,
            "driverTime": self.driver_time,
            "position": self.position,
            "totalLaps": self.total_laps,
            "lastLapMs": self.last_lap_ms,
            "bestLapMs": self.best_lap_ms,
            "gap": self.gap,
            "interval": self.interval,
            "pitCount": self.pit_count,
            "pitStatus": self.pit_status,
            "pitTime": self.pit_time,
            "visualStatus": self.visual_status,
            "arrowStatus": self.arrow_status,
            "stintLapsCount": len(self.stint_laps),
            "stintDurationS": self.stint_duration_s(),
            "tierScore": self.tier_score,
            "driverDifferentialMs": self.driver_differential_ms,
            "avgLapMs": self.avg_lap_ms,
            "bestAvgMs": self.best_avg_ms,
        }


class RaceStateManager:
    """Manages all in-memory race state and broadcasts to clients."""

    def __init__(self):
        self.karts: dict[str, KartState] = {}
        self.race_started: bool = False
        self.countdown_ms: int = 0
        self.track_name: str = ""
        self.start_time: float = 0.0
        self._ws_clients: set = set()
        self._event_buffer: list[dict] = []
        self._broadcast_lock = asyncio.Lock()

        # Analytics state
        self.fifo_queue: list[int] = []
        self.fifo_score: float = 0.0
        self.fifo_history: list[dict] = []
        self.classification: list[dict] = []

        # Config (loaded at runtime)
        self.circuit_length_m: int = 1100
        self.pit_time_s: int = 120
        self.laps_discard: int = 2
        self.lap_differential: float = 1.15
        self.rain_mode: bool = False
        self.our_kart_number: int = 0
        self.min_pits: int = 3
        self.max_stint_min: int = 40
        self.min_stint_min: int = 15
        self.box_lines: int = 2
        self.box_karts: int = 30
        self.duration_min: int = 180

    def add_client(self, ws):
        self._ws_clients.add(ws)
        logger.info(f"Client connected. Total: {len(self._ws_clients)}")

    def remove_client(self, ws):
        self._ws_clients.discard(ws)
        logger.info(f"Client disconnected. Total: {len(self._ws_clients)}")

    async def handle_events(self, events: list[RaceEvent]):
        """Process a batch of parsed events and broadcast updates."""
        updates = []
        for event in events:
            update = self._apply_event(event)
            if update:
                updates.append(update)

        if updates and self._ws_clients:
            await self._broadcast({"type": "update", "events": updates})

    def _apply_event(self, event: RaceEvent) -> dict | None:
        """Apply a single event to state. Returns update dict for broadcast."""
        row_id = event.row_id

        if event.type == EventType.INIT and event.value == "kart":
            kart = KartState(
                row_id=row_id,
                kart_number=event.extra.get("kart_number", 0),
                team_name=event.extra.get("team_name", ""),
                position=event.extra.get("position", 0),
                total_laps=int(event.extra.get("total_laps", "0") or "0"),
                gap=event.extra.get("gap", ""),
                interval=event.extra.get("interval", ""),
                pit_time=event.extra.get("pit_time", ""),
                pit_count=int(event.extra.get("pit_count", "0") or "0"),
            )
            # Parse lap times from init
            last_lap_str = event.extra.get("last_lap", "")
            best_lap_str = event.extra.get("best_lap", "")
            if last_lap_str:
                kart.last_lap_ms = time_to_ms(last_lap_str)
            if best_lap_str:
                kart.best_lap_ms = time_to_ms(best_lap_str)
            kart.stint_start_time = time.time()
            self.karts[row_id] = kart
            return None  # Init sends snapshot, not individual updates

        if event.type == EventType.INIT and event.value == "init":
            # Reset state for new init
            self.karts.clear()
            self.race_started = False
            return None

        # Get or skip unknown karts
        kart = self.karts.get(row_id)
        if not kart and row_id:
            return None

        if event.type == EventType.LAP:
            lap_ms = time_to_ms(event.value)
            if lap_ms > 0 and kart:
                kart.last_lap_ms = lap_ms
                kart.all_laps.append(lap_ms)
                # Only add to stint laps if it passes quality filter
                if self._is_valid_lap(kart, lap_ms):
                    kart.stint_laps.append(lap_ms)
                return {"event": "lap", "rowId": row_id,
                        "kartNumber": kart.kart_number,
                        "lapTimeMs": lap_ms,
                        "lapClass": event.extra.get("class", "tn")}

        elif event.type == EventType.LAP_MS:
            lap_ms = int(event.value)
            if lap_ms > 0 and kart:
                kart.last_lap_ms = lap_ms
                kart.all_laps.append(lap_ms)
                if self._is_valid_lap(kart, lap_ms):
                    kart.stint_laps.append(lap_ms)
                return {"event": "lapMs", "rowId": row_id,
                        "kartNumber": kart.kart_number, "lapTimeMs": lap_ms}

        elif event.type == EventType.BEST_LAP:
            lap_ms = time_to_ms(event.value)
            if lap_ms > 0 and kart:
                kart.best_lap_ms = lap_ms
                return {"event": "bestLap", "rowId": row_id,
                        "kartNumber": kart.kart_number, "lapTimeMs": lap_ms}

        elif event.type == EventType.PIT_IN and kart:
            kart.pit_status = "in_pit"
            kart.last_pit_lap = kart.total_laps
            return {"event": "pitIn", "rowId": row_id,
                    "kartNumber": kart.kart_number,
                    "lap": kart.total_laps}

        elif event.type == EventType.PIT_OUT and kart:
            kart.pit_status = "racing"
            kart.stint_start_time = time.time()
            kart.stint_laps = []
            kart.pit_count += 1
            return {"event": "pitOut", "rowId": row_id,
                    "kartNumber": kart.kart_number,
                    "pitCount": kart.pit_count}

        elif event.type == EventType.RANKING and kart:
            kart.position = int(event.value)
            return {"event": "position", "rowId": row_id,
                    "kartNumber": kart.kart_number,
                    "position": kart.position}

        elif event.type == EventType.GAP and kart:
            kart.gap = event.value
            return {"event": "gap", "rowId": row_id, "value": event.value}

        elif event.type == EventType.INTERVAL and kart:
            kart.interval = event.value
            return {"event": "interval", "rowId": row_id, "value": event.value}

        elif event.type == EventType.TOTAL_LAPS and kart:
            try:
                kart.total_laps = int(event.value)
            except ValueError:
                pass
            return {"event": "totalLaps", "rowId": row_id,
                    "value": kart.total_laps}

        elif event.type == EventType.PIT_TIME and kart:
            kart.pit_time = event.value
            return {"event": "pitTime", "rowId": row_id, "value": event.value}

        elif event.type == EventType.PIT_COUNT and kart:
            try:
                kart.pit_count = int(event.value)
            except ValueError:
                pass
            return {"event": "pitCount", "rowId": row_id,
                    "value": kart.pit_count}

        elif event.type == EventType.DRIVER_TEAM and kart:
            kart.driver_name = event.value
            kart.driver_time = event.extra.get("time", "")
            return {"event": "driver", "rowId": row_id,
                    "driverName": kart.driver_name,
                    "driverTime": kart.driver_time}

        elif event.type == EventType.TEAM and kart:
            kart.team_name = event.value
            return {"event": "team", "rowId": row_id,
                    "teamName": kart.team_name}

        elif event.type == EventType.COUNTDOWN:
            self.countdown_ms = int(event.value)
            if not self.race_started:
                self.race_started = True
                self.start_time = time.time()
            return {"event": "countdown", "ms": self.countdown_ms}

        elif event.type == EventType.COUNT_UP:
            self.countdown_ms = -int(event.value)
            return {"event": "countUp", "ms": int(event.value)}

        elif event.type == EventType.STATUS and kart:
            if event.value in ("gs", "gf", "gm", "gl"):
                kart.visual_status = event.value
            elif event.value in ("su", "sd", "sf", "sr"):
                kart.arrow_status = event.value
            return {"event": "status", "rowId": row_id, "value": event.value}

        elif event.type == EventType.MESSAGE:
            if event.extra.get("subtype") == "track":
                self.track_name = event.value
                return {"event": "track", "name": event.value}
            return {"event": "message", "text": event.value}

        return None

    def _is_valid_lap(self, kart: KartState, lap_ms: int) -> bool:
        """Check if a lap time should be included in analytics."""
        if lap_ms <= 0:
            return False

        # Discard first N laps after pit
        laps_since_pit = kart.total_laps - kart.last_pit_lap
        if laps_since_pit <= self.laps_discard:
            return False

        # In rain mode, don't filter outliers
        if self.rain_mode:
            return True

        # Filter outlier laps (too slow)
        if kart.best_lap_ms > 0:
            threshold = kart.best_lap_ms * self.lap_differential
            if lap_ms > threshold:
                return False

        return True

    def get_snapshot(self) -> dict:
        """Get full state snapshot for new client connections."""
        sorted_karts = sorted(self.karts.values(), key=lambda k: k.position or 999)
        return {
            "type": "snapshot",
            "data": {
                "raceStarted": self.race_started,
                "countdownMs": self.countdown_ms,
                "trackName": self.track_name,
                "karts": [k.to_dict() for k in sorted_karts],
                "fifo": {
                    "queue": self.fifo_queue,
                    "score": self.fifo_score,
                    "history": self.fifo_history[-10:],
                },
                "classification": self.classification,
                "config": {
                    "circuitLengthM": self.circuit_length_m,
                    "pitTimeS": self.pit_time_s,
                    "ourKartNumber": self.our_kart_number,
                    "minPits": self.min_pits,
                    "maxStintMin": self.max_stint_min,
                    "minStintMin": self.min_stint_min,
                    "durationMin": self.duration_min,
                },
            },
        }

    async def _broadcast(self, message: dict):
        """Send message to all connected browser clients."""
        import json
        data = json.dumps(message)
        dead_clients = set()
        for client in self._ws_clients:
            try:
                await client.send_text(data)
            except Exception:
                dead_clients.add(client)
        for client in dead_clients:
            self._ws_clients.discard(client)
