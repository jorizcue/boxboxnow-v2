"""
Weighted FIFO pit queue scoring.
EXACT port of boxboxnow.py calcular_puntuacion_ponderada().

The score is a PERCENTAGE 0-100 where:
  100 = all slow karts in the queue (good time to pit)
  0   = all fast karts in the queue (bad time to pit)

Each queue entry is a dict:
  {"score": int, "kartNumber": int, "teamName": str, "driverName": str}

Two assignment flows coexist:
  - Auto (default): `add_entry` pushes to the rolling deque with a
    round-robin line via `_best_line` (lane with fewest pending
    entries, tiebreak by counter).
  - Manual (when `manual_mode = True`): `add_entry` redirects to a
    pre-queue. The strategist drags the kart to a specific lane via
    `assign_manually`. If 15 s elapse with no manual action, the
    entry falls back to auto via `_pre_queue_timers`. The
    `manual_mode` flag is set ONLY by `UserSession.configure()`;
    `ReplaySession` never touches it, so replays always use auto by
    construction (avoids real-time 15 s timers during sped-up
    reproductions).
"""

import asyncio
import logging
import time
from collections import deque
import numpy as np
from app.engine.state import RaceStateManager

logger = logging.getLogger(__name__)

DEFAULT_SCORE = 25
MANUAL_TIMEOUT_S = 15.0  # fallback to auto after this many seconds with no manual pick


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
        self._next_line: int = 0  # round-robin tiebreaker counter
        # Manual mode state — only used when manual_mode == True.
        # UserSession.configure() sets manual_mode from the DB session.
        # ReplaySession NEVER touches it, so its FifoManager stays
        # manual_mode=False forever (no real-time timers during replay).
        self.manual_mode: bool = False
        self.pre_queue: list[dict] = []
        self._pre_queue_timers: dict[int, asyncio.Task] = {}

    def update_config(self, queue_size: int, box_lines: int):
        """Update queue size and box lines, preserving existing kart entries.
        Only resets fully when called with reset=True (e.g. replay start)."""
        old_size = self.queue_size
        self.queue_size = queue_size
        self.box_lines = box_lines

        # Preserve real kart entries (kartNumber > 0)
        real_entries = [e for e in self.fifo if isinstance(e, dict) and e.get("kartNumber", 0) > 0]

        if queue_size == old_size and len(real_entries) > 0:
            # Same size, just update box_lines — no queue change needed
            return

        # Rebuild: fill defaults first, then append real entries at the end
        num_defaults = max(0, queue_size - len(real_entries))
        new_queue = [_default_entry() for _ in range(num_defaults)] + real_entries[-queue_size:]
        self.fifo = deque(new_queue, maxlen=queue_size)
        # Keep _next_line and _history intact so history is preserved

    def reset(self, queue_size: int | None = None, box_lines: int | None = None):
        """Full reset — used when starting a new replay or new race.
        Cancels any pre-queue timers so the new session doesn't get
        stale fallback commits 15 s in. `manual_mode` is preserved
        (the caller — UserSession — re-applies it from the DB
        session after reset)."""
        if queue_size is not None:
            self.queue_size = queue_size
        if box_lines is not None:
            self.box_lines = box_lines
        self.fifo = deque(
            [_default_entry() for _ in range(self.queue_size)], maxlen=self.queue_size
        )
        self._history.clear()
        self._next_line = 0
        # Cancel timers + drop pending entries without committing —
        # the karts that were "waiting" belong to the previous
        # session and shouldn't show up in the new one.
        for t in self._pre_queue_timers.values():
            t.cancel()
        self._pre_queue_timers.clear()
        self.pre_queue.clear()

    def add_entry(self, tier_score: int, kart_number: int = 0,
                  team_name: str = "", driver_name: str = "",
                  avg_lap_ms: float = 0, avg_position: int = 0,
                  recent_laps: list[dict] | None = None,
                  pit_count: int = 0,
                  stint_laps: int = 0,
                  timestamp: float | None = None):
        """Add a kart's tier score when it enters the pit.
        Also records a history snapshot (only on actual pit entries).
        timestamp: epoch seconds. Defaults to time.time() (wall clock).
                   For replay, pass the replay block's actual datetime.

        Manual mode: if `self.manual_mode` is True and we have a real
        kart_number, the entry goes to `pre_queue` instead of the
        rolling deque. The strategist later assigns it via
        `assign_manually` (drag & drop in the BoxStatusPanel UI). A
        15 s `asyncio.Task` falls back to auto if no manual pick is
        made — see `_timeout_fallback`."""
        # GC: purge any task that's already done (cancelled or finished)
        # so the dict doesn't leak across long sessions. Cheap O(N) on
        # a dict that's bounded by the number of in-pit karts at once.
        self._pre_queue_timers = {
            k: t for k, t in self._pre_queue_timers.items() if not t.done()
        }

        entry = {
            "score": tier_score,
            "kartNumber": kart_number,
            "teamName": team_name,
            "driverName": driver_name,
            "avgLapMs": avg_lap_ms,
            "avgPosition": avg_position,
            "recentLaps": recent_laps or [],
            "pitCount": pit_count,
            "stintLaps": stint_laps,
        }

        if self.manual_mode and kart_number > 0:
            self._enqueue_pending(entry, timestamp)
            return

        # Auto: commit directly with the best line.
        self._commit_entry(entry, line=self._best_line(), timestamp=timestamp)

    # ── Pre-queue (manual mode) ──────────────────────────────────────

    def _enqueue_pending(self, entry: dict, timestamp: float | None) -> None:
        """Push to pre-queue + spawn 15 s fallback timer. If the kart
        is already in pre-queue (duplicate pit-in from Apex repaint),
        ignore — first pit-in wins. NO `line` assigned yet; that
        happens in `_commit_entry` on manual pick or timeout."""
        kart_number = entry["kartNumber"]
        if any(e["kartNumber"] == kart_number for e in self.pre_queue):
            return
        entry["enqueuedAt"] = timestamp if timestamp is not None else time.time()
        self.pre_queue.append(entry)
        # asyncio.create_task may fail if no running loop (e.g. unit
        # tests in sync context). In that case we still queue but
        # without auto-fallback — the entry waits forever for manual
        # pick. Tests should call `assign_manually` or
        # `cancel_pending` explicitly.
        try:
            loop = asyncio.get_running_loop()
            self._pre_queue_timers[kart_number] = loop.create_task(
                self._timeout_fallback(kart_number)
            )
        except RuntimeError:
            pass

    async def _timeout_fallback(self, kart_number: int) -> None:
        """Wait MANUAL_TIMEOUT_S and commit to auto if still pending.
        Cancelled by `assign_manually`, `cancel_pending`, `reset` and
        `flush_pending`."""
        try:
            await asyncio.sleep(MANUAL_TIMEOUT_S)
        except asyncio.CancelledError:
            return
        # Re-check the entry hasn't been removed in the meantime.
        entry = next((e for e in self.pre_queue if e["kartNumber"] == kart_number), None)
        if entry is None:
            return
        self.pre_queue.remove(entry)
        self._commit_entry(entry, line=self._best_line(), timestamp=time.time())
        self._pre_queue_timers.pop(kart_number, None)

    def assign_manually(self, kart_number: int, line: int) -> bool:
        """Pop kart from pre-queue and commit to the requested line.
        Returns False on race conditions (kart already gone, line out
        of range) so the API can reply 409 and the UI can rollback
        its optimistic move."""
        if not (0 <= line < self.box_lines):
            return False
        entry = next((e for e in self.pre_queue if e["kartNumber"] == kart_number), None)
        if entry is None:
            return False
        self.pre_queue.remove(entry)
        self._cancel_timer(kart_number)
        self._commit_entry(entry, line=line, timestamp=time.time())
        return True

    def cancel_pending(self, kart_number: int) -> None:
        """Remove from pre-queue (used on pit-out before the 15 s
        deadline). Safe to call when the kart isn't pending."""
        self.pre_queue = [e for e in self.pre_queue if e["kartNumber"] != kart_number]
        self._cancel_timer(kart_number)

    def flush_pending(self) -> None:
        """Drain pre-queue into auto immediately. Used when the user
        toggles manual_mode off mid-race AND in `reset()` to clear
        state between sessions."""
        pending = list(self.pre_queue)
        self.pre_queue.clear()
        for entry in pending:
            self._commit_entry(entry, line=self._best_line(), timestamp=time.time())
        for t in self._pre_queue_timers.values():
            t.cancel()
        self._pre_queue_timers.clear()

    def _cancel_timer(self, kart_number: int) -> None:
        t = self._pre_queue_timers.pop(kart_number, None)
        if t is not None and not t.done():
            t.cancel()

    # ── Line assignment + commit ─────────────────────────────────────

    def _best_line(self) -> int:
        """Lane with fewest entries currently in the rolling fifo.
        Ties broken by the round-robin counter so the lane rotation
        is stable across equal-count states.

        Replaces the legacy `_next_line % box_lines` which biased
        toward whichever lane the operator manually picked most
        recently (the counter would advance, leaving the other lanes
        underused).

        IMPORTANTE: `_next_line` se sincroniza con la línea
        ASIGNADA en TODOS los caminos (tiebreak Y single-candidate).
        El bug histórico: la rama de single-candidate (línea con menos
        entries claras) no actualizaba el counter, así que el
        siguiente tiebreak seguía apuntando a la línea recién llenada.
        Caso reproducible (3 lanes, fifo vacío de reales):
            entry 1: tiebreak [0,1,2]   → 0,  counter 0→1
            entry 2: tiebreak [1,2]     → 1,  counter 1→2
            entry 3: único [2]          → 2,  counter QUEDA en 2  ← antes
            entry 4: tiebreak [0,1,2]   → 2 ❌  (debería ser 0)
        Tras el fix, entry 3 deja el counter en 3 (=0%3 al saltar) y
        entry 4 cae en 0 (F1) como espera el operador.
        """
        if self.box_lines <= 1:
            return 0
        counts = [0] * self.box_lines
        for e in self.fifo:
            ln = e.get("line", -1)
            if 0 <= ln < self.box_lines:
                counts[ln] += 1
        best_count = min(counts)
        candidates = [i for i, c in enumerate(counts) if c == best_count]
        if len(candidates) == 1:
            chosen = candidates[0]
            # Sincronizar el counter también aquí — el path de
            # single-candidate es la fuente del bug original.
            self._next_line = (chosen + 1) % self.box_lines
            return chosen
        # Tiebreak: arrancar desde donde dejamos la última vez y
        # escanear hasta encontrar un candidate.
        line = self._next_line % self.box_lines
        while line not in candidates:
            line = (line + 1) % self.box_lines
        self._next_line = (line + 1) % self.box_lines
        return line

    def _commit_entry(self, entry: dict, line: int, timestamp: float | None) -> None:
        """Push entry to the rolling fifo + history snapshot.
        Internal — used by both the auto path (add_entry) and the
        manual path (assign_manually / timeout fallback)."""
        entry["line"] = line
        # Remove pre-queue-only field so the serialized payload stays
        # clean; clients distinguish pre_queue vs queue by which list
        # the entry belongs to, not by this field.
        entry.pop("enqueuedAt", None)
        self.fifo.append(entry)
        score = self.get_weighted_score()
        self._history.append({
            "timestamp": timestamp if timestamp is not None else time.time(),
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

    def get_pre_queue_snapshot(self) -> list[dict]:
        """Pre-queue serialized for the WS payload. Frontend renders
        each entry as a draggable card with a 15 s countdown derived
        from `enqueuedAt` (epoch seconds set on enqueue)."""
        return list(self.pre_queue)

    def apply_to_state(self, state: RaceStateManager):
        """Update state with current FIFO data (called by analytics loop).
        Does NOT record history — history is recorded only on pit entries."""
        state.fifo_queue = self.get_queue_snapshot()
        state.fifo_pre_queue = self.get_pre_queue_snapshot()
        state.fifo_manual_mode = self.manual_mode
        state.fifo_score = round(self.get_weighted_score(), 2)
        state.fifo_history = self._history[-20:]
