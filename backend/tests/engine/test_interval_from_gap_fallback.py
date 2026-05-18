"""Le Mans CIK exposes a `gap`/"Ecart" column but no `int` column, so
KartState.interval was always "" → the driver-view interval cards
("INTERVALO KART DELANTERO/TRASERO") showed "—"/"LIDER" for everyone.

Fallback: when no Apex interval column has been seen, synthesise each
kart's interval-to-the-kart-ahead from the gap column (classification
order). Real Apex `int` values, when present, take precedence and are
never overwritten. Reuses the existing `interval` field so web/iOS/
Android all get it with no app release.
"""
from app.engine.state import RaceStateManager, KartState
from app.apex.parser import RaceEvent, EventType


def _mgr(karts):
    m = RaceStateManager()
    for k in karts:
        m.karts[k.row_id] = k
    return m


def _k(row, num, pos, gap, interval=""):
    k = KartState(row_id=row, kart_number=num)
    k.position = pos
    k.gap = gap
    k.interval = interval
    return k


def test_derives_interval_from_gap_when_no_int_column():
    m = _mgr([
        _k("r1", 41, 1, ""),       # leader (empty gap)
        _k("r2", 15, 2, "0.310"),
        _k("r3", 19, 3, "0.371"),
        _k("r4", 28, 4, "1.250"),
    ])
    m._derive_intervals_from_gap()
    assert m.karts["r1"].interval == ""        # leader → "LIDER"
    assert m.karts["r2"].interval == "0.310"   # vs leader (0)
    assert m.karts["r3"].interval == "0.061"   # 0.371 - 0.310
    assert m.karts["r4"].interval == "0.879"   # 1.250 - 0.371


def test_does_not_overwrite_real_apex_interval():
    m = _mgr([_k("r1", 41, 1, ""), _k("r2", 15, 2, "0.310", "0.300")])
    m._interval_col_seen = True
    m._derive_intervals_from_gap()
    assert m.karts["r2"].interval == "0.300"   # Apex value preserved


def test_unparseable_gap_skipped_not_crash():
    m = _mgr([
        _k("r1", 41, 1, ""),
        _k("r2", 15, 2, "1 Tour"),   # lapped marker → unparseable
        _k("r3", 19, 3, "2.500"),
    ])
    m._derive_intervals_from_gap()
    assert m.karts["r1"].interval == ""
    assert m.karts["r2"].interval == ""        # unparseable → sentinel
    assert m.karts["r3"].interval == ""        # kart ahead unparseable


def test_gap_to_ms_parser():
    g = RaceStateManager._gap_to_ms
    assert g("0.310") == 310
    assert g("+0.310") == 310
    assert g("1:11.981") == 71981
    assert g("12") == 12000
    assert g("") is None
    assert g("1 Tour") is None
    assert g("Leader") is None
    assert g(None) is None


async def test_handle_events_gap_only_then_int_takes_over():
    m = RaceStateManager()
    await m.handle_events([
        RaceEvent(type=EventType.INIT, value="kart", row_id="r1",
                  extra={"kart_number": 41, "team_name": "A",
                         "position": 1, "total_laps": "0"}),
        RaceEvent(type=EventType.INIT, value="kart", row_id="r2",
                  extra={"kart_number": 15, "team_name": "B",
                         "position": 2, "total_laps": "0"}),
    ])
    m.karts["r1"].position = 1
    m.karts["r2"].position = 2

    # gap-only feed (no INTERVAL event) → interval synthesised
    await m.handle_events([RaceEvent(type=EventType.GAP, row_id="r2", value="0.420")])
    assert m.karts["r2"].interval == "0.420"

    # a real Apex interval column appears → derivation must stop
    await m.handle_events([RaceEvent(type=EventType.INTERVAL, row_id="r2", value="0.999")])
    assert m._interval_col_seen is True
    assert m.karts["r2"].interval == "0.999"

    # later gap change must NOT re-derive over the Apex value
    await m.handle_events([RaceEvent(type=EventType.GAP, row_id="r2", value="0.100")])
    assert m.karts["r2"].interval == "0.999"
