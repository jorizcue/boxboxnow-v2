"""Stage 3: Race → list[SessionExtract] with the finishing order
RECONSTRUCTED from lap data (Apex RANKING is not trusted for the
result). Competitor = kart for endurance, driver-row for individual.
Classification key: (retired, -laps, race_time_ms, stable). Endurance:
the kart's position is shared by every driver who drove it.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field

from .assembler import Race, classify_race
from .normalizer import normalize_name


@dataclass
class SessionExtract:
    circuit_name: str
    log_date: str
    title1: str
    title2: str
    session_seq: int
    session_type: str           # "race" | "pace"
    team_mode: str              # "endurance" | "individual"
    driver_canonical: str
    driver_raw: str
    kart_number: int | None
    team_key: str
    drteam_names: list[str] = field(default_factory=list)
    laps_ms: list[int] = field(default_factory=list)
    total_laps: int = 0
    best_lap_ms: int = 0
    avg_lap_ms: float = 0.0
    median_lap_ms: int = 0
    final_position: int | None = None
    apex_last_position: int | None = None
    duration_s: int = 0


@dataclass
class _Row:
    row_id: str
    kart_number: int | None
    raw_name: str
    canonical: str
    team_key: str
    laps: list[int]
    drteam_names: list[str]
    retired: bool
    apex_last_position: int | None


def _collect_rows(race: Race) -> list[_Row]:
    """One _Row per (row_id) aggregated across the race's segments."""
    acc: dict[str, dict] = {}
    for seg in race.segments:
        for rid, st in seg.rows.items():
            laps = st.laps()
            if not laps:
                continue
            kart = seg.row_to_kart.get(rid)
            raw_name = st.last_live_name or seg.init_team_name.get(rid, "")
            a = acc.setdefault(rid, {
                "kart": kart, "raw": raw_name, "laps": [],
                "drteam": [], "retired": False, "apex": None,
            })
            if kart is not None:
                a["kart"] = kart
            if raw_name and not a["raw"]:
                a["raw"] = raw_name
            a["laps"].extend(laps)
            for n in st.drteam_names:
                if not a["drteam"] or a["drteam"][-1] != n:
                    a["drteam"].append(n)
            a["retired"] = a["retired"] or st.retired
            if st.apex_last_position is not None:
                a["apex"] = st.apex_last_position
    rows: list[_Row] = []
    for rid, a in acc.items():
        raw_name = a["raw"]
        canonical = normalize_name(raw_name)
        if not canonical:
            raw_name = f"KART {a['kart']}" if a["kart"] is not None else f"ROW {rid}"
            canonical = normalize_name(raw_name)
        if not canonical:
            continue
        team_key = str(a["kart"]) if a["kart"] is not None else f"row:{rid}"
        rows.append(_Row(rid, a["kart"], raw_name, canonical, team_key,
                          a["laps"], a["drteam"], a["retired"], a["apex"]))
    return rows


def reconstruct_race(
    race: Race, *, circuit_name: str, log_date: str, session_seq: int
) -> list[SessionExtract]:
    cls = classify_race(race)
    rows = _collect_rows(race)
    if not rows:
        return []

    endurance = cls.team_mode == "endurance"

    comp_of: dict[str, str] = {}
    comp_rows: dict[str, list[_Row]] = {}
    for r in rows:
        cid = (str(r.kart_number) if (endurance and r.kart_number is not None)
               else r.row_id)
        comp_of[r.row_id] = cid
        comp_rows.setdefault(cid, []).append(r)

    comp_stats = {}
    for cid, rs in comp_rows.items():
        all_laps = [ms for r in rs for ms in r.laps]
        comp_stats[cid] = {
            "retired": all(r.retired for r in rs) if rs else False,
            "laps": len(all_laps),
            "time": sum(all_laps),
        }
    ordered = sorted(
        comp_rows.keys(),
        key=lambda c: (
            comp_stats[c]["retired"],
            -comp_stats[c]["laps"],
            comp_stats[c]["time"],
            c,
        ),
    )
    pos_of = {cid: i + 1 for i, cid in enumerate(ordered)}

    out: list[SessionExtract] = []
    for r in rows:
        laps = r.laps
        out.append(SessionExtract(
            circuit_name=circuit_name,
            log_date=log_date,
            title1=race.title1,
            title2=race.title2,
            session_seq=session_seq,
            session_type=cls.session_type,
            team_mode=cls.team_mode,
            driver_canonical=r.canonical,
            driver_raw=r.raw_name,
            kart_number=r.kart_number,
            team_key=r.team_key,
            drteam_names=list(r.drteam_names),
            laps_ms=list(laps),
            total_laps=len(laps),
            best_lap_ms=min(laps),
            avg_lap_ms=statistics.fmean(laps),
            median_lap_ms=int(statistics.median(laps)),
            final_position=pos_of[comp_of[r.row_id]],
            apex_last_position=r.apex_last_position,
            duration_s=race.duration_s,
        ))
    return out
