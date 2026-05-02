"""
Real-time race classification accounting for pit-stop differences
between teams.

ALGORITHM (lap-domain progress with field-uniform conversion):

  T               = race time elapsed (s)
  avg_field_lap   = median of avg_lap_ms across the field
  pit_time_ref    = median of completed pit durations (field-wide)

  intra_lap_K     = time on track in current lap so far (capped at one lap)
                    racing : T - sum_lap_times_K - pit_time_in_current_lap
                    in_pit : pit_in_race_time - sum_lap_times_K  (frozen)

  pit_debt_K      = pit-time obligation still to pay
                    racing : pits_remaining_K * pit_time_ref
                    in_pit : (pit_time_ref - currentPitElapsed) + pits_beyond * pit_time_ref

  adj_progress_K  = lap_count_K * avg_field_lap + intra_lap_K - pit_debt_K

Sort by adj_progress desc → leader first.

  gap_to_leader_s   = adj_leader - adj_K
  interval_to_ahead = adj_ahead  - adj_K

WHY lap_count × avg_field_lap (not T - pit_time)?

  The earlier draft used `trackTime = T - pit_time`. When actual pit
  duration ≈ pit_time_ref, doing a pit is informationally equivalent
  to NOT doing one (debt drops by pit_ref, trackTime drops by ≈
  pit_ref → adj_progress unchanged). All karts collapsed to the same
  adj_progress modulo individual pit-time variance, which on a clean
  field is sub-second → the table shows everyone at +0.0s.

  Multiplying lap_count by a SHARED constant (avg_field_lap) instead
  preserves the "more laps = more progress" signal independently of
  pit time. A kart that's done 16 laps + 0 pits is ranked ahead of a
  kart with 13 laps + 1 pit, by approximately 3 × avg_field_lap −
  pit_time_ref worth of adj_progress (which is the right answer when
  the race finishes only after both have done all min_pits stops).

STABILITY:

  Steady state: every kart accumulates adj_progress at +1.0 s/s.
  Racing : intra_lap grows +1, debt static.
  In pit : intra_lap frozen, current_pit_remaining shrinks -1
           (debt drops by 1) → adj_progress still grows +1.
  Pit-in : pits_remaining drops by 1, current_pit_remaining starts
           at pit_time_ref. Net debt unchanged → no jump.
  Lap-completion : lap_count++, intra resets near 0. The jump
           equals (avg_field_lap - actual_lap_time), which reflects
           the kart's real pace vs the field. Faster than field → +
           jump; slower → - jump.
"""

import logging
import statistics
from app.engine.state import RaceStateManager

logger = logging.getLogger(__name__)


def compute_classification(state: RaceStateManager) -> None:
    """Compute the lap-domain real classification and store on state."""

    duration_ms = getattr(state, '_first_countdown_ms', 0) or state.duration_min * 60 * 1000
    elapsed_ms = duration_ms - state.countdown_ms
    if elapsed_ms <= 0 or not state.karts:
        state.classification = []
        state.classification_meta = {}
        return

    T_s = elapsed_ms / 1000  # race time elapsed in seconds

    # --- Reference values (field-wide) -------------------------------------

    # Reference pit duration: median of completed pits across the field.
    all_pit_times_ms = [
        p.pit_time_ms
        for kart in state.karts.values()
        for p in kart.pit_history
        if p.pit_time_ms > 0
    ]
    if all_pit_times_ms:
        pit_time_ref_s = statistics.median(all_pit_times_ms) / 1000
    else:
        pit_time_ref_s = float(state.pit_time_s) if state.pit_time_s > 0 else 60.0

    # Required pits per kart. Use config; fallback to legacy max(field) if
    # unset so the classification doesn't collapse to "everyone owes 0".
    if state.min_pits > 0:
        min_pits = state.min_pits
    else:
        min_pits = max(
            (kart.pit_count for kart in state.karts.values()),
            default=0,
        )

    # Field median average lap time. Used to convert lap_count into a
    # comparable progress-time. Falls back to a sensible default when
    # not enough data has been gathered yet.
    avg_lap_ms_values = [
        kart.avg_lap_ms for kart in state.karts.values() if kart.avg_lap_ms > 0
    ]
    if avg_lap_ms_values:
        avg_field_lap_s = statistics.median(avg_lap_ms_values) / 1000
    else:
        avg_field_lap_s = 60.0  # conservative default

    # Field median speed for the meters secondary display only. Single
    # field-wide value so the meters column doesn't flicker per-kart.
    if avg_field_lap_s > 0 and state.circuit_length_m > 0:
        median_field_speed_ms = state.circuit_length_m / avg_field_lap_s
    else:
        median_field_speed_ms = 0.0

    # --- Per-kart adjusted progress ----------------------------------------

    karts_data = []
    for kart in state.karts.values():
        if kart.total_laps == 0:
            continue

        # Race time at last line crossing = sum of completed lap durations.
        # Lap durations include any pit time spent on the same lap (pit lap
        # time = on-track portion + pit duration), so this naturally
        # accounts for completed pit penalties.
        sum_lap_times_ms = sum(
            int(lap.get('lapTime', 0)) for lap in kart.all_laps
        )
        sum_lap_times_s = sum_lap_times_ms / 1000

        # Pit-in race time (if currently in pit) and elapsed in current pit.
        if kart.pit_status == "in_pit" and kart.pit_in_countdown_ms != 0:
            pit_in_race_time_s = (duration_ms - kart.pit_in_countdown_ms) / 1000
            current_pit_elapsed_s = max(0.0, T_s - pit_in_race_time_s)
        else:
            pit_in_race_time_s = 0.0
            current_pit_elapsed_s = 0.0

        # Intra-lap time: time on track since last crossing within the
        # current (in-progress) lap. Frozen during pit so the kart doesn't
        # appear to be "advancing" while stationary.
        if kart.pit_status == "in_pit":
            intra_lap_s = max(0.0, pit_in_race_time_s - sum_lap_times_s)
        else:
            # Subtract any pit time spent during the current (yet-uncompleted)
            # lap. PitRecord.lap is the lap_count at PIT_IN, so a pit during
            # the kart's current attempt at lap (total_laps + 1) carries
            # lap == total_laps. Once that lap completes, the pit's duration
            # is folded into lap_time and removed from this branch.
            pit_ms_in_current_lap = sum(
                p.pit_time_ms
                for p in kart.pit_history
                if p.lap == kart.total_laps and p.pit_time_ms > 0
            )
            intra_lap_s = max(
                0.0,
                T_s - sum_lap_times_s - pit_ms_in_current_lap / 1000,
            )

        # Cap intra at one lap. Beyond that the kart is anomalously slow
        # (full course yellow, mechanical) and we don't want to credit
        # them for "almost completing another lap".
        if avg_field_lap_s > 0:
            intra_lap_s = min(intra_lap_s, avg_field_lap_s * 0.99)

        # Pit debt
        if kart.pit_status == "in_pit":
            pits_beyond = max(0, min_pits - kart.pit_count)
            current_pit_remaining = max(0.0, pit_time_ref_s - current_pit_elapsed_s)
            pit_debt_s = current_pit_remaining + pits_beyond * pit_time_ref_s
            pits_remaining_display = pits_beyond + 1
        else:
            pits_remaining = max(0, min_pits - kart.pit_count)
            pit_debt_s = pits_remaining * pit_time_ref_s
            pits_remaining_display = pits_remaining

        # Lap-domain adjusted progress
        adj_progress_s = (
            kart.total_laps * avg_field_lap_s
            + intra_lap_s
            - pit_debt_s
        )

        karts_data.append({
            'kart': kart,
            'sum_lap_times_s': sum_lap_times_s,
            'intra_lap_s': intra_lap_s,
            'pit_debt_s': pit_debt_s,
            'adj_progress_s': adj_progress_s,
            'pits_remaining_display': pits_remaining_display,
        })

    karts_data.sort(key=lambda d: d['adj_progress_s'], reverse=True)

    if not karts_data:
        state.classification = []
        state.classification_meta = {}
        return

    leader_progress = karts_data[0]['adj_progress_s']

    # --- Build output -------------------------------------------------------

    classification = []
    for i, d in enumerate(karts_data):
        kart = d['kart']
        gap_s = leader_progress - d['adj_progress_s']
        interval_s = (
            karts_data[i - 1]['adj_progress_s'] - d['adj_progress_s']
            if i > 0 else 0.0
        )
        classification.append({
            "position": i + 1,
            "kartNumber": int(kart.kart_number),
            "teamName": kart.team_name,
            "driverName": kart.driver_name,
            "totalLaps": int(kart.total_laps),
            "pitCount": int(kart.pit_count),
            "pitStatus": kart.pit_status,
            "pitsRemaining": int(d['pits_remaining_display']),
            "gapS": round(gap_s, 3),
            "intervalS": round(interval_s, 3),
            "gapM": round(gap_s * median_field_speed_ms),
            "intervalM": round(interval_s * median_field_speed_ms),
            "trackTimeS": round(
                d['sum_lap_times_s'] + d['intra_lap_s'], 1
            ),
            "adjProgressS": round(d['adj_progress_s'], 1),
            "avgLapMs": round(kart.avg_lap_ms),
            "tierScore": kart.tier_score,
        })

    state.classification = classification
    state.classification_meta = {
        "minPits": int(min_pits),
        "pitTimeRefS": round(pit_time_ref_s, 2),
        "avgFieldLapMs": round(avg_field_lap_s * 1000),
        "medianFieldSpeedMs": round(median_field_speed_ms, 2),
        "raceTimeS": round(T_s, 1),
    }
