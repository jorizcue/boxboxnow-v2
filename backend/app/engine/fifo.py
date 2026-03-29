"""
Weighted FIFO pit queue scoring.
EXACT port of boxboxnow.py calcular_puntuacion_ponderada().

The score is a PERCENTAGE 0-100 where:
  100 = all slow karts in the queue (good time to pit)
  0   = all fast karts in the queue (bad time to pit)

Each queue entry is a dict:
  {"score": int, "kartNumber": int, "teamName": str, "driverName": str}
"""

import logging
import time
from collections import deque
import numpy as np
from app.engine.state import RaceStateManager

logger = logging.getLogger(__name__)

DEFAULT_SCORE = 25


def _default_entry(score: int = DEFAULT_SCORE) -> dict:
    return {"score": score, "kartNumber": 0, "teamName": "", "driverName": ""}


class FifoManager:
    def __init__(self, queue_size: int = 30, box_lines: int = 2):
        self.queue_size = queue_size
        self.box_lines = box_lines
        self.fifo: deque[dict] = deque(
            [_default_entry() for _ in range(queue_size)], maxlen=queue_size
        )
        self._history: list[dict] = []

    def update_config(self, queue_size: int, box_lines: int):
        if queue_size != self.queue_size:
            self.queue_size = queue_size
            self.fifo = deque(
                [_default_entry() for _ in range(queue_size)], maxlen=queue_size
            )
        self.box_lines = box_lines

    def add_entry(self, tier_score: int, kart_number: int = 0,
                  team_name: str = "", driver_name: str = ""):
        """Add a kart's tier score when it enters the pit.
        Also records a history snapshot (only on actual pit entries)."""
        entry = {
            "score": tier_score,
            "kartNumber": kart_number,
            "teamName": team_name,
            "driverName": driver_name,
        }
        self.fifo.append(entry)
        # Save history only when a kart actually enters pit
        score = self.get_weighted_score()
        self._history.append({
            "timestamp": time.time(),
            "queue": list(self.fifo),
            "score": round(score, 2),
        })
        if len(self._history) > 50:
            self._history = self._history[-50:]

    def _scores(self) -> list[int]:
        """Extract numeric scores from queue entries."""
        return [e["score"] if isinstance(e, dict) else e for e in self.fifo]

    def _calcular_pesos(self) -> np.ndarray:
        """
        Exact port of boxboxnow.py calcular_pesos().
        First box_lines positions get weight 1.0.
        Remaining get linspace(0.9, 0.1).
        """
        tamano_cola = len(self.fifo)
        pesos = np.ones(tamano_cola)
        if tamano_cola > self.box_lines:
            pesos[self.box_lines:] = np.linspace(0.9, 0.1, tamano_cola - self.box_lines)
        return pesos

    def get_weighted_score(self) -> float:
        """
        Exact port of boxboxnow.py calcular_puntuacion_ponderada().
        Returns a PERCENTAGE 0-100.
        """
        tamano_cola = len(self.fifo)
        if tamano_cola == 0:
            return 0.0

        pesos = self._calcular_pesos()
        fifo_arr = np.array(self._scores(), dtype=float)

        max_puntuacion = np.sum(pesos * 100)
        min_puntuacion = np.sum(pesos * 1)

        puntuacion_ponderada = np.sum(fifo_arr * pesos)

        if max_puntuacion == min_puntuacion:
            return 0.0

        porcentaje = ((puntuacion_ponderada - min_puntuacion) / (max_puntuacion - min_puntuacion)) * 100

        return float(max(0.0, min(porcentaje, 100.0)))

    def get_queue_snapshot(self) -> list[dict]:
        return list(self.fifo)

    def apply_to_state(self, state: RaceStateManager):
        """Update state with current FIFO data (called by analytics loop).
        Does NOT record history — history is recorded only on pit entries."""
        state.fifo_queue = self.get_queue_snapshot()
        state.fifo_score = round(self.get_weighted_score(), 2)
        state.fifo_history = self._history[-20:]
