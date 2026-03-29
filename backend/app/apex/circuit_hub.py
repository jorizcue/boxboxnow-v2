"""
CircuitHub — Always-on WebSocket connections to all circuits.

Connects to every circuit's Apex Timing WebSocket on startup,
records all messages per circuit per day, and broadcasts to
subscribed user sessions.
"""

import asyncio
import logging
import os
import re
import ssl
from datetime import datetime, date
from pathlib import Path
from typing import Callable, Awaitable

import websockets
from sqlalchemy import select

from app.config import get_settings

logger = logging.getLogger(__name__)

RECORDINGS_BASE = "data/recordings"


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
        filepath = os.path.join(self._dir, f"{today}.log")
        self._file = open(filepath, "a", encoding="utf-8")
        logger.info(f"DailyRecorder: rotated to {filepath}")

    def close(self):
        if self._file:
            self._file.flush()
            self._file.close()
            self._file = None


class CircuitConnection:
    """Manages one circuit's permanent WebSocket connection."""

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
        self.message_count = 0

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    async def start(self):
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
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
        # Cache init blocks for late subscribers
        if "init|" in message and "grid||" in message:
            self._last_init_block = message

        # Record to daily log
        try:
            self._recorder.write(message)
        except Exception as e:
            logger.error(f"[{self.circuit_name}] Recording error: {e}")

        self.message_count += 1

        # Broadcast to subscribers
        if self._subscribers:
            for user_id, callback in list(self._subscribers.items()):
                try:
                    await callback(message)
                except Exception as e:
                    logger.error(f"[{self.circuit_name}] Subscriber {user_id} error: {e}")


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
            }
            for conn in self._connections.values()
        ]
