from datetime import datetime, timedelta

from app.services.ranking.segmenter import Segment, _RowState
from app.services.ranking.assembler import assemble_races


def _seg(title2, *, karts, t0_s, t1_s, chequered, laps_per=10):
    s = Segment("", title2)
    for i, k in enumerate(karts):
        rid = f"r{title2}{k}"
        st = _RowState()
        st.lap_ms = [40000] * laps_per
        s.rows[rid] = st
        s.row_to_kart[rid] = k
    base = datetime(2026, 5, 2, 10, 0, 0)
    s.first_lap_ts = base + timedelta(seconds=t0_s)
    s.last_lap_ts = base + timedelta(seconds=t1_s)
    s.had_chequered = chequered
    return s


def test_two_same_title_heats_with_chequered_between_do_not_stitch():
    a = _seg("HEAT B-C", karts=[1, 2, 3], t0_s=0, t1_s=600, chequered=True)
    b = _seg("HEAT B-C", karts=[1, 2, 3], t0_s=700, t1_s=1300, chequered=True)
    races = assemble_races([a, b])
    assert len(races) == 2


def test_endurance_reconnect_same_title_no_chequered_stitches():
    a = _seg("12H", karts=[8, 9, 10], t0_s=0, t1_s=3600, chequered=False, laps_per=300)
    b = _seg("12H", karts=[8, 9, 10], t0_s=3700, t1_s=7200, chequered=False, laps_per=250)
    races = assemble_races([a, b])
    assert len(races) == 1
    assert len(races[0].segments) == 2


def test_disjoint_karts_do_not_stitch():
    a = _seg("HEAT", karts=[1, 2, 3], t0_s=0, t1_s=600, chequered=False)
    b = _seg("HEAT", karts=[7, 8, 9], t0_s=650, t1_s=1200, chequered=False)
    races = assemble_races([a, b])
    assert len(races) == 2


def test_gap_over_threshold_does_not_stitch():
    a = _seg("12H", karts=[8, 9, 10], t0_s=0, t1_s=3600, chequered=False, laps_per=300)
    b = _seg("12H", karts=[8, 9, 10], t0_s=3600+400, t1_s=7000, chequered=False, laps_per=250)
    races = assemble_races([a, b])
    assert len(races) == 2


def test_first_segment_always_its_own_race():
    races = assemble_races([_seg("X", karts=[1, 2], t0_s=0, t1_s=60, chequered=False)])
    assert len(races) == 1
    assert len(races[0].segments) == 1


def test_different_title_does_not_stitch():
    a = _seg("HEAT A-B", karts=[1, 2, 3], t0_s=0, t1_s=300, chequered=False)
    b = _seg("HEAT C-D", karts=[1, 2, 3], t0_s=320, t1_s=600, chequered=False)
    races = assemble_races([a, b])
    assert len(races) == 2
