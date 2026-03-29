"""
Race message recorder.
Captures all raw Apex Timing WebSocket messages to .log files
compatible with the ReplayEngine format.

Log format (same as replay expects):
    <timestamp YYYY-MM-DD HH:MM:SS>
    <raw message lines>
    <blank line>
"""

import logging
import os
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class RaceRecorder:
    """Records raw WS messages to a .log file for later replay."""

    def __init__(self, logs_dir: str = "data/logs", user_id: int | None = None):
        # If user_id provided, store in per-user subdirectory
        if user_id is not None:
            self.logs_dir = os.path.join(logs_dir, str(user_id))
        else:
            self.logs_dir = logs_dir
        self._file = None
        self._filename: str | None = None
        self._recording = False
        self._message_count = 0
        self._started_at: datetime | None = None
        Path(self.logs_dir).mkdir(parents=True, exist_ok=True)

    @property
    def is_recording(self) -> bool:
        return self._recording

    @property
    def status(self) -> dict:
        return {
            "recording": self._recording,
            "filename": self._filename,
            "messages": self._message_count,
            "started_at": self._started_at.isoformat() if self._started_at else None,
        }

    def start(self, label: str = "") -> str:
        """Start recording to a new log file. Returns the filename."""
        if self._recording:
            self.stop()

        now = datetime.now()
        safe_label = label.replace(" ", "_").replace("/", "-")[:30] if label else "race"
        self._filename = f"{now.strftime('%Y%m%d_%H%M%S')}_{safe_label}.log"
        filepath = os.path.join(self.logs_dir, self._filename)

        self._file = open(filepath, "w", encoding="utf-8")
        self._recording = True
        self._message_count = 0
        self._started_at = now
        logger.info(f"Recording started: {self._filename}")
        return self._filename

    def stop(self) -> dict:
        """Stop recording and close the file. Returns final status."""
        result = self.status
        if self._file:
            self._file.flush()
            self._file.close()
            self._file = None
        self._recording = False
        if self._filename:
            logger.info(f"Recording stopped: {self._filename} ({self._message_count} messages)")
        self._filename = None
        self._started_at = None
        return result

    def write(self, message: str):
        """Write a raw WS message with timestamp (replay-compatible format)."""
        if not self._recording or not self._file:
            return
        try:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self._file.write(f"{timestamp}\n{message}\n\n")
            self._message_count += 1
            # Flush every 50 messages to avoid data loss
            if self._message_count % 50 == 0:
                self._file.flush()
        except Exception as e:
            logger.error(f"Error writing to recording: {e}")
