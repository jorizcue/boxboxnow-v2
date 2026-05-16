"""
Central race state manager.
Maintains all race state in memory and dispatches updates to browser clients.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from app.apex.parser import RaceEvent, EventType, time_to_ms

logger = logging.getLogger(__name__)


@dataclass
class PitRecord:
    """A completed pit stop record (mirrors original pits_info table)."""
    pit_number: int          # Sequential pit number
    lap: int                 # Lap when pit-in happened
    race_time_ms: int        # Race elapsed time at pit-in (duration_ms - countdown_ms)
    on_track_ms: int         # Stint duration (time on track before this pit)
    driver_name: str         # Driver at time of pit-in
    total_driver_ms: int     # Cumulative on-track time for this driver
    pit_time_ms: int = 0     # Time spent in the pit (0 if still in pit / last pit)
    stint_laps: int = 0      # Number of laps in the stint

    def to_dict(self) -> dict:
        return {
            "pitNumber": self.pit_number,
            "lap": self.lap,
            "raceTimeMs": self.race_time_ms,
            "onTrackMs": self.on_track_ms,
            "driverName": self.driver_name,
            "totalDriverMs": self.total_driver_ms,
            "pitTimeMs": self.pit_time_ms,
            "stintLaps": self.stint_laps,
        }


@dataclass
class KartState:
    """
    In-memory state per kart. Mirrors the data_table entry from
    websocket_Secuencial.py + analytics from boxboxnow.py.
    """
    row_id: str
    kart_number: int
    team_name: str = ""
    driver_name: str = ""
    driver_time: str = ""
    position: int = 0
    total_laps: int = 0
    apex_total_laps: int = 0   # Apex c6 (tlp) value — source of truth for lap count
    last_lap_ms: int = 0       # lastLapTime - last valid lap time in ms
    # Last c7 (llp) value we actually processed. Used to distinguish a real
    # new lap from a CSS class repaint (Apex re-sends the same last_lap value
    # with a different class, e.g. "tb" → "tn", when another kart beats the
    # best). A new c7 is a real new lap if either:
    #   - the value differs from _last_c7_value, OR
    #   - apex_total_laps has moved forward since our last recorded lap
    #     (covers the rare case of two consecutive laps with identical ms).
    _last_c7_value: int = 0
    # CSS class of the last c7 we recorded ("tn" normal, "ti" improvement,
    # "tb" best, "to" other). Used as an additional discriminator alongside
    # _last_c7_value: when a c7 arrives with the same value but a class
    # transition that REQUIRES a new lap completion (anything → ti / tb,
    # or ti → tn), we accept it as a real new lap. This catches the case
    # where two consecutive laps coincidentally share the same ms — Apex's
    # row class still flips because the new lap isn't an "improvement"
    # over the previous best of the same kart anymore. Critical for Modo C
    # circuits like Cabanillas SPRINT 3 where a kart (kart 4 / Oscar Pérez)
    # had laps 2 and 3 both at 48.982ms — without this discriminator,
    # lap 3 was silently dropped and the counter stayed -1 for the rest
    # of the race.
    _last_c7_class: str = ""
    # Timestamp (in seconds, scale set by RaceStateManager._now_seconds())
    # of when we last RECORDED a c7 for this kart. Used as a fourth
    # discriminator in the LAP handler: if a c7 with identical ms and
    # CSS-class transition that doesn't match our "new lap" pattern
    # arrives more than ~70% of `lap_ms` after the previous one, it's
    # almost certainly a real new lap (CSS repaints arrive within ms
    # of the trigger; real laps take a full lap to come around).
    # Critical for replays of Modo C circuits where the PHP API isn't
    # available — purely WS-side recovery.
    _last_c7_at: float = 0.0
    best_lap_ms: int = 0
    gap: str = ""
    interval: str = ""
    pit_count: int = 0          # pitNumber from original
    pit_status: str = "racing"  # "racing" | "in_pit"
    pit_time: str = ""
    visual_status: str = ""
    arrow_status: str = ""
    stint_start_time: float = 0.0
    stint_elapsed_ms: int = 0    # Accumulated lap time in current stint (works for replay too)
    stint_start_countdown_ms: int = 0  # Race clock (countdown_ms) when stint started
    last_pit_lap: int = 0       # lastPitLap - lap number when last pit occurred (0 = race start)

    # Pit-in timing (saved on PIT_IN, used on PIT_OUT to compute pit duration)
    pit_in_countdown_ms: int = 0  # Race clock when pit-in occurred

    # Pit history (list of completed pit records, like pits_info table)
    pit_history: list[PitRecord] = field(default_factory=list)

    # Per-driver cumulative on-track time (for "Total" column in PITS tab)
    driver_total_ms: dict = field(default_factory=dict)  # driver_name -> cumulative ms

    # Lap storage (replaces stage_laps_rt and stage_laps_clasif)
    # valid_laps = stage_laps_rt equivalent (filtered, per pitNumber)
    # all_laps = stage_laps_clasif equivalent (all laps including filtered)
    valid_laps: list[dict] = field(default_factory=list)  # {lapTime, totalLap, pitNumber, created_at}
    all_laps: list[dict] = field(default_factory=list)

    # Analytics results (set by clustering/classification engines)
    tier_score: int = 50
    avg_lap_ms: float = 0.0
    best_avg_ms: float = 0.0
    cluster: int = 2
    driver_differential_ms: int = 0

    # Sector times (only populated on circuits whose Apex grid header
    # declares `data-type="s1|s2|s3"` columns — Campillos does, many
    # don't). The sector index in the field name is the SECTOR index,
    # not the column index. The parser resolves `s1|s2|s3` → semantic
    # via the dynamic `column_map`, so the actual cN column varies per
    # circuit. `current_sN_ms` is the last sector time we measured for
    # this kart, used for the "Δ vs field-best" indicator. `best_sN_ms`
    # is the kart's PB across the whole session, used to compute the
    # field-wide best holder + theoretical-best-lap card.
    current_s1_ms: int = 0
    current_s2_ms: int = 0
    current_s3_ms: int = 0
    best_s1_ms: int = 0
    best_s2_ms: int = 0
    best_s3_ms: int = 0

    # ── Tracking module (live spatial map) ──
    # Anchor timestamps used by the frontend to interpolate where a
    # kart sits along the circuit polyline. All three are in
    # countdown-clock units (ms), same domain as `stint_start_countdown_ms`,
    # so the frontend can compute "elapsed since last cross" by
    # subtracting from the live countdown reading.
    #
    # `last_lap_complete_countdown_ms`: countdown_ms value when the kart
    # last crossed the meta line. Reset to 0 at race start, updated on
    # each LAP event.
    #
    # `last_sector_n`: which sensor we crossed last (1, 2, 3, or 0 if
    # the kart has just completed a lap → next reference is the meta).
    # The frontend uses this together with `last_sector_countdown_ms` to
    # know where on the polyline to anchor the interpolation.
    last_lap_complete_countdown_ms: int = 0
    last_sector_n: int = 0
    last_sector_countdown_ms: int = 0

    def stint_duration_s(self) -> float:
        """Stint duration in seconds, based on accumulated lap times."""
        return self.stint_elapsed_ms / 1000.0

    def stint_lap_count(self) -> int:
        """Number of laps in current stint (all laps, not just valid)."""
        return sum(1 for lap in self.all_laps if lap.get("pitNumber") == self.pit_count)

    def best_stint_lap_ms(self) -> int:
        """Best valid lap time in the current stint (0 if no valid laps yet)."""
        stint_laps = [lap["lapTime"] for lap in self.valid_laps if lap.get("pitNumber") == self.pit_count]
        return min(stint_laps) if stint_laps else 0

    def driver_avg_lap_ms_map(self) -> dict:
        """Compute average lap time per driver from valid laps."""
        sums: dict[str, list[int]] = {}
        for lap in self.valid_laps:
            name = lap.get("driverName", "")
            if name:
                sums.setdefault(name, []).append(lap["lapTime"])
        return {name: sum(times) / len(times) for name, times in sums.items() if times}

    def to_dict(self) -> dict:
        # `totalLaps` is what the dashboard displays as VLT. We expose
        # the MAX of (our recorded count, Apex's `tlp` counter) so the
        # cell stays in sync with Apex even when we can't capture every
        # `c7` event (Modo A: Alcanede, Henakart 3h). `lapTimesMissing`
        # is the gap, surfaced to the frontend so the UI can tell the
        # user "Apex says 6 laps but we only have 5 lap times" via a
        # small ⚠ badge instead of silently lying about averages.
        display_total = max(self.total_laps, self.apex_total_laps)
        lap_times_missing = max(0, self.apex_total_laps - self.total_laps)
        return {
            "rowId": self.row_id,
            "kartNumber": self.kart_number,
            "teamName": self.team_name,
            "driverName": self.driver_name,
            "driverTime": self.driver_time,
            "position": self.position,
            "totalLaps": display_total,
            "lapTimesMissing": lap_times_missing,
            "lastLapMs": self.last_lap_ms,
            "bestLapMs": self.best_lap_ms,
            "gap": self.gap,
            "interval": self.interval,
            "pitCount": self.pit_count,
            "pitStatus": self.pit_status,
            "pitTime": self.pit_time,
            "visualStatus": self.visual_status,
            "arrowStatus": self.arrow_status,
            "stintLapsCount": self.stint_lap_count(),
            "stintDurationS": self.stint_duration_s(),
            "stintStartTime": self.stint_start_time,  # kept for backwards compat
            "stintElapsedMs": self.stint_elapsed_ms,
            "stintStartCountdownMs": self.stint_start_countdown_ms,
            "pitInCountdownMs": self.pit_in_countdown_ms if self.pit_in_countdown_ms else None,
            "pitHistory": [p.to_dict() for p in self.pit_history],
            "driverTotalMs": self.driver_total_ms,
            "driverAvgLapMs": self.driver_avg_lap_ms_map(),
            "tierScore": self.tier_score,
            "driverDifferentialMs": self.driver_differential_ms,
            "avgLapMs": self.avg_lap_ms,
            "bestAvgMs": self.best_avg_ms,
            "bestStintLapMs": self.best_stint_lap_ms(),
            "recentLaps": [
                {"lapTime": l["lapTime"], "totalLap": l["totalLap"], "driverName": l.get("driverName", "")}
                for l in self.valid_laps[-5:]
            ],
            # Sector times (0 when the circuit doesn't expose sectors or this
            # kart hasn't completed a sector yet). Frontend treats 0 as "no
            # data" and shows "--".
            "currentS1Ms": self.current_s1_ms,
            "currentS2Ms": self.current_s2_ms,
            "currentS3Ms": self.current_s3_ms,
            "bestS1Ms": self.best_s1_ms,
            "bestS2Ms": self.best_s2_ms,
            "bestS3Ms": self.best_s3_ms,
            # Tracking anchors — frontend interpolates kart position
            # along the circuit polyline from these timestamps.
            "lastLapCompleteCountdownMs": self.last_lap_complete_countdown_ms,
            "lastSectorN": self.last_sector_n,
            "lastSectorCountdownMs": self.last_sector_countdown_ms,
        }


class RaceStateManager:
    """Manages all in-memory race state and broadcasts to clients."""

    def __init__(self):
        self.karts: dict[str, KartState] = {}
        self.race_started: bool = False
        self.race_finished: bool = False
        self.countdown_ms: int = 0
        # Wall/log timestamp (matches `_now_seconds()`) when
        # `self.countdown_ms` was last updated by an Apex COUNTDOWN /
        # COUNT_UP event. Apex only sends those every ~30 s, so
        # `countdown_ms` itself has 30-second resolution in real terms.
        # `_interpolated_countdown_ms()` uses this to give sub-second
        # precision when assigning kart anchors on lap/sector crosses.
        self._countdown_received_at: float = 0.0
        self.track_name: str = ""
        self.start_time: float = 0.0
        self._ws_clients: set = set()
        self._event_buffer: list[dict] = []
        self._broadcast_lock = asyncio.Lock()

        # Optional Apex PHP API client. Set via `set_php_api()` from the
        # owning UserSession / CircuitConnection once the circuit's
        # php_api_url and php_api_port are known. Used as a tie-breaker
        # in the LAP handler when we can't tell from the WebSocket
        # stream alone whether an incoming `c7` is a new lap or a CSS
        # repaint (Modo C circuits like Ariza, where there's no `tlp`
        # column to give us the counter independently).
        self._php_api = None  # type: ApexApiClient | None

        # Replay-aware clock. When a ReplaySession owns this state, it
        # writes the current log-block timestamp here before each
        # handle_events(). The LAP handler reads it via _now_seconds()
        # so the time-elapsed-since-last-c7 check works at any replay
        # speed (the comparison is in *log time*, not wall clock).
        # In live operation this stays None and we fall back to
        # time.monotonic() — equivalent because live time advances at
        # 1x by definition.
        self._current_log_time: float | None = None

        # Analytics state
        self.fifo_queue: list[dict] = []
        self.fifo_score: float = 0.0
        self.fifo_history: list[dict] = []
        self.classification: list[dict] = []
        # Reference values used by the latest classification compute pass:
        # minPits, pitTimeRefS, medianFieldSpeedMs, raceTimeS. Surfaced to
        # the frontend so the UI can show "Pits oblig.: N · Ref. pit: X.Xs".
        self.classification_meta: dict = {}

        # Whether the current Apex grid exposes sector columns (s1|s2|s3
        # data-types). Set true the first time we receive a SECTOR event
        # in this session. Reset on EventType.INIT init/init. Frontends
        # use this flag to auto-hide the sector-related driver cards on
        # circuits without sector telemetry.
        self.has_sectors: bool = False

        # Session metadata (auto-detected from Apex signals)
        self.category: str = ""  # title1: "70 SILVER", "85 GOLD", etc.
        self.session_title: str = ""
        self.real_start_time: str = ""  # HH:MM from green flag com|| message
        self.race_current_lap: int = 0  # Current lap in lap-based races
        self.race_total_laps: int = 0   # Total laps in lap-based races

        # Config (loaded at runtime)
        self.circuit_length_m: int = 1100
        self.pit_time_s: int = 120
        self.laps_discard: int = 2
        self.lap_differential: int = 3000  # diferencial_vueltas in ms (absolute offset, not multiplier)
        # First N laps of each stint excluded from the rolling 20-lap mean
        # because tyres are cold. Configurable per circuit (Circuit.warmup_laps_to_skip).
        self.warmup_laps_to_skip: int = 3

        # Set by the user session while the replay engine is in silent
        # rebuild mode (catching up state from init block to seek target).
        # Suppresses outbound broadcasts so clients don't get flooded.
        self._silent_rebuild: bool = False
        self.rain_mode: bool = False
        self.our_kart_number: int = 0
        self.min_pits: int = 3
        self.max_stint_min: int = 40
        self.min_stint_min: int = 15
        self.min_driver_time_min: int = 30
        self.pit_closed_start_min: int = 0
        self.pit_closed_end_min: int = 0
        self.box_lines: int = 2
        self.box_karts: int = 30
        self.duration_min: int = 180
        # Number of drivers in the team. 0 = not configured; the pit-gate
        # falls back to Apex-observed drivers. Set from RaceSession by
        # _apply_session_config.
        self.team_drivers_count: int = 0
        self.finish_lat1: float | None = None
        self.finish_lon1: float | None = None
        self.finish_lat2: float | None = None
        self.finish_lon2: float | None = None

    def set_php_api(self, php_api):
        """Inject the Apex PHP API client. Once set, the LAP handler
        will use it to disambiguate identical-ms `c7` events on circuits
        that don't expose a `tlp` column (Modo C — Ariza). On all other
        circuits this is a no-op."""
        self._php_api = php_api

    def _now_seconds(self) -> float:
        """Time source for lap-interval checks. Replay sessions write
        `_current_log_time` (block timestamp) before each handle_events
        call so the elapsed-since-last-c7 comparison happens in LOG
        time — invariant under replay speed. Live mode falls back to
        monotonic, which IS log time at 1x by definition.
        """
        if self._current_log_time is not None:
            return self._current_log_time
        return time.monotonic()

    def _interpolated_countdown_ms(self) -> int:
        """Return `self.countdown_ms` interpolated to the current
        moment.

        Apex sends `dyn1|countdown|X` events every ~30 seconds, so
        between updates `self.countdown_ms` is up to 30 seconds stale.
        For kart anchor timestamps (`last_lap_complete_countdown_ms`,
        `last_sector_countdown_ms`) we need sub-second precision: when
        four karts cross META in the same 30-second window, they all
        end up with the EXACT same anchor if we just use
        `self.countdown_ms` — that's the "4 karts with current =
        1:11.469 to the millisecond" bug.

        Interpolation: countdown decreases at 1 ms per real ms, so
        `countdown_now = countdown_at_last_update − elapsed_since_update`.
        Works for both live mode (wall-clock) and replay mode (log
        time), because `_now_seconds()` is consistent across both.
        """
        if self._countdown_received_at <= 0:
            return self.countdown_ms
        elapsed_s = self._now_seconds() - self._countdown_received_at
        if elapsed_s < 0:
            elapsed_s = 0
        return max(0, self.countdown_ms - int(elapsed_s * 1000))

    def reset(self):
        """Reset all race state (used when starting/stopping replay)."""
        self.karts.clear()
        self.race_started = False
        self.race_finished = False
        self.countdown_ms = 0
        self.track_name = ""
        self.start_time = 0.0
        self.category = ""
        self.session_title = ""
        self.real_start_time = ""
        self._event_buffer.clear()
        self.fifo_queue.clear()
        self.fifo_score = 0.0
        self.fifo_history.clear()
        self.classification.clear()
        self.classification_meta = {}
        self._first_countdown_ms = 0
        self._needs_snapshot = False
        self.race_current_lap = 0
        self.race_total_laps = 0

    def update_duration(self, new_duration_min: int):
        """Update duration_min and recalculate stint_start_countdown_ms
        for karts in their first stint (pit_count == 0).

        This is needed when the user corrects the race duration mid-race,
        especially after a reconnection where stint starts were estimated
        from the old duration_min.
        """
        old_duration_min = self.duration_min
        self.duration_min = new_duration_min

        if not self.race_started or old_duration_min == new_duration_min:
            return

        old_race_start_ms = old_duration_min * 60 * 1000
        new_race_start_ms = new_duration_min * 60 * 1000

        updated = 0
        for kart in self.karts.values():
            if kart.pit_count == 0 and kart.stint_start_countdown_ms > 0:
                # Only adjust karts whose stint_start was calculated from duration
                # (reconnection case). In fresh start, stint_start == _first_countdown_ms.
                if kart.stint_start_countdown_ms == old_race_start_ms:
                    kart.stint_start_countdown_ms = new_race_start_ms
                    updated += 1

        if updated:
            logger.info(f"Duration changed {old_duration_min}->{new_duration_min}min, "
                        f"updated stint_start for {updated} first-stint karts")

    def add_client(self, ws):
        self._ws_clients.add(ws)
        logger.info(f"Client connected. Total: {len(self._ws_clients)}")

    def remove_client(self, ws):
        self._ws_clients.discard(ws)
        logger.info(f"Client disconnected. Total: {len(self._ws_clients)}")

    async def handle_events(self, events: list[RaceEvent]):
        """Process a batch of parsed events and broadcast updates."""
        # Pre-scan: which karts had a c6 LAP event in this block? The
        # LAP_MS handler uses this to skip the * (own-lap signal) when c6
        # is also present (i.e. c6 wasn't dropped). Robust to event
        # ordering within the block — doesn't rely on c6 always preceding
        # the * line.
        self._lap_karts_this_block: set[str] = {
            e.row_id for e in events
            if e.type == EventType.LAP and e.row_id
        }
        updates = []
        had_init_kart = False
        for event in events:
            update = await self._apply_event(event)
            if update:
                updates.append(update)
            if event.type == EventType.INIT and event.value == "kart":
                had_init_kart = True

        # Skip outbound broadcasts while a silent rebuild is in flight (set
        # by the replay engine during init→target catch-up after a seek).
        # The local state is still updated above so the simulation lands in
        # the right shape, but the WS doesn't get spammed with hundreds of
        # intermediate updates.
        if self._ws_clients and not getattr(self, "_silent_rebuild", False):
            if had_init_kart or getattr(self, '_needs_snapshot', False):
                # Send full snapshot when karts init'd or race just started
                # (so frontend gets updated stintStartCountdownMs values)
                self._needs_snapshot = False
                await self._broadcast(self.get_snapshot())
            elif updates:
                msg = {"type": "update", "events": updates}
                # When this batch contained any sector event, attach the
                # freshly-recomputed sectorMeta so clients can refresh
                # the field-best holders + theoretical-best card without
                # waiting for the next snapshot. Bandwidth-cheap (only
                # fires when sectors actually changed) and avoids each
                # client recomputing the leader board independently.
                has_sector_event = any(
                    e.get("event") == "sector" for e in updates
                )
                if has_sector_event and self.has_sectors:
                    msg["sectorMeta"] = self._compute_sector_meta()
                    msg["sectorMetaCurrent"] = self._compute_sector_meta(source="current")
                    msg["hasSectors"] = True
                await self._broadcast(msg)

        # Real classification: positions only change at lap-line crossings
        # (every kart's adj_progress otherwise advances at +1 s/s in steady
        # state). Recompute and push a lightweight `classification_update`
        # whenever this batch contained a LAP event so the UI animates the
        # row swap immediately instead of waiting for the next analytics
        # tick (which can be 10-30s away). Lazy import to avoid circular
        # dependency with classification.py which itself imports state.
        if (
            self._ws_clients
            and not getattr(self, "_silent_rebuild", False)
            and self._lap_karts_this_block
        ):
            from app.engine.classification import compute_classification
            compute_classification(self)
            await self._broadcast({
                "type": "classification_update",
                "data": {
                    "classification": self.classification,
                    "classificationMeta": self.classification_meta,
                },
            })

    def _record_lap(self, kart: KartState, row_id: str, lap_ms: int,
                    lap_class: str = "tn") -> dict:
        """Record a lap for a kart. Handles counting, filtering, analytics.
        Returns the lap event dict for broadcast."""
        kart.total_laps += 1
        now_str = datetime.now().strftime("%Y-%m-%dT%H:%M:%S.%f")
        lap_record = {
            "lapTime": lap_ms,
            "totalLap": kart.total_laps,
            "pitNumber": kart.pit_count,
            "kartNumber": kart.kart_number,
            "driverName": kart.driver_name,
            "created_at": now_str,
        }

        # Always add to all_laps
        kart.all_laps.append(lap_record)

        # Outlier filter:
        # 1. Skip if total_lap <= lastPitLap + num_vueltas_descarte
        # 2. Skip if lap_time > lastLapTime + diferencial_vueltas AND not rain
        is_valid = True
        if kart.total_laps <= kart.last_pit_lap + self.laps_discard:
            is_valid = False
        elif kart.last_lap_ms > 0 and not self.rain_mode:
            if lap_ms > kart.last_lap_ms + self.lap_differential:
                is_valid = False

        if is_valid:
            kart.valid_laps.append(lap_record)

        # Update lastLapTime AFTER filter check (matches original order)
        kart.last_lap_ms = lap_ms
        if kart.best_lap_ms <= 0 or lap_ms < kart.best_lap_ms:
            kart.best_lap_ms = lap_ms

        # Accumulate stint elapsed time
        kart.stint_elapsed_ms += lap_ms

        # Tracking anchor: kart just crossed meta, so reset the sector
        # reference. We INTERPOLATE the current countdown_ms to wall
        # time because Apex only sends countdown updates every ~30 s.
        # Without interpolation, every kart crossing META within the
        # same 30-second window ends up with the EXACT same anchor
        # value, and the frontend's live "current lap" counter shows
        # identical values to the millisecond for tight packs (the bug
        # observed at Ariza's 2HORAS AMATEUR Final).
        anchor_ms = self._interpolated_countdown_ms()
        kart.last_lap_complete_countdown_ms = anchor_ms
        kart.last_sector_n = 0
        kart.last_sector_countdown_ms = anchor_ms

        # Include the freshly-updated tracking anchors. Without these,
        # the frontend WS handler patches `lastLapMs` + `totalLaps` but
        # the kart keeps its stale `lastLapCompleteCountdownMs` from the
        # previous full snapshot, so the live "current lap" counter
        # never resets at META and just keeps growing past the actual
        # lap time. The Tracking panel was showing values like
        # "current = 1:15" right after a 56 s lap closed because of this.
        return {"event": "lap", "rowId": row_id,
                "kartNumber": kart.kart_number,
                "lapTimeMs": lap_ms,
                "lapClass": lap_class,
                "totalLaps": kart.total_laps,
                "lastLapCompleteCountdownMs": kart.last_lap_complete_countdown_ms,
                "lastSectorN": kart.last_sector_n,
                "lastSectorCountdownMs": kart.last_sector_countdown_ms}

    async def _apply_event(self, event: RaceEvent) -> dict | None:
        """Apply a single event to state. Returns update dict for broadcast.

        Async because the LAP handler may call into the Apex PHP API to
        disambiguate identical-ms `c7` events on Modo C circuits (no
        `tlp` column). All other branches are pure-sync; only the rare
        ambiguous lap event triggers a real `await` that yields.
        """
        row_id = event.row_id

        if event.type == EventType.INIT and event.value == "kart":
            kart = KartState(
                row_id=row_id,
                kart_number=event.extra.get("kart_number", 0),
                team_name=event.extra.get("team_name", ""),
                position=event.extra.get("position", 0),
                total_laps=int(event.extra.get("total_laps", "0") or "0"),
                apex_total_laps=int(event.extra.get("total_laps", "0") or "0"),
                gap=event.extra.get("gap", ""),
                interval=event.extra.get("interval", ""),
                pit_time=event.extra.get("pit_time", ""),
                pit_count=int(event.extra.get("pit_count", "0") or "0"),
            )
            # Parse lap times from init
            last_lap_str = event.extra.get("last_lap", "")
            best_lap_str = event.extra.get("best_lap", "")
            if last_lap_str:
                kart.last_lap_ms = time_to_ms(last_lap_str)
            if best_lap_str:
                kart.best_lap_ms = time_to_ms(best_lap_str)
            kart.stint_start_time = time.time()
            # If race already started, first-stint karts use race start reference
            # (not current countdown, which may be seconds behind the actual start).
            # This handles the common case where grid|| arrives AFTER countdown
            # in the same message block.
            if self.race_started and kart.pit_count == 0:
                kart.stint_start_countdown_ms = getattr(self, '_race_start_ms', self.countdown_ms)
            else:
                kart.stint_start_countdown_ms = self.countdown_ms

            # Apply restored pit summary from DB (after backend restart mid-race)
            pit_summary = getattr(self, '_restored_pit_summary', {})
            if pit_summary and kart.kart_number in pit_summary:
                ps = pit_summary[kart.kart_number]
                # Restore pit count if Apex init data shows fewer pits than DB
                if ps["pit_count"] > kart.pit_count:
                    kart.pit_count = ps["pit_count"]
                # Restore stint start from last pit-out countdown
                if ps["last_pit_out_countdown_ms"] is not None:
                    kart.stint_start_countdown_ms = ps["last_pit_out_countdown_ms"]

            self.karts[row_id] = kart
            return None  # Init sends snapshot, not individual updates

        if event.type == EventType.INIT and event.value == "init":
            # Reset state for new init block (new race / new session).
            # countdown_ms MUST be reset so that karts created in this init
            # get stint_start_countdown_ms=0 (which _trigger_race_start will
            # then properly set to race_start_ms).
            self.karts.clear()
            self.race_started = False
            self.race_finished = False
            self.countdown_ms = 0
            self._first_countdown_ms = 0
            self._race_start_ms = 0
            # Sector flag resets on init so circuits without sectors don't
            # carry over the flag from a previous session in the same
            # process (live mode keeps the same RaceStateManager).
            self.has_sectors = False
            return None

        # Get or skip unknown karts
        kart = self.karts.get(row_id)
        if not kart and row_id:
            return None

        if event.type == EventType.LAP:
            # Lap counting from cell update (llp column).
            lap_ms = time_to_ms(event.value)
            # Minimum lap time filter: some circuits (Santos) briefly show the
            # lap NUMBER in the llp column (e.g. "1" → 1000ms) before the real
            # time. No karting lap is under 15 seconds.
            if lap_ms > 15000 and kart:
                # A c7 update is a REAL new lap when either:
                #   - Apex's c6 (apex_total_laps) has advanced beyond our count
                #     (catches the rare edge case of two consecutive laps with
                #     identical ms — our value dedup would otherwise drop one).
                #   - The value differs from the last c7 we actually processed.
                # Otherwise it's a CSS class repaint (Apex re-sends the same
                # last_lap value with a different class, e.g. "tb" → "tn" when
                # another kart beats the best). The previous implementation
                # used `total_laps >= apex_total_laps` as the skip guard, which
                # dropped legitimate c7 events that arrived AFTER a phantom
                # back-fill had already bumped our counter — corrupting every
                # subsequent lap with stale last_lap_ms values. See Issue #1
                # in pending_issues.md for the Henakart 3h evidence.
                c6_advanced = (
                    kart.apex_total_laps > 0
                    and kart.apex_total_laps > kart.total_laps
                )
                value_changed = lap_ms != kart._last_c7_value
                new_class = event.extra.get("class", "tn")

                # CSS class transition signal.
                #
                # Apex's class is one of: tn (normal), ti (improvement over
                # the kart's own best), tb (session best), to (invalidated).
                # Class transitions can prove a new lap was completed when
                # neither apex_total_laps nor lap_ms moved — but ONLY for
                # the transitions that genuinely require a new lap. The
                # bug we hit at race start in Cabanillas SPRINT 3 was that
                # `tb → ti` was being accepted as a new lap, when in fact
                # it's a textbook repaint: another kart beat your session
                # best, so your lap drops from "session best" to "just
                # your own improvement" — same lap, lower badge.
                #
                # Safe transitions (require a real new lap):
                #   - any transition FROM tn or to (going up)
                #   - ti → tb (improvement promoted to session best)
                #   - ti → tn (no longer an improvement, i.e. you ran a
                #     better lap so the previous one is now plain)
                #
                # Unsafe transitions (could be CSS repaint, ignore):
                #   - tb → anything: another kart took session best
                #   - anything → to: lap got invalidated (same lap)
                old_cls = kart._last_c7_class
                class_indicates_new_lap = (
                    old_cls != ""
                    and new_class != old_cls
                    and old_cls != "tb"      # downgrades from tb are repaints
                    and new_class != "to"    # invalidations are repaints of the same lap
                )
                # Explicit repaint detection: when the class transitioned in
                # a way that PROVES it's a repaint of the same lap (tb was
                # downgraded because another kart took session best, or the
                # lap got invalidated to `to`). Must take precedence over
                # the time-elapsed discriminator below — otherwise a long
                # stint with identical lap_ms can fool the time check into
                # accepting the repaint as a phantom new lap (Cabanillas
                # SPRINT 3, k1 Gonzalo del Hoyo: tb|52.551 at 17:10:34 →
                # ti|52.551 at 17:11:22, 48s gap > 0.7×52.5s = 36.8s).
                class_repaint = (
                    old_cls != ""
                    and new_class != old_cls
                    and (old_cls == "tb" or new_class == "to")
                )

                now = self._now_seconds()
                if c6_advanced or value_changed or class_indicates_new_lap:
                    kart._last_c7_value = lap_ms
                    kart._last_c7_class = new_class
                    kart._last_c7_at = now
                    return self._record_lap(kart, row_id, lap_ms, new_class)

                # CSS repaint of the same lap — discard before the time
                # check has a chance to misfire. Update _last_c7_class so
                # subsequent events compare against the current (post-
                # repaint) class.
                if class_repaint:
                    kart._last_c7_class = new_class
                    return None

                # Time-elapsed discriminator. If the previous c7 was
                # recorded long enough ago that an entire new lap could
                # have completed in between (≥70% of lap_ms in LOG time),
                # the incoming event is almost certainly a real new lap
                # whose ms happens to coincide with the previous one. CSS
                # repaints arrive within milliseconds of their trigger,
                # so this threshold separates them cleanly. Works in
                # replays at any speed because _now_seconds() returns
                # LOG time, not wall clock.
                if kart._last_c7_at > 0:
                    elapsed_log_s = now - kart._last_c7_at
                    if elapsed_log_s * 1000 > 0.7 * lap_ms:
                        kart._last_c7_value = lap_ms
                        kart._last_c7_class = new_class
                        kart._last_c7_at = now
                        return self._record_lap(kart, row_id, lap_ms, new_class)

                # Ambiguous: same ms, same/repaint-class, counter not
                # advanced, AND elapsed time is too short for a real lap.
                # In Modo A circuits (apex_total_laps > 0 and equal to
                # ours): unambiguous CSS repaint — discard.
                if kart.apex_total_laps > 0:
                    return None

                # Modo C: no `tlp` column ever appeared, so we have NO
                # independent counter and class didn't change suggestively
                # either. Ask Apex's PHP API for the kart's recent laps;
                # if it shows more laps than we've recorded, the incoming
                # c7 is a real new lap whose ms happens to match the
                # previous one. The class-transition rule above already
                # caught the Oscar Pérez case (ti→tn); this is the
                # remaining tn→tn or tb→tn fallback.
                if self._php_api is not None and self._php_api.php_api_port:
                    try:
                        recent = await self._php_api.get_recent_laps(row_id, n=10)
                    except Exception as exc:
                        logger.warning(f"[php_api] tie-break failed for {row_id}: {exc}")
                        recent = []
                    if recent and recent[0][0] > kart.total_laps:
                        api_top_ms = recent[0][1]
                        kart._last_c7_value = lap_ms
                        kart._last_c7_class = new_class
                        kart._last_c7_at = now
                        return self._record_lap(
                            kart, row_id, api_top_ms or lap_ms, new_class,
                        )
                return None

        elif event.type == EventType.LAP_MS:
            # `r{id}|*|<X>|` is Apex's per-kart "own lap completed" signal.
            # In Modo A circuits (with `tlp`), `apex_total_laps` already
            # gives us a reliable counter and dropped c6/c7 events are
            # caught by the c6_advanced discriminator in the LAP handler,
            # so we ignore * there. In Modo C (no tlp column,
            # apex_total_laps stays at 0), the c6 cell update sometimes
            # gets dropped while the * still arrives — that's a lap we'd
            # otherwise miss entirely. The * fires only on this kart's
            # own line crossing (gap recalcs from the LEADER lapping
            # update other karts' c2/c7 but NOT their *), so it's a clean
            # signal. The * VALUE is unreliable as the lap time
            # (sometimes carries the actual ms, often a derived/stale
            # metric), so we use elapsed log time since the previous
            # recorded lap as the lap_ms instead.
            #
            # Cabanillas SPRINT 3, k16 Marin Moreno: c6 dropped at
            # 17:13:05 but `r1785|*|49552` still arrived; without this
            # path his VLT lagged 1 lap behind the field for the rest
            # of the race.
            if (
                kart
                and kart.apex_total_laps == 0
                and event.row_id not in getattr(self, '_lap_karts_this_block', ())
            ):
                now = self._now_seconds()
                if kart._last_c7_at > 0:
                    elapsed_ms = int(round((now - kart._last_c7_at) * 1000))
                    # Sanity range: at least one credible lap (15s),
                    # at most one credible lap+slow (10min, covers pit
                    # laps). Outside that range, leave it alone.
                    if 15000 <= elapsed_ms <= 600000:
                        kart._last_c7_value = elapsed_ms
                        kart._last_c7_class = "tn"
                        kart._last_c7_at = now
                        return self._record_lap(kart, row_id, elapsed_ms, "tn")
            return None

        elif event.type == EventType.BEST_LAP:
            lap_ms = time_to_ms(event.value)
            if lap_ms > 0 and kart:
                kart.best_lap_ms = lap_ms
                return {"event": "bestLap", "rowId": row_id,
                        "kartNumber": kart.kart_number, "lapTimeMs": lap_ms}

        elif event.type == EventType.PIT_IN and kart:
            # Port of websocket_Secuencial.py PIT IN handling
            # Guard against duplicate pit-in (both *in| and si fire for same pit)
            if kart.pit_status == "in_pit":
                return None  # Already in pit, skip duplicate
            kart.pit_status = "in_pit"
            kart.pit_count += 1
            kart.last_pit_lap = kart.total_laps
            # Interpolated, NOT raw self.countdown_ms: Apex sends countdown
            # only every ~30s so the raw value is up to 30s stale. The
            # pilot-view pit overlay shows elapsed = pitInCountdownMs −
            # (client interpolated clock); a stale raw anchor makes that
            # timer start at the staleness offset (e.g. 0:09) instead of
            # 0:00 and end equally late. Same fix as lines 558/966.
            kart.pit_in_countdown_ms = self._interpolated_countdown_ms()  # Save race clock at pit-in

            # Calculate stint duration (time on track) and race elapsed time
            duration_total_ms = self.duration_min * 60 * 1000
            on_track_ms = kart.stint_start_countdown_ms - self.countdown_ms
            # Interpolated, NOT raw self.countdown_ms (≤30s stale): the Box
            # "Pit en curso" card computes elapsed = raceElapsed(live
            # interpolated clock) − pitRecord.race_time_ms, so a stale raw
            # anchor makes that card start at the staleness offset (e.g.
            # 0:09) instead of 0:00. Same rationale as pit_in_countdown_ms
            # above / lines 558,966.
            icd = self._interpolated_countdown_ms()
            race_time_ms = duration_total_ms - icd if icd > 0 else abs(icd) + duration_total_ms
            stint_laps = sum(1 for lap in kart.all_laps if lap.get("pitNumber") == kart.pit_count - 1)

            # Update per-driver cumulative time
            driver = kart.driver_name or "Unknown"
            prev_total = kart.driver_total_ms.get(driver, 0)
            kart.driver_total_ms[driver] = prev_total + on_track_ms

            # Create pit history record
            pit_record = PitRecord(
                pit_number=kart.pit_count,
                lap=kart.total_laps,
                race_time_ms=race_time_ms,
                on_track_ms=on_track_ms,
                driver_name=driver,
                total_driver_ms=kart.driver_total_ms[driver],
                pit_time_ms=0,  # Will be filled on pit-out
                stint_laps=stint_laps,
            )
            kart.pit_history.append(pit_record)

            return {"event": "pitIn", "rowId": row_id,
                    "kartNumber": kart.kart_number,
                    "pitCount": kart.pit_count,
                    "lap": kart.total_laps,
                    "pitInCountdownMs": kart.pit_in_countdown_ms,
                    "pitRecord": pit_record.to_dict()}

        elif event.type == EventType.PIT_OUT and kart:
            # Port of websocket_Secuencial.py PIT OUT handling
            # Guard against duplicate pit-out (both *out| and so fire for same pit)
            if kart.pit_status == "racing":
                return None  # Already racing, skip duplicate
            # Calculate pit time (time spent in the pit)
            if kart.pit_in_countdown_ms != 0:
                # Interpolated on the out side too: pit_in_countdown_ms is
                # now interpolated, so mixing it with the raw (≤30s stale)
                # countdown here would re-introduce up to 30s of error into
                # the recorded pit duration.
                pit_time_ms = kart.pit_in_countdown_ms - self._interpolated_countdown_ms()
                # Update the last pit record with pit_time
                if kart.pit_history:
                    kart.pit_history[-1].pit_time_ms = pit_time_ms

            kart.pit_status = "racing"
            kart.stint_start_time = time.time()
            kart.stint_elapsed_ms = 0  # Reset stint timer on pit out
            kart.stint_start_countdown_ms = self.countdown_ms  # Race clock at stint start
            kart.pit_in_countdown_ms = 0  # Clear pit-in marker
            return {"event": "pitOut", "rowId": row_id,
                    "kartNumber": kart.kart_number,
                    "pitCount": kart.pit_count,
                    "stintStartCountdownMs": self.countdown_ms}

        elif event.type == EventType.RANKING and kart:
            kart.position = int(event.value)
            return {"event": "position", "rowId": row_id,
                    "kartNumber": kart.kart_number,
                    "position": kart.position}

        elif event.type == EventType.GAP and kart:
            kart.gap = event.value
            return {"event": "gap", "rowId": row_id, "value": event.value}

        elif event.type == EventType.INTERVAL and kart:
            kart.interval = event.value
            return {"event": "interval", "rowId": row_id, "value": event.value}

        elif event.type == EventType.TOTAL_LAPS and kart:
            new_total = int(event.value) if event.value.strip().isdigit() else 0
            if new_total <= 0:
                return None

            # Just sync the Apex counter. The previous implementation synthesized
            # phantom lap records here using `kart.last_lap_ms` whenever c6
            # arrived before the matching c7 — but that stale value had nothing
            # to do with the actual new lap, which corrupted every downstream
            # stat (avg, best, best-stint) in Carrera / Analytics / GPS Insights.
            # We now rely exclusively on c7 (LAP event) to create lap records;
            # if we miss a c7 entirely we miss that one lap, which is far less
            # damaging than polluting the record set with made-up times.
            kart.apex_total_laps = new_total
            return {"event": "totalLaps", "rowId": row_id,
                    "value": new_total}

        elif event.type == EventType.SECTOR and kart:
            # Sector time update (only on circuits with s1|s2|s3 columns).
            # The sector index comes from the parser, which derived it from
            # the grid's `data-type` declaration (not the cN column index).
            sector_idx = event.extra.get("sectorIdx", 0)
            if sector_idx not in (1, 2, 3):
                return None
            try:
                ms = int(round(float(event.value) * 1000))
            except (ValueError, TypeError):
                return None
            if ms <= 0:
                return None

            # Update kart's most-recent + own-best per sector. Field-best
            # is computed on the fly in get_snapshot() / sectorMeta — cheap
            # for ~30 karts and avoids keeping two sources of truth.
            if sector_idx == 1:
                kart.current_s1_ms = ms
                if kart.best_s1_ms <= 0 or ms < kart.best_s1_ms:
                    kart.best_s1_ms = ms
            elif sector_idx == 2:
                kart.current_s2_ms = ms
                if kart.best_s2_ms <= 0 or ms < kart.best_s2_ms:
                    kart.best_s2_ms = ms
            elif sector_idx == 3:
                kart.current_s3_ms = ms
                if kart.best_s3_ms <= 0 or ms < kart.best_s3_ms:
                    kart.best_s3_ms = ms

            self.has_sectors = True

            # Tracking anchor: record the moment the kart crossed this
            # sensor so the frontend can interpolate its position from
            # the corresponding sector distance along the polyline.
            # Same interpolation rationale as the lap handler: Apex's
            # countdown_ms only updates every ~30 s.
            kart.last_sector_n = sector_idx
            kart.last_sector_countdown_ms = self._interpolated_countdown_ms()

            # Same as the lap event: include the freshly-updated anchor
            # so the Tracking renderer can re-pin the kart at the
            # sector's polyline position instead of carrying a stale
            # anchor from the previous full snapshot.
            return {"event": "sector", "rowId": row_id,
                    "kartNumber": kart.kart_number,
                    "sectorIdx": sector_idx,
                    "ms": ms,
                    "lastSectorN": kart.last_sector_n,
                    "lastSectorCountdownMs": kart.last_sector_countdown_ms}

        elif event.type == EventType.PIT_TIME and kart:
            kart.pit_time = event.value
            return {"event": "pitTime", "rowId": row_id, "value": event.value}

        elif event.type == EventType.PIT_COUNT and kart:
            try:
                kart.pit_count = int(event.value)
            except ValueError:
                pass
            return {"event": "pitCount", "rowId": row_id,
                    "value": kart.pit_count}

        elif event.type == EventType.DRIVER_TEAM and kart:
            kart.driver_name = event.value
            kart.driver_time = event.extra.get("time", "")
            return {"event": "driver", "rowId": row_id,
                    "driverName": kart.driver_name,
                    "driverTime": kart.driver_time}

        elif event.type == EventType.TEAM and kart:
            kart.team_name = event.value
            return {"event": "team", "rowId": row_id,
                    "teamName": kart.team_name}

        elif event.type == EventType.COUNTDOWN:
            self.countdown_ms = int(event.value)
            self._countdown_received_at = self._now_seconds()
            if not self.race_started:
                self._trigger_race_start(trigger="countdown")
            elif self._first_countdown_ms == 0 and self.countdown_ms > 0:
                # First real countdown arrived AFTER race was started by green
                # light. Auto-detect the true duration and fix stint starts.
                self._recalibrate_from_countdown()
            return {"event": "countdown", "ms": self.countdown_ms}

        elif event.type == EventType.COUNT_UP:
            # Convert count-up (elapsed ms) to countdown (remaining ms)
            # so all downstream calculations use a uniform decreasing value.
            elapsed_ms = int(event.value)
            race_duration_ms = self.duration_min * 60 * 1000
            self.countdown_ms = max(0, race_duration_ms - elapsed_ms)
            self._countdown_received_at = self._now_seconds()
            if not self.race_started:
                self._trigger_race_start(trigger="count_up")
            return {"event": "countdown", "ms": self.countdown_ms}

        elif event.type == EventType.LAP_COUNT:
            # Lap-based races: "X/Y" (current lap / total laps)
            parts = event.value.split("/")
            current_lap = int(parts[0])
            total_laps = int(parts[1])
            self.race_current_lap = current_lap
            self.race_total_laps = total_laps

            if not self.race_started:
                self._trigger_race_start(trigger="lap_count")

            # Simulate countdown using elapsed wall time so stint timers work
            if self.start_time > 0:
                wall_elapsed_ms = int((time.time() - self.start_time) * 1000)
                speed = getattr(self, '_replay_speed', 1.0)
                elapsed_ms = int(wall_elapsed_ms * speed)
                race_duration_ms = self.duration_min * 60 * 1000
                self.countdown_ms = max(0, race_duration_ms - elapsed_ms)

            return {"event": "countdown", "ms": self.countdown_ms,
                    "lapCount": current_lap, "totalLaps": total_laps}

        elif event.type == EventType.LIGHT:
            light = event.value  # "lg"=green, "lr"=red, "lf"=finish
            logger.info(f"Light signal: {light}")
            if light == "lg" and not self.race_started:
                # Green light is the earliest race start signal (before countdown in some circuits)
                self._trigger_race_start(trigger="green_light")
            elif light == "lf" and self.race_started:
                self._trigger_race_end()
                return {"event": "raceEnd", "countdownMs": 0}
            return {"event": "light", "value": light}

        elif event.type == EventType.CATEGORY:
            self.category = event.value
            logger.info(f"Category: {self.category}")
            return {"event": "category", "value": event.value}

        elif event.type == EventType.SESSION_TITLE:
            self.session_title = event.value
            logger.info(f"Session title: {self.session_title}")
            return {"event": "sessionTitle", "value": event.value}

        elif event.type == EventType.TRACK_INFO:
            self.track_name = event.value
            circuit_length = event.extra.get("circuit_length_m")
            if circuit_length and circuit_length > 0:
                old_length = self.circuit_length_m
                self.circuit_length_m = circuit_length
                if old_length != circuit_length:
                    logger.info(f"Circuit length auto-configured: {old_length}m -> {circuit_length}m")
            return {"event": "track", "name": event.value,
                    "circuitLengthM": self.circuit_length_m}

        elif event.type == EventType.PRE_RACE_DURATION:
            # Parse HH:MM:SS -> minutes
            parts = event.value.split(":")
            if len(parts) == 3:
                try:
                    hours = int(parts[0])
                    minutes = int(parts[1])
                    duration_min = hours * 60 + minutes
                    if duration_min > 0:
                        old_duration = self.duration_min
                        self.duration_min = duration_min
                        if old_duration != duration_min:
                            logger.info(f"Race duration auto-configured: {old_duration}min -> {duration_min}min")
                except ValueError:
                    pass
            return {"event": "preDuration", "value": event.value,
                    "durationMin": self.duration_min}

        elif event.type == EventType.STATUS and kart:
            if event.value in ("gs", "gf", "gm", "gl"):
                kart.visual_status = event.value
            elif event.value in ("su", "sd", "sf", "sr"):
                kart.arrow_status = event.value
            return {"event": "status", "rowId": row_id, "value": event.value}

        elif event.type == EventType.FLAG:
            flag = event.value  # "green", "chequered", "penalty"
            real_time = event.extra.get("real_time", "")
            if flag == "green" and real_time and not self.real_start_time:
                self.real_start_time = real_time
                logger.info(f"Real race start time recorded: {real_time}")
            logger.info(f"Flag received: {flag}" + (f" at {real_time}" if real_time else ""))
            result = {"event": "flag", "flag": flag}
            if real_time:
                result["realTime"] = real_time
            if event.extra.get("kart_number"):
                result["kartNumber"] = event.extra["kart_number"]
                result["reason"] = event.extra.get("reason", "")
            return result

        elif event.type == EventType.MESSAGE:
            if event.extra.get("subtype") == "track":
                self.track_name = event.value
                return {"event": "track", "name": event.value}
            return {"event": "message", "text": event.value}

        return None

    def _trigger_race_start(self, trigger: str = "countdown"):
        """Mark the race as started and initialize stint tracking for all karts.

        Called by COUNTDOWN, COUNT_UP, or LIGHT green — whichever arrives first.

        Duration detection strategy:
        - COUNTDOWN circuits (e.g. Eupen): The first countdown value IS the race
          duration (e.g. 1080053 ≈ 18min). Round up to the nearest minute for a
          clean reference. This auto-detects duration without user config.
        - COUNT_UP circuits (e.g. Campillos): The elapsed value grows from ~0.
          We can't know total duration yet, so use configured duration_min.
        - LIGHT green: No countdown received yet, use configured duration_min.
        """
        self.race_started = True
        self.race_finished = False
        self.start_time = time.time()

        if self.duration_min > 0:
            # Configured duration is the source of truth. Apex's first
            # countdown emit is reliably within ~1 s of the real
            # duration but can spill across a minute boundary
            # (e.g. 7,200,563 ms for a configured 2 h race, 1,080,053 ms
            # for an 18 min race). The legacy `math.ceil(... / 60000)`
            # over-rounded those cases by an entire minute, pinning
            # every first-stint kart's `stint_start_countdown_ms` one
            # minute ahead of the actual race clock — surfaced as
            # "STINT EN CURSO 00:01:00" the instant the race went
            # green. Trusting `duration_min` here pins the reference
            # at exactly the configured value and avoids that drift.
            race_start_ms = self.duration_min * 60 * 1000
        elif trigger == "countdown" and self.countdown_ms > 0:
            # No configured duration — fall back to auto-detect from
            # Apex's emit. `round()` (not `ceil()`) so a tick that
            # spills slightly OVER a minute boundary snaps DOWN to
            # the nearest minute instead of bumping up to the next.
            race_start_ms = round(self.countdown_ms / 60000) * 60000
            detected_min = race_start_ms // 60000
            logger.info(f"Auto-detected race duration from countdown: "
                        f"{self.countdown_ms}ms → {detected_min}min ({race_start_ms}ms)")
        else:
            # COUNT_UP / green light / lap_count without configured
            # duration: nothing reliable to derive from, leave at 0.
            race_start_ms = 0

        self._race_start_ms = race_start_ms

        # For lap-based races, set initial countdown to full duration
        if trigger == "lap_count":
            self.countdown_ms = race_start_ms
        # _first_countdown_ms tracks the ACTUAL first countdown value.
        # For green_light trigger, leave it at 0 so _recalibrate_from_countdown
        # fires when the real countdown arrives moments later.
        if trigger != "green_light":
            self._first_countdown_ms = race_start_ms

        for kart in self.karts.values():
            if kart.pit_count == 0:
                # First-stint karts: unconditionally pin stint_start to the
                # race start reference. The previous `if stint_start == 0`
                # guard left alone karts that were init'd during the pre-race
                # countdown (Apex often emits a `3:01:00`-ish countdown with
                # grid in formation before the real start). Those karts kept
                # a stint_start value HIGHER than race_start_ms, so
                # `stint_sec = stint_start - current_countdown` came out
                # inflated by the pre-race offset (~1 min for a 3h session
                # at Henakart). This propagated to STINT EN CURSO /
                # TIEMPO HASTA STINT MAXIMO / VUELTAS HASTA STINT MAXIMO
                # and the analogous DriverView + Box metrics. Pinning to
                # race_start_ms here mirrors what `_recalibrate_from_countdown`
                # already does for the green-light-before-countdown path.
                kart.stint_start_countdown_ms = race_start_ms
            elif kart.stint_start_countdown_ms == 0:
                # Kart has already pitted but is missing a stint_start
                # (typically a DB restore of a mid-race state). Seed with
                # the current countdown — the best approximation we have.
                kart.stint_start_countdown_ms = self.countdown_ms

        logger.info(f"Race started via {trigger}. countdown_ms={self.countdown_ms}, "
                    f"race_start_ms={race_start_ms}, duration_min={self.duration_min}, "
                    f"karts={len(self.karts)}")
        self._needs_snapshot = True

    def _recalibrate_from_countdown(self):
        """Re-detect race duration when first countdown arrives after green light.

        This handles circuits like Eupen where green light comes BEFORE the
        first countdown in the same init block.

        Strategy: when the strategist has configured `duration_min`, that
        value is the source of truth — Apex's first countdown emit is
        within ~1 s of the real duration but can spill over a minute
        boundary (e.g. 7,200,563 ms for a configured 2 h race), and the
        legacy `math.ceil(... / 60000)` over-rounded those cases by an
        entire minute. That left every first-stint kart's
        `stint_start_countdown_ms` one minute AHEAD of the actual race
        clock, producing a false "STINT EN CURSO 00:01:00" the instant
        the race went green. Only when no duration is configured do we
        fall back to round() auto-detect — round() (vs. ceil) handles
        both "slightly under" and "slightly over" minute boundaries
        symmetrically.
        """
        if self.duration_min > 0:
            detected_ms = self.duration_min * 60 * 1000
            source = "configured duration_min"
        else:
            detected_ms = round(self.countdown_ms / 60000) * 60000
            source = "auto-detect (round)"
        old_race_start = self._race_start_ms
        self._race_start_ms = detected_ms
        self._first_countdown_ms = detected_ms
        detected_min = detected_ms // 60000
        logger.info(f"Recalibrated race duration from {source}: "
                    f"countdown={self.countdown_ms}ms → "
                    f"{detected_min}min ({detected_ms}ms), was {old_race_start}ms")

        # Fix stint starts for all karts (they were set from the wrong value)
        for kart in self.karts.values():
            if kart.pit_count == 0:
                kart.stint_start_countdown_ms = detected_ms
        self._needs_snapshot = True

    def _trigger_race_end(self):
        """Mark race as finished via finish flag (light|lf|).

        Sets countdown to 0 so the frontend clock shows 00:00:00.
        Keeps race_started=True so UI stays visible with final standings.
        """
        logger.info(f"Race ended via finish flag (light|lf|). "
                    f"countdown_ms was {self.countdown_ms}, "
                    f"elapsed since start: {time.time() - self.start_time:.1f}s")
        self.countdown_ms = 0
        self.race_finished = True
        self._needs_snapshot = True

    def _compute_sector_meta(self, source: str = "best") -> dict:
        """Field-wide sector leaders (best + 2nd best per sector).

        source="best"  → rank by each kart's session-long PB
                          (`best_sN_ms`) over ALL karts. Unchanged
                          legacy behaviour; default arg keeps every
                          existing call site byte-identical.
        source="current" → rank by each kart's latest live pass
                          (`current_sN_ms`) over ON-TRACK karts only
                          (`pit_status != "in_pit"`). A kart parked in
                          the pits retains a stale-fast current value;
                          excluding it keeps the live-pace reference
                          meaningful.

        Returns {"s1": {...}|None, "s2": ..., "s3": ...}.
        """
        result: dict = {}
        for s in (1, 2, 3):
            attr = f"{source}_s{s}_ms"
            if source == "current":
                pool = [k for k in self.karts.values()
                        if k.pit_status != "in_pit"]
            else:
                pool = list(self.karts.values())
            ranked = sorted(
                ((getattr(k, attr), k) for k in pool
                 if getattr(k, attr) > 0),
                key=lambda pair: pair[0],
            )
            if not ranked:
                result[f"s{s}"] = None
                continue
            best_ms, leader = ranked[0]
            second_ms = ranked[1][0] if len(ranked) > 1 else None
            result[f"s{s}"] = {
                "bestMs": best_ms,
                "kartNumber": leader.kart_number,
                "driverName": leader.driver_name,
                "teamName": leader.team_name,
                "secondBestMs": second_ms,
            }
        return result

    def get_snapshot(self) -> dict:
        """Get full state snapshot for new client connections."""
        sorted_karts = sorted(self.karts.values(), key=lambda k: k.position or 999)
        return {
            "type": "snapshot",
            "data": {
                "raceStarted": self.race_started,
                "raceFinished": self.race_finished,
                "countdownMs": self.countdown_ms,
                "trackName": self.track_name,
                "karts": [k.to_dict() for k in sorted_karts],
                "fifo": {
                    "queue": self.fifo_queue,
                    "score": self.fifo_score,
                    "history": self.fifo_history[-10:],
                },
                "classification": self.classification,
                "classificationMeta": self.classification_meta,
                "hasSectors": self.has_sectors,
                "sectorMeta": self._compute_sector_meta() if self.has_sectors else None,
                "sectorMetaCurrent": self._compute_sector_meta(source="current") if self.has_sectors else None,
                "config": {
                    "circuitLengthM": self.circuit_length_m,
                    "pitTimeS": self.pit_time_s,
                    "ourKartNumber": self.our_kart_number,
                    "minPits": self.min_pits,
                    "maxStintMin": self.max_stint_min,
                    "minStintMin": self.min_stint_min,
                    "durationMin": self.duration_min,
                    "boxLines": self.box_lines,
                    "boxKarts": self.box_karts,
                    "minDriverTimeMin": self.min_driver_time_min,
                    "teamDriversCount": self.team_drivers_count,
                    "pitClosedStartMin": self.pit_closed_start_min,
                    "pitClosedEndMin": self.pit_closed_end_min,
                    "rain": self.rain_mode,
                    "finishLat1": self.finish_lat1,
                    "finishLon1": self.finish_lon1,
                    "finishLat2": self.finish_lat2,
                    "finishLon2": self.finish_lon2,
                },
                # Pit-gate decision computed server-side so every client
                # (web, iPad dashboard, iOS / Android driver apps) sees the
                # same open/close + reason + predicted-open-at countdown.
                "pitStatus": self._compute_pit_status_dict(),
                "durationMs": getattr(self, '_first_countdown_ms', 0) or self.duration_min * 60 * 1000,
                "raceCurrentLap": self.race_current_lap,
                "raceTotalLaps": self.race_total_laps,
            },
        }

    def _compute_pit_status_dict(self) -> dict:
        """Wrapper that calls into `app.engine.pit_gate.compute_pit_status`
        and returns the result as a plain dict ready for JSON serialization.

        Fail-safe on exception: returns `is_open=False` with a synthetic
        `compute_error` close reason. Previously this fell back to
        `is_open=True`, which is the wrong default — if the feasibility
        check crashes we'd rather the strategist see PIT CERRADO and
        ask "why?" than see PIT ABIERTO and trust an answer the engine
        wasn't able to compute. The result is intentionally indistinguishable
        from a normal close in the badge label, so a transient bug doesn't
        broadcast a misleading green badge to the live race screen.
        """
        try:
            from app.engine.pit_gate import compute_pit_status
            result = compute_pit_status(self)
            # Diagnostic log when the gate opens despite min_driver_time
            # constraints being on the table. Keeps the data we need to
            # reconstruct any future "should have been closed" report
            # without flooding the normal log volume — only fires when
            # someone has a chance of being affected.
            try:
                if (
                    result.is_open
                    and (getattr(self, "min_driver_time_min", 0) or 0) > 0
                    and result.drivers
                    and any(d.remaining_ms > 0 for d in result.drivers)
                ):
                    our_kart_n = getattr(self, "our_kart_number", 0) or 0
                    our_kart = next(
                        (k for k in self.karts.values() if k.kart_number == our_kart_n),
                        None,
                    )
                    pit_count = getattr(our_kart, "pit_count", -1) if our_kart else -1
                    pit_status_val = (
                        getattr(our_kart, "pit_status", "?") if our_kart else "?"
                    )
                    import logging
                    logging.getLogger(__name__).info(
                        "pit_gate OPEN with unmet driver_min: "
                        f"our_kart={our_kart_n} pit_count={pit_count} "
                        f"pit_status={pit_status_val} min_pits={self.min_pits} "
                        f"countdown_ms={self.countdown_ms} "
                        f"min_driver_time_min={self.min_driver_time_min} "
                        f"team_drivers_count={getattr(self, 'team_drivers_count', 0)} "
                        f"min_stint={self.min_stint_min} max_stint={self.max_stint_min} "
                        f"pit_time_s={self.pit_time_s} "
                        f"drivers=" + str([
                            f"{d.name!r}:acc={d.accumulated_ms}ms,rem={d.remaining_ms}ms"
                            for d in result.drivers
                        ])
                    )
            except Exception:
                pass  # never let logging itself crash the broadcast
            return result.to_dict()
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                "pit_gate compute failed — falling back to CLOSED (fail-safe)"
            )
            return {
                "is_open": False,
                "close_reason": "compute_error",
                "blocking_driver": None,
                "blocking_driver_remaining_ms": 0,
                "next_open_countdown_ms": None,
                "drivers": [],
            }

    async def _broadcast(self, message: dict):
        """Send message to all connected browser clients."""
        import json
        data = json.dumps(message)
        dead_clients = set()
        for client in self._ws_clients:
            try:
                await client.send_text(data)
            except Exception:
                dead_clients.add(client)
        for client in dead_clients:
            self._ws_clients.discard(client)
