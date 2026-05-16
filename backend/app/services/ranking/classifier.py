"""Pure session classification: title + duration + swap -> type/mode.
No I/O, no DB -- trivially unit-testable. Thresholds are the spec's
tunables (race/pace 12 min, endurance 40 min)."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

RACE_PACE_THRESHOLD_S = 12 * 60
ENDURANCE_THRESHOLD_S = 40 * 60

_NON_RACE = (
    "ESSAIS", "CHRONOS", "CRONOS", "QUALI", "QUALIF", "LIBRE", "LIBRES", "PRACTICE",
    "FREE", "PROVE", "ENTRENO", "ENTRENAMIENTO", "WARM", "BRIEFING", "ACCUEIL",
    "CLASIF", "CLASSIFICA",
)
_NON_RACE_RE = re.compile(r"\b(Q\d+|FP\d+)\b")
_SESSION_GENERIC_RE = re.compile(r"^\s*SESS(?:ION)?\s*\d*\s*$")
_RACE = (
    "CARRERA", "COURSE", "RACE", "GARA", "RENNEN", "FINAL", "FINALE", "GP",
    "GRAN PREMIO", "GRAND PRIX", "MANGA", "HEAT", "RACING", "RESIST",
    "ENDURANCE",
)
_DURATION_RE = re.compile(r"\d+\s*(H|HEURES|HOURS|HORAS|ORE|STUNDEN|HRS?)\b", re.I)
_ENDURANCE_RE = re.compile(r"\b(HEURE|HOUR|HORA|ORE|STUNDEN|ENDURANCE|RESIST)\w*")


@dataclass
class SessionClass:
    session_type: str  # "race" | "pace"
    team_mode: str      # "endurance" | "individual"


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.upper()


def classify_session(
    title1: str, title2: str, *, duration_s: int, had_driver_swap: bool
) -> SessionClass:
    blob = f"{_norm(title1)} {_norm(title2)}".strip()

    has_non_race = any(k in blob for k in _NON_RACE) or bool(_NON_RACE_RE.search(blob)) \
        or bool(_SESSION_GENERIC_RE.match(blob))
    has_race = any(k in blob for k in _RACE) or bool(_DURATION_RE.search(blob))

    if has_non_race:
        session_type = "pace"
    elif has_race:
        session_type = "race"
    else:
        session_type = "race" if duration_s >= RACE_PACE_THRESHOLD_S else "pace"

    endurance = (
        had_driver_swap
        or duration_s >= ENDURANCE_THRESHOLD_S
        or bool(_ENDURANCE_RE.search(blob))
    )
    return SessionClass(
        session_type=session_type,
        team_mode="endurance" if (session_type == "race" and endurance) else "individual",
    )
