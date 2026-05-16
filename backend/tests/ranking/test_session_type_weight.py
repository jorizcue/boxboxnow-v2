"""Pure (DB-free) tests for the session-type weighting constants and _blend helper.

Task 4: tanda/pace sessions move the Glicko-2 rating 30% of what an equivalent
race would; race stays byte-identical (w=1.0).
"""
from __future__ import annotations

import pytest

from app.services.ranking.processor import (
    INTRA_RACE_POS_WEIGHT,
    SESSION_TYPE_WEIGHT,
    _blend,
)
from app.services.ranking.glicko2 import Glicko2State


# ── Constant sanity ───────────────────────────────────────────────────────────

def test_session_type_weight_values():
    assert SESSION_TYPE_WEIGHT == {"race": 1.0, "pace": 0.3}


def test_intra_race_pos_weight_value():
    assert INTRA_RACE_POS_WEIGHT == 0.7


# ── _blend edge cases ─────────────────────────────────────────────────────────

_PRE = Glicko2State(rating=1500.0, rd=200.0, volatility=0.06)
_NEW = Glicko2State(rating=1540.0, rd=180.0, volatility=0.061)


def test_blend_w1_equals_new():
    """w=1.0 (race) → fully apply the Glicko update — byte-identical to new."""
    result = _blend(_PRE, _NEW, 1.0)
    assert result.rating == pytest.approx(_NEW.rating, abs=1e-9)
    assert result.rd == pytest.approx(_NEW.rd, abs=1e-9)
    assert result.volatility == pytest.approx(_NEW.volatility, abs=1e-9)


def test_blend_w0_equals_pre():
    """w=0.0 → no movement; state should remain identical to pre."""
    result = _blend(_PRE, _NEW, 0.0)
    assert result.rating == pytest.approx(_PRE.rating, abs=1e-9)
    assert result.rd == pytest.approx(_PRE.rd, abs=1e-9)
    assert result.volatility == pytest.approx(_PRE.volatility, abs=1e-9)


def test_blend_w03_linear_rating():
    """w=0.3 → rating moves 30% of the way from pre to new."""
    result = _blend(_PRE, _NEW, 0.3)
    expected_delta = 0.3 * (_NEW.rating - _PRE.rating)
    assert result.rating - _PRE.rating == pytest.approx(expected_delta, abs=1e-9)


def test_blend_w03_linear_rd():
    """w=0.3 → rd moves 30% of the way from pre to new."""
    result = _blend(_PRE, _NEW, 0.3)
    expected_delta = 0.3 * (_NEW.rd - _PRE.rd)
    assert result.rd - _PRE.rd == pytest.approx(expected_delta, abs=1e-9)


def test_blend_w03_linear_volatility():
    """w=0.3 → volatility moves 30% of the way from pre to new."""
    result = _blend(_PRE, _NEW, 0.3)
    expected_delta = 0.3 * (_NEW.volatility - _PRE.volatility)
    assert result.volatility - _PRE.volatility == pytest.approx(expected_delta, abs=1e-9)


def test_blend_returns_glicko2state():
    """_blend must return a Glicko2State, not some other type."""
    result = _blend(_PRE, _NEW, 0.5)
    assert isinstance(result, Glicko2State)


def test_blend_race_weight_from_constant():
    """SESSION_TYPE_WEIGHT['race'] == 1.0 → _blend is identity for new state."""
    w = SESSION_TYPE_WEIGHT["race"]
    result = _blend(_PRE, _NEW, w)
    assert result.rating == pytest.approx(_NEW.rating, abs=1e-9)
    assert result.rd == pytest.approx(_NEW.rd, abs=1e-9)
    assert result.volatility == pytest.approx(_NEW.volatility, abs=1e-9)


def test_blend_pace_weight_from_constant():
    """SESSION_TYPE_WEIGHT['pace'] == 0.3 → 30% blend."""
    w = SESSION_TYPE_WEIGHT["pace"]
    result = _blend(_PRE, _NEW, w)
    assert result.rating == pytest.approx(
        _PRE.rating + 0.3 * (_NEW.rating - _PRE.rating), abs=1e-9
    )
