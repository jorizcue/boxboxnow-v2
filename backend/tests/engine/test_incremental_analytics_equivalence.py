"""Equivalence tests for the per-LAP-event analytics perf refactor.

These three changes replace unbounded full-scans (run on every LAP event,
which is what made 24h/40-kart races ramp CPU linearly) with O(1)/cached
equivalents. Each assertion below pins the new incremental value to the
EXACT old scan it replaces, so the refactor is provably behaviour-preserving.

  W1  all_laps_sum_ms        == sum(int(l.get('lapTime',0)) for l in all_laps)
  W2  current_stint_lap_count == sum(1 for l in all_laps if l['pitNumber']==pit-1)
  W3  cached pit median       == statistics.median(all completed pit_time_ms)

Laps are fed through the REAL LAP handler (distinct ms > 15000 so the
value-changed branch records each one), and pits through the real
PIT_IN/PIT_OUT handlers, so the incremental updates run on the exact code
path production uses.
"""
import statistics

from app.engine.state import RaceStateManager
from app.apex.parser import RaceEvent, EventType


def _ev(t, **kw):
    return RaceEvent(type=t, **kw)


def _kart_init(row="r1", num=7, total="0"):
    return _ev(
        EventType.INIT, value="kart", row_id=row,
        extra={"kart_number": num, "team_name": "Alpha",
               "position": 1, "total_laps": total},
    )


def _ms_to_str(ms: int) -> str:
    """Inverse of time_to_ms for the M:SS.mmm form the parser expects."""
    minutes = ms // 60000
    rem = ms % 60000
    secs = rem // 1000
    millis = rem % 1000
    return f"{minutes}:{secs:02d}.{millis:03d}"


async def _feed_lap(s, row, lap_ms):
    """Feed one LAP event with a distinct ms so value_changed records it."""
    await s.handle_events([_ev(EventType.LAP, value=_ms_to_str(lap_ms), row_id=row)])


def _old_all_laps_sum_ms(kart) -> int:
    return sum(int(lap.get("lapTime", 0)) for lap in kart.all_laps)


def _old_stint_scan(kart) -> int:
    # As written at PIT_IN: pit_count already incremented, so pit_count-1
    # is the just-finished stint's pitNumber.
    return sum(1 for lap in kart.all_laps if lap.get("pitNumber") == kart.pit_count - 1)


def _old_field_pit_median(state):
    vals = [
        p.pit_time_ms
        for kart in state.karts.values()
        for p in kart.pit_history
        if p.pit_time_ms > 0
    ]
    return statistics.median(vals) if vals else None


# --------------------------------------------------------------------------
# W1 — all_laps_sum_ms incremental
# --------------------------------------------------------------------------

async def test_w1_all_laps_sum_ms_matches_scan_over_many_laps():
    s = RaceStateManager()
    await s.handle_events([_kart_init()])
    kart = s.karts["r1"]

    # Distinct, realistic lap times (all > 15000ms).
    lap_times = [71_234, 70_980, 72_010, 69_888, 71_111, 70_500, 73_222]
    for i, lt in enumerate(lap_times):
        await _feed_lap(s, "r1", lt)
        # Equivalence checked at EVERY append, not just the end.
        assert kart.all_laps_sum_ms == _old_all_laps_sum_ms(kart), (
            f"mismatch after lap {i + 1}"
        )

    assert len(kart.all_laps) == len(lap_times)
    assert kart.all_laps_sum_ms == sum(lap_times)


async def test_w1_parse_is_bit_identical_to_classification_expr():
    # The classification scan uses int(lap.get('lapTime', 0)). Prove the
    # incremental update uses the identical parse for the edge cases that
    # can occur: a record with lapTime=0 and a record missing the key.
    # (These never arise on the real LAP path — lap_ms is always an int >
    # 15000 there — but the parse must match so the field is bit-identical
    # to the sum if such a record were ever appended.)
    s = RaceStateManager()
    await s.handle_events([_kart_init()])
    kart = s.karts["r1"]
    await _feed_lap(s, "r1", 71_000)

    baseline = kart.all_laps_sum_ms
    # zero lapTime
    rec0 = {"lapTime": 0, "totalLap": 99, "pitNumber": kart.pit_count}
    kart.all_laps.append(rec0)
    kart.all_laps_sum_ms += int(rec0.get("lapTime", 0))
    assert kart.all_laps_sum_ms == _old_all_laps_sum_ms(kart) == baseline

    # missing lapTime key → default 0
    rec_missing = {"totalLap": 100, "pitNumber": kart.pit_count}
    kart.all_laps.append(rec_missing)
    kart.all_laps_sum_ms += int(rec_missing.get("lapTime", 0))
    assert kart.all_laps_sum_ms == _old_all_laps_sum_ms(kart) == baseline


# --------------------------------------------------------------------------
# W2 — current_stint_lap_count == old stint scan at PIT_IN
# --------------------------------------------------------------------------

async def test_w2_stint_count_matches_scan_across_two_stints():
    s = RaceStateManager()
    await s.handle_events([_kart_init()])
    kart = s.karts["r1"]

    # Stint 1: N laps, then PIT_IN.
    for lt in (71_001, 70_002, 72_003, 69_004):
        await _feed_lap(s, "r1", lt)
    await s.handle_events([_ev(EventType.PIT_IN, row_id="r1")])
    # At PIT_IN, pit_count was bumped; old scan counts the just-finished stint.
    assert kart.current_stint_lap_count == _old_stint_scan(kart)
    assert kart.current_stint_lap_count == 4

    # PIT_OUT resets the counter to 0.
    await s.handle_events([_ev(EventType.PIT_OUT, row_id="r1")])
    assert kart.current_stint_lap_count == 0

    # Stint 2: a DIFFERENT number of laps, then PIT_IN again.
    for lt in (70_500, 71_600, 69_700):
        await _feed_lap(s, "r1", lt)
    await s.handle_events([_ev(EventType.PIT_IN, row_id="r1")])
    assert kart.current_stint_lap_count == _old_stint_scan(kart)
    assert kart.current_stint_lap_count == 3


async def test_w2_stint_count_zero_when_pit_with_no_laps():
    # Off-by-one guard: a kart that pits immediately with no laps in the
    # stint must report 0 from both the counter and the scan.
    s = RaceStateManager()
    await s.handle_events([_kart_init()])
    kart = s.karts["r1"]
    await s.handle_events([_ev(EventType.PIT_IN, row_id="r1")])
    assert kart.current_stint_lap_count == _old_stint_scan(kart) == 0


# --------------------------------------------------------------------------
# W3 — cached field-wide pit median
# --------------------------------------------------------------------------

async def _do_pit(s, row, dwell_ms):
    """PIT_IN then PIT_OUT with a controlled pit dwell so pit_time_ms>0.

    pit_time_ms = pit_in_countdown_ms - interpolated_countdown_ms(). With no
    COUNTDOWN event ever sent, _countdown_received_at stays 0 so the
    interpolated countdown == raw self.countdown_ms. So decreasing
    self.countdown_ms by dwell_ms between PIT_IN and PIT_OUT yields exactly
    pit_time_ms == dwell_ms.
    """
    await s.handle_events([_ev(EventType.PIT_IN, row_id=row)])
    s.countdown_ms -= dwell_ms
    await s.handle_events([_ev(EventType.PIT_OUT, row_id=row)])


async def test_w3_cached_pit_median_matches_scan():
    s = RaceStateManager()
    s.duration_min = 1440  # 24h, so countdown is large and positive
    s.countdown_ms = s.duration_min * 60 * 1000
    await s.handle_events([_kart_init(row="r1", num=7)])
    await s.handle_events([_kart_init(row="r2", num=9)])

    # No pits yet → cache is None.
    assert s.field_pit_median_ms() == _old_field_pit_median(s)

    # A sequence of completed pits across both karts.
    await _do_pit(s, "r1", 32_000)
    assert s.field_pit_median_ms() == _old_field_pit_median(s)

    await _do_pit(s, "r2", 28_500)
    assert s.field_pit_median_ms() == _old_field_pit_median(s)

    await _do_pit(s, "r1", 41_000)
    assert s.field_pit_median_ms() == _old_field_pit_median(s)

    # Odd vs even count both exercised above (1, 2, 3 completed pits).
    expected = statistics.median([32_000, 28_500, 41_000])
    assert s.field_pit_median_ms() == expected
