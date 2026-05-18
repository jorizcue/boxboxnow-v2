"""Regression: Le Mans / CIK re-sends `init|p|` several times during ONE
session's warm-up. The old INIT-init handler wiped every kart + its lap
history on every re-send, so laps run between re-sends were lost ("no
laps until ~lap 6", MED.20 = MEJ.3 = ULT = MEJOR collapsed to one value).

Fix: defer the destructive reset; only reset on a genuine session
identity change (title1/title2) or after a finished race. Redundant
re-inits keep the same identity → laps preserved; the re-sent grid
merges into existing karts instead of recreating them.
"""
from app.engine.state import RaceStateManager
from app.apex.parser import RaceEvent, EventType


def _ev(t, **kw):
    return RaceEvent(type=t, **kw)


def _kart(row="r1", num=7, total="0"):
    return _ev(
        EventType.INIT, value="kart", row_id=row,
        extra={"kart_number": num, "team_name": "Alpha",
               "position": 1, "total_laps": total},
    )


def _seed_laps(k, n):
    k.total_laps = n
    k.apex_total_laps = n
    k.all_laps = [
        {"lapTime": 71000 + i, "totalLap": i, "pitNumber": 0}
        for i in range(1, n + 1)
    ]


async def test_redundant_init_resend_same_session_preserves_laps():
    s = RaceStateManager()
    # Genuine first session + its (late-arriving) identity.
    await s.handle_events([_ev(EventType.INIT, value="init")])
    await s.handle_events([_ev(EventType.SESSION_TITLE, value="Session 19")])
    await s.handle_events([_kart()])
    _seed_laps(s.karts["r1"], 5)

    # Le Mans warm-up: init|p| re-sent, same title, then the grid re-send.
    await s.handle_events([_ev(EventType.INIT, value="init")])
    await s.handle_events([_ev(EventType.SESSION_TITLE, value="Session 19")])
    await s.handle_events([_kart(total="5")])

    assert "r1" in s.karts
    assert s.karts["r1"].total_laps == 5            # not wiped
    assert len(s.karts["r1"].all_laps) == 5         # history preserved


async def test_session_title_change_resets_field():
    s = RaceStateManager()
    await s.handle_events([_ev(EventType.INIT, value="init")])
    await s.handle_events([_ev(EventType.SESSION_TITLE, value="Session 19")])
    await s.handle_events([_kart()])
    _seed_laps(s.karts["r1"], 3)

    # Real new heat: Apex increments the title → genuine reset.
    await s.handle_events([_ev(EventType.SESSION_TITLE, value="Session 20")])

    assert s.karts == {}                            # field cleared


async def test_finished_race_then_init_forces_reset_same_title():
    s = RaceStateManager()
    await s.handle_events([_ev(EventType.INIT, value="init")])
    await s.handle_events([_ev(EventType.SESSION_TITLE, value="Carrera")])
    await s.handle_events([_kart()])
    _seed_laps(s.karts["r1"], 8)
    s.race_finished = True  # checkered

    # Next race reuses the exact same title but the prior one finished.
    await s.handle_events([_ev(EventType.INIT, value="init")])
    assert s.karts == {}                            # checkered ⇒ reset
    assert s.race_finished is False


async def test_titleless_circuit_keeps_legacy_reset_behaviour():
    # Circuits that never send title1/title2 must keep the old
    # always-reset-on-init behaviour (conservative fallback, no regression).
    s = RaceStateManager()
    await s.handle_events([_ev(EventType.INIT, value="init")])
    await s.handle_events([_kart()])
    _seed_laps(s.karts["r1"], 4)

    await s.handle_events([_ev(EventType.INIT, value="init")])
    assert s.karts == {}                            # no identity ⇒ reset
