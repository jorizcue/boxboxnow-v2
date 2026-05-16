"""Task 7 — End-to-end acceptance test on real Santos data.

Part A (DB-free): verifies the classifier maps "Clasificación" → pace and
"CARRERA" → race on the real 2026-04-25 Santos log.

Part B (DB): verifies apply_extracts persists the correct session_type and
final_position for kart 8 (Jon del Valle) in the pace session, and that a
RankingSessionOverride flips the session type to race (reverting to finish
order) while surviving reset_ratings.
"""
from __future__ import annotations

import os
from collections import defaultdict

import pytest

from app.models.schemas import RankingSessionOverride, SessionResult
from app.services.ranking.extractor import extract_sessions
from app.services.ranking.processor import apply_extracts, reset_ratings
from sqlalchemy import select

FX = os.path.join(os.path.dirname(__file__), "fixtures")
SANTOS = os.path.join(FX, "santos_2026-04-25.log.gz")


def _by_seq(sessions):
    g = defaultdict(list)
    for s in sessions:
        g[s.session_seq].append(s)
    return g


# ─── Part A: extractor only (no DB) ─────────────────────────────────────────


@pytest.mark.skipif(not os.path.exists(SANTOS), reason="santos fixture missing")
def test_santos_classifier_pace_and_race():
    """Classifier must map Clasificación → pace and CARRERA → race
    end-to-end on the real fixture (no DB involved)."""
    sessions = extract_sessions(SANTOS, circuit_name="Santos", log_date="2026-04-25")
    by_seq = _by_seq(sessions)

    # Locate seq=1 (Clasificación) and the race sessions (CARRERA).
    seq1_rows = None
    carrera_seqs = []
    for seq, rows in by_seq.items():
        title2 = rows[0].title2
        if "clasif" in title2.lower():
            seq1_rows = (seq, rows)
        elif "CARRERA" in title2.upper():
            carrera_seqs.append((seq, rows))

    assert seq1_rows is not None, (
        "Could not find a seq with title2 containing 'Clasif'/'clasif' — "
        f"available title2 values: {[r[1][0].title2 for r in by_seq.items()]}"
    )
    seq1_num, seq1 = seq1_rows
    assert seq1_num == 1, f"Expected seq=1 to be Clasificación but it's seq={seq1_num}"

    for row in seq1:
        assert row.session_type == "pace", (
            f"seq=1 (Clasificación): expected session_type='pace' but got "
            f"'{row.session_type}' for driver {row.driver_raw!r}"
        )

    assert len(carrera_seqs) >= 1, (
        "Expected at least one CARRERA session (seq=2 or seq=3) — "
        f"available title2 values: {[rows[0].title2 for rows in by_seq.values()]}"
    )
    for seq_num, rows in carrera_seqs:
        for row in rows:
            assert row.session_type == "race", (
                f"seq={seq_num} (CARRERA): expected session_type='race' but got "
                f"'{row.session_type}' for driver {row.driver_raw!r}"
            )


# ─── Part B: apply_extracts + override (DB) ─────────────────────────────────


@pytest.mark.skipif(not os.path.exists(SANTOS), reason="santos fixture missing")
@pytest.mark.asyncio
async def test_santos_kart8_pace_position_and_override_flip(db_session):
    """
    1. Kart 8 (Jon del Valle) in seq=1 (Clasificación) must be stored as
       session_type='pace' with final_position=3 (3rd-fastest best lap
       of 64532 ms; only karts 3 @64510 and 10 @64523 are faster).

    2. After inserting a RankingSessionOverride(forced_type='race') and
       re-running apply_extracts:
       - The override row must still exist after reset_ratings (proves
         reset does NOT wipe overrides).
       - Kart 8's final_position must NOT be 3 (it reverts to finish-order
         position, where it ran only 12 laps and should be last or near
         last → assert >= 10).
    """
    sessions = extract_sessions(SANTOS, circuit_name="Santos", log_date="2026-04-25")
    await apply_extracts(sessions, db_session)

    # ── Step 1: verify pace session was stored correctly ──────────────────
    res = await db_session.execute(
        select(SessionResult).where(
            SessionResult.circuit_name == "Santos",
            SessionResult.log_date == "2026-04-25",
            SessionResult.session_seq == 1,
            SessionResult.kart_number == 8,
        )
    )
    kart8_rows = list(res.scalars().all())

    assert kart8_rows, (
        "FAIL: No SessionResult rows found for kart 8 in Santos/2026-04-25/seq=1. "
        "This means apply_extracts did not persist kart 8. Check MIN_DRIVERS filter "
        "or kart-number mapping."
    )

    for row in kart8_rows:
        assert row.session_type == "pace", (
            f"Kart 8 in seq=1 should have session_type='pace' but got "
            f"'{row.session_type}'"
        )
        assert row.final_position == 3, (
            f"Kart 8 in seq=1 should be final_position=3 (3rd-fastest best lap) "
            f"but got {row.final_position}. "
            f"Kart 8 best_lap_ms={row.best_lap_ms}. "
            "Ground truth: kart 3 @64510 ms and kart 10 @64523 ms are faster."
        )

    # ── Step 2: verify a race seq has session_type='race' ─────────────────
    res2 = await db_session.execute(
        select(SessionResult).where(
            SessionResult.circuit_name == "Santos",
            SessionResult.log_date == "2026-04-25",
            SessionResult.session_seq == 2,
        )
    )
    seq2_rows = list(res2.scalars().all())
    assert seq2_rows, "No SessionResult rows found for seq=2; cannot verify race session."
    for row in seq2_rows:
        assert row.session_type == "race", (
            f"seq=2 (CARRERA) should be session_type='race' but got '{row.session_type}'"
        )
    # Final positions in a race session must be valid integers ≥ 1.
    for row in seq2_rows:
        assert row.final_position is not None and row.final_position >= 1, (
            f"seq=2 race row has invalid final_position={row.final_position}"
        )

    # ── Step 3: add override, reset, re-apply, verify flip ────────────────
    override = RankingSessionOverride(
        circuit_name="Santos",
        log_date="2026-04-25",
        session_seq=1,
        forced_type="race",
    )
    db_session.add(override)
    await db_session.flush()

    # reset_ratings must NOT delete the override row.
    await reset_ratings(db_session)

    res3 = await db_session.execute(
        select(RankingSessionOverride).where(
            RankingSessionOverride.circuit_name == "Santos",
            RankingSessionOverride.log_date == "2026-04-25",
            RankingSessionOverride.session_seq == 1,
        )
    )
    override_after_reset = res3.scalar_one_or_none()
    assert override_after_reset is not None, (
        "FAIL: reset_ratings deleted the RankingSessionOverride row. "
        "The override table must survive reset_ratings."
    )

    # Re-apply extracts with the override in effect.
    sessions2 = extract_sessions(SANTOS, circuit_name="Santos", log_date="2026-04-25")
    await apply_extracts(sessions2, db_session)

    res4 = await db_session.execute(
        select(SessionResult).where(
            SessionResult.circuit_name == "Santos",
            SessionResult.log_date == "2026-04-25",
            SessionResult.session_seq == 1,
            SessionResult.kart_number == 8,
        )
    )
    kart8_after = list(res4.scalars().all())
    assert kart8_after, (
        "FAIL: No kart 8 rows found in seq=1 after override+reset+re-apply."
    )

    for row in kart8_after:
        assert row.session_type == "race", (
            f"After override forced_type='race', kart 8 seq=1 should have "
            f"session_type='race' but got '{row.session_type}'"
        )
        assert row.final_position != 3, (
            f"After override to 'race' (finish order), kart 8 must NOT be P3 "
            f"(that was the pace-order position). Got final_position={row.final_position}. "
            "Under finish order kart 8 ran only 12 laps so it should be near last."
        )
        assert row.final_position >= 10, (
            f"After override to 'race' (finish order), kart 8 should be P≥10 "
            f"(ran only 12 laps, near last). Got final_position={row.final_position}."
        )
