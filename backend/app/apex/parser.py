"""
Apex Timing WebSocket message parser.

Parses the pipe-delimited protocol from Apex Timing systems.
Handles both the init HTML grid and live update messages.

Protocol format:
  - Init: init|p| followed by grid||<tbody>...</tbody> with full HTML state
  - Updates: r{rowId}c{colId}|{action}|{value}
  - Rankings: r{rowId}|#|{position}
  - Lap ms: r{rowId}|*|{ms}|
  - Countdown: dyn1|countdown|{ms}
  - Messages: msg||{text}
"""

import re
import logging
from dataclasses import dataclass, field
from enum import Enum
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


class EventType(Enum):
    INIT = "init"
    LAP = "lap"
    PIT_IN = "pit_in"
    PIT_OUT = "pit_out"
    POSITION = "position"
    DRIVER = "driver"
    TEAM = "team"
    DRIVER_TEAM = "driver_team"
    COUNTDOWN = "countdown"
    COUNT_UP = "count_up"
    MESSAGE = "message"
    BEST_LAP = "best_lap"
    GAP = "gap"
    INTERVAL = "interval"
    TOTAL_LAPS = "total_laps"
    PIT_TIME = "pit_time"
    PIT_COUNT = "pit_count"
    STATUS = "status"
    LAP_MS = "lap_ms"
    RANKING = "ranking"
    FLAG = "flag"
    LIGHT = "light"              # light|lg|, light|lr|, light|lf|
    CATEGORY = "category"            # title1||70 SILVER, title1||85 GOLD...
    SESSION_TITLE = "session_title"  # title2||...
    TRACK_INFO = "track_info"    # track||... (with circuit length)
    PRE_RACE_DURATION = "pre_race_duration"  # dyn1|text|HH:MM:SS
    LAP_COUNT = "lap_count"          # dyn1|text|Vuelta X/Y (lap-based races)


@dataclass
class RaceEvent:
    type: EventType
    row_id: str = ""
    value: str = ""
    extra: dict = field(default_factory=dict)


@dataclass
class InitKart:
    row_id: str
    kart_number: int
    team_name: str
    position: int
    last_lap: str
    best_lap: str
    gap: str
    interval: str
    total_laps: str
    pit_time: str
    pit_count: str
    status_class: str


# Column type to semantic name mapping
COLUMN_TYPES = {
    "no": "kart_number",
    "dr": "team_name",
    "rk": "position",
    "llp": "last_lap",
    "blp": "best_lap",
    "gap": "gap",
    "int": "interval",
    "tlp": "total_laps",
    "otr": "pit_time",
    "pit": "pit_count",
    "sta": "status",
    "grp": "group",
    # Sector times — mapped so they are NOT mistaken for laps
    "s1": "sector",
    "s2": "sector",
    "s3": "sector",
}

# Columns that should be ignored for lap counting / event generation
IGNORED_SEMANTICS = {"sector"}

# Lap time CSS classes
LAP_CLASSES = {"tn", "ti", "tb", "to"}  # normal, improvement, best, other


class ApexMessageParser:
    """Parses Apex Timing WebSocket messages into typed events."""

    def __init__(self):
        self.column_map: dict[str, str] = {}  # c1 -> "kart_number", c2 -> "status", ...
        self.row_to_kart: dict[str, int] = {}  # r7980 -> 1
        self._initialized = False

    def parse(self, raw_message: str) -> list[RaceEvent]:
        """Parse a raw WebSocket message block into a list of events."""
        events = []
        lines = raw_message.strip().split("\n")

        for line in lines:
            line = line.strip()
            if not line:
                continue

            parsed = self._parse_line(line)
            if parsed:
                events.extend(parsed)

        return events

    def _parse_line(self, line: str) -> list[RaceEvent]:
        """Parse a single line of the WebSocket message."""
        # Init message
        if line.startswith("init|"):
            return [RaceEvent(type=EventType.INIT, value="init")]

        # Grid HTML (comes after init)
        if line.startswith("grid||"):
            html = line[6:]  # strip "grid||"
            return self._parse_grid(html)

        # Countdown
        if line.startswith("dyn1|countdown|"):
            ms = line.split("|")[2]
            return [RaceEvent(type=EventType.COUNTDOWN, value=ms)]

        # Count up
        if line.startswith("dyn1|count|"):
            ms = line.split("|")[2]
            return [RaceEvent(type=EventType.COUNT_UP, value=ms)]

        # Race message
        if line.startswith("msg||"):
            return [RaceEvent(type=EventType.MESSAGE, value=line[5:])]

        # Pre-race duration or lap count: dyn1|text|...
        if line.startswith("dyn1|text|"):
            text_val = line.split("|", 2)[2] if len(line.split("|")) > 2 else ""
            if text_val and re.match(r'^\d{1,2}:\d{2}:\d{2}$', text_val):
                return [RaceEvent(type=EventType.PRE_RACE_DURATION, value=text_val)]
            # Lap-based races: "Vuelta X/Y", "Lap X/Y", "Tour X/Y", "Giro X/Y" etc.
            lap_match = re.match(r'^(?:Vuelta|Lap|Tour|Giro|Ronde)\s+(\d+)/(\d+)$', text_val, re.IGNORECASE)
            if lap_match:
                return [RaceEvent(type=EventType.LAP_COUNT, value=f"{lap_match.group(1)}/{lap_match.group(2)}")]
            return []

        # Track info, CSS, title, etc.
        if line.startswith(("css|", "best|", "effects|", "comments|",
                            "title1|", "light|", "wth",
                            "track|", "com|", "title2|")):
            # title1 handling (category) — must be before the skip block
            if line.startswith("title1||"):
                cat = line[8:].strip()
                if cat:
                    return [RaceEvent(type=EventType.CATEGORY, value=cat)]
                return []
            # Light signals: lg=green, lr=red, lf=finish/chequered
            if line.startswith("light|"):
                parts = line.split("|")
                if len(parts) >= 2 and parts[1] in ("lg", "lr", "lf"):
                    return [RaceEvent(type=EventType.LIGHT, value=parts[1])]
                return []

            # Session title: title2||CARRERA 3H, title2||Qualifying, etc.
            if line.startswith("title2||"):
                title = line[8:].strip()
                if title:
                    return [RaceEvent(type=EventType.SESSION_TITLE, value=title)]
                return []

            # Track info with circuit length
            if line.startswith("track||"):
                track_str = line[7:].strip()
                events = [RaceEvent(type=EventType.TRACK_INFO, value=track_str)]
                # Extract circuit length from patterns like "(700m)" or "(1100m)"
                length_match = re.search(r'\((\d+)m\)', track_str)
                if length_match:
                    events[0].extra = {"circuit_length_m": int(length_match.group(1))}
                return events

            # Extract flags + real time from com|| messages
            if line.startswith("com||"):
                events = []
                # Extract all flags with their associated times
                # Pattern: <b>HH:MM</b><span data-flag="green"></span>
                flag_matches = re.findall(
                    r'<b>(\d{1,2}:\d{2})</b>.*?data-flag="(\w+)"', line
                )
                for time_str, flag in flag_matches:
                    events.append(RaceEvent(
                        type=EventType.FLAG, value=flag,
                        extra={"real_time": time_str}
                    ))
                # Also extract penalty details: data-flag="penalty" followed by kart info
                penalty_matches = re.findall(
                    r'<b>(\d{1,2}:\d{2})</b>.*?data-flag="penalty".*?class="com_no[^"]*">(\d+)</span>(.*?)</p>',
                    line
                )
                for time_str, kart_num, reason in penalty_matches:
                    events.append(RaceEvent(
                        type=EventType.FLAG, value="penalty",
                        extra={"real_time": time_str, "kart_number": int(kart_num),
                               "reason": reason.strip().lstrip("- ")}
                    ))
                return events

            return []

        # Ranking change: r{id}|#|{pos}
        match = re.match(r'^(r\d+)\|#\|(\d+)$', line)
        if match:
            return [RaceEvent(type=EventType.RANKING, row_id=match.group(1),
                              value=match.group(2))]

        # Lap time in ms: r{id}|*|{ms}|
        match = re.match(r'^(r\d+)\|\*\|(\d+)\|', line)
        if match:
            return [RaceEvent(type=EventType.LAP_MS, row_id=match.group(1),
                              value=match.group(2))]

        # Pit in via asterisk: r{id}|*in|
        match = re.match(r'^(r\d+)\|\*in\|', line)
        if match:
            return [RaceEvent(type=EventType.PIT_IN, row_id=match.group(1))]

        # Pit out via asterisk: r{id}|*out|
        match = re.match(r'^(r\d+)\|\*out\|', line)
        if match:
            return [RaceEvent(type=EventType.PIT_OUT, row_id=match.group(1))]

        # Cell update: r{id}c{col}|{action}|{value}
        match = re.match(r'^(r\d+)(c\d+)\|([^|]*)\|(.*)$', line)
        if match:
            row_id = match.group(1)
            col_id = match.group(2)
            action = match.group(3)
            value = match.group(4)
            return self._parse_cell_update(row_id, col_id, action, value)

        # Unrecognized - log for debugging
        if not line.startswith(("r", "d")):
            logger.debug(f"Unrecognized message: {line[:80]}")

        return []

    def _parse_grid(self, html: str) -> list[RaceEvent]:
        """Parse the init grid HTML to extract column mapping and kart states."""
        events = []
        soup = BeautifulSoup(html, "html.parser")

        # Find header row to build column mapping
        header = soup.find("tr", {"data-id": "r0"})
        if header:
            self.column_map = {}
            for td in header.find_all("td"):
                td_id = td.get("data-id", "")
                td_type = td.get("data-type", "")
                if td_id and td_type and td_type in COLUMN_TYPES:
                    self.column_map[td_id] = COLUMN_TYPES[td_type]
                elif td_id and not td_type:
                    # Column without data-type - check content for hints
                    text = td.get_text(strip=True).lower()
                    if "vuelta" in text and "mejor" not in text:
                        self.column_map[td_id] = "total_laps"
            self._initialized = True
            logger.info(f"Column mapping: {self.column_map}")

        # Parse each kart row
        for row in soup.find_all("tr", {"data-id": re.compile(r'^r\d+$')}):
            row_id = row.get("data-id", "")
            if row_id == "r0":
                continue

            kart = self._parse_kart_row(row, row_id)
            if kart:
                self.row_to_kart[row_id] = kart.kart_number
                events.append(RaceEvent(
                    type=EventType.INIT,
                    row_id=row_id,
                    value="kart",
                    extra={
                        "kart_number": kart.kart_number,
                        "team_name": kart.team_name,
                        "position": kart.position,
                        "last_lap": kart.last_lap,
                        "best_lap": kart.best_lap,
                        "gap": kart.gap,
                        "interval": kart.interval,
                        "total_laps": kart.total_laps,
                        "pit_time": kart.pit_time,
                        "pit_count": kart.pit_count,
                        "status_class": kart.status_class,
                    }
                ))

        logger.info(f"Parsed {len(events)} karts from init grid")
        return events

    def _parse_kart_row(self, row, row_id: str) -> InitKart | None:
        """Extract kart data from an HTML table row.

        Note: Some columns (rk, no) have their data-id on inner <div>/<p>
        elements rather than on the <td> itself. We check both levels.
        """
        data = {}
        for td in row.find_all("td"):
            # Try to find data-id on the <td> itself or on inner elements
            td_id = td.get("data-id", "")
            if not td_id:
                # Check inner <div> or <p> for data-id (rk/no columns)
                for inner_el in td.find_all(["div", "p"]):
                    inner_id = inner_el.get("data-id", "")
                    if inner_id:
                        td_id = inner_id
                        break

            if not td_id:
                continue

            # Extract column id (e.g., "c4" from "r7980c4")
            col_match = re.search(r'(c\d+)$', td_id)
            if not col_match:
                continue
            col_id = col_match.group(1)
            semantic = self.column_map.get(col_id)

            if not semantic:
                continue

            # Get text content
            inner = td.find("div") or td.find("p") or td
            text = inner.get_text(strip=True)
            data[semantic] = text

            # Get status class from c1 (group column)
            if semantic == "group":
                data["status_class"] = td.get("class", [""])[0] if td.get("class") else ""

            # Get status from c2
            if semantic == "status":
                data["status_class"] = td.get("class", [""])[0] if td.get("class") else ""

        kart_number = data.get("kart_number", "")
        if not kart_number:
            return None

        try:
            kart_num = int(kart_number)
        except ValueError:
            return None

        return InitKart(
            row_id=row_id,
            kart_number=kart_num,
            team_name=data.get("team_name", ""),
            position=int(data.get("position", 0) or 0),
            last_lap=data.get("last_lap", ""),
            best_lap=data.get("best_lap", ""),
            gap=data.get("gap", ""),
            interval=data.get("interval", ""),
            total_laps=data.get("total_laps", "0"),
            pit_time=data.get("pit_time", ""),
            pit_count=data.get("pit_count", "0"),
            status_class=data.get("status_class", ""),
        )

    def _parse_cell_update(self, row_id: str, col_id: str, action: str, value: str) -> list[RaceEvent]:
        """Parse a cell update message into the appropriate event type."""
        # Status column (c2 typically) - pit in/out
        semantic = self.column_map.get(col_id, "")

        # Pit in/out via status actions
        if action == "si":
            return [RaceEvent(type=EventType.PIT_IN, row_id=row_id)]
        if action == "so":
            return [RaceEvent(type=EventType.PIT_OUT, row_id=row_id)]

        # Driver/team updates
        if action == "drteam":
            # Format: "DRIVER NAME [H:MM]"
            match = re.match(r'^(.+?)\s*\[([^\]]+)\]$', value)
            if match:
                return [RaceEvent(type=EventType.DRIVER_TEAM, row_id=row_id,
                                  value=match.group(1).strip(),
                                  extra={"time": match.group(2)})]
            return [RaceEvent(type=EventType.DRIVER_TEAM, row_id=row_id, value=value)]

        if action == "dr":
            return [RaceEvent(type=EventType.TEAM, row_id=row_id, value=value.strip())]

        # Lap time updates (tn=normal, ti=improvement, tb=best, to=other)
        if action in LAP_CLASSES:
            # Skip sector and total_laps columns — they are NOT lap time events.
            # Some circuits (e.g. Santos) send lap times with LAP_CLASS actions
            # on the "Vueltas" column (total_laps), which would create phantom laps.
            if semantic in IGNORED_SEMANTICS or semantic == "total_laps":
                return []
            # Determine if this is last_lap or best_lap column
            if semantic == "best_lap":
                return [RaceEvent(type=EventType.BEST_LAP, row_id=row_id,
                                  value=value, extra={"class": action})]
            else:
                return [RaceEvent(type=EventType.LAP, row_id=row_id,
                                  value=value, extra={"class": action})]

        # Generic "in" action - depends on column
        if action == "in":
            if semantic in IGNORED_SEMANTICS:
                return []
            if semantic == "last_lap":
                return [RaceEvent(type=EventType.LAP, row_id=row_id, value=value)]
            if semantic == "best_lap":
                return [RaceEvent(type=EventType.BEST_LAP, row_id=row_id, value=value)]
            if semantic == "gap":
                return [RaceEvent(type=EventType.GAP, row_id=row_id, value=value)]
            if semantic == "interval":
                return [RaceEvent(type=EventType.INTERVAL, row_id=row_id, value=value)]
            if semantic == "total_laps":
                return [RaceEvent(type=EventType.TOTAL_LAPS, row_id=row_id, value=value)]
            if semantic == "pit_time":
                return [RaceEvent(type=EventType.PIT_TIME, row_id=row_id, value=value)]
            if semantic == "pit_count":
                return [RaceEvent(type=EventType.PIT_COUNT, row_id=row_id, value=value)]

            # If column not mapped, try by known column patterns
            # c6 is often last_lap, c7 best_lap, etc. but this varies
            return []

        # Visual status changes (gs=green start, gf=finish, gm=middle, gl=last)
        if action in ("gs", "gf", "gm", "gl"):
            return [RaceEvent(type=EventType.STATUS, row_id=row_id,
                              value=action)]

        # Status arrows (su=up, sd=down, sf=finish, sr=retired)
        if action in ("su", "sd", "sf", "sr"):
            return [RaceEvent(type=EventType.STATUS, row_id=row_id,
                              value=action)]

        # Gap/interval with special formatting
        if action == "ib":
            if semantic in IGNORED_SEMANTICS:
                return []
            if semantic == "best_lap":
                return [RaceEvent(type=EventType.BEST_LAP, row_id=row_id, value=value)]
            return [RaceEvent(type=EventType.GAP, row_id=row_id, value=value)]

        return []

    def get_column_for_type(self, type_name: str) -> str | None:
        """Get the column id for a given semantic type."""
        for col_id, semantic in self.column_map.items():
            if semantic == type_name:
                return col_id
        return None


def time_to_ms(time_str: str) -> int:
    """Convert time string (M:SS.mmm or SS.mmm) to milliseconds."""
    time_str = time_str.strip()
    if not time_str:
        return 0
    try:
        if ":" in time_str:
            parts = time_str.split(":")
            minutes = int(parts[0])
            sec_parts = parts[1].split(".")
            seconds = int(sec_parts[0])
            millis = int(sec_parts[1]) if len(sec_parts) > 1 else 0
            return (minutes * 60 + seconds) * 1000 + millis
        else:
            sec_parts = time_str.split(".")
            seconds = int(sec_parts[0])
            millis = int(sec_parts[1]) if len(sec_parts) > 1 else 0
            return seconds * 1000 + millis
    except (ValueError, IndexError):
        return 0


def ms_to_time(ms: int) -> str:
    """Convert milliseconds to M:SS.mmm format."""
    if ms <= 0:
        return ""
    minutes = ms // 60000
    seconds = (ms % 60000) // 1000
    millis = ms % 1000
    if minutes > 0:
        return f"{minutes}:{seconds:02d}.{millis:03d}"
    return f"{seconds}.{millis:03d}"
