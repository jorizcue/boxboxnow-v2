"""Stage 2: list[Segment] → list[Race].

Default: one segment = one race (fixes Apex reusing a title across
consecutive heats / superpole — they are distinct grids). Stitch a
segment onto the previous race only when it is the SAME ongoing race
that Apex re-gridded mid-event (endurance reconnect): same title, no
chequered yet, short gap, same competitors. Ambiguity ⇒ do NOT stitch
(a clean split is less harmful than an over-merge).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .segmenter import Segment
from .classifier import classify_session

STITCH_GAP_S = 300
STITCH_KART_OVERLAP = 0.5


@dataclass
class Race:
    segments: list[Segment] = field(default_factory=list)

    @property
    def title1(self) -> str:
        return self.segments[0].title1 if self.segments else ""

    @property
    def title2(self) -> str:
        return self.segments[0].title2 if self.segments else ""

    @property
    def duration_s(self) -> int:
        ts = [s.first_lap_ts for s in self.segments if s.first_lap_ts is not None]
        te = [s.last_lap_ts for s in self.segments if s.last_lap_ts is not None]
        if not ts or not te:
            return 0
        d = int((max(te) - min(ts)).total_seconds())
        return d if d > 0 else 0

    @property
    def had_chequered(self) -> bool:
        return any(s.had_chequered for s in self.segments)

    @property
    def kart_set(self) -> set[int]:
        out: set[int] = set()
        for s in self.segments:
            out |= s.kart_set
        return out


def _norm(s: str) -> str:
    return (s or "").strip().upper()


def _overlap(a: set[int], b: set[int]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def assemble_races(segments: list[Segment]) -> list[Race]:
    races: list[Race] = []
    for seg in segments:
        if not races:
            races.append(Race([seg]))
            continue
        prev = races[-1]
        prev_last = prev.segments[-1]
        same_title = (_norm(prev.title1), _norm(prev.title2)) == (_norm(seg.title1), _norm(seg.title2))
        gap_ok = (
            prev_last.last_lap_ts is not None
            and seg.first_lap_ts is not None
            and (seg.first_lap_ts - prev_last.last_lap_ts).total_seconds() <= STITCH_GAP_S
        )
        karts_ok = _overlap(prev.kart_set, seg.kart_set) >= STITCH_KART_OVERLAP
        if same_title and not prev_last.had_chequered and gap_ok and karts_ok:
            prev.segments.append(seg)
        else:
            races.append(Race([seg]))
    return races


def classify_race(race: Race):
    """SessionClass for the assembled race (combined duration + any swap
    across its segments)."""
    had_swap = any(
        len(r.drteam_names) > 1
        for s in race.segments for r in s.rows.values()
    )
    return classify_session(
        race.title1, race.title2,
        duration_s=race.duration_s, had_driver_swap=had_swap,
    )
