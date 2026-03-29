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
import re
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
        self._blocks: list[tuple[datetime, str]] = []

    @property
    def status(self) -> dict:
        # Current replay timestamp
        current_time = None
        if self._blocks and 0 < self._current_block <= len(self._blocks):
            current_time = self._blocks[self._current_block - 1][0].strftime("%H:%M:%S")
        return {
            "active": self._active,
            "filename": self._filename,
            "progress": self._progress,
            "speed": self._speed,
            "paused": self._paused,
            "currentBlock": self._current_block,
            "totalBlocks": self._total_blocks,
            "currentTime": current_time,
        }

    def list_logs(self) -> list[str]:
        """List available .log files."""
        log_path = Path(self.logs_dir)
        if not log_path.exists():
            return []
        return sorted([f.name for f in log_path.glob("*.log")])

    def analyze_log(self, filename: str) -> dict:
        """Analyze a log file and return metadata: total blocks, race starts, timestamps."""
        filepath = os.path.join(self.logs_dir, filename)
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Log file not found: {filepath}")

        blocks = self._parse_log_file(filepath)
        total = len(blocks)
        if total == 0:
            return {"totalBlocks": 0, "raceStarts": [], "startTime": None, "endTime": None}

        race_starts = []
        for i, (timestamp, message) in enumerate(blocks):
            # Detect init blocks (new race session)
            if "grid||" in message and "init|" in message:
                # Extract title1 and title2
                title1 = ""
                title2 = ""
                has_countdown = False
                for line in message.split("\n"):
                    if line.startswith("title1||"):
                        title1 = line[8:].strip()
                    elif line.startswith("title2||"):
                        title2 = line[8:].strip()
                    elif line.startswith("dyn1|countdown|") or line.startswith("dyn1|count|"):
                        has_countdown = True

                # Build combined title
                parts = [p for p in (title1, title2) if p]
                title = " - ".join(parts) if parts else ""

                if has_countdown:
                    # Init with countdown = race already running
                    race_starts.append({
                        "block": i,
                        "progress": i / total,
                        "timestamp": timestamp.strftime("%H:%M:%S"),
                        "title": title,
                    })
                else:
                    # Init without countdown = find the first countdown after
                    for j in range(i + 1, min(i + 200, len(blocks))):
                        block_msg = blocks[j][1]
                        if "dyn1|countdown|" in block_msg or "dyn1|count|" in block_msg:
                            race_starts.append({
                                "block": j,
                                "progress": j / total,
                                "timestamp": blocks[j][0].strftime("%H:%M:%S"),
                                "title": title,
                            })
                            break

        return {
            "totalBlocks": total,
            "raceStarts": race_starts,
            "startTime": blocks[0][0].strftime("%H:%M:%S"),
            "endTime": blocks[-1][0].strftime("%H:%M:%S"),
        }

    async def start(self, filename: str, speed: float = 1.0, start_block: int = 0):
        """Start replaying a log file, optionally from a specific block."""
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

        self._blocks = self._parse_log_file(filepath)
        self._total_blocks = len(self._blocks)
        self._current_block = 0

        self._task = asyncio.create_task(self._replay_from(start_block))
        logger.info(f"Replay started: {filename} at {speed}x from block {start_block}")

    async def seek(self, block: int):
        """Seek to a specific block. Stops current replay, replays init blocks silently, resumes."""
        if not self._filename or not self._blocks:
            return

        filename = self._filename
        speed = self._speed

        # Stop current task
        self._active = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        # Reset parser state
        self.parser.column_map = {}
        self.parser.row_to_kart = {}
        self.parser._initialized = False

        self._filename = filename
        self._speed = speed
        self._active = True
        self._paused = False

        self._task = asyncio.create_task(self._replay_from(block))
        logger.info(f"Replay seeked to block {block}/{self._total_blocks}")

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
        self._blocks = []
        logger.info("Replay stopped")

    async def pause(self):
        """Pause/resume the replay."""
        self._paused = not self._paused
        logger.info(f"Replay {'paused' if self._paused else 'resumed'}")

    async def set_speed(self, speed: float):
        """Set the replay speed multiplier."""
        self._speed = max(0.1, min(100.0, speed))
        logger.info(f"Replay speed set to {self._speed}x")

    async def _replay_from(self, start_block: int = 0):
        """Replay from a specific block. If start_block > 0, find the nearest
        preceding init block and replay init blocks silently (no delays) to
        rebuild state, then continue normally from start_block."""
        blocks = self._blocks

        if not blocks:
            logger.warning("No message blocks to replay")
            self._active = False
            return

        logger.info(f"Replaying {len(blocks)} blocks starting from {start_block}")

        # Find the nearest init block at or before start_block for state rebuild
        init_block = 0
        if start_block > 0:
            for i in range(start_block, -1, -1):
                if "grid||" in blocks[i][1] and "init|" in blocks[i][1]:
                    init_block = i
                    break

            # Silently replay init_block → start_block to rebuild state (no delays)
            logger.info(f"Rebuilding state from block {init_block} to {start_block}")
            for i in range(init_block, min(start_block, len(blocks))):
                if not self._active:
                    return
                try:
                    events = self.parser.parse(blocks[i][1])
                    if events:
                        await self.on_events(events)
                except Exception as e:
                    logger.error(f"Error rebuilding block {i}: {e}")

        # Now replay from start_block with normal timing
        actual_start = max(start_block, 0)
        prev_time = blocks[actual_start][0] if actual_start < len(blocks) else None

        for i in range(actual_start, len(blocks)):
            if not self._active:
                break

            while self._paused and self._active:
                await asyncio.sleep(0.1)

            if not self._active:
                break

            timestamp, message = blocks[i]

            # Calculate delay based on timestamp difference
            if prev_time and i > actual_start:
                delta = (timestamp - prev_time).total_seconds()
                if delta > 0:
                    await asyncio.sleep(delta / self._speed)

            prev_time = timestamp
            self._current_block = i + 1
            self._progress = (i + 1) / self._total_blocks

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
