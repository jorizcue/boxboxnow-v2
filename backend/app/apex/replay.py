"""
Log file replay engine.
Parses .log and .log.gz files captured from Apex Timing WebSocket sessions
and replays them through the same parser pipeline.

Log format:
    <timestamp YYYY-MM-DD HH:MM:SS>
    <message lines>
    <blank line>
    <next timestamp>
    ...
"""

import asyncio
import gzip
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from app.apex.parser import ApexMessageParser

logger = logging.getLogger(__name__)


def open_log_file(filepath: str):
    """Open a log file, supporting both plain .log and .log.gz."""
    if filepath.endswith(".gz"):
        return gzip.open(filepath, "rt", encoding="utf-8", errors="replace")
    return open(filepath, "r", encoding="utf-8", errors="replace")


def try_parse_timestamp(line: str) -> datetime | None:
    """Try to parse a line as a timestamp."""
    try:
        return datetime.strptime(line, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def _is_valid_apex_message(message: str) -> bool:
    """Check if a message looks like valid Apex Timing data.

    Rejects:
    - HTTP proxy/scanner requests (CONNECT, GET http, etc.)
    - Messages containing non-printable binary bytes (TLS handshakes, etc.)
    """
    # Reject messages starting with HTTP methods (bot/scanner garbage)
    first_line = message.split("\n", 1)[0].strip()
    if first_line.startswith(("CONNECT ", "GET ", "POST ", "PUT ", "DELETE ", "HEAD ", "OPTIONS ", "HTTP/")):
        return False
    # Reject messages with non-printable characters (binary/TLS data)
    # Allow common whitespace: \n \r \t and printable ASCII + extended latin
    for ch in message:
        code = ord(ch)
        if code < 32 and ch not in "\n\r\t":
            return False
        if 128 <= code < 160:  # C1 control characters
            return False
    return True


def _sanitize_apex_line(line: str) -> str | None:
    """Remove trailing binary garbage from an Apex message line.

    Some log entries have valid Apex data followed by TLS/binary bytes
    injected by port scanners. Strip everything after the last valid
    pipe-delimited segment.
    """
    # Find the last valid pipe-delimited token boundary
    # Apex messages use format: key|action|value
    # If we detect non-printable bytes, truncate there
    for i, ch in enumerate(line):
        code = ord(ch)
        if code < 32 and ch not in "\n\r\t":
            line = line[:i].rstrip()
            break
        if 128 <= code < 160:
            line = line[:i].rstrip()
            break
    return line if line.strip() else None


def parse_log_file(filepath: str) -> list[tuple[datetime, str]]:
    """Parse a log file into (timestamp, message_block) tuples.
    Supports both .log and .log.gz files.
    Filters out garbage from bots/scanners that connected to the WebSocket."""
    blocks = []
    current_timestamp = None
    current_lines: list[str] = []

    with open_log_file(filepath) as f:
        for line in f:
            line = line.rstrip("\n")

            ts = try_parse_timestamp(line.strip())
            if ts is not None:
                if current_timestamp and current_lines:
                    message = "\n".join(current_lines)
                    if message.strip():
                        blocks.append((current_timestamp, message))
                current_timestamp = ts
                current_lines = []
                continue

            if not line.strip():
                if current_timestamp and current_lines:
                    message = "\n".join(current_lines)
                    if message.strip():
                        blocks.append((current_timestamp, message))
                    current_lines = []
                continue

            current_lines.append(line)

    if current_timestamp and current_lines:
        message = "\n".join(current_lines)
        if message.strip():
            blocks.append((current_timestamp, message))

    # Filter out garbage messages and sanitize binary-contaminated ones
    clean_blocks = []
    for ts, message in blocks:
        if not _is_valid_apex_message(message):
            continue
        # Sanitize individual lines (strip trailing binary)
        sanitized_lines = []
        for line in message.split("\n"):
            clean = _sanitize_apex_line(line)
            if clean:
                sanitized_lines.append(clean)
        if sanitized_lines:
            clean_blocks.append((ts, "\n".join(sanitized_lines)))

    return clean_blocks


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
        self.current_block_timestamp: datetime | None = None  # Accessible by callback
        # True while we're replaying init/intermediate blocks silently to
        # rebuild state after a seek. Listeners (registry.on_events) can
        # short-circuit any heavy outbound broadcast while this is set.
        self._silent_rebuild: bool = False

    @property
    def status(self) -> dict:
        # Current replay timestamp
        current_time = None
        if self._blocks and 0 < self._current_block <= len(self._blocks):
            current_time = self._blocks[self._current_block - 1][0].isoformat()
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
        """List available .log and .log.gz files."""
        log_path = Path(self.logs_dir)
        if not log_path.exists():
            return []
        logs = [f.name for f in log_path.glob("*.log")]
        logs += [f.name for f in log_path.glob("*.log.gz")]
        return sorted(set(logs))

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
        seen_titles = set()  # Deduplicate init blocks from reconnections
        current_title2 = ""
        race_finished = True  # Start true so first title2 change can be detected

        for i, (timestamp, message) in enumerate(blocks):
            # Extract title2 from every block to detect mid-session race changes
            block_title2 = None
            for line in message.split("\n"):
                if line.startswith("title2||"):
                    block_title2 = line[8:].strip()
                    break

            # Detect init blocks (new race session from WS connect/reconnect)
            if "grid||" in message and "init|" in message:
                title1 = ""
                title2 = ""
                has_countdown = False
                has_chequered = 'data-flag="chequered"' in message
                for line in message.split("\n"):
                    if line.startswith("title1||"):
                        title1 = line[8:].strip()
                    elif line.startswith("title2||"):
                        title2 = line[8:].strip()
                    elif line.startswith("dyn1|countdown|") or line.startswith("dyn1|count|"):
                        has_countdown = True

                parts = [p for p in (title1, title2) if p]
                title = " - ".join(parts) if parts else ""

                if has_chequered and not has_countdown:
                    seen_titles.discard(title)
                    current_title2 = title2
                    race_finished = True
                    continue

                if title in seen_titles:
                    continue

                if has_countdown:
                    race_starts.append({
                        "block": i,
                        "progress": i / total,
                        "timestamp": timestamp.isoformat(),
                        "title": title,
                    })
                    seen_titles.add(title)
                    race_finished = False
                else:
                    # Init without countdown: look for first countdown nearby
                    found_start = False
                    for j in range(i + 1, min(i + 200, len(blocks))):
                        block_msg = blocks[j][1]
                        if 'data-flag="chequered"' in block_msg:
                            break
                        if "dyn1|countdown|" in block_msg or "dyn1|count|" in block_msg:
                            race_starts.append({
                                "block": j,
                                "progress": j / total,
                                "timestamp": blocks[j][0].strftime("%H:%M:%S"),
                                "title": title,
                            })
                            seen_titles.add(title)
                            race_finished = False
                            found_start = True
                            break

                    if not found_start:
                        # No countdown found — race starts without countdown (e.g. heats/finals)
                        race_starts.append({
                            "block": i,
                            "progress": i / total,
                            "timestamp": timestamp.isoformat(),
                            "title": title,
                        })
                        seen_titles.add(title)
                        race_finished = False

                current_title2 = title2

            elif 'data-flag="chequered"' in message:
                seen_titles.clear()
                race_finished = True

            # Detect mid-session race starts via title2 change after a chequered flag
            elif block_title2 is not None and block_title2 != current_title2 and race_finished:
                # title2 changed after a race ended — new race starting without init block
                title1_here = ""
                for line in message.split("\n"):
                    if line.startswith("title1||"):
                        title1_here = line[8:].strip()
                        break
                parts = [p for p in (title1_here, block_title2) if p]
                title = " - ".join(parts) if parts else block_title2

                if title not in seen_titles:
                    # Use this block as race start; some races have no countdown at all
                    race_starts.append({
                        "block": i,
                        "progress": i / total,
                        "timestamp": timestamp.isoformat(),
                        "title": title,
                    })
                    seen_titles.add(title)
                    race_finished = False

                current_title2 = block_title2

                current_title2 = block_title2

            elif block_title2 is not None:
                current_title2 = block_title2

        return {
            "totalBlocks": total,
            "raceStarts": race_starts,
            "startTime": blocks[0][0].isoformat(),
            "endTime": blocks[-1][0].isoformat(),
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

    def block_at_time(self, target: str) -> int | None:
        """Resolve a target time (HH:MM:SS, HH:MM, or full ISO datetime) to
        the nearest block index whose timestamp is at or before `target`.
        Returns None if the input is unparseable or there are no blocks.

        For HH:MM:SS / HH:MM we combine with the date of the first block —
        long replay sessions are typically a single day's log so this
        matches the user's mental model of "jump to 21:35".
        """
        if not self._blocks:
            return None
        try:
            if "T" in target or "-" in target:
                # ISO datetime path
                clean = target.replace("Z", "").replace("+00:00", "")
                target_dt = datetime.fromisoformat(clean)
            else:
                # HH:MM[:SS] path — anchor against the first block's date.
                # The first block always has a parsed timestamp because
                # replay loading rejects entries without one.
                hms = target.strip().split(":")
                hour = int(hms[0])
                minute = int(hms[1]) if len(hms) > 1 else 0
                second = int(hms[2]) if len(hms) > 2 else 0
                first_date = self._blocks[0][0].date()
                target_dt = datetime(
                    first_date.year, first_date.month, first_date.day,
                    hour, minute, second,
                )
        except (ValueError, IndexError):
            return None

        # Binary search the blocks (sorted by timestamp) for the largest
        # index whose timestamp is <= target. Returning the previous index
        # (rather than the next) means the user lands at the block just
        # before their target, so the rebuild loop catches up to it
        # naturally without skipping the message they pointed at.
        lo, hi = 0, len(self._blocks)
        while lo < hi:
            mid = (lo + hi) // 2
            if self._blocks[mid][0] <= target_dt:
                lo = mid + 1
            else:
                hi = mid
        return max(0, lo - 1)

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
        # Emit a final "active: false" so subscribers clear their UI state.
        try:
            await self.on_events([])
        except Exception as e:
            logger.warning(f"Final replay_status broadcast on stop failed: {e}")
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
            try:
                await self.on_events([])
            except Exception as e:
                logger.warning(f"replay_status broadcast (empty blocks) failed: {e}")
            return

        logger.info(f"Replaying {len(blocks)} blocks starting from {start_block}")

        # Anchor `_current_block` and progress to the target BEFORE the silent
        # rebuild kicks in. Without this, every `on_events` broadcast emitted
        # during rebuild (for state updates) reports the OLD position because
        # `_current_block` only gets updated inside the main loop below.
        # That made the orange replay clock and progress bar appear stuck on
        # the previous time after a seek/seek_time even though the underlying
        # state had already moved.
        anchored_block = max(0, min(start_block, len(blocks)))
        if anchored_block > 0:
            self._current_block = anchored_block
            self._progress = anchored_block / max(1, self._total_blocks)
            self.current_block_timestamp = blocks[anchored_block - 1][0]

        # Find the nearest init block at or before start_block for state rebuild
        init_block = 0
        if start_block > 0:
            for i in range(start_block, -1, -1):
                if "grid||" in blocks[i][1] and "init|" in blocks[i][1]:
                    init_block = i
                    break

            # Silently replay init_block → start_block to rebuild state (no delays)
            logger.info(f"Rebuilding state from block {init_block} to {start_block}")
            self._silent_rebuild = True
            try:
                for i in range(init_block, min(start_block, len(blocks))):
                    if not self._active:
                        return
                    self.current_block_timestamp = blocks[i][0]
                    try:
                        events = self.parser.parse(blocks[i][1])
                        if events:
                            await self.on_events(events)
                    except Exception as e:
                        logger.error(f"Error rebuilding block {i}: {e}")
            finally:
                self._silent_rebuild = False

            # Push one explicit replay_status now that the silent rebuild
            # is done — listeners had their broadcasts suppressed during
            # rebuild, so the client clock would otherwise stay frozen
            # until the very first block of the main loop processes.
            try:
                await self.on_events([])
            except Exception as e:
                logger.warning(f"Post-rebuild replay_status broadcast failed: {e}")

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
                    # Cap large gaps (idle periods between sessions) to 10s
                    capped_delta = min(delta, 10.0)
                    remaining = capped_delta / self._speed
                    while remaining > 0 and self._active:
                        while self._paused and self._active:
                            await asyncio.sleep(0.1)
                        chunk = min(remaining, 0.5)
                        await asyncio.sleep(chunk)
                        remaining -= chunk

            prev_time = timestamp
            self._current_block = i + 1
            self._progress = (i + 1) / self._total_blocks
            self.current_block_timestamp = timestamp

            try:
                events = self.parser.parse(message)
                if events:
                    await self.on_events(events)
            except Exception as e:
                logger.error(f"Error replaying block {i}: {e}", exc_info=True)

        self._active = False
        self._progress = 1.0
        # Notify listeners that the replay has ended — otherwise the last
        # broadcast they saw had active=true and the frontend indicator stays
        # stuck. on_events([]) re-uses the existing replay_status broadcast
        # path which now reads _active=False.
        try:
            await self.on_events([])
        except Exception as e:
            logger.warning(f"Final replay_status broadcast failed: {e}")
        logger.info("Replay completed")

    def _open_log_file(self, filepath: str):
        return open_log_file(filepath)

    def _parse_log_file(self, filepath: str) -> list[tuple[datetime, str]]:
        return parse_log_file(filepath)

    def _try_parse_timestamp(self, line: str) -> datetime | None:
        return try_parse_timestamp(line)
