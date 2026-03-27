"""
Distance-based race classification engine.
EXACT port of boxboxnow.py resumen_karts() (lines 192-289).

Key difference from previous implementation:
  - max_pits = max pitNumber across ALL karts (not a config value)
  - Uses created_at timestamps from all_laps for time_since_meta
  - Excludes first lap of each stint when computing averages
"""

import logging
import numpy as np
import pandas as pd
from datetime import datetime
from app.engine.state import RaceStateManager

logger = logging.getLogger(__name__)


def compute_classification(state: RaceStateManager) -> None:
    """
    Exact port of boxboxnow.py resumen_karts().
    Builds a DataFrame from all_laps (stage_laps_clasif equivalent),
    computes distance-based standings.
    """
    longitud_circuito = state.circuit_length_m
    tiempo_pit = state.pit_time_s

    if not longitud_circuito or longitud_circuito <= 0:
        state.classification = []
        return

    # Build DataFrame from all_laps (stage_laps_clasif equivalent)
    all_records = []
    for kart in state.karts.values():
        for lap in kart.all_laps:
            all_records.append(lap)

    if not all_records:
        state.classification = []
        return

    df_clasif = pd.DataFrame(all_records)
    if df_clasif.empty or 'lapTime' not in df_clasif.columns:
        state.classification = []
        return

    df_clasif['created_at'] = pd.to_datetime(df_clasif['created_at'])
    df_clasif = df_clasif.sort_values(['kartNumber', 'totalLap'])

    # Max pits across ALL karts (exact port)
    max_pits = df_clasif['pitNumber'].max() if 'pitNumber' in df_clasif.columns else 0

    resumen = []

    for kart_num, group in df_clasif.groupby('kartNumber'):
        last_row = group.iloc[-1]
        last_lap = last_row['totalLap']
        last_time = last_row['created_at']
        last_pit = last_row['pitNumber']

        # Last stint: final block where pitNumber == last_pit
        stint_mask = group['pitNumber'] == last_pit
        stint = group[stint_mask].copy()

        # Exclude first lap of stint (exact port)
        if len(stint) > 1:
            stint = stint.iloc[1:]

        # Last 20 laps of stint
        stint_ultimas = stint.tail(20)
        mean_lap_time = stint_ultimas['lapTime'].mean()  # in ms

        # Speed (m/s)
        if mean_lap_time and not np.isnan(mean_lap_time):
            mean_lap_time_s = mean_lap_time / 1000
            velocidad_media = longitud_circuito / mean_lap_time_s
        else:
            velocidad_media = np.nan

        # Distance from completed laps
        distancia_vueltas = last_lap * longitud_circuito

        # Time since last crossing
        ahora = pd.Timestamp.now()
        tiempo_desde_meta = (ahora - last_time).total_seconds()
        metros_extra = velocidad_media * tiempo_desde_meta if not np.isnan(velocidad_media) else 0

        # Pit penalty
        distancia_pit = velocidad_media * tiempo_pit if not np.isnan(velocidad_media) and tiempo_pit else np.nan
        pits_restantes = max_pits - last_pit
        distancia_no_recorrida = pits_restantes * distancia_pit if not np.isnan(distancia_pit) else np.nan

        distancia_total = distancia_vueltas + metros_extra - (distancia_no_recorrida if not np.isnan(distancia_no_recorrida) else 0)

        # Find team name from kart state
        team_name = ""
        driver_name = ""
        for k in state.karts.values():
            if k.kart_number == kart_num:
                team_name = k.team_name
                driver_name = k.driver_name
                break

        resumen.append({
            'kartNumber': kart_num,
            'teamName': team_name,
            'driverName': driver_name,
            'ultima_vuelta': last_lap,
            'velocidad_media_stint': velocidad_media,
            'distancia_total': distancia_total,
            'last_pit': last_pit,
            'pits_restantes': pits_restantes,
        })

    if not resumen:
        state.classification = []
        return

    df_resumen = pd.DataFrame(resumen)

    if df_resumen.empty or 'distancia_total' not in df_resumen.columns:
        state.classification = []
        return

    # Sort by distance (leader first)
    df_resumen = df_resumen.sort_values('distancia_total', ascending=False).reset_index(drop=True)

    # Interval (exact port)
    interval_list = [0.0]
    for i in range(1, len(df_resumen)):
        dist_diff = df_resumen.loc[i - 1, 'distancia_total'] - df_resumen.loc[i, 'distancia_total']
        v = df_resumen.loc[i, 'velocidad_media_stint']
        if v and not np.isnan(v) and v > 0:
            interval_list.append(dist_diff / v)
        else:
            interval_list.append(np.nan)
    df_resumen['Interval'] = interval_list

    # Gap (exact port)
    gap_list = [0.0]
    lider_dist = df_resumen.loc[0, 'distancia_total']
    for i in range(1, len(df_resumen)):
        dist_diff = lider_dist - df_resumen.loc[i, 'distancia_total']
        v = df_resumen.loc[i, 'velocidad_media_stint']
        if v and not np.isnan(v) and v > 0:
            gap_list.append(dist_diff / v)
        else:
            gap_list.append(np.nan)
    df_resumen['gap'] = gap_list

    # Build classification output
    classification = []
    for i, row in df_resumen.iterrows():
        # Get tier score from kart state
        tier_score = 50
        avg_lap_ms = 0
        for kart in state.karts.values():
            if kart.kart_number == row['kartNumber']:
                tier_score = kart.tier_score
                avg_lap_ms = kart.avg_lap_ms
                break

        gap_val = row['gap']
        interval_val = row['Interval']

        classification.append({
            "position": i + 1,
            "kartNumber": int(row['kartNumber']),
            "teamName": row['teamName'],
            "driverName": row['driverName'],
            "totalLaps": int(row['ultima_vuelta']),
            "pitCount": int(row['last_pit']),
            "gap": f"{gap_val:.3f}" if not np.isnan(gap_val) and gap_val > 0 else "",
            "interval": f"{interval_val:.3f}" if not np.isnan(interval_val) and interval_val > 0 else "",
            "avgLapMs": round(avg_lap_ms),
            "tierScore": tier_score,
        })

    state.classification = classification
