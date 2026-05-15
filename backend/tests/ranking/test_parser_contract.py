"""Pins the live ApexMessageParser event API the extractor depends on.
If app/apex/parser.py changes shape, this fails first — by design.

=== Observed event-type mapping (empirical, 2026-05-15) ===

Both fixtures are 8 000-line slices of real production recordings captured
from /home/ubuntu/boxboxnow-v2/backend/data/recordings/:

  RKC_Paris/2026-04-18.log.gz  lines 1400–9400 (includes first init|p| block)
  EUPEN/2026-04-04.log.gz      lines 1–8000     (includes session start)

RKC_Paris (rkc_inline.log) — 687 blocks, Counter:
  DRIVER_TEAM: 1171  TEAM: 1093       RANKING: 843   SECTOR: 314
  GAP: 180           STATUS: 166       PIT_TIME: 146  LAP: 91
  TOTAL_LAPS: 87     LAP_MS: 87        BEST_LAP: 67   INIT: 41
  COUNTDOWN: 9       LIGHT: 5          SESSION_TITLE: 4  PRE_RACE_DURATION: 4
  TRACK_INFO: 4      MESSAGE: 4        CATEGORY: 3    FLAG: 1

  -> lap-time schema: r<N>|*|<ms>| lines emit LAP_MS (inline ms, 87 events)
     plus cell-update lines on the last-lap column emit LAP (91 events).
     Both types represent the same completed lap — different message paths.

EUPEN (eupen_column.log) — 947 blocks, Counter:
  SECTOR: 509        STATUS: 261       LAP: 162       RANKING: 161
  TOTAL_LAPS: 155    LAP_MS: 154       GAP: 147       INIT: 126
  BEST_LAP: 80       COUNTDOWN: 71     LIGHT: 16      SESSION_TITLE: 12
  PRE_RACE_DURATION: 12  TRACK_INFO: 12  MESSAGE: 12  FLAG: 5
  PIT_IN: 2          TEAM: 1

  -> lap-time schema: cell-update lines on the last-lap column emit LAP (162
     events); r<N>|*|<ms>| lines ALSO emit LAP_MS (154 events).
     Both circuits use the same dual-path pattern.

Conclusion: BOTH circuits emit LAP_MS (inline ms path) AND LAP (column
cell-update path). The plan description of EUPEN emitting only column
time-strings was inaccurate — at the parser level both event types coexist.
The ranking extractor (later tasks) must handle both.
"""
from collections import Counter
from pathlib import Path

from app.apex.replay import parse_log_file
from app.apex.parser import ApexMessageParser, EventType

FIX = Path(__file__).parent / "fixtures"


def _event_types(log_name: str) -> Counter:
    parser = ApexMessageParser()
    counts: Counter = Counter()
    for _ts, message in parse_log_file(str(FIX / log_name)):
        for ev in parser.parse(message):
            counts[ev.type] += 1
    return counts


def test_rkc_inline_emits_core_events():
    c = _event_types("rkc_inline.log")
    assert c[EventType.LAP_MS] > 0, f"Expected LAP_MS > 0, got {c[EventType.LAP_MS]}"
    assert c[EventType.LAP] > 0, f"Expected LAP > 0, got {c[EventType.LAP]}"
    assert c[EventType.RANKING] > 0, f"Expected RANKING > 0, got {c[EventType.RANKING]}"
    assert c[EventType.INIT] > 0, f"Expected INIT > 0, got {c[EventType.INIT]}"


def test_eupen_column_emits_core_events():
    c = _event_types("eupen_column.log")
    # EUPEN emits both LAP (cell-update path) and LAP_MS (inline ms path)
    assert c[EventType.LAP] > 0, f"Expected LAP > 0, got {c[EventType.LAP]}"
    assert c[EventType.LAP_MS] > 0, f"Expected LAP_MS > 0, got {c[EventType.LAP_MS]}"
    assert c[EventType.RANKING] > 0, f"Expected RANKING > 0, got {c[EventType.RANKING]}"
