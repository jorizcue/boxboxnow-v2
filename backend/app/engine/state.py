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
class PitRecord:
    """A completed pit stop record (mirrors original pits_info table)."""
    pit_number: int          # Sequential pit number
    lap: int                 # Lap when pit-in happened
    race_time_ms: int        # Race elapsed time at pit-in (duration_ms - countdown_ms)
    on_track_ms: int         # Stint duration (time on track before this pit)
    driver_name: str         # Driver at time of pit-in
    total_driver_ms: int     # Cumulative on-track time for this driver
    pit_time_ms: int = 0     # Time spent in the pit (0 if still in pit / last pit)
    stint_laps: int = 0      # Number of laps in the stint

    def to_dict(self) -> dict:
        return {
            "pitNumber": self.pit_number,
            "lap": self.lap,
            "raceTimeMs": self.race_time_ms,
            "onTrackMs": self.on_track_ms,
            "driverName": self.driver_name,
            "totalDriverMs": self.total_driver_ms,
            "pitTimeMs": self.pit_time_ms,
            "stintLaps": self.stint_laps,
        }


@dataclass
class KartState:
    """
    In-memory state per kart. Mirrors the data_table entry from
    websocket_Secuencial.py + analytics from boxboxnow.py.
    """
    row_id: str
    kart_number: int
    team_name: str = ""
    driver_name: str = ""
    driver_time: str = ""
    position: int = 0
    total_laps: int = 0
    last_lap_ms: int = 0       # lastLapTime - last valid lap time in ms
    best_lap_ms: int = 0
    gap: str = ""
    interval: str = ""
    pit_count: int = 0          # pitNumber from original
    pit_status: str = "racing"  # "racing" | "in_pit"
    pit_time: str = ""
    visual_status: str = ""
    arrow_status: str = ""
    stint_start_time: float = 0.0
    stint_elapsed_ms: int = 0    # Accumulated lap time in current stint (works for replay too)
    stint_start_countdown_ms: int = 0  # Race clock (countdown_ms) when stint started
    last_pit_lap: int = 0       # lastPitLap - lap number when last pit occurred (0 = race start)

    # Pit-in timing (saved on PIT_IN, used on PIT_OUT to compute pit duration)
    pit_in_countdown_ms: int = 0  # Race clock when pit-in occurred

    # Pit history (list of completed pit records, like pits_info table)
    pit_history: list[PitRecord] = field(default_factory=list)

    # Per-driver cumulative on-track time (for "Total" column in PITS tab)
    driver_total_ms: dict = field(default_factory=dict)  # driver_name -> cumulative ms

    # Lap storage (replaces stage_laps_rt and stage_laps_clasif)
    # valid_laps = stage_laps_rt equivalent (filtered, per pitNumber)
    # all_laps = stage_laps_clasif equivalent (all laps including filtered)
    valid_laps: list[dict] = field(default_factory=list)  # {lapTime, totalLap, pitNumber, created_at}
    all_laps: list[dict] = field(default_factory=list)

    # Analytics results (set by clustering/classification engines)
    tier_score: int = 50
    avg_lap_ms: float = 0.0
    best_avg_ms: float = 0.0
    cluster: int = 2
    driver_differential_ms: int = 0

    def stint_duration_s(self) -> float:
        """Stint duration in seconds, based on accumulated lap times."""
        return self.stint_elapsed_ms / 1000.0

    def stint_lap_count(self) -> int:
        """Number of laps in current stint (all laps, not just valid)."""
        return sum(1 for lap in self.all_laps if lap.get("pitNumber") == self.pit_count)

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
            "stintLapsCount": self.stint_lap_count(),
            "stintDurationS": self.stint_duration_s(),
            "stintStartTime": self.stint_start_time,  # kept for backwards compat
            "stintElapsedMs": self.stint_elapsed_ms,
            "stintStartCountdownMs": self.stint_start_countdown_ms,
            "pitHistory": [p.to_dict() for p in self.pit_history],
            "driverTotalMs": self.driver_total_ms,
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
        self.fifo_queue: list[dict] = []
        self.fifo_score: float = 0.0
        self.fifo_history: list[dict] = []
        self.classification: list[dict] = []

        # Session metadata (auto-detected from Apex signals)
        self.session_title: str = ""
        self.real_start_time: str = ""  # HH:MM from green flag com|| message

        # Config (loaded at runtime)
        self.circuit_length_m: int = 1100
        self.pit_time_s: int = 120
        self.laps_discard: int = 2
        self.lap_differential: int = 3000  # diferencial_vueltas in ms (absolute offset, not multiplier)
        self.rain_mode: bool = False
        self.our_kart_number: int = 0
        self.min_pits: int = 3
        self.max_stint_min: int = 40
        self.min_stint_min: int = 15
        self.min_driver_time_min: int = 30
        self.box_lines: int = 2
        self.box_karts: int = 30
        self.duration_min: int = 180

    def reset(self):
        """Reset all race state (used when starting/stopping replay)."""
        self.karts.clear()
        self.race_started = False
        self.countdown_ms = 0
        self.track_name = ""
        self.start_time = 0.0
        self.session_title = ""
        self.real_start_time = ""
        self._event_buffer.clear()
        self.fifo_queue.clear()
        self.fifo_score = 0.0
        self.fifo_history.clear()
        self.classification.clear()
        self._first_countdown_ms = 0
        self._needs_snapshot = False

    def update_duration(self, new_duration_min: int):
        """Update duration_min and recalculate stint_start_countdown_ms
        for karts in their first stint (pit_count == 0).

        This is needed when the user corrects the race duration mid-race,
        especially after a reconnection where stint starts were estimated
        from the old duration_min.
        """
        old_duration_min = self.duration_min
        self.duration_min = new_duration_min

        if not self.race_started or old_duration_min == new_duration_min:
            return

        old_race_start_ms = old_duration_min * 60 * 1000
        new_race_start_ms = new_duration_min * 60 * 1000

        updated = 0
        for kart in self.karts.values():
            if kart.pit_count == 0 and kart.stint_start_countdown_ms > 0:
                # Only adjust karts whose stint_start was calculated from duration
                # (reconnection case). In fresh start, stint_start == _first_countdown_ms.
                if kart.stint_start_countdown_ms == old_race_start_ms:
                    kart.stint_start_countdown_ms = new_race_start_ms
                    updated += 1

        if updated:
            logger.info(f"Duration changed {old_duration_min}->{new_duration_min}min, "
                        f"updated stint_start for {updated} first-stint karts")

    def add_client(self, ws):
        self._ws_clients.add(ws)
        logger.info(f"Client connected. Total: {len(self._ws_clients)}")

    def remove_client(self, ws):
        self._ws_clients.discard(ws)
        logger.info(f"Client disconnected. Total: {len(self._ws_clients)}")

    async def handle_events(self, events: list[RaceEvent]):
        """Process a batch of parsed events and broadcast updates."""
        updates = []
        had_init_kart = False
        for event in events:
            update = self._apply_event(event)
            if update:
                updates.append(update)
            if event.type == EventType.INIT and event.value == "kart":
                had_init_kart = True

        if self._ws_clients:
            if had_init_kart or getattr(self, '_needs_snapshot', False):
                # Send full snapshot when karts init'd or race just started
                # (so frontend gets updated stintStartCountdownMs values)
                self._needs_snapshot = False
                await self._broadcast(self.get_snapshot())
            elif updates:
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
            # If race already started, first-stint karts use race start reference
            # (not current countdown, which may be seconds behind the actual start).
            # This handles the common case where grid|| arrives AFTER countdown
            # in the same message block.
            if self.race_started and kart.pit_count == 0:
                kart.stint_start_countdown_ms = getattr(self, '_race_start_ms', self.countdown_ms)
            else:
                kart.stint_start_countdown_ms = self.countdown_ms
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
            # Lap counting from cell update (exact port of original websocket_Secuencial.py)
            # Only cell updates on the llp column count as new laps.
            lap_ms = time_to_ms(event.value)
            # Minimum lap time filter: some circuits (Santos) briefly show the
            # lap NUMBER in the llp column (e.g. "1" → 1000ms) before the real
            # time. No karting lap is under 15 seconds.
            if lap_ms > 15000 and kart:
                # Skip CSS class repaints: Apex resends the same lap time with a
                # different class (e.g. tb→ti) which is NOT a new lap. Two consecutive
                # laps with identical ms is impossible in karting.
                if lap_ms == kart.last_lap_ms and kart.total_laps > 0:
                    return None
                kart.total_laps += 1
                now_str = datetime.now().strftime("%Y-%m-%dT%H:%M:%S.%f")
                lap_record = {
                    "lapTime": lap_ms,
                    "totalLap": kart.total_laps,
                    "pitNumber": kart.pit_count,
                    "kartNumber": kart.kart_number,
                    "driverName": kart.driver_name,
                    "created_at": now_str,
                }

                # Always add to all_laps (stage_laps_clasif equivalent)
                kart.all_laps.append(lap_record)

                # Outlier filter - exact port of original:
                # 1. Skip if total_lap <= lastPitLap + num_vueltas_descarte
                # 2. Skip if lap_time > lastLapTime + diferencial_vueltas AND not rain
                is_valid = True
                if kart.total_laps <= kart.last_pit_lap + self.laps_discard:
                    is_valid = False
                elif kart.last_lap_ms > 0 and not self.rain_mode:
                    if lap_ms > kart.last_lap_ms + self.lap_differential:
                        is_valid = False

                if is_valid:
                    kart.valid_laps.append(lap_record)

                # Update lastLapTime AFTER filter check (matches original order)
                kart.last_lap_ms = lap_ms
                if kart.best_lap_ms <= 0 or lap_ms < kart.best_lap_ms:
                    kart.best_lap_ms = lap_ms

                # Accumulate stint elapsed time (works for both live and replay)
                kart.stint_elapsed_ms += lap_ms

                return {"event": "lap", "rowId": row_id,
                        "kartNumber": kart.kart_number,
                        "lapTimeMs": lap_ms,
                        "lapClass": event.extra.get("class", "tn")}

        elif event.type == EventType.LAP_MS:
            # The r{id}|*|{ms}| pattern is NOT a lap event.
            # It carries a timing metric (not always the actual lap time).
            # The original code did not process this for lap counting.
            # We ignore it — laps are counted exclusively from cell updates.
            return None

        elif event.type == EventType.BEST_LAP:
            lap_ms = time_to_ms(event.value)
            if lap_ms > 0 and kart:
                kart.best_lap_ms = lap_ms
                return {"event": "bestLap", "rowId": row_id,
                        "kartNumber": kart.kart_number, "lapTimeMs": lap_ms}

        elif event.type == EventType.PIT_IN and kart:
            # Port of websocket_Secuencial.py PIT IN handling
            # Guard against duplicate pit-in (both *in| and si fire for same pit)
            if kart.pit_status == "in_pit":
                return None  # Already in pit, skip duplicate
            kart.pit_status = "in_pit"
            kart.pit_count += 1
            kart.last_pit_lap = kart.total_laps
            kart.pit_in_countdown_ms = self.countdown_ms  # Save race clock at pit-in

            # Calculate stint duration (time on track) and race elapsed time
            duration_total_ms = self.duration_min * 60 * 1000
            on_track_ms = kart.stint_start_countdown_ms - self.countdown_ms
            race_time_ms = duration_total_ms - self.countdown_ms if self.countdown_ms > 0 else abs(self.countdown_ms) + duration_total_ms
            stint_laps = kart.stint_lap_count()

            # Update per-driver cumulative time
            driver = kart.driver_name or "Unknown"
            prev_total = kart.driver_total_ms.get(driver, 0)
            kart.driver_total_ms[driver] = prev_total + on_track_ms

            # Create pit history record
            pit_record = PitRecord(
                pit_number=kart.pit_count,
                lap=kart.total_laps,
                race_time_ms=race_time_ms,
                on_track_ms=on_track_ms,
                driver_name=driver,
                total_driver_ms=kart.driver_total_ms[driver],
                pit_time_ms=0,  # Will be filled on pit-out
                stint_laps=stint_laps,
            )
            kart.pit_history.append(pit_record)

            return {"event": "pitIn", "rowId": row_id,
                    "kartNumber": kart.kart_number,
                    "pitCount": kart.pit_count,
                    "lap": kart.total_laps,
                    "pitRecord": pit_record.to_dict()}

        elif event.type == EventType.PIT_OUT and kart:
            # Port of websocket_Secuencial.py PIT OUT handling
            # Guard against duplicate pit-out (both *out| and so fire for same pit)
            if kart.pit_status == "racing":
                return None  # Already racing, skip duplicate
            # Calculate pit time (time spent in the pit)
            if kart.pit_in_countdown_ms != 0:
                pit_time_ms = kart.pit_in_countdown_ms - self.countdown_ms
                # Update the last pit record with pit_time
                if kart.pit_history:
                    kart.pit_history[-1].pit_time_ms = pit_time_ms

            kart.pit_status = "racing"
            kart.stint_start_time = time.time()
            kart.stint_elapsed_ms = 0  # Reset stint timer on pit out
            kart.stint_start_countdown_ms = self.countdown_ms  # Race clock at stint start
            kart.pit_in_countdown_ms = 0  # Clear pit-in marker
            return {"event": "pitOut", "rowId": row_id,
                    "kartNumber": kart.kart_number,
                    "pitCount": kart.pit_count,
                    "stintStartCountdownMs": self.countdown_ms}

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
            # Ignore — lap count is driven exclusively by LAP events.
            # Apex's total_laps column often sends values ahead of actual
            # crossings, causing phantom lap increments.
            return None

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
                self._trigger_race_start(trigger="countdown")
            return {"event": "countdown", "ms": self.countdown_ms}

        elif event.type == EventType.COUNT_UP:
            self.countdown_ms = -int(event.value)
            if not self.race_started:
                self._trigger_race_start(trigger="count_up")
            return {"event": "countdown", "ms": self.countdown_ms}

        elif event.type == EventType.LIGHT:
            light = event.value  # "lg"=green, "lr"=red, "lf"=finish
            logger.info(f"Light signal: {light}")
            if light == "lg" and not self.race_started:
                # Green light is the earliest race start signal (before countdown in some circuits)
                self._trigger_race_start(trigger="green_light")
            return {"event": "light", "value": light}

        elif event.type == EventType.SESSION_TITLE:
            self.session_title = event.value
            logger.info(f"Session title: {self.session_title}")
            return {"event": "sessionTitle", "value": event.value}

        elif event.type == EventType.TRACK_INFO:
            self.track_name = event.value
            circuit_length = event.extra.get("circuit_length_m")
            if circuit_length and circuit_length > 0:
                old_length = self.circuit_length_m
                self.circuit_length_m = circuit_length
                if old_length != circuit_length:
                    logger.info(f"Circuit length auto-configured: {old_length}m -> {circuit_length}m")
            return {"event": "track", "name": event.value,
                    "circuitLengthM": self.circuit_length_m}

        elif event.type == EventType.PRE_RACE_DURATION:
            # Parse HH:MM:SS -> minutes
            parts = event.value.split(":")
            if len(parts) == 3:
                try:
                    hours = int(parts[0])
                    minutes = int(parts[1])
                    duration_min = hours * 60 + minutes
                    if duration_min > 0:
                        old_duration = self.duration_min
                        self.duration_min = duration_min
                        if old_duration != duration_min:
                            logger.info(f"Race duration auto-configured: {old_duration}min -> {duration_min}min")
                except ValueError:
                    pass
            return {"event": "preDuration", "value": event.value,
                    "durationMin": self.duration_min}

        elif event.type == EventType.STATUS and kart:
            if event.value in ("gs", "gf", "gm", "gl"):
                kart.visual_status = event.value
            elif event.value in ("su", "sd", "sf", "sr"):
                kart.arrow_status = event.value
            return {"event": "status", "rowId": row_id, "value": event.value}

        elif event.type == EventType.FLAG:
            flag = event.value  # "green", "chequered", "penalty"
            real_time = event.extra.get("real_time", "")
            if flag == "green" and real_time and not self.real_start_time:
                self.real_start_time = real_time
                logger.info(f"Real race start time recorded: {real_time}")
            logger.info(f"Flag received: {flag}" + (f" at {real_time}" if real_time else ""))
            result = {"event": "flag", "flag": flag}
            if real_time:
                result["realTime"] = real_time
            if event.extra.get("kart_number"):
                result["kartNumber"] = event.extra["kart_number"]
                result["reason"] = event.extra.get("reason", "")
            return result

        elif event.type == EventType.MESSAGE:
            if event.extra.get("subtype") == "track":
                self.track_name = event.value
                return {"event": "track", "name": event.value}
            return {"event": "message", "text": event.value}

        return None

    def _trigger_race_start(self, trigger: str = "countdown"):
        """Mark the race as started and initialize stint tracking for all karts.

        Called by COUNTDOWN, COUNT_UP, or LIGHT green — whichever arrives first.
        Always uses duration_min as race start reference because the first
        countdown/signal we receive is always a few seconds late (Apex has
        already been running the timer before we get the message).
        """
        self.race_started = True
        self.start_time = time.time()

        # Use configured duration as the canonical race start reference.
        # The first countdown we receive (e.g. 10,786,217 for a 3h race)
        # is always slightly less than the true start (10,800,000).
        race_start_ms = self.duration_min * 60 * 1000
        self._race_start_ms = race_start_ms
        self._first_countdown_ms = race_start_ms

        for kart in self.karts.values():
            if kart.stint_start_countdown_ms == 0:
                if kart.pit_count == 0:
                    kart.stint_start_countdown_ms = race_start_ms
                else:
                    kart.stint_start_countdown_ms = self.countdown_ms

        logger.info(f"Race started via {trigger}. countdown_ms={self.countdown_ms}, "
                    f"race_start_ms={race_start_ms}, karts={len(self.karts)}")
        self._needs_snapshot = True

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
                    "boxLines": self.box_lines,
                    "boxKarts": self.box_karts,
                    "minDriverTimeMin": self.min_driver_time_min,
                },
                "durationMs": getattr(self, '_first_countdown_ms', 0) or self.duration_min * 60 * 1000,
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
