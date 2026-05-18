"""Regression: Le Mans/CIK splits one on-track session into several
race_log fragments (issues #7/#8), so the SAME physical lap is stored
once per fragment. Kart-analytics (stats / best-laps / drivers) queried
KartLap by race_log_id IN (...) and double-counted those — e.g. kart 27
lap 13 = 1:11.649 appeared twice in the "top 5 best laps" popup and the
counts/avg were inflated. `_dedup_laps` collapses exact
(kart_number, lap_number, lap_time_ms) repeats while keeping
legitimately distinct laps.
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


def test_collapses_fragment_duplicate_keeps_first():
    # Same kart/lap/time stored under two race_log fragments.
    a = _lap(27, 13, 71649)
    b = _lap(27, 13, 71649)
    out = _dedup_laps([a, b])
    assert out == [a]


def test_keeps_distinct_laps():
    laps = [
        _lap(27, 13, 71649),
        _lap(27, 13, 71894),   # same number, different time → distinct
        _lap(27, 5, 71649),    # different number, same time → distinct
        _lap(28, 13, 71649),   # different kart → distinct
    ]
    assert _dedup_laps(laps) == laps


def test_preserves_order_and_dedups_interleaved():
    l1 = _lap(27, 1, 70000)
    l2 = _lap(27, 2, 70500)
    l1b = _lap(27, 1, 70000)   # dup of l1 from another fragment
    l3 = _lap(27, 3, 70200)
    out = _dedup_laps([l1, l2, l1b, l3])
    assert out == [l1, l2, l3]


def test_empty():
    assert _dedup_laps([]) == []
