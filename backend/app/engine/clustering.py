"""
Kart performance clustering using Jenks Natural Breaks.
Ported from boxboxnow.py - segments karts into 5 performance tiers.

Driver differential adjustment:
  Each driver can have a differential_ms that represents how much slower/faster
  they are vs the team's reference pace. When clustering, the kart's observed
  average is adjusted by subtracting the current driver's differential to
  estimate the kart's "true" pace, independent of who is driving.

  Example: Kart 7 observed avg = 67000ms, current driver "Juan" has +2500ms
  -> adjusted avg = 64500ms (the kart is actually faster than it looks)
"""

import logging
import numpy as np
from app.engine.state import RaceStateManager, KartState

logger = logging.getLogger(__name__)

# Tier scores by cluster index
TIER_SCORES = {0: 100, 1: 75, 2: 50, 3: 25, 4: 1}
N_CLUSTERS = 5
LAST_N_LAPS = 20
BEST_N_LAPS = 3


def adjust_cluster_by_position(cluster: int, theoretical_pos: int, actual_pos: int) -> int:
    """
    Adjust cluster based on gap between theoretical and actual position.
    Ported from boxboxnow.py ajustar_cluster_por_posicion().
    """
    gap = theoretical_pos - actual_pos

    if 6 <= gap <= 15:
        cluster = max(0, cluster - 1)
    elif gap > 15:
        cluster = max(0, cluster - 2)
    elif -15 <= gap <= -6:
        cluster = min(N_CLUSTERS - 1, cluster + 1)
    elif gap < -15:
        cluster = min(N_CLUSTERS - 1, cluster + 2)

    return cluster


def _get_driver_differential(kart: KartState, driver_differentials: dict[int, dict[str, int]]) -> int:
    """
    Look up the current driver's differential for this kart.

    Args:
        kart: The kart state (has kart_number and driver_name)
        driver_differentials: dict[kart_number -> dict[driver_name_lower -> differential_ms]]

    Returns:
        differential_ms for the current driver, or 0 if not configured
    """
    if not kart.driver_name or kart.kart_number not in driver_differentials:
        return 0

    drivers = driver_differentials[kart.kart_number]
    # Try exact match first, then case-insensitive partial match
    driver_lower = kart.driver_name.strip().lower()

    # Exact match
    if driver_lower in drivers:
        return drivers[driver_lower]

    # Partial match (Apex sometimes sends truncated names)
    for name, diff in drivers.items():
        if name in driver_lower or driver_lower in name:
            return diff

    return 0


def compute_clustering(
    state: RaceStateManager,
    team_positions: dict[int, int],
    driver_differentials: dict[int, dict[str, int]] | None = None,
) -> None:
    """
    Compute performance clusters for all karts and update state.

    Args:
        state: The race state manager
        team_positions: Dict of kart_number -> theoretical position from teams_level
        driver_differentials: Dict of kart_number -> {driver_name_lower: differential_ms}
            Positive differential = driver is slower than reference
            The differential is SUBTRACTED from observed avg to get "true kart pace"
    """
    if driver_differentials is None:
        driver_differentials = {}

    karts = list(state.karts.values())
    if len(karts) < 2:
        return

    kart_stats = []
    for kart in karts:
        valid_laps = kart.stint_laps[-LAST_N_LAPS:] if kart.stint_laps else []
        if not valid_laps:
            valid_laps = kart.all_laps[-LAST_N_LAPS:] if kart.all_laps else []

        if not valid_laps:
            continue

        avg_ms = float(np.mean(valid_laps))
        sorted_laps = sorted(valid_laps)
        best_avg_ms = float(np.mean(sorted_laps[:BEST_N_LAPS])) if len(sorted_laps) >= BEST_N_LAPS else avg_ms

        # Apply driver differential: subtract it to get the kart's "true" pace
        # If driver is slow (+2500ms), subtracting makes the kart look faster (which it is)
        driver_diff = _get_driver_differential(kart, driver_differentials)
        adjusted_avg_ms = avg_ms - driver_diff
        adjusted_best_avg_ms = best_avg_ms - driver_diff

        kart_stats.append({
            "kart": kart,
            "avg_ms": avg_ms,                          # raw observed
            "best_avg_ms": best_avg_ms,                # raw observed
            "adjusted_avg_ms": adjusted_avg_ms,        # corrected for driver
            "adjusted_best_avg_ms": adjusted_best_avg_ms,
            "driver_diff": driver_diff,
        })

    if len(kart_stats) < N_CLUSTERS:
        for ks in kart_stats:
            ks["kart"].tier_score = 50
            ks["kart"].avg_lap_ms = ks["avg_ms"]
            ks["kart"].best_avg_ms = ks["best_avg_ms"]
            ks["kart"].driver_differential_ms = ks["driver_diff"]
            ks["kart"].cluster = 2
        return

    # Use ADJUSTED best_avg for clustering (this is the key change)
    best_avgs = np.array([ks["adjusted_best_avg_ms"] for ks in kart_stats])

    unique_vals = len(np.unique(best_avgs))
    n_classes = max(2, min(unique_vals, N_CLUSTERS))

    try:
        import jenkspy
        breaks = jenkspy.jenks_breaks(best_avgs.tolist(), n_classes=n_classes)

        for ks in kart_stats:
            kart = ks["kart"]
            kart.avg_lap_ms = ks["avg_ms"]
            kart.best_avg_ms = ks["best_avg_ms"]
            kart.driver_differential_ms = ks["driver_diff"]

            # Cluster based on adjusted time
            cluster = 0
            for i in range(1, len(breaks)):
                if ks["adjusted_best_avg_ms"] <= breaks[i]:
                    cluster = i - 1
                    break
            else:
                cluster = n_classes - 1

            theoretical_pos = team_positions.get(kart.kart_number, kart.position)
            cluster = adjust_cluster_by_position(cluster, theoretical_pos, kart.position)

            kart.cluster = cluster
            score_idx = min(cluster, N_CLUSTERS - 1)
            kart.tier_score = TIER_SCORES.get(score_idx, 50)

    except Exception as e:
        logger.error(f"Clustering error: {e}", exc_info=True)
        for ks in kart_stats:
            ks["kart"].tier_score = 50
            ks["kart"].avg_lap_ms = ks["avg_ms"]
            ks["kart"].best_avg_ms = ks["best_avg_ms"]
            ks["kart"].driver_differential_ms = ks["driver_diff"]
            ks["kart"].cluster = 2
