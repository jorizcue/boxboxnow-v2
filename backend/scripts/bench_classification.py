"""Micro-benchmark: per-call cost of compute_classification at 25h scale.

Builds a realistic state (K karts × L laps with periodic pits) via the REAL
event handlers, then times compute_classification(state) over many calls.
Run the SAME script on `main` (full-scan) and the perf branch (incremental)
to show the rising curve: old grows with L, new stays flat.

    cd backend && PYTHONPATH=. .venv/bin/python scripts/bench_classification.py
"""
import asyncio
import time

from app.engine.state import RaceStateManager
from app.engine.classification import compute_classification
from app.apex.parser import RaceEvent, EventType

K = 44                      # karts
LAP_SIZES = [100, 800, 1600]  # accumulated laps/kart: ~1.5h, ~12h, ~25h
PIT_EVERY = 40              # laps per stint
TIMED_CALLS = 60            # compute_classification calls to average


def _ev(t, **kw):
    return RaceEvent(type=t, **kw)


def _ms_to_str(ms: int) -> str:
    return f"{ms // 60000}:{(ms % 60000) // 1000:02d}.{ms % 1000:03d}"


async def build_state(k: int, laps_per_kart: int) -> RaceStateManager:
    s = RaceStateManager()
    s.duration_min = 1440
    s.countdown_ms = s.duration_min * 60 * 1000
    # init karts
    for ki in range(k):
        row = f"r{ki + 1}"
        await s.handle_events([_ev(EventType.INIT, value="kart", row_id=row,
                                   extra={"kart_number": ki + 1,
                                          "team_name": f"T{ki + 1}",
                                          "position": ki + 1, "total_laps": "0"})])
    # feed laps in stint-sized chunks, with a pit between chunks
    for ki in range(k):
        row = f"r{ki + 1}"
        fed = 0
        base = 68_000 + ki * 13       # distinct per kart so value_changed records
        while fed < laps_per_kart:
            chunk = min(PIT_EVERY, laps_per_kart - fed)
            evs = [_ev(EventType.LAP, value=_ms_to_str(base + ((fed + i) * 7) % 9000),
                       row_id=row) for i in range(chunk)]
            await s.handle_events(evs)
            fed += chunk
            if fed < laps_per_kart:           # pit between stints
                await s.handle_events([_ev(EventType.PIT_IN, row_id=row)])
                s.countdown_ms -= 30_000      # ~30s dwell → pit_time_ms>0
                await s.handle_events([_ev(EventType.PIT_OUT, row_id=row)])
    # warm the cached pit median if this build has it (branch only); harmless on main
    if hasattr(s, "_field_pit_median_dirty"):
        s._field_pit_median_dirty = True
    return s


async def main():
    print(f"compute_classification cost — K={K} karts, {TIMED_CALLS} calls averaged\n")
    print(f"{'laps/kart':>10} {'total laps':>11} {'pits':>6} {'mean ms/call':>14}")
    for L in LAP_SIZES:
        s = await build_state(K, L)
        total_laps = sum(len(k.all_laps) for k in s.karts.values())
        total_pits = sum(len(k.pit_history) for k in s.karts.values())
        # warm once (median cache / any lazy init), then time
        compute_classification(s)
        t0 = time.perf_counter()
        for _ in range(TIMED_CALLS):
            compute_classification(s)
        ms = (time.perf_counter() - t0) / TIMED_CALLS * 1000
        print(f"{L:>10} {total_laps:>11} {total_pits:>6} {ms:>14.3f}")


if __name__ == "__main__":
    asyncio.run(main())
