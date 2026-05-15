from pathlib import Path
from app.services.ranking.extractor import extract_sessions, SessionExtract

FIX = Path(__file__).parent / "fixtures"


def test_rkc_yields_sessions_with_drivers_and_laps():
    sessions = extract_sessions(str(FIX / "rkc_inline.log"), circuit_name="RKC_Paris", log_date="2026-04-18")
    assert len(sessions) >= 1
    s0 = sessions[0]
    assert isinstance(s0, SessionExtract)
    assert s0.circuit_name == "RKC_Paris"
    assert s0.log_date == "2026-04-18"
    assert s0.total_laps >= 1
    assert s0.avg_lap_ms > 0
    assert s0.session_seq >= 1


def test_eupen_column_format_yields_laps():
    sessions = extract_sessions(str(FIX / "eupen_column.log"), circuit_name="EUPEN", log_date="2026-04-04")
    # The old regex parser produced ZERO here — the bug under fix.
    assert any(s.total_laps >= 1 for s in sessions)


def test_session_seq_is_monotonic_per_log():
    sessions = extract_sessions(str(FIX / "rkc_inline.log"), circuit_name="RKC_Paris", log_date="2026-04-18")
    seqs = sorted({s.session_seq for s in sessions})
    assert seqs == list(range(1, len(seqs) + 1))


def test_no_double_counting_laps():
    # Both LAP and LAP_MS fire per lap; a driver must not get ~2x laps.
    # A real kart in a ~1h+ recording slice does on the order of tens of
    # laps, never hundreds. Guard against the double-count regression.
    sessions = extract_sessions(str(FIX / "rkc_inline.log"), circuit_name="RKC_Paris", log_date="2026-04-18")
    assert sessions
    assert max(s.total_laps for s in sessions) < 250


def test_drteam_names_preserved_for_task6():
    sessions = extract_sessions(str(FIX / "rkc_inline.log"), circuit_name="RKC_Paris", log_date="2026-04-18")
    # RKC logs carry live drteam (person) names; at least one extracted
    # driver-row must expose its raw drteam sequence so Task 6 can
    # separate person identity from the team label.
    assert any(s.drteam_names for s in sessions)
    # EUPEN is kart-only (no live drteam) — empty list is acceptable there,
    # so we only assert presence on the RKC fixture.


import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models.schemas import Base, DriverRating, SessionResult, DriverCircuitRating
from app.services.ranking.processor import apply_extracts


@pytest.fixture
async def db():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(eng, expire_on_commit=False)
    async with Session() as s:
        yield s


async def test_apply_extracts_populates_global_and_circuit_ratings(db):
    sessions = extract_sessions(str(FIX / "rkc_inline.log"),
                                circuit_name="RKC_Paris", log_date="2026-04-18")
    assert sessions, "fixture must yield sessions"
    await apply_extracts(sessions, db)
    await db.commit()
    from sqlalchemy import select, func
    n_global = (await db.execute(select(func.count()).select_from(DriverRating))).scalar()
    n_circuit = (await db.execute(select(func.count()).select_from(DriverCircuitRating))).scalar()
    n_results = (await db.execute(select(func.count()).select_from(SessionResult))).scalar()
    assert n_global > 0
    assert n_circuit > 0          # the prod bug: this was 0
    assert n_results > 0


async def test_conflicting_team_position_falls_back_to_pace_no_abort(db):
    """Regression: same team_key with conflicting final_position values used to
    raise FrozenInstanceError (via ``rd.team_position = None`` on a frozen
    dataclass), which aborted the whole run.  The fix removes the dead mutation
    loop; the group must be rated via pace ordering, not aborted."""
    from sqlalchemy import select, func

    # Three drivers in ONE group: teamA has two drivers with CONFLICTING
    # final_position (1 vs 2) — enough to trigger the ValueError in
    # effective_scores.  teamB has a single driver as a control.
    # All have >=6 laps (endurance floor is 5).
    common = dict(
        circuit_name="TestCircuit",
        log_date="2026-01-01",
        session_seq=1,
        session_type="race",
        team_mode="endurance",
        kart_number=None,
        driver_raw="",
        drteam_names=[],
        laps_ms=[60000] * 6,
        total_laps=6,
        avg_lap_ms=60000.0,
        best_lap_ms=60000,
        median_lap_ms=60000,
        duration_s=3600,
        title1="T1",
        title2="T2",
    )

    sessions = [
        # teamA: driver1 claims position 1
        SessionExtract(driver_canonical="driver1", team_key="teamA", final_position=1, **common),
        # teamA: driver2 claims position 2 → conflict!
        SessionExtract(driver_canonical="driver2", team_key="teamA", final_position=2, **common),
        # teamB: single driver, position 2 — no conflict within its own team
        SessionExtract(driver_canonical="driver3", team_key="teamB", final_position=2, **common),
    ]

    # Must NOT raise — fallback to pace ordering, run continues.
    result = await apply_extracts(sessions, db)
    await db.commit()

    assert result["sessions"] >= 1, "group must be rated (pace fallback), not aborted"

    # All three drivers must have SessionResult rows.
    n_results = (await db.execute(select(func.count()).select_from(SessionResult))).scalar()
    assert n_results >= 3, f"expected >=3 SessionResult rows, got {n_results}"

    # final_position must be NULL for all rows (is_race was set to False).
    from app.models.schemas import SessionResult as SR
    rows = (await db.execute(select(SR))).scalars().all()
    for row in rows:
        assert row.final_position is None, (
            f"driver {row.driver_id}: expected final_position=None in pace fallback, "
            f"got {row.final_position}"
        )
        assert row.session_type == "race"

    # DriverRating rows must exist for the rated drivers.
    n_global = (await db.execute(select(func.count()).select_from(DriverRating))).scalar()
    assert n_global >= 3, f"expected >=3 DriverRating rows, got {n_global}"
