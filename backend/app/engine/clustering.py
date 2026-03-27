"""
Kart performance clustering using Jenks Natural Breaks.
EXACT port of boxboxnow.py lines 390-451.

Steps:
1. Group valid_laps by kart + pitNumber, take last pit's laps
2. Compute Tiempo_Promedio_Vuelta (mean last 20) and Best_time_avg (mean best 3)
3. Apply JenksNaturalBreaks with 5 clusters on Best_time_avg
4. Pad breaks with min-20 and max+20, trim to 5 bins
5. pd.cut to assign cluster labels
6. Sort by Best_time_avg -> assign posicion_real
7. Adjust cluster by position gap (ajustar_cluster_por_posicion)
8. Map cluster -> tier score

Driver differential:
  Subtracts differential from observed averages before clustering.
"""

import logging
import numpy as np
import pandas as pd
import jenkspy
from app.engine.state import RaceStateManager, KartState

logger = logging.getLogger(__name__)

TIER_SCORES = {0: 100, 1: 75, 2: 50, 3: 25, 4: 1}
N_CLUSTERS = 5


def ajustar_cluster_por_posicion(row):
    """Exact port of boxboxnow.py ajustar_cluster_por_posicion()."""
    diferencia = row['position'] - row['posicion_real']
    if 6 < diferencia <= 15:
        return max(0, row['cluster'] - 1)
    elif -15 < diferencia < -6:
        return min(4, row['cluster'] + 1)
    elif diferencia > 15:
        return max(0, row['cluster'] - 2)
    elif diferencia < -15:
        return min(4, row['cluster'] + 2)
    else:
        return row['cluster']


def compute_clustering(
    state: RaceStateManager,
    team_positions: dict[int, int],
    driver_differentials: dict[int, dict[str, int]] | None = None,
) -> None:
    """
    Exact port of boxboxnow.py main loop clustering (lines 360-451).

    Uses valid_laps from each kart, grouped by pitNumber, taking the
    last pit's data. Then applies Jenks clustering with break padding.
    """
    if driver_differentials is None:
        driver_differentials = {}

    # Build a DataFrame from all karts' valid_laps (stage_laps_rt equivalent)
    all_records = []
    for kart in state.karts.values():
        for lap in kart.valid_laps:
            all_records.append(lap)

    if not all_records:
        return

    df = pd.DataFrame(all_records)
    if df.empty or 'lapTime' not in df.columns:
        return

    df.dropna(inplace=True)
    df = df.sort_values(['kartNumber', 'pitNumber', 'totalLap'])

    # Group by kart + pitNumber, compute aggregates (exact port)
    df_grouped = df.groupby(['kartNumber', 'pitNumber']).agg({
        'lapTime': [
            ('Tiempo_Promedio_Vuelta', lambda x: x.tail(20).mean()),
            ('Best_time_avg', lambda x: x.nsmallest(3).mean()),
        ]
    }).reset_index()

    df_grouped.columns = ['kart', 'pits', 'Tiempo_Promedio_Vuelta', 'Best_time_avg']

    # Filter to last pit per kart
    df_ultimo_pit = df_grouped.loc[df_grouped.groupby('kart')['pits'].idxmax()].copy()

    # Merge with team positions
    if team_positions:
        team_df = pd.DataFrame([
            {'kart': k, 'position': v}
            for k, v in team_positions.items()
        ])
        df_ultimo_pit = pd.merge(df_ultimo_pit, team_df, on='kart', how='left')
    else:
        df_ultimo_pit['position'] = range(1, len(df_ultimo_pit) + 1)

    df_ultimo_pit['position'] = df_ultimo_pit['position'].fillna(len(df_ultimo_pit))

    # Apply driver differentials before clustering
    for idx, row in df_ultimo_pit.iterrows():
        kart_num = int(row['kart'])
        kart_state = None
        for k in state.karts.values():
            if k.kart_number == kart_num:
                kart_state = k
                break
        if kart_state and kart_num in driver_differentials:
            driver_name_lower = kart_state.driver_name.strip().lower()
            drivers = driver_differentials[kart_num]
            diff = drivers.get(driver_name_lower, 0)
            # Try partial match
            if diff == 0:
                for name, d in drivers.items():
                    if name in driver_name_lower or driver_name_lower in name:
                        diff = d
                        break
            df_ultimo_pit.at[idx, 'Best_time_avg'] -= diff
            df_ultimo_pit.at[idx, 'Tiempo_Promedio_Vuelta'] -= diff
            if kart_state:
                kart_state.driver_differential_ms = diff

    # Check unique values
    unique_values = df_ultimo_pit['Best_time_avg'].nunique()

    if unique_values < N_CLUSTERS:
        logger.warning("No hay suficientes valores unicos para calcular los clusters.")
        # Still update avg/best on kart states
        _update_kart_stats(state, df_ultimo_pit)
        return

    # Apply Jenks Natural Breaks (exact port)
    try:
        breaks = jenkspy.JenksNaturalBreaks(n_classes=N_CLUSTERS)
        breaks.fit(df_ultimo_pit['Best_time_avg'].values)

        # Pad breaks with min-20 and max+20
        min_value = df_ultimo_pit['Best_time_avg'].min()
        max_value = df_ultimo_pit['Best_time_avg'].max()
        adjusted_breaks = np.concatenate(([min_value - 20], breaks.breaks_, [max_value + 20]))

        # Trim to 5 bins if too many boundaries
        if len(adjusted_breaks) > 6:
            adjusted_breaks = np.array([adjusted_breaks[0]] + list(breaks.breaks_[:4]) + [adjusted_breaks[-1]])

        if len(adjusted_breaks) < 3:
            logger.warning("No hay suficientes datos para generar los clusters.")
            _update_kart_stats(state, df_ultimo_pit)
            return

        adjusted_breaks = sorted(set(adjusted_breaks))

        df_ultimo_pit['cluster'] = pd.cut(
            df_ultimo_pit['Best_time_avg'],
            bins=adjusted_breaks,
            labels=range(len(adjusted_breaks) - 1),
            include_lowest=True,
            right=True,
            duplicates='drop',
        )

        # Assign posicion_real based on Best_time_avg sort
        df_ultimo_pit = df_ultimo_pit.sort_values(by='Best_time_avg')
        df_ultimo_pit['posicion_real'] = range(1, len(df_ultimo_pit) + 1)

        # Adjust cluster by position gap
        df_ultimo_pit['cluster_ajustado'] = df_ultimo_pit.apply(ajustar_cluster_por_posicion, axis=1)

        # Map to tier scores
        df_ultimo_pit['puntuacion'] = df_ultimo_pit['cluster_ajustado'].map(TIER_SCORES)

        # Re-sort by Tiempo_Promedio_Vuelta and re-assign posicion_real
        df_ultimo_pit = df_ultimo_pit.sort_values(by='Tiempo_Promedio_Vuelta')
        df_ultimo_pit['posicion_real'] = range(1, len(df_ultimo_pit) + 1)

        # Apply results to kart states
        for _, row in df_ultimo_pit.iterrows():
            kart_num = int(row['kart'])
            for kart in state.karts.values():
                if kart.kart_number == kart_num:
                    kart.avg_lap_ms = float(row['Tiempo_Promedio_Vuelta'])
                    kart.best_avg_ms = float(row['Best_time_avg'])
                    kart.cluster = int(row.get('cluster_ajustado', 2))
                    kart.tier_score = int(row.get('puntuacion', 50))
                    break

        logger.debug(f"Clustering updated: {len(df_ultimo_pit)} karts")

    except Exception as e:
        logger.error(f"Error al crear los clusters: {e}", exc_info=True)
        _update_kart_stats(state, df_ultimo_pit)


def _update_kart_stats(state: RaceStateManager, df: pd.DataFrame):
    """Update avg/best on kart states even when clustering fails."""
    for _, row in df.iterrows():
        kart_num = int(row['kart'])
        for kart in state.karts.values():
            if kart.kart_number == kart_num:
                kart.avg_lap_ms = float(row.get('Tiempo_Promedio_Vuelta', 0))
                kart.best_avg_ms = float(row.get('Best_time_avg', 0))
                kart.tier_score = 50
                kart.cluster = 2
                break
