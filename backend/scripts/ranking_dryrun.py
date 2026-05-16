"""Pre-deploy gate. Run INSIDE the backend container against the real
recordings, BEFORE the admin triggers a full ranking Reset:

  docker compose exec -T backend python scripts/ranking_dryrun.py

Asserts the two headline fixes on real data (mirrors
tests/ranking/test_race_classification_integration.py, which runs the
same logic on committed .log.gz fixtures). Exit 0 = OK, 1 = FAIL.
"""
import os
import sys
from collections import defaultdict

# Run-from-anywhere: `python scripts/ranking_dryrun.py` puts scripts/ on
# sys.path, not the backend app root, so `import app...` fails. Prepend
# the backend root (parent of scripts/) so the documented command works.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.ranking.extractor import extract_sessions

ARIZA = "/app/data/recordings/Ariza/2026-05-02.log.gz"
SANTOS = "/app/data/recordings/Santos/2026-04-25.log.gz"

ok = True


def _by_seq(sessions):
    g = defaultdict(list)
    for s in sessions:
        g[s.session_seq].append(s)
    return g


def _heat_race(by_seq, name):
    out = []
    for rows in by_seq.values():
        title = f"{rows[0].title1} {rows[0].title2}".upper()
        if (name in title and "SUPERPOLE" not in title
                and rows[0].session_type == "race"
                and max(r.total_laps for r in rows) > 5):
            out.append(rows)
    return out


# ---- Ariza: over-merge fixed + Jon is a front-runner (P1/P1/P2) ----
S = extract_sessions(ARIZA, circuit_name="Ariza", log_date="2026-05-02")
bys = _by_seq(S)

bc = _heat_race(bys, "HEAT B-C")
print(f"Ariza HEAT B-C race sessions: {len(bc)} (expect 1)")
if len(bc) != 1:
    ok = False
else:
    mx = max(r.total_laps for r in bc[0])
    print(f"  HEAT B-C max_total_laps={mx} (expect <=14, i.e. not doubled)")
    if mx > 14:
        ok = False


def _jon(name):
    rl = _heat_race(bys, name)
    if len(rl) != 1:
        print(f"  {name}: expected 1 race session, got {len(rl)}")
        return None
    j = [r for r in rl[0] if "VALLE" in r.driver_raw.upper()]
    if len(j) != 1:
        print(f"  {name}: expected 1 Jon row, got {len(j)}")
        return None
    return j[0]


cd, ac, b = _jon("HEAT C-D"), _jon("HEAT A-C"), _jon("HEAT B-C")
for label, row, exp in (("HEAT C-D", cd, 1), ("HEAT A-C", ac, 1),
                        ("HEAT B-C", b, 2)):
    if row is None:
        ok = False
        continue
    print(f"  Jon {label}: final_position={row.final_position} (expect {exp})")
    if row.final_position != exp:
        ok = False

# ---- Santos: 12h stitched, kart 9 shared & realistic ----
S2 = extract_sessions(SANTOS, circuit_name="Santos", log_date="2026-04-25")
races = _by_seq(S2)
carrera = [rows for rows in races.values()
           if rows[0].session_type == "race"
           and "CARRERA" in f"{rows[0].title1} {rows[0].title2}".upper()
           and max(r.total_laps for r in rows) > 200]
print(f"Santos 12h CARRERA stitched races (>200 laps): {len(carrera)} (expect 1)")
if len(carrera) != 1:
    ok = False
else:
    k9 = [r for r in carrera[0] if r.kart_number == 9]
    pos = {r.final_position for r in k9}
    print(f"  kart 9 driver rows={len(k9)} shared_pos={pos} (expect 1 value, >=10)")
    if len(k9) == 0 or len(pos) != 1 or next(iter(pos), 0) < 10:
        ok = False

print("DRYRUN", "OK" if ok else "FAIL")
sys.exit(0 if ok else 1)
