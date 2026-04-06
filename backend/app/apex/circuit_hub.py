"""
CircuitHub — Always-on WebSocket connections to all circuits.

Connects to every circuit's Apex Timing WebSocket on startup,
records all messages per circuit per day, broadcasts to
subscribed user sessions, and tracks live race state (race start,
pit events) per circuit for state recovery after restarts.
"""

import asyncio
import logging
import os
import re
import ssl
from datetime import datetime, date, timezone
from pathlib import Path
from typing import Callable, Awaitable

import websockets
from sqlalchemy import select, delete

from app.config import get_settings
from app.apex.parser import ApexMessageParser, EventType
from app.engine.state import RaceStateManager

logger = logging.getLogger(__name__)

RECORDINGS_BASE = "data/recordings"

# Regex patterns for lightweight pit detection in raw Apex messages
_RE_PIT_IN_STAR = re.compile(r'^(r\d+)\|\*in\|')
_RE_PIT_OUT_STAR = re.compile(r'^(r\d+)\|\*out\|')
_RE_CELL_UPDATE = re.compile(r'^(r\d+)(c\d+)\|([^|]*)\|(.*)$')
# Kart number from grid row: extract from <td> with class containing "no"
_RE_GRID_ROW = re.compile(r'<tr[^>]*id="(r\d+)"')
_RE_KART_NUM = re.compile(r'<td[^>]*class="[^"]*\bno\b[^"]*"[^>]*>(\d+)</td>')
_RE_TEAM_NAME = re.compile(r'<td[^>]*class="[^"]*\bdr\b[^"]*"[^>]*>([^<]*)</td>')


def _safe_name(name: str) -> str:
    """Convert circuit name to safe directory name."""
    return re.sub(r'[^\w\-]', '_', name.strip())[:50]


class DailyRecorder:
    """Records all messages for a circuit, one file per day."""

    def __init__(self, circuit_name: str, base_dir: str = RECORDINGS_BASE):
        self._dir = os.path.join(base_dir, _safe_name(circuit_name))
        self._file = None
        self._current_date: str | None = None
        self._msg_count = 0
        Path(self._dir).mkdir(parents=True, exist_ok=True)

    def write(self, message: str):
        today = date.today().isoformat()
        if today != self._current_date:
            self._rotate(today)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._file.write(f"{timestamp}\n{message}\n\n")
        self._msg_count += 1
        if self._msg_count % 50 == 0:
            self._file.flush()

    def _rotate(self, today: str):
        if self._file:
            self._file.flush()
            self._file.close()
        self._current_date = today
        self._msg_count = 0
        filepath = os.path.join(self._dir, f"{today}.log")
        self._file = open(filepath, "a", encoding="utf-8")
        logger.info(f"DailyRecorder: rotated to {filepath}")

    def close(self):
        if self._file:
            self._file.flush()
            self._file.close()
            self._file = None


class CircuitConnection:
    """Manages one circuit's permanent WebSocket connection.

    Also tracks live race state (race start, pit events) for recovery
    after backend restarts. State is persisted to DB and kept in memory.
    """

    def __init__(self, circuit_id: int, circuit_name: str, ws_url: str):
        self.circuit_id = circuit_id
        self.circuit_name = circuit_name
        self.ws_url = ws_url
        self._subscribers: dict[int, Callable[[str], Awaitable[None]]] = {}
        self._recorder = DailyRecorder(circuit_name)
        self._last_init_block: str | None = None
        self._task: asyncio.Task | None = None
        self._running = False
        self._reconnect_delay = 1.0
        self._connected = False

        # --- Live race tracking ---
        self._race_active = False
        self._race_start_at: datetime | None = None
        self._race_duration_ms: int = 0
        self._is_count_up = False
        self._live_race_db_id: int | None = None  # DB id of LiveRaceState row
        self._row_to_kart: dict[str, int] = {}    # r7980 -> kart_number
        self._row_to_team: dict[str, str] = {}    # r7980 -> team_name

        # --- Automatic lap persistence (runs for ALL circuits) ---
        self._lap_parser = ApexMessageParser()
        self._lap_state = RaceStateManager()  # headless (no ws_clients)
        self._lap_race_log_id: int | None = None
        self._lap_saved_per_kart: dict[int, int] = {}
        self._lap_save_lock = asyncio.Lock()
        self._lap_save_counter = 0  # batch saves every N lap events

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def message_count(self) -> int:
        """Today's message count (resets on day rotation)."""
        return self._recorder._msg_count

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    @property
    def live_race_state(self) -> dict | None:
        """Return in-memory live race state for UserSession restoration."""
        if not self._race_active or not self._race_start_at:
            return None
        now = datetime.now(timezone.utc)
        elapsed_ms = (now - self._race_start_at).total_seconds() * 1000
        estimated_countdown = max(0, int(self._race_duration_ms - elapsed_ms))
        return {
            "duration_ms": self._race_duration_ms,
            "race_start_at": self._race_start_at,
            "estimated_countdown_ms": estimated_countdown,
            "is_count_up": self._is_count_up,
            "pit_summary": {},  # Loaded from DB on demand
        }

    async def start(self):
        self._running = True
        # Restore live race state from DB if exists
        await self._restore_from_db()
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        # Finalize any pending lap data before shutdown
        await self._finalize_lap_race_log()
        self._recorder.close()
        self._connected = False

    def subscribe(self, user_id: int, callback: Callable[[str], Awaitable[None]]):
        """Subscribe a user to this circuit's message stream."""
        self._subscribers[user_id] = callback
        logger.info(f"[{self.circuit_name}] User {user_id} subscribed "
                    f"({len(self._subscribers)} subscribers)")
        # Send cached init block to late subscriber
        if self._last_init_block:
            asyncio.create_task(self._send_init(user_id, callback))

    async def _send_init(self, user_id: int, callback):
        """Send cached init block to a new subscriber."""
        try:
            await callback(self._last_init_block)
            logger.info(f"[{self.circuit_name}] Sent cached init to user {user_id}")
        except Exception as e:
            logger.error(f"[{self.circuit_name}] Failed to send init to user {user_id}: {e}")

    def unsubscribe(self, user_id: int):
        if user_id in self._subscribers:
            del self._subscribers[user_id]
            logger.info(f"[{self.circuit_name}] User {user_id} unsubscribed "
                        f"({len(self._subscribers)} subscribers)")

    async def _run(self):
        """Main loop with reconnection."""
        while self._running:
            try:
                await self._connect_and_listen()
            except asyncio.CancelledError:
                break
            except Exception as e:
                self._connected = False
                if not self._running:
                    break
                logger.warning(f"[{self.circuit_name}] Connection lost: {e}. "
                               f"Reconnecting in {self._reconnect_delay}s...")
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 2, 30.0)

    async def _connect_and_listen(self):
        use_ssl = self.ws_url.startswith("wss://")
        connect_kwargs = {
            "ping_interval": 20,
            "ping_timeout": 10,
            "close_timeout": 5,
        }
        if use_ssl:
            ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            connect_kwargs["ssl"] = ssl_context

        async with websockets.connect(self.ws_url, **connect_kwargs) as ws:
            logger.info(f"[{self.circuit_name}] Connected to {self.ws_url}")
            self._reconnect_delay = 1.0
            self._connected = True

            async for message in ws:
                if not self._running:
                    break
                await self._on_message(message)

        self._connected = False

    async def _on_message(self, message: str):
        # Cache init blocks for late subscribers + parse kart map
        if "init|" in message and "grid||" in message:
            self._last_init_block = message
            self._parse_grid_for_karts(message)

        # Record to daily log
        try:
            self._recorder.write(message)
        except Exception as e:
            logger.error(f"[{self.circuit_name}] Recording error: {e}")

        # --- Lightweight live race detection ---
        try:
            self._detect_race_events(message)
        except Exception as e:
            logger.error(f"[{self.circuit_name}] Race detection error: {e}")

        # --- Automatic lap extraction & persistence ---
        try:
            events = self._lap_parser.parse(message)
            if events:
                await self._lap_state.handle_events(events)
                has_laps = any(e.type == EventType.LAP for e in events)
                has_init = any(e.type == EventType.INIT and e.value == "init" for e in events)
                if has_init:
                    # New race: finalize previous race_log and reset
                    await self._finalize_lap_race_log()
                if has_laps:
                    self._lap_save_counter += 1
                    if self._lap_save_counter >= 5:  # batch every 5 lap events
                        self._lap_save_counter = 0
                        asyncio.create_task(self._save_circuit_laps())
        except Exception as e:
            logger.error(f"[{self.circuit_name}] Lap extraction error: {e}")

        # Broadcast to subscribers
        if self._subscribers:
            for user_id, callback in list(self._subscribers.items()):
                try:
                    await callback(message)
                except Exception as e:
                    logger.error(f"[{self.circuit_name}] Subscriber {user_id} error: {e}")

    # --- Live race event detection (lightweight, no full parser) ---

    def _parse_grid_for_karts(self, message: str):
        """Extract row_id -> kart_number mapping from init grid HTML."""
        self._row_to_kart.clear()
        self._row_to_team.clear()
        # Find grid HTML block
        for line in message.split("\n"):
            if not line.startswith("grid||"):
                continue
            html = line[6:]  # strip "grid||"
            # Split by <tr to process each row
            rows = html.split("<tr")
            for row_html in rows:
                row_match = re.search(r'id="(r\d+)"', row_html)
                if not row_match:
                    continue
                row_id = row_match.group(1)
                kart_match = _RE_KART_NUM.search(row_html)
                if kart_match:
                    try:
                        self._row_to_kart[row_id] = int(kart_match.group(1))
                    except ValueError:
                        pass
                team_match = _RE_TEAM_NAME.search(row_html)
                if team_match:
                    self._row_to_team[row_id] = team_match.group(1).strip()

    def _detect_race_events(self, message: str):
        """Scan raw message lines for race start, pit events, race end."""
        for line in message.split("\n"):
            line = line.strip()
            if not line:
                continue

            # Init reset — new session, race ends
            if line == "init|r|":
                if self._race_active:
                    self._on_race_end(reason="init_reset")
                continue

            # Countdown — race start detection
            if line.startswith("dyn1|countdown|"):
                ms_str = line.split("|")[2]
                try:
                    ms = int(ms_str)
                except ValueError:
                    continue
                if not self._race_active and ms > 0:
                    self._on_race_start(duration_ms=ms, is_count_up=False)
                continue

            # Count-up — race start detection
            if line.startswith("dyn1|count|"):
                ms_str = line.split("|")[2]
                try:
                    ms = int(ms_str)
                except ValueError:
                    continue
                if not self._race_active and ms > 0:
                    # For count-up, we don't know duration yet.
                    # Use 0 as placeholder — will be set by UserSession's config.
                    self._on_race_start(duration_ms=0, is_count_up=True)
                continue

            # Finish flag — race end
            if line == "light|lf|":
                if self._race_active:
                    self._on_race_end(reason="finish_light")
                continue

            # Checkered flag — race end
            if 'data-flag="chequered"' in line:
                if self._race_active:
                    self._on_race_end(reason="checkered_flag")
                continue

            # Pit-in via asterisk: r{id}|*in|
            m = _RE_PIT_IN_STAR.match(line)
            if m:
                row_id = m.group(1)
                kart_num = self._row_to_kart.get(row_id)
                if kart_num is not None and self._race_active:
                    team = self._row_to_team.get(row_id, "")
                    asyncio.create_task(self._persist_pit_in(kart_num, team))
                continue

            # Pit-out via asterisk: r{id}|*out|
            m = _RE_PIT_OUT_STAR.match(line)
            if m:
                row_id = m.group(1)
                kart_num = self._row_to_kart.get(row_id)
                if kart_num is not None and self._race_active:
                    asyncio.create_task(self._persist_pit_out(kart_num))
                continue

            # Cell update pit: r{id}c{col}|si|... or |so|...
            m = _RE_CELL_UPDATE.match(line)
            if m:
                row_id = m.group(1)
                action = m.group(3)
                if action == "si" and self._race_active:
                    kart_num = self._row_to_kart.get(row_id)
                    if kart_num is not None:
                        team = self._row_to_team.get(row_id, "")
                        asyncio.create_task(self._persist_pit_in(kart_num, team))
                elif action == "so" and self._race_active:
                    kart_num = self._row_to_kart.get(row_id)
                    if kart_num is not None:
                        asyncio.create_task(self._persist_pit_out(kart_num))

    # --- Race lifecycle ---

    def _on_race_start(self, duration_ms: int, is_count_up: bool):
        """Called when a new race is detected at this circuit."""
        self._race_active = True
        self._race_start_at = datetime.now(timezone.utc)
        self._race_duration_ms = duration_ms
        self._is_count_up = is_count_up
        logger.info(f"[{self.circuit_name}] Race started "
                    f"(duration={duration_ms}ms, count_up={is_count_up})")
        asyncio.create_task(self._persist_race_start())

    def _on_race_end(self, reason: str):
        """Called when the race ends (init reset or checkered flag)."""
        logger.info(f"[{self.circuit_name}] Race ended ({reason})")
        self._race_active = False
        self._race_start_at = None
        self._race_duration_ms = 0
        asyncio.create_task(self._persist_race_end())
        # Finalize lap data for this race
        asyncio.create_task(self._finalize_lap_race_log())

    # --- DB persistence ---

    async def _persist_race_start(self):
        """Write LiveRaceState row for this circuit."""
        try:
            from app.models.database import async_session
            from app.models.schemas import LiveRaceState

            async with async_session() as db:
                # Delete any existing row for this circuit (only 1 active race per circuit)
                await db.execute(
                    delete(LiveRaceState).where(LiveRaceState.circuit_id == self.circuit_id)
                )
                row = LiveRaceState(
                    circuit_id=self.circuit_id,
                    race_start_at=self._race_start_at,
                    duration_ms=self._race_duration_ms,
                    is_count_up=self._is_count_up,
                )
                db.add(row)
                await db.flush()
                self._live_race_db_id = row.id
                await db.commit()
            logger.info(f"[{self.circuit_name}] Persisted race start (db_id={self._live_race_db_id})")
        except Exception as e:
            logger.error(f"[{self.circuit_name}] Failed to persist race start: {e}")

    async def _persist_race_end(self):
        """Delete LiveRaceState row for this circuit (race is over)."""
        try:
            from app.models.database import async_session
            from app.models.schemas import LiveRaceState

            async with async_session() as db:
                await db.execute(
                    delete(LiveRaceState).where(LiveRaceState.circuit_id == self.circuit_id)
                )
                await db.commit()
            self._live_race_db_id = None
            logger.info(f"[{self.circuit_name}] Cleaned up live race state (race ended)")
        except Exception as e:
            logger.error(f"[{self.circuit_name}] Failed to clean up live race state: {e}")

    async def _persist_pit_in(self, kart_number: int, team_name: str):
        """Write LivePitEvent row on pit-in."""
        if self._live_race_db_id is None:
            return
        try:
            from app.models.database import async_session
            from app.models.schemas import LivePitEvent

            async with async_session() as db:
                row = LivePitEvent(
                    live_race_id=self._live_race_db_id,
                    kart_number=kart_number,
                    team_name=team_name,
                    pit_in_at=datetime.now(timezone.utc),
                )
                db.add(row)
                await db.commit()
        except Exception as e:
            logger.error(f"[{self.circuit_name}] Failed to persist pit-in kart #{kart_number}: {e}")

    async def _persist_pit_out(self, kart_number: int):
        """Update LivePitEvent row on pit-out."""
        if self._live_race_db_id is None:
            return
        try:
            from app.models.database import async_session
            from app.models.schemas import LivePitEvent
            from sqlalchemy import desc

            async with async_session() as db:
                result = await db.execute(
                    select(LivePitEvent)
                    .where(
                        LivePitEvent.live_race_id == self._live_race_db_id,
                        LivePitEvent.kart_number == kart_number,
                        LivePitEvent.pit_out_at == None,
                    )
                    .order_by(desc(LivePitEvent.id))
                    .limit(1)
                )
                event = result.scalar_one_or_none()
                if event:
                    event.pit_out_at = datetime.now(timezone.utc)
                    await db.commit()
        except Exception as e:
            logger.error(f"[{self.circuit_name}] Failed to persist pit-out kart #{kart_number}: {e}")

    async def _save_circuit_laps(self):
        """Save newly arrived laps to DB (automatic, no user session needed)."""
        try:
            from app.models.database import async_session
            from app.models.schemas import RaceLog, KartLap
            from sqlalchemy import select, func

            async with self._lap_save_lock:
                async with async_session() as db:
                    if self._lap_race_log_id is None:
                        # Use track_name as session identifier to avoid duplicates
                        # from WS reconnections within the same race
                        session_name = self._lap_state.track_name or f"Auto {self.circuit_name}"
                        today_start = datetime.now(timezone.utc).replace(
                            hour=0, minute=0, second=0, microsecond=0)

                        # Check if a RaceLog already exists for this session today
                        existing = (await db.execute(
                            select(RaceLog).where(
                                RaceLog.circuit_id == self.circuit_id,
                                RaceLog.session_name == session_name,
                                RaceLog.race_date >= today_start,
                            )
                        )).scalar_one_or_none()

                        if existing:
                            self._lap_race_log_id = existing.id
                            # Rebuild saved counts from existing laps to avoid duplicates
                            from sqlalchemy import func as sqlfunc
                            rows = (await db.execute(
                                select(KartLap.kart_number, sqlfunc.max(KartLap.lap_number))
                                .where(KartLap.race_log_id == existing.id)
                                .group_by(KartLap.kart_number)
                            )).all()
                            for kart_number, max_lap in rows:
                                self._lap_saved_per_kart[kart_number] = max_lap
                            logger.info(f"[{self.circuit_name}] Reusing race_log #{existing.id} "
                                        f"for session '{session_name}'")
                        else:
                            race_log = RaceLog(
                                circuit_id=self.circuit_id,
                                user_id=None,
                                race_date=datetime.now(timezone.utc),
                                session_name=session_name,
                                duration_min=self._lap_state.duration_min,
                                total_karts=len(self._lap_state.karts),
                            )
                            db.add(race_log)
                            await db.flush()
                            self._lap_race_log_id = race_log.id
                            logger.info(f"[{self.circuit_name}] Auto race_log #{race_log.id} "
                                        f"created for session '{session_name}'")

                    new_count = 0
                    for kart in self._lap_state.karts.values():
                        saved = self._lap_saved_per_kart.get(kart.kart_number, 0)
                        if len(kart.all_laps) <= saved:
                            continue
                        valid_set = {(vl["totalLap"], vl["lapTime"]) for vl in kart.valid_laps}
                        for lap in kart.all_laps[saved:]:
                            db.add(KartLap(
                                race_log_id=self._lap_race_log_id,
                                kart_number=kart.kart_number,
                                team_name=kart.team_name,
                                driver_name=lap.get("driverName", ""),
                                lap_number=lap["totalLap"],
                                lap_time_ms=lap["lapTime"],
                                is_valid=(lap["totalLap"], lap["lapTime"]) in valid_set,
                            ))
                            new_count += 1
                        self._lap_saved_per_kart[kart.kart_number] = len(kart.all_laps)

                    if new_count > 0:
                        await db.commit()
        except Exception as e:
            logger.error(f"[{self.circuit_name}] Auto lap save failed: {e}")

    async def _finalize_lap_race_log(self):
        """Finalize current race_log and reset for next race."""
        if self._lap_race_log_id is not None:
            try:
                # Flush any remaining laps
                await self._save_circuit_laps()
                from app.models.database import async_session
                from app.models.schemas import RaceLog
                from sqlalchemy import update

                async with async_session() as db:
                    await db.execute(
                        update(RaceLog)
                        .where(RaceLog.id == self._lap_race_log_id)
                        .values(total_karts=len(self._lap_state.karts))
                    )
                    await db.commit()
                logger.info(f"[{self.circuit_name}] Auto race_log #{self._lap_race_log_id} finalized "
                            f"({len(self._lap_state.karts)} karts)")
            except Exception as e:
                logger.error(f"[{self.circuit_name}] Auto race_log finalize failed: {e}")

        self._lap_race_log_id = None
        self._lap_saved_per_kart.clear()
        self._lap_save_counter = 0

    async def _restore_from_db(self):
        """Restore live race state from DB on startup (if backend restarted mid-race)."""
        try:
            from app.models.database import async_session
            from app.models.schemas import LiveRaceState
            from sqlalchemy.orm import selectinload

            async with async_session() as db:
                result = await db.execute(
                    select(LiveRaceState)
                    .options(selectinload(LiveRaceState.pit_events))
                    .where(LiveRaceState.circuit_id == self.circuit_id)
                )
                live_race = result.scalar_one_or_none()

            if not live_race:
                return

            # Check if race is still plausible (not older than 24h)
            now = datetime.now(timezone.utc)
            elapsed_h = (now - live_race.race_start_at).total_seconds() / 3600
            if elapsed_h > 24:
                logger.info(f"[{self.circuit_name}] Stale live race state (>24h), cleaning up")
                async with async_session() as db:
                    await db.execute(
                        delete(LiveRaceState).where(LiveRaceState.circuit_id == self.circuit_id)
                    )
                    await db.commit()
                return

            # Restore in-memory state
            self._race_active = True
            self._race_start_at = live_race.race_start_at
            self._race_duration_ms = live_race.duration_ms
            self._is_count_up = live_race.is_count_up
            self._live_race_db_id = live_race.id

            # Build pit summary for UserSession restoration
            pit_count = len(live_race.pit_events)
            logger.info(f"[{self.circuit_name}] Restored live race from DB: "
                        f"started={live_race.race_start_at}, "
                        f"duration={live_race.duration_ms}ms, "
                        f"pit_events={pit_count}")

        except Exception as e:
            logger.error(f"[{self.circuit_name}] Failed to restore live race state: {e}")

    def get_pit_summary(self) -> dict:
        """Build pit summary from DB for UserSession state restoration.
        Returns dict: kart_number -> {pit_count, last_pit_out_countdown_ms}
        This is called synchronously from ensure_monitoring; DB data was loaded in _restore_from_db.
        We return an empty dict here and load on demand.
        """
        # Pit summary is loaded lazily when needed
        return {}

    async def load_pit_summary(self) -> dict:
        """Load pit summary from DB for state restoration."""
        if self._live_race_db_id is None:
            return {}
        try:
            from app.models.database import async_session
            from app.models.schemas import LivePitEvent

            async with async_session() as db:
                result = await db.execute(
                    select(LivePitEvent)
                    .where(LivePitEvent.live_race_id == self._live_race_db_id)
                    .order_by(LivePitEvent.id)
                )
                events = result.scalars().all()

            summary: dict[int, dict] = {}
            for pe in events:
                kn = pe.kart_number
                if kn not in summary:
                    summary[kn] = {"pit_count": 0, "last_pit_out_countdown_ms": None}
                summary[kn]["pit_count"] += 1
                if pe.pit_out_countdown_ms is not None:
                    summary[kn]["last_pit_out_countdown_ms"] = pe.pit_out_countdown_ms
            return summary
        except Exception as e:
            logger.error(f"[{self.circuit_name}] Failed to load pit summary: {e}")
            return {}


class CircuitHub:
    """Central hub managing permanent connections to all circuits."""

    def __init__(self):
        self._connections: dict[int, CircuitConnection] = {}

    async def start_all(self):
        """Load all circuits from DB and connect to each."""
        from app.models.database import async_session
        from app.models.schemas import Circuit

        settings = get_settings()

        async with async_session() as db:
            result = await db.execute(select(Circuit))
            circuits = result.scalars().all()

        for circuit in circuits:
            ws_port = circuit.ws_port_data or (circuit.ws_port - 1)
            ws_url = f"ws://{settings.apex_ws_host}:{ws_port}"

            conn = CircuitConnection(circuit.id, circuit.name, ws_url)
            self._connections[circuit.id] = conn
            await conn.start()

        logger.info(f"CircuitHub: started {len(self._connections)} connections")

    async def stop_all(self):
        for conn in self._connections.values():
            await conn.stop()
        self._connections.clear()
        logger.info("CircuitHub: all connections stopped")

    def subscribe(self, circuit_id: int, user_id: int,
                  callback: Callable[[str], Awaitable[None]]) -> bool:
        """Subscribe a user to a circuit's message stream."""
        conn = self._connections.get(circuit_id)
        if conn:
            conn.subscribe(user_id, callback)
            return True
        logger.warning(f"CircuitHub: circuit {circuit_id} not found")
        return False

    def unsubscribe(self, circuit_id: int, user_id: int):
        conn = self._connections.get(circuit_id)
        if conn:
            conn.unsubscribe(user_id)

    def unsubscribe_all(self, user_id: int):
        """Remove user from all circuit subscriptions."""
        for conn in self._connections.values():
            conn.unsubscribe(user_id)

    async def start_connection(self, circuit_id: int) -> bool:
        """Start (or restart) a single circuit connection from DB."""
        conn = self._connections.get(circuit_id)
        if conn and conn._running:
            return True  # Already running

        from app.models.database import async_session
        from app.models.schemas import Circuit

        async with async_session() as db:
            result = await db.execute(select(Circuit).where(Circuit.id == circuit_id))
            circuit = result.scalar_one_or_none()

        if not circuit:
            logger.warning(f"CircuitHub: circuit {circuit_id} not found in DB")
            return False

        settings = get_settings()
        ws_port = circuit.ws_port_data or (circuit.ws_port - 1)
        ws_url = f"ws://{settings.apex_ws_host}:{ws_port}"

        # Stop existing if any
        if conn:
            await conn.stop()

        new_conn = CircuitConnection(circuit.id, circuit.name, ws_url)
        self._connections[circuit.id] = new_conn
        await new_conn.start()
        logger.info(f"CircuitHub: started connection to {circuit.name}")
        return True

    async def stop_connection(self, circuit_id: int) -> bool:
        """Stop a single circuit connection."""
        conn = self._connections.get(circuit_id)
        if not conn:
            return False
        await conn.stop()
        logger.info(f"CircuitHub: stopped connection to {conn.circuit_name}")
        return True

    def get_connection(self, circuit_id: int) -> CircuitConnection | None:
        return self._connections.get(circuit_id)

    def get_status(self) -> list[dict]:
        """Get status of all circuit connections."""
        return [
            {
                "circuit_id": conn.circuit_id,
                "circuit_name": conn.circuit_name,
                "connected": conn.connected,
                "subscribers": conn.subscriber_count,
                "messages": conn.message_count,
                "ws_url": conn.ws_url,
                "race_active": conn._race_active,
            }
            for conn in self._connections.values()
        ]
