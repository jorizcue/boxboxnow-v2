"""Regression: Le Mans/CIK splits one on-track session into several
race_log fragments (issues #7/#8/#1), so the SAME physical lap is stored
once per fragment. Kart-analytics (stats / best-laps / drivers) queried
KartLap by race_log_id IN (...) and double/triple-counted those.

`_dedup_laps` keys on (kart_number, lap_time_ms) — NOT lap_number,
because the split re-numbers laps (verified in prod: kart 39 / A.GARCIA
= 28 rows over 3 fragments, all "unique" by lap_number+ms → showed 24
laps for a real 12; deduping by (kart, ms) yields the real 12). The
lap *time* survives the split; a kart doing the exact same millisecond
twice doesn't happen in real karting (same invariant pending #1 uses).
"""
import sys
import types
from types import SimpleNamespace
from unittest.mock import MagicMock

if "resend" not in sys.modules:
    _r = types.ModuleType("resend"); _r.api_key = None; _r.Emails = MagicMock()
    sys.modules["resend"] = _r

from app.api.analytics_routes import _dedup_laps  # noqa: E402


def _lap(kart, num, ms):
    return SimpleNamespace(kart_number=kart, lap_number=num, lap_time_ms=ms)


def test_collapses_exact_fragment_duplicate():
    a = _lap(27, 13, 71649)
    b = _lap(27, 13, 71649)
    assert _dedup_laps([a, b]) == [a]


def test_collapses_renumbered_fragment_duplicate():
    # The real A.GARCIA / kart 39 shape: same on-track lap re-recorded
    # in 3 fragments with DIFFERENT lap_number but the SAME lap_time_ms.
    # Old (lap_number,ms) key missed these; (kart,ms) collapses them.
    frags = [
        _lap(39, 1, 74323), _lap(39, 1, 74323), _lap(39, 1, 74323),
        _lap(39, 2, 74359), _lap(39, 5, 74359), _lap(39, 9, 74359),
        _lap(39, 3, 74555),
    ]
    out = _dedup_laps(frags)
    assert [(l.lap_number, l.lap_time_ms) for l in out] == [
        (1, 74323), (2, 74359), (3, 74555),
    ]


def test_keeps_distinct_times_and_distinct_karts():
    laps = [
        _lap(27, 13, 71649),
        _lap(27, 14, 71894),   # same kart, different time → kept
        _lap(28, 13, 71649),   # different kart, same time → kept
        _lap(27, 99, 71649),   # same kart+time (any number) → collapsed
    ]
    out = _dedup_laps(laps)
    assert [(l.kart_number, l.lap_time_ms) for l in out] == [
        (27, 71649), (27, 71894), (28, 71649),
    ]


def test_preserves_order_keeps_first():
    l1 = _lap(27, 1, 70000)
    l2 = _lap(27, 2, 70500)
    l1b = _lap(27, 7, 70000)   # fragment dup of l1 (renumbered)
    l3 = _lap(27, 3, 70200)
    assert _dedup_laps([l1, l2, l1b, l3]) == [l1, l2, l3]


def test_empty():
    assert _dedup_laps([]) == []
