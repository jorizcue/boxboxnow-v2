import os
from collections import defaultdict

import pytest

from app.services.ranking.extractor import extract_sessions

FX = os.path.join(os.path.dirname(__file__), "fixtures")
ARIZA = os.path.join(FX, "ariza_2026-05-02.log.gz")
SANTOS = os.path.join(FX, "santos_2026-04-25.log.gz")


def _by_seq(sessions):
    g = defaultdict(list)
    for s in sessions:
        g[s.session_seq].append(s)
    return g


def _heat_race(by_seq, name):
    """The single race session for `name` (e.g. 'HEAT B-C'), excluding
    the 1-lap SUPERPOLE and any non-race / tiny session."""
    out = []
    for rows in by_seq.values():
        title = f"{rows[0].title1} {rows[0].title2}".upper()
        if name in title and "SUPERPOLE" not in title \
           and rows[0].session_type == "race" \
           and max(r.total_laps for r in rows) > 5:
            out.append(rows)
    return out


@pytest.mark.skipif(not os.path.exists(ARIZA), reason="ariza fixture missing")
def test_ariza_overmerge_fixed_and_jon_is_a_front_runner():
    S = extract_sessions(ARIZA, circuit_name="Ariza", log_date="2026-05-02")
    by_seq = _by_seq(S)

    # Over-merge fixed: HEAT B-C is ONE ~12-lap race, not a doubled ~24+.
    bc = _heat_race(by_seq, "HEAT B-C")
    assert len(bc) == 1, f"expected exactly one HEAT B-C race, got {len(bc)}"
    bc_rows = bc[0]
    assert max(r.total_laps for r in bc_rows) <= 14, "HEAT B-C laps doubled (over-merge not fixed)"
    # contiguous 1..N classification (a real reconstructed result)
    assert sorted(r.final_position for r in bc_rows) == list(range(1, len(bc_rows) + 1))

    def jon_in(name, rows_list):
        assert len(rows_list) == 1, f"{name}: expected 1 race session"
        jon = [r for r in rows_list[0] if "VALLE" in r.driver_raw.upper()]
        assert jon, f"Jon del Valle not in {name}"
        assert len(jon) == 1
        return jon[0]

    # Verified ground truth: Jon WON C-D and A-C, was P2 in B-C
    # (Iker Ramos +0.459s). The OLD bug put him ~P9/8/10 (alphabetical
    # /fragment) — assert he is a front-runner now, NOT mid-pack.
    cd = jon_in("HEAT C-D", _heat_race(by_seq, "HEAT C-D"))
    ac = jon_in("HEAT A-C", _heat_race(by_seq, "HEAT A-C"))
    bc_jon = jon_in("HEAT B-C", bc)
    assert cd.final_position == 1, f"HEAT C-D: Jon should be P1, got {cd.final_position}"
    assert ac.final_position == 1, f"HEAT A-C: Jon should be P1, got {ac.final_position}"
    assert bc_jon.final_position == 2, f"HEAT B-C: Jon should be P2, got {bc_jon.final_position}"
    # Old alphabetical-bug signature ("JON" ~9th) must be gone everywhere.
    for r in (cd, ac, bc_jon):
        assert r.final_position < 5


@pytest.mark.skipif(not os.path.exists(SANTOS), reason="santos fixture missing")
def test_santos_12h_stitches_and_kart9_shared_realistic():
    S = extract_sessions(SANTOS, circuit_name="Santos", log_date="2026-04-25")
    races = _by_seq(S)
    carrera = [rows for rows in races.values()
               if rows[0].session_type == "race"
               and "CARRERA" in f"{rows[0].title1} {rows[0].title2}".upper()
               and max(r.total_laps for r in rows) > 200]
    assert len(carrera) == 1
    rows = carrera[0]
    k9 = [r for r in rows if r.kart_number == 9]
    assert k9, "kart 9 not in stitched 12h"
    pos = {r.final_position for r in k9}
    assert len(pos) == 1
    assert next(iter(pos)) >= 10
