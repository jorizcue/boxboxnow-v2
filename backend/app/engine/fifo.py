"""
Weighted FIFO pit queue scoring.
Ported from boxboxnow.py - manages pit box queue and computes weighted scores.

The FIFO tracks which karts enter the pit. Each entry is scored by the kart's
performance tier. The weighted score reflects whether good or bad karts are
currently in the pit queue, helping decide when to pit.
"""

import logging
import time
from collections import deque
import numpy as np
from app.engine.state import RaceStateManager

logger = logging.getLogger(__name__)

DEFAULT_SCORE = 25  # Default fill value for FIFO


class FifoManager:
    """Manages the weighted FIFO pit queue."""

    def __init__(self, queue_size: int = 30, box_lines: int = 2):
        self.queue_size = queue_size
        self.box_lines = box_lines
        self.fifo: deque[int] = deque(
            [DEFAULT_SCORE] * queue_size, maxlen=queue_size
        )

    def update_config(self, queue_size: int, box_lines: int):
        """Update queue configuration."""
        if queue_size != self.queue_size:
            self.queue_size = queue_size
            self.fifo = deque(
                [DEFAULT_SCORE] * queue_size, maxlen=queue_size
            )
        self.box_lines = box_lines

    def add_entry(self, tier_score: int):
        """Add a kart's tier score when it enters the pit."""
        self.fifo.append(tier_score)

    def get_weighted_score(self) -> float:
        """
        Compute the weighted score for the current FIFO state.
        Ported from boxboxnow.py calcular_puntuacion_ponderada().

        First `box_lines` positions get weight 1.0 (they're being serviced).
        Remaining positions get linearly decreasing weights from 0.9 to 0.1.
        Score is normalized to 0-100.
        """
        values = list(self.fifo)
        n = len(values)

        if n == 0:
            return 0.0

        # Build weights
        weights = []
        for i in range(n):
            if i < self.box_lines:
                weights.append(1.0)
            else:
                remaining = n - self.box_lines
                if remaining > 0:
                    w = np.linspace(0.9, 0.1, remaining)
                    weights.append(float(w[i - self.box_lines]))
                else:
                    weights.append(0.1)

        # Weighted average
        weights = np.array(weights)
        values_arr = np.array(values, dtype=float)
        weighted_sum = np.sum(values_arr * weights)
        weight_total = np.sum(weights)

        if weight_total == 0:
            return 0.0

        return float(weighted_sum / weight_total)

    def get_queue_snapshot(self) -> list[int]:
        """Get current queue state as a list."""
        return list(self.fifo)

    def apply_to_state(self, state: RaceStateManager):
        """Update the race state with current FIFO data."""
        state.fifo_queue = self.get_queue_snapshot()
        state.fifo_score = round(self.get_weighted_score(), 2)
        state.fifo_history.append({
            "timestamp": time.time(),
            "queue": state.fifo_queue.copy(),
            "score": state.fifo_score,
        })
        # Keep only last 20 history entries
        if len(state.fifo_history) > 20:
            state.fifo_history = state.fifo_history[-20:]
