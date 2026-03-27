"""
Distance-based race classification engine.
Ported from boxboxnow.py resumen_karts() - computes race standings
based on estimated real-time distance covered.
"""

import time
import logging
import numpy as np
from app.engine.state import RaceStateManager, KartState

logger = logging.getLogger(__name__)


def compute_classification(state: RaceStateManager) -> None:
    """
    Compute distance-based classification and update state.

    For each kart:
    1. Average lap time from valid stint laps (last 20)
    2. Average speed = circuit_length / avg_lap_time
    3. Base distance = total_laps * circuit_length
    4. Extra distance since last crossing = speed * time_since_last_lap
    5. Pit penalty = (max_pits_remaining) * speed * pit_time (for fairness)
    6. Total distance = base + extra - penalty
    7. Sort by total distance descending
    8. Compute gap and interval
    """
    karts = [k for k in state.karts.values() if k.total_laps > 0]
    if not karts:
        state.classification = []
        return

    circuit_m = state.circuit_length_m
    pit_time_s = state.pit_time_s
    min_pits = state.min_pits
    now = time.time()

    results = []
    for kart in karts:
        # Average lap time
        valid_laps = kart.stint_laps[-20:] if kart.stint_laps else kart.all_laps[-20:]
        if not valid_laps:
            avg_lap_s = 70.0  # fallback ~1:10
        else:
            avg_lap_s = float(np.mean(valid_laps)) / 1000.0

        if avg_lap_s <= 0:
            avg_lap_s = 70.0

        # Speed in m/s
        speed = circuit_m / avg_lap_s

        # Base distance
        base_distance = kart.total_laps * circuit_m

        # Extra distance since last timing line crossing
        # (estimated from time elapsed and current speed)
        time_since_start = now - kart.stint_start_time if kart.stint_start_time > 0 else 0
        laps_in_stint = len(kart.stint_laps)
        if laps_in_stint > 0 and kart.stint_laps:
            total_stint_time_s = sum(kart.stint_laps) / 1000.0
            time_since_last_lap = max(0, time_since_start - total_stint_time_s)
        else:
            time_since_last_lap = 0

        extra_distance = speed * min(time_since_last_lap, avg_lap_s)

        # Pit penalty for karts that haven't done their minimum pits
        pits_remaining = max(0, min_pits - kart.pit_count)
        pit_penalty = pits_remaining * speed * pit_time_s

        total_distance = base_distance + extra_distance - pit_penalty

        results.append({
            "kart": kart,
            "total_distance": total_distance,
            "speed": speed,
            "avg_lap_s": avg_lap_s,
        })

    # Sort by total distance (descending = leader first)
    results.sort(key=lambda r: r["total_distance"], reverse=True)

    # Compute gap and interval
    classification = []
    leader_distance = results[0]["total_distance"] if results else 0
    prev_distance = leader_distance

    for i, r in enumerate(results):
        kart = r["kart"]
        speed = r["speed"]

        # Gap to leader (in seconds)
        if i == 0:
            gap = ""
            interval = ""
        else:
            distance_to_leader = leader_distance - r["total_distance"]
            gap_s = distance_to_leader / speed if speed > 0 else 0
            gap = f"{gap_s:.3f}"

            distance_to_prev = prev_distance - r["total_distance"]
            interval_s = distance_to_prev / speed if speed > 0 else 0
            interval = f"{interval_s:.3f}"

        prev_distance = r["total_distance"]

        classification.append({
            "position": i + 1,
            "kartNumber": kart.kart_number,
            "teamName": kart.team_name,
            "driverName": kart.driver_name,
            "totalLaps": kart.total_laps,
            "pitCount": kart.pit_count,
            "gap": gap,
            "interval": interval,
            "avgLapMs": round(r["avg_lap_s"] * 1000),
            "tierScore": kart.tier_score,
        })

    state.classification = classification
