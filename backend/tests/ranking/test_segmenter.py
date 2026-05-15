from datetime import datetime, timedelta

from app.apex.parser import RaceEvent, EventType
from app.services.ranking.segmenter import segment_events


def _ts(s):  # seconds → datetime
    return datetime(2026, 5, 2, 10, 0, 0) + timedelta(seconds=s)


def ev(t, **kw):
    return RaceEvent(type=t, **kw)


def test_init_init_starts_new_segment_even_with_same_title():
    stream = [
        (_ts(0), [ev(EventType.SESSION_TITLE, value="HEAT B-C"),
                  ev(EventType.INIT, value="init"),
                  ev(EventType.INIT, value="kart", row_id="r1"),
                  ev(EventType.LAP_MS, row_id="r1", value="40000"),
                  ev(EventType.RANKING, row_id="r1", value="1")]),
        (_ts(60), [ev(EventType.FLAG, value="chequered")]),
        # Same title, but a fresh INIT-init → MUST be a new segment.
        (_ts(120), [ev(EventType.INIT, value="init"),
                    ev(EventType.INIT, value="kart", row_id="r9"),
                    ev(EventType.LAP_MS, row_id="r9", value="41000"),
                    ev(EventType.RANKING, row_id="r9", value="2")]),
    ]
    segs = segment_events(stream)
    assert len(segs) == 2
    assert segs[0].had_chequered is True
    assert "r1" in segs[0].rows and "r9" not in segs[0].rows
    assert "r9" in segs[1].rows and "r1" not in segs[1].rows


def test_lap_source_prefers_lap_ms_over_lap_string():
    stream = [
        (_ts(0), [ev(EventType.SESSION_TITLE, value="X"),
                  ev(EventType.INIT, value="init"),
                  ev(EventType.LAP_MS, row_id="r1", value="42000"),
                  ev(EventType.LAP, row_id="r1", value="0:42.000"),
                  ev(EventType.LAP, row_id="r1", value="0:43.000")]),
    ]
    segs = segment_events(stream)
    assert segs[0].rows["r1"].laps() == [42000]  # LAP_MS buffer wins, never mixed
