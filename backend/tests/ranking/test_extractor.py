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
