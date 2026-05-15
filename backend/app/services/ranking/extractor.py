"""Façade: raw Apex recording → list[SessionExtract].

Composes the three pure stages:
  segmenter.segment_log  → list[Segment]   (INIT-grid boundaries)
  assembler.assemble_races → list[Race]    (stitch reconnects)
  results.reconstruct_race → list[SessionExtract] (lap-based finish)

Public API is unchanged: `extract_sessions(filepath, *, circuit_name,
log_date)` and `SessionExtract` are still importable from here, so
`processor.py` and the ranking tests need no import changes. Never
raises on malformed wire data. `app/apex/*` is not mutated (pinned by
tests/ranking/test_parser_contract.py).
"""
from __future__ import annotations

from .segmenter import segment_log
from .assembler import assemble_races
from .results import SessionExtract, reconstruct_race

__all__ = ["extract_sessions", "SessionExtract"]


def extract_sessions(
    filepath: str, *, circuit_name: str, log_date: str
) -> list[SessionExtract]:
    segments = segment_log(filepath, circuit_name=circuit_name, log_date=log_date)
    races = assemble_races(segments)
    out: list[SessionExtract] = []
    seq = 0
    for race in races:
        rows = reconstruct_race(
            race,
            circuit_name=circuit_name,
            log_date=log_date,
            session_seq=seq + 1,
        )
        if rows:
            seq += 1
            out.extend(rows)
    return out
