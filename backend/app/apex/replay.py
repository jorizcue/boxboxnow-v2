"""
Log file replay engine.
Parses .log files captured from Apex Timing WebSocket sessions
and replays them through the same parser pipeline.

Log format:
    <timestamp YYYY-MM-DD HH:MM:SS>
    <message lines>
    <blank line>
    <next timestamp>
    ...
"""

import asyncio
import logging
import os
from datetime import datetime
from pathlib import Path
from app.apex.parser import ApexMessageParser

logger = logging.getLogger(__name__)


class ReplayEngine:
    """Replays .log files through the Apex message parser."""

    def __init__(self, parser: ApexMessageParser, on_events_callback, logs_dir: str = "data/logs"):
        self.parser = parser
        self.on_events = on_events_callback
        self.logs_dir = logs_dir
        self._task: asyncio.Task | None = None
        self._active = False
        self._paused = False
        self._speed = 1.0
        self._filename: str | None = None
        self._progress = 0.0
        self._total_blocks = 0
        self._current_block = 0

    @property
    def status(self) -> dict:
        return {
            "active": self._active,
            "filename": self._filename,
            "progress": self._progress,
            "speed": self._speed,
            "paused": self._paused,
        }

    def list_logs(self) -> list[str]:
        """List available .log files."""
        log_path = Path(self.logs_dir)
        if not log_path.exists():
            return []
        return sorted([f.name for f in log_path.glob("*.log")])

    async def start(self, filename: str, speed: float = 1.0):
        """Start replaying a log file."""
        if self._active:
            await self.stop()

        filepath = os.path.join(self.logs_dir, filename)
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Log file not found: {filepath}")

        self._filename = filename
        self._speed = max(0.1, speed)
        self._active = True
        self._paused = False
        self._progress = 0.0

        # Reset parser state for new replay
        self.parser.column_map = {}
        self.parser.row_to_kart = {}
        self.parser._initialized = False

        self._task = asyncio.create_task(self._replay(filepath))
        logger.info(f"Replay started: {filename} at {speed}x")

    async def stop(self):
        """Stop the current replay."""
        self._active = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._filename = None
        self._progress = 0.0
        logger.info("Replay stopped")

    async def pause(self):
        """Pause/resume the replay."""
        self._paused = not self._paused
        logger.info(f"Replay {'paused' if self._paused else 'resumed'}")

    async def set_speed(self, speed: float):
        """Set the replay speed multiplier."""
        self._speed = max(0.1, min(100.0, speed))
        logger.info(f"Replay speed set to {self._speed}x")

    async def _replay(self, filepath: str):
        """Parse and replay a log file."""
        blocks = self._parse_log_file(filepath)
        self._total_blocks = len(blocks)
        self._current_block = 0

        if not blocks:
            logger.warning(f"No message blocks found in {filepath}")
            self._active = False
            return

        logger.info(f"Parsed {len(blocks)} message blocks from {filepath}")

        prev_time = blocks[0][0]

        for i, (timestamp, message) in enumerate(blocks):
            if not self._active:
                break

            # Wait while paused
            while self._paused and self._active:
                await asyncio.sleep(0.1)

            if not self._active:
                break

            # Calculate delay based on timestamp difference
            if i > 0:
                delta = (timestamp - prev_time).total_seconds()
                if delta > 0:
                    await asyncio.sleep(delta / self._speed)

            prev_time = timestamp
            self._current_block = i + 1
            self._progress = (i + 1) / self._total_blocks

            # Parse and dispatch events
            try:
                events = self.parser.parse(message)
                if events:
                    await self.on_events(events)
            except Exception as e:
                logger.error(f"Error replaying block {i}: {e}", exc_info=True)

        self._active = False
        self._progress = 1.0
        logger.info("Replay completed")

    def _parse_log_file(self, filepath: str) -> list[tuple[datetime, str]]:
        """Parse a log file into (timestamp, message_block) tuples."""
        blocks = []
        current_timestamp = None
        current_lines = []

        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.rstrip("\n")

                # Try to parse as timestamp
                ts = self._try_parse_timestamp(line.strip())
                if ts is not None:
                    # Save previous block if exists
                    if current_timestamp and current_lines:
                        message = "\n".join(current_lines)
                        if message.strip():
                            blocks.append((current_timestamp, message))
                    current_timestamp = ts
                    current_lines = []
                    continue

                # Empty line = block separator
                if not line.strip():
                    if current_timestamp and current_lines:
                        message = "\n".join(current_lines)
                        if message.strip():
                            blocks.append((current_timestamp, message))
                        current_lines = []
                    continue

                current_lines.append(line)

        # Don't forget the last block
        if current_timestamp and current_lines:
            message = "\n".join(current_lines)
            if message.strip():
                blocks.append((current_timestamp, message))

        return blocks

    def _try_parse_timestamp(self, line: str) -> datetime | None:
        """Try to parse a line as a timestamp."""
        try:
            return datetime.strptime(line, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            return None
