"""
Real-time race classification accounting for pit-stop differences
between teams.

ALGORITHM (time-domain, no speed dependence):

  T              = race time elapsed (s)
  trackTime_K    = T - completedPitTime_K - currentPitElapsed_K
  pitDebt_K      = remaining mandatory-pit obligation in seconds
  adjProgress_K  = trackTime_K - pitDebt_K

Sort by adjProgress desc → leader first.

  gap_to_leader_s   = adj_leader   - adj_K
  interval_to_ahead = adj_ahead    - adj_K

Stable: every kart in steady state advances at +1.0 s/s on adjProgress
(racing: +1 trackTime, 0 debt; in pit: 0 trackTime, -1 debt). Relative
gaps don't drift on idle ticks. Pit-in is a no-op (debt shifts from
"future pit obligation" to "current pit remaining"). Pit-out reveals
the saved/lost time vs reference.

Replaces the previous distance × speed algorithm whose `max(pitCount)`
recalculation oscillated whenever any kart pitted, and whose per-kart
speed conversion amplified noise from individual-lap outliers.
"""

import logging
import statistics
from app.engine.state import RaceStateManager

logger = logging.getLogger(__name__)


def compute_classification(state: RaceStateManager) -> None:
    """Compute the time-domain real classification and store on state."""

    # Total race duration: prefer `_first_countdown_ms` (the initial value
    # captured from Apex's first `dyn1|countdown|` signal) over the
    # configured `duration_min`, because replays of races whose actual
    # duration doesn't match the user's config (e.g. user has 180min set
    # but loads a 12h Santos replay) would otherwise produce a NEGATIVE
    # elapsed time and an empty classification.
    duration_ms = getattr(state, '_first_countdown_ms', 0) or state.duration_min * 60 * 1000
    elapsed_ms = duration_ms - state.countdown_ms
    if elapsed_ms <= 0 or not state.karts:
        state.classification = []
        state.classification_meta = {}
        return

    T_s = elapsed_ms / 1000  # race time elapsed in seconds

    # Reference pit duration: median of completed pits across the field.
    # Falls back to config.pit_time_s when no pits have completed yet.
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

    # Required pits per kart. Use config; if 0/unset (misconfigured race),
    # fall back to the legacy max(field) so the classification doesn't
    # collapse to "everyone owes 0 pits" until someone pits enough.
    if state.min_pits > 0:
        min_pits = state.min_pits
    else:
        min_pits = max(
            (kart.pit_count for kart in state.karts.values()),
            default=0,
        )

    # Field median speed for the meters secondary display. We use a single
    # field-wide value (not per-kart) so the meters column tracks a
    # consistent reference and doesn't flicker with individual lap-time
    # noise.
    speeds = []
    for kart in state.karts.values():
        if kart.avg_lap_ms > 0 and state.circuit_length_m > 0:
            speeds.append(state.circuit_length_m / (kart.avg_lap_ms / 1000))
    median_field_speed_ms = statistics.median(speeds) if speeds else 0.0

    karts_data = []
    for kart in state.karts.values():
        if kart.total_laps == 0:
            continue

        # Time spent in already-completed pits (measured from pit history).
        completed_pit_s = sum(
            p.pit_time_ms for p in kart.pit_history if p.pit_time_ms > 0
        ) / 1000

        # Time spent in the in-progress pit, if applicable. Both
        # pit_in_countdown_ms and state.countdown_ms decrease over time;
        # the difference is positive ms elapsed in the current pit.
        if kart.pit_status == "in_pit" and kart.pit_in_countdown_ms != 0:
            current_pit_elapsed_s = max(
                0.0,
                (kart.pit_in_countdown_ms - state.countdown_ms) / 1000,
            )
        else:
            current_pit_elapsed_s = 0.0

        # Track time = race time minus all pit time. The identity
        # T = trackTime + pitTime holds exactly per kart.
        track_time_s = T_s - completed_pit_s - current_pit_elapsed_s

        # Pit debt
        if kart.pit_status == "in_pit":
            # pit_count was incremented at PIT_IN, so this counts pits
            # BEYOND the one currently in progress.
            pits_beyond = max(0, min_pits - kart.pit_count)
            current_pit_remaining = max(0.0, pit_time_ref_s - current_pit_elapsed_s)
            pit_debt_s = current_pit_remaining + pits_beyond * pit_time_ref_s
            # For UI display: count the current pit as "remaining" too,
            # since the kart hasn't actually paid the obligation yet.
            pits_remaining_display = pits_beyond + 1
        else:
            pits_remaining = max(0, min_pits - kart.pit_count)
            pit_debt_s = pits_remaining * pit_time_ref_s
            pits_remaining_display = pits_remaining

        adj_progress_s = track_time_s - pit_debt_s

        karts_data.append({
            'kart': kart,
            'track_time_s': track_time_s,
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
            "trackTimeS": round(d['track_time_s'], 1),
            "adjProgressS": round(d['adj_progress_s'], 1),
            "avgLapMs": round(kart.avg_lap_ms),
            "tierScore": kart.tier_score,
        })

    state.classification = classification
    state.classification_meta = {
        "minPits": int(min_pits),
        "pitTimeRefS": round(pit_time_ref_s, 2),
        "medianFieldSpeedMs": round(median_field_speed_ms, 2),
        "raceTimeS": round(T_s, 1),
    }
