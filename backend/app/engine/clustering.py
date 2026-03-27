"""
Kart performance clustering using Jenks Natural Breaks.
Ported from boxboxnow.py - segments karts into 5 performance tiers.
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

    If the kart is performing better than its theoretical position suggests,
    bump it up a tier. If worse, bump it down.
    """
    gap = theoretical_pos - actual_pos  # positive = performing better than expected

    if 6 <= gap <= 15:
        cluster = max(0, cluster - 1)
    elif gap > 15:
        cluster = max(0, cluster - 2)
    elif -15 <= gap <= -6:
        cluster = min(N_CLUSTERS - 1, cluster + 1)
    elif gap < -15:
        cluster = min(N_CLUSTERS - 1, cluster + 2)

    return cluster


def compute_clustering(state: RaceStateManager, team_positions: dict[int, int]) -> None:
    """
    Compute performance clusters for all karts and update state.

    Args:
        state: The race state manager
        team_positions: Dict of kart_number -> theoretical position from teams_level
    """
    karts = list(state.karts.values())
    if len(karts) < 2:
        return

    # Compute average lap times for each kart (last N laps of current stint)
    kart_stats = []
    for kart in karts:
        valid_laps = kart.stint_laps[-LAST_N_LAPS:] if kart.stint_laps else []
        if not valid_laps:
            # Use all_laps if no stint laps
            valid_laps = kart.all_laps[-LAST_N_LAPS:] if kart.all_laps else []

        if not valid_laps:
            continue

        avg_ms = float(np.mean(valid_laps))
        sorted_laps = sorted(valid_laps)
        best_avg_ms = float(np.mean(sorted_laps[:BEST_N_LAPS])) if len(sorted_laps) >= BEST_N_LAPS else avg_ms

        kart_stats.append({
            "kart": kart,
            "avg_ms": avg_ms,
            "best_avg_ms": best_avg_ms,
        })

    if len(kart_stats) < N_CLUSTERS:
        # Not enough data for clustering - assign middle tier to all
        for ks in kart_stats:
            ks["kart"].tier_score = 50
            ks["kart"].avg_lap_ms = ks["avg_ms"]
            ks["kart"].best_avg_ms = ks["best_avg_ms"]
            ks["kart"].cluster = 2
        return

    # Extract best_avg values for clustering
    best_avgs = np.array([ks["best_avg_ms"] for ks in kart_stats])

    # Check for enough unique values
    unique_vals = len(np.unique(best_avgs))
    if unique_vals < N_CLUSTERS:
        n_classes = max(2, unique_vals)
    else:
        n_classes = N_CLUSTERS

    try:
        import jenkspy
        breaks = jenkspy.jenks_breaks(best_avgs.tolist(), n_classes=n_classes)

        # Assign clusters (lower best_avg = faster = lower cluster index)
        for ks in kart_stats:
            kart = ks["kart"]
            kart.avg_lap_ms = ks["avg_ms"]
            kart.best_avg_ms = ks["best_avg_ms"]

            # Find which cluster this kart belongs to
            cluster = 0
            for i in range(1, len(breaks)):
                if ks["best_avg_ms"] <= breaks[i]:
                    cluster = i - 1
                    break
            else:
                cluster = n_classes - 1

            # Adjust by position if team mapping exists
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
            ks["kart"].cluster = 2
