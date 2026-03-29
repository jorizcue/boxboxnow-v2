"""
Apex Timing WebSocket client with auto-reconnection.
Connects to the Apex Timing live timing system and feeds messages
to the RaceStateManager.
"""

import asyncio
import ssl
import logging
import websockets
from app.apex.parser import ApexMessageParser

logger = logging.getLogger(__name__)


class ApexClient:
    """Async WebSocket client for Apex Timing systems."""

    def __init__(self, ws_url: str, parser: ApexMessageParser, on_events_callback,
                 recorder=None):
        self.ws_url = ws_url
        self.parser = parser
        self.on_events = on_events_callback
        self.recorder = recorder  # Optional RaceRecorder instance
        self._task: asyncio.Task | None = None
        self._running = False
        self._reconnect_delay = 1.0
        self._max_reconnect_delay = 30.0
        self._queue: asyncio.Queue[str] = asyncio.Queue()

    async def start(self):
        """Start the WebSocket client."""
        self._running = True
        self._task = asyncio.create_task(self._run())
        logger.info(f"Apex client started, connecting to {self.ws_url}")

    async def stop(self):
        """Stop the WebSocket client."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Apex client stopped")

    async def _run(self):
        """Main loop with reconnection logic."""
        while self._running:
            try:
                await self._connect_and_listen()
            except asyncio.CancelledError:
                break
            except Exception as e:
                if not self._running:
                    break
                logger.warning(f"Connection lost: {e}. Reconnecting in {self._reconnect_delay}s...")
                await asyncio.sleep(self._reconnect_delay)
                self._reconnect_delay = min(
                    self._reconnect_delay * 2,
                    self._max_reconnect_delay
                )

    async def _connect_and_listen(self):
        """Connect to WebSocket and process messages sequentially."""
        # Use SSL only for wss:// URLs
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

        async with websockets.connect(
            self.ws_url,
            **connect_kwargs,
        ) as ws:
            logger.info(f"Connected to {self.ws_url}")
            self._reconnect_delay = 1.0  # Reset on successful connect

            # Process messages sequentially via queue
            processor = asyncio.create_task(self._process_queue())
            try:
                async for message in ws:
                    await self._queue.put(message)
            finally:
                processor.cancel()
                try:
                    await processor
                except asyncio.CancelledError:
                    pass

    async def _process_queue(self):
        """Process messages from the queue sequentially."""
        while True:
            message = await self._queue.get()
            try:
                # Record raw message if recording is active
                if self.recorder and self.recorder.is_recording:
                    self.recorder.write(message)

                events = self.parser.parse(message)
                if events:
                    await self.on_events(events)
            except Exception as e:
                logger.error(f"Error processing message: {e}", exc_info=True)
