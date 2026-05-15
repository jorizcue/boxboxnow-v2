from app.services.ranking.segmenter import Segment, _RowState
from app.services.ranking.assembler import Race, classify_race
from app.services.ranking.results import reconstruct_race


def _row(name, laps_ms, *, drteam=None, retired=False):
    st = _RowState()
    st.lap_ms = list(laps_ms)
    st.last_live_name = name
    if drteam:
        st.drteam_names = list(drteam)
    st.retired = retired
    return st


def test_individual_sprint_classifies_by_laps_then_time():
    seg = Segment("", "HEAT A-B")
    seg.rows["rA"] = _row("ALICE", [40000, 40000, 40000]); seg.row_to_kart["rA"] = 1
    seg.rows["rB"] = _row("BOB", [41000, 41000, 41000]); seg.row_to_kart["rB"] = 2
    seg.rows["rC"] = _row("CARL", [40000, 40000])        ; seg.row_to_kart["rC"] = 3
    race = Race([seg])
    out = {s.driver_raw: s for s in reconstruct_race(
        race, circuit_name="X", log_date="2026-05-02", session_seq=1)}
    assert out["ALICE"].final_position == 1
    assert out["BOB"].final_position == 2
    assert out["CARL"].final_position == 3
    assert out["ALICE"].session_type == "race"


def test_retired_sorts_strictly_behind_classified():
    seg = Segment("", "RACE")
    seg.rows["r1"] = _row("WINNER", [40000] * 5); seg.row_to_kart["r1"] = 1
    seg.rows["r2"] = _row("DNF", [39000] * 9, retired=True); seg.row_to_kart["r2"] = 2
    race = Race([seg])
    out = {s.driver_raw: s for s in reconstruct_race(
        race, circuit_name="X", log_date="d", session_seq=1)}
    assert out["WINNER"].final_position == 1
    assert out["DNF"].final_position == 2


def test_endurance_team_position_shared_by_all_kart_drivers():
    seg = Segment("24 HORAS", "CARRERA")
    seg.rows["r9a"] = _row("TEAM9", [60000] * 300, drteam=["DRIVER A"]); seg.row_to_kart["r9a"] = 9
    seg.rows["r9b"] = _row("TEAM9", [60000] * 300, drteam=["DRIVER B"]); seg.row_to_kart["r9b"] = 9
    seg.rows["r8"]  = _row("TEAM8", [60000] * 700, drteam=["DRIVER C"]); seg.row_to_kart["r8"] = 8
    race = Race([seg])
    out = list(reconstruct_race(race, circuit_name="X", log_date="d", session_seq=1))
    by_kart = {}
    for s in out:
        by_kart.setdefault(s.kart_number, set()).add(s.final_position)
    assert by_kart[8] == {1}
    assert by_kart[9] == {2}
    assert len([s for s in out if s.kart_number == 9]) == 2


def test_kart_only_recording_uses_init_team_name():
    seg = Segment("", "CARRERA")
    # Row with no last_live_name but init_team_name set
    st = _RowState()
    st.lap_ms = [40000] * 5
    seg.rows["rx"] = st
    seg.row_to_kart["rx"] = 7
    seg.init_team_name["rx"] = "JULFRS"
    # Second competitor so there are >=2
    seg.rows["ry"] = _row("RIVAL", [41000] * 5)
    seg.row_to_kart["ry"] = 8
    race = Race([seg])
    out = {s.driver_raw: s for s in reconstruct_race(
        race, circuit_name="X", log_date="d", session_seq=1)}
    assert "JULFRS" in out
    assert out["JULFRS"].final_position is not None


def test_pace_session_still_emitted_with_positions():
    seg = Segment("", "CRONOS")
    seg.rows["r1"] = _row("DRIVER1", [35000] * 5)
    seg.row_to_kart["r1"] = 1
    seg.rows["r2"] = _row("DRIVER2", [36000] * 5)
    seg.row_to_kart["r2"] = 2
    race = Race([seg])
    out = list(reconstruct_race(race, circuit_name="X", log_date="d", session_seq=1))
    assert len(out) == 2
    expected_type = classify_race(race).session_type
    for s in out:
        assert s.session_type == expected_type
        assert s.final_position is not None


def test_endurance_reconnect_unions_laps_across_different_row_ids():
    s1 = Segment("24 HORAS", "CARRERA")
    s1.rows["a1"] = _row("T9", [60000]*200, drteam=["A"]); s1.row_to_kart["a1"] = 9
    s1.rows["b1"] = _row("T8", [60000]*250, drteam=["C"]); s1.row_to_kart["b1"] = 8
    s2 = Segment("24 HORAS", "CARRERA")              # reconnect: NEW row_ids, same karts
    s2.rows["a2"] = _row("T9", [60000]*150, drteam=["B"]); s2.row_to_kart["a2"] = 9
    s2.rows["b2"] = _row("T8", [60000]*250, drteam=["C"]); s2.row_to_kart["b2"] = 8
    out = list(reconstruct_race(Race([s1, s2]), circuit_name="X", log_date="d", session_seq=1))
    k9 = [s for s in out if s.kart_number == 9]
    k8 = [s for s in out if s.kart_number == 8]
    # kart 9 total = 200+150 = 350 laps; kart 8 = 250+250 = 500 → kart 8 wins
    assert {s.final_position for s in k8} == {1}
    assert {s.final_position for s in k9} == {2}      # single shared position
    assert len(k9) == 2                                # both row_ids emitted


def test_partial_retired_endurance_kart_is_finisher():
    seg = Segment("24 HORAS", "CARRERA")
    seg.rows["p1"] = _row("T5", [60000]*100, drteam=["A"], retired=True);  seg.row_to_kart["p1"] = 5
    seg.rows["p2"] = _row("T5", [60000]*100, drteam=["B"], retired=False); seg.row_to_kart["p2"] = 5
    seg.rows["q1"] = _row("T6", [60000]*300, drteam=["C"], retired=True);  seg.row_to_kart["q1"] = 6
    out = {s.kart_number: s.final_position for s in reconstruct_race(
        Race([seg]), circuit_name="X", log_date="d", session_seq=1)}
    # kart 5 partial-retired → treated as finisher → ahead of all-retired kart 6
    assert out[5] == 1
    assert out[6] == 2
