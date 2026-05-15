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


def test_title_change_without_init_splits_and_no_empty_segment():
    """Title change without INIT-init triggers a split; empty blocks are filtered."""
    stream = [
        (_ts(0), [ev(EventType.SESSION_TITLE, value="Q1"),
                  ev(EventType.INIT, value="init"),
                  ev(EventType.LAP_MS, row_id="r1", value="40000")]),
        (_ts(60), [ev(EventType.SESSION_TITLE, value="RACE"),
                   ev(EventType.LAP_MS, row_id="r2", value="41000")]),
    ]
    segs = segment_events(stream)
    assert len(segs) == 2
    assert segs[0].title2 != segs[1].title2
    assert all(seg.has_laps for seg in segs)
    assert all(seg.rows for seg in segs)


def test_gap_split_when_idle_over_20min():
    """A block with no laps >20 min after the last lap triggers a split."""
    stream = [
        (_ts(0), [ev(EventType.SESSION_TITLE, value="R"),
                  ev(EventType.INIT, value="init"),
                  ev(EventType.LAP_MS, row_id="r1", value="40000")]),
        (_ts(21 * 60), [ev(EventType.MESSAGE, value="x")]),
        (_ts(21 * 60 + 5), [ev(EventType.LAP_MS, row_id="r1", value="40500")]),
    ]
    segs = segment_events(stream)
    assert len(segs) == 2


def test_chequered_in_no_lap_block_after_gap_keeps_old_segment_finished():
    """C1 regression: chequered in an idle gap block must mark the previous segment."""
    stream = [
        (_ts(0), [ev(EventType.SESSION_TITLE, value="R"),
                  ev(EventType.INIT, value="init"),
                  ev(EventType.LAP_MS, row_id="r1", value="40000")]),
        (_ts(21 * 60), [ev(EventType.FLAG, value="chequered")]),
    ]
    segs = segment_events(stream)
    # Post-gap empty segment has no laps and is filtered (C2), leaving exactly 1.
    assert len(segs) == 1
    assert segs[0].had_chequered is True


def test_chequered_with_prior_laps_marks_had_chequered():
    """Chequered flag in same block as laps marks the segment finished."""
    stream = [
        (_ts(0), [ev(EventType.SESSION_TITLE, value="R"),
                  ev(EventType.INIT, value="init"),
                  ev(EventType.LAP_MS, row_id="r1", value="40000"),
                  ev(EventType.FLAG, value="chequered")]),
    ]
    segs = segment_events(stream)
    assert segs[0].had_chequered is True


def test_events_without_row_id_do_not_create_phantom_rows():
    """I2 regression: RANKING/STATUS with no row_id must not create rows['']."""
    stream = [
        (_ts(0), [ev(EventType.SESSION_TITLE, value="R"),
                  ev(EventType.INIT, value="init"),
                  ev(EventType.LAP_MS, row_id="r1", value="40000"),
                  ev(EventType.RANKING, value="3"),         # no row_id → ""
                  ev(EventType.STATUS, value="sr")]),        # no row_id → ""
    ]
    segs = segment_events(stream)
    assert set(segs[0].rows.keys()) == {"r1"}
    assert "" not in segs[0].rows
    assert None not in segs[0].rows


def test_empty_stream_returns_empty_list():
    """Empty input must produce an empty list."""
    assert segment_events([]) == []
