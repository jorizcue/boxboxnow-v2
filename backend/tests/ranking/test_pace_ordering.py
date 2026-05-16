"""Tests for Task 3: pace ordering by best lap + effective type via override.

Pure unit tests (no DB) test _pace_positions directly.
DB tests call apply_extracts and assert persisted SessionResult values.
"""
import pytest
from sqlalchemy import select

from app.services.ranking.processor import _pace_positions, apply_extracts
from app.services.ranking.results import SessionExtract
from app.models.schemas import SessionResult, RankingSessionOverride


# ─── Helpers ──────────────────────────────────────────────────────────────


def _se(
    driver_canonical: str,
    team_key: str,
    best_lap_ms: int,
    avg_lap_ms: float,
    total_laps: int = 10,
    final_position: int | None = None,
    session_type: str = "pace",
    team_mode: str = "individual",
    circuit_name: str = "TestCircuit",
    log_date: str = "2026-01-01",
    session_seq: int = 1,
) -> SessionExtract:
    """Construct a minimal SessionExtract for testing."""
    return SessionExtract(
        circuit_name=circuit_name,
        log_date=log_date,
        title1="Test Title",
        title2="Session Title",
        session_seq=session_seq,
        session_type=session_type,
        team_mode=team_mode,
        driver_canonical=driver_canonical,
        driver_raw=driver_canonical,
        kart_number=None,
        team_key=team_key,
        drteam_names=[],
        laps_ms=[best_lap_ms] * total_laps,
        total_laps=total_laps,
        best_lap_ms=best_lap_ms,
        avg_lap_ms=avg_lap_ms,
        median_lap_ms=best_lap_ms,
        final_position=final_position,
        apex_last_position=None,
        duration_s=600,
    )


# ─── Pure unit tests: _pace_positions ────────────────────────────────────


def test_pace_positions_fastest_gets_rank_1():
    """The team with the fastest best lap gets position 1."""
    rows = [
        _se("driver_a", "tk_a", best_lap_ms=60000, avg_lap_ms=61000.0),
        _se("driver_b", "tk_b", best_lap_ms=62000, avg_lap_ms=62000.0),
        _se("driver_c", "tk_c", best_lap_ms=63000, avg_lap_ms=63000.0),
    ]
    pos = _pace_positions(rows)
    assert pos["tk_a"] == 1
    assert pos["tk_b"] == 2
    assert pos["tk_c"] == 3


def test_pace_positions_per_team_min_over_multiple_rows():
    """When multiple rows share a team_key, the team's best = min of their best laps."""
    rows = [
        _se("driver_a1", "team_1", best_lap_ms=65000, avg_lap_ms=66000.0),
        _se("driver_a2", "team_1", best_lap_ms=61000, avg_lap_ms=62000.0),  # faster stint
        _se("driver_b",  "team_2", best_lap_ms=63000, avg_lap_ms=63000.0),
    ]
    pos = _pace_positions(rows)
    # team_1 best = min(65000, 61000) = 61000 → position 1
    assert pos["team_1"] == 1
    assert pos["team_2"] == 2


def test_pace_positions_ties_are_stable():
    """Teams with identical best laps appear in a stable (sorted) order."""
    rows = [
        _se("driver_a", "tk_a", best_lap_ms=60000, avg_lap_ms=60000.0),
        _se("driver_b", "tk_b", best_lap_ms=60000, avg_lap_ms=60000.0),
    ]
    pos = _pace_positions(rows)
    # Both have the same best lap — both should appear with distinct positions
    assert set(pos.values()) == {1, 2}
    assert pos["tk_a"] in (1, 2)
    assert pos["tk_b"] in (1, 2)


def test_pace_positions_rows_with_invalid_best_lap_excluded():
    """Rows with best_lap_ms <= 0 are excluded from the output."""
    rows = [
        _se("driver_a", "tk_a", best_lap_ms=60000, avg_lap_ms=60000.0),
        _se("driver_b", "tk_b", best_lap_ms=0, avg_lap_ms=60000.0),   # invalid
        _se("driver_c", "tk_c", best_lap_ms=-1, avg_lap_ms=60000.0),  # invalid
    ]
    pos = _pace_positions(rows)
    assert "tk_a" in pos
    assert "tk_b" not in pos
    assert "tk_c" not in pos
    assert pos["tk_a"] == 1


def test_pace_positions_empty_input():
    """Empty input returns empty dict."""
    assert _pace_positions([]) == {}


def test_pace_positions_single_competitor():
    """Single competitor with valid best lap gets rank 1."""
    rows = [_se("driver_a", "tk_a", best_lap_ms=60000, avg_lap_ms=60000.0)]
    pos = _pace_positions(rows)
    assert pos == {"tk_a": 1}


# ─── DB tests: apply_extracts + pace ordering ────────────────────────────


# Enough drivers to pass MIN_DRIVERS_PER_SESSION (3)
PACE_ROWS_BASE = [
    # best_lap_ms determines rank: 60000 → 1st, 61000 → 2nd, 62000 → 3rd
    dict(driver_canonical="alice",   team_key="tk_alice",   best_lap_ms=60000, avg_lap_ms=61500.0, final_position=3),
    dict(driver_canonical="bob",     team_key="tk_bob",     best_lap_ms=61000, avg_lap_ms=61000.0, final_position=1),
    dict(driver_canonical="charlie", team_key="tk_charlie", best_lap_ms=62000, avg_lap_ms=62000.0, final_position=2),
]

RACE_ROWS_BASE = [
    dict(driver_canonical="alice",   team_key="tk_alice",   best_lap_ms=61000, avg_lap_ms=61500.0, final_position=1),
    dict(driver_canonical="bob",     team_key="tk_bob",     best_lap_ms=60000, avg_lap_ms=61000.0, final_position=2),
    dict(driver_canonical="charlie", team_key="tk_charlie", best_lap_ms=62000, avg_lap_ms=62000.0, final_position=3),
]


def _make_pace_session(seq: int = 1) -> list[SessionExtract]:
    return [
        _se(
            session_type="pace",
            team_mode="individual",
            session_seq=seq,
            **row,
        )
        for row in PACE_ROWS_BASE
    ]


def _make_race_session(seq: int = 2) -> list[SessionExtract]:
    return [
        _se(
            session_type="race",
            team_mode="individual",
            session_seq=seq,
            **row,
        )
        for row in RACE_ROWS_BASE
    ]


@pytest.mark.asyncio
async def test_pace_session_positions_by_best_lap(db_session):
    """Pace session: SessionResult.final_position reflects best-lap rank (fastest→1)."""
    db = db_session
    rows = _make_pace_session(seq=1)
    await apply_extracts(rows, db)
    await db.flush()

    results = (await db.execute(
        select(SessionResult).where(
            SessionResult.circuit_name == "TestCircuit",
            SessionResult.log_date == "2026-01-01",
            SessionResult.session_seq == 1,
        )
    )).scalars().all()
    assert len(results) == 3

    by_name = {r.team_name: r for r in results}
    # alice has best_lap 60000 → rank 1; bob 61000 → rank 2; charlie 62000 → rank 3
    assert by_name["alice"].final_position == 1
    assert by_name["bob"].final_position == 2
    assert by_name["charlie"].final_position == 3
    # session_type must be "pace"
    for r in results:
        assert r.session_type == "pace"


@pytest.mark.asyncio
async def test_race_session_positions_unchanged(db_session):
    """Race session: final_position is still the finish-order from SessionExtract."""
    db = db_session
    rows = _make_race_session(seq=1)
    await apply_extracts(rows, db)
    await db.flush()

    results = (await db.execute(
        select(SessionResult).where(
            SessionResult.circuit_name == "TestCircuit",
            SessionResult.log_date == "2026-01-01",
            SessionResult.session_seq == 1,
        )
    )).scalars().all()
    assert len(results) == 3

    by_name = {r.team_name: r for r in results}
    # Race finish order must be preserved as-is from SessionExtract.final_position
    assert by_name["alice"].final_position == 1
    assert by_name["bob"].final_position == 2
    assert by_name["charlie"].final_position == 3
    for r in results:
        assert r.session_type == "race"


@pytest.mark.asyncio
async def test_override_forces_race_to_pace(db_session):
    """An override with forced_type='pace' applied to a classifier-'race' session
    causes apply_extracts to use best-lap ordering and store session_type='pace'."""
    db = db_session

    # Insert override: force seq=1 (normally "race") to "pace"
    db.add(RankingSessionOverride(
        circuit_name="TestCircuit",
        log_date="2026-01-01",
        session_seq=1,
        forced_type="pace",
        title1="Test Title",
        title2="Session Title",
    ))
    await db.flush()

    # The rows have session_type="race" from classifier
    rows = _make_race_session(seq=1)
    await apply_extracts(rows, db)
    await db.flush()

    results = (await db.execute(
        select(SessionResult).where(
            SessionResult.circuit_name == "TestCircuit",
            SessionResult.log_date == "2026-01-01",
            SessionResult.session_seq == 1,
        )
    )).scalars().all()
    assert len(results) == 3

    by_name = {r.team_name: r for r in results}
    # Override forced to pace → positions by best lap
    # Race rows: alice best_lap=61000→2, bob best_lap=60000→1, charlie best_lap=62000→3
    assert by_name["bob"].final_position == 1    # fastest best lap
    assert by_name["alice"].final_position == 2
    assert by_name["charlie"].final_position == 3
    # session_type stored as "pace" (from override)
    for r in results:
        assert r.session_type == "pace"
