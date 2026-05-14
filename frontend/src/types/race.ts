export interface PitRecord {
  pitNumber: number;
  lap: number;
  raceTimeMs: number;     // Race elapsed time at pit-in
  onTrackMs: number;      // Stint duration (time on track)
  driverName: string;
  totalDriverMs: number;  // Cumulative on-track time for this driver
  pitTimeMs: number;      // Time spent in pit (0 = still in pit / last pit)
  stintLaps: number;
}

export interface KartState {
  rowId: string;
  kartNumber: number;
  teamName: string;
  driverName: string;
  driverTime: string;
  position: number;
  totalLaps: number;
  lastLapMs: number;
  bestLapMs: number;
  gap: string;
  interval: string;
  pitCount: number;
  pitStatus: "racing" | "in_pit";
  pitTime: string;
  visualStatus: string;
  arrowStatus: string;
  // Number of laps Apex's `tlp` counter is ahead of our recorded count.
  // > 0 means the WebSocket dropped some `c7` events: we know the kart
  // completed N laps but only have N-lapTimesMissing actual times. The
  // `totalLaps` field already shows max(our_count, apex_count) so the
  // display is correct; this field tells the UI to show a small warning.
  lapTimesMissing?: number;
  stintLapsCount: number;
  stintDurationS: number;
  stintStartTime: number;  // epoch seconds
  stintElapsedMs: number;  // accumulated lap time in stint (ms)
  stintStartCountdownMs: number;  // race clock (ms) when stint started
  pitInCountdownMs?: number;     // race clock (ms) when pit entry occurred
  pitHistory: PitRecord[];
  driverTotalMs: Record<string, number>;
  driverAvgLapMs: Record<string, number>;
  tierScore: number;
  avgLapMs: number;
  bestAvgMs: number;
  bestStintLapMs: number;
  driverDifferentialMs: number;
  recentLaps: { lapTime: number; totalLap: number; driverName: string }[];
  // Sector times — only populated on circuits whose Apex grid declares
  // `s1|s2|s3` data-type columns. The "1/2/3" in the field names is
  // the SECTOR index, not the column index — backend resolves the
  // cN→sector mapping per-circuit from the live grid header.
  // `currentSNMs` is the latest sector time we've received for this
  // kart (drives the live "Δ vs field-best" indicator). `bestSNMs`
  // is the kart's session-long PB per sector, used for the
  // theoretical-best-lap card.
  currentS1Ms?: number;
  currentS2Ms?: number;
  currentS3Ms?: number;
  bestS1Ms?: number;
  bestS2Ms?: number;
  bestS3Ms?: number;
  // Tracking anchors — countdown_ms snapshots used by the live
  // tracking map to interpolate where this kart sits along the
  // circuit polyline. `lastSectorN` is 0 (just crossed meta) or 1-3
  // (last sensor crossed).
  lastLapCompleteCountdownMs?: number;
  lastSectorN?: number;
  lastSectorCountdownMs?: number;
}

// Tracking module — circuit geometry served by /api/tracking/circuits/{id}/track-config
// and the admin-side editor.
export interface TrackConfig {
  trackPolyline: [number, number][] | null;  // closed loop [[lat, lon], ...]
  trackLengthM: number | null;
  s1DistanceM: number | null;
  s2DistanceM: number | null;
  s3DistanceM: number | null;
  // Pit-in / pit-out: lat/lon libres (los `*DistanceM` quedan por
  // compat con configs anteriores; el renderer prefiere lat/lon
  // cuando están presentes).
  pitEntryDistanceM: number | null;
  pitExitDistanceM: number | null;
  pitEntryLat: number | null;
  pitEntryLon: number | null;
  pitExitLat: number | null;
  pitExitLon: number | null;
  pitLanePolyline: [number, number][] | null;  // open path pit-in → boxes → pit-out
  pitLaneLengthM: number | null;
  pitBoxDistanceM: number | null;
  // Distancia (m) desde polyline[0] hasta META. 0 = META coincide
  // con el primer vértice. La interpolación de kart usa este valor
  // como ancla en cada LAP event.
  metaDistanceM: number;
  defaultDirection: "forward" | "reversed";
}

export interface SectorBest {
  bestMs: number;
  kartNumber: number;
  driverName?: string;
  teamName?: string;
  /** Runner-up's session-long PB. Used only when the local pilot IS the
   * field-best holder, so the driver-view card can display their margin
   * over the chaser instead of always 0.00s. */
  secondBestMs?: number | null;
}

export interface SectorMeta {
  s1: SectorBest | null;
  s2: SectorBest | null;
  s3: SectorBest | null;
}

export interface FifoEntry {
  score: number;
  kartNumber: number;
  teamName: string;
  driverName: string;
  avgLapMs?: number;
  avgPosition?: number;
  recentLaps?: { lapTime: number; totalLap: number; driverName: string }[];
  pitCount?: number;
  stintLaps?: number;
  line?: number;  // Assigned pit line (stable across queue shifts)
}

export interface FifoState {
  queue: FifoEntry[];
  score: number;
  history: FifoSnapshot[];
}

export interface FifoSnapshot {
  timestamp: number;
  queue: FifoEntry[];
  score: number;
}

export interface ClassificationEntry {
  position: number;
  kartNumber: number;
  teamName: string;
  driverName: string;
  totalLaps: number;
  pitCount: number;
  pitStatus: "racing" | "in_pit";
  pitsRemaining: number;     // Pits aún por hacer (incluye el actual si está en pit)
  gapS: number;              // Segundos al líder (positivo)
  intervalS: number;         // Segundos al kart inmediatamente delante
  gapM: number;              // Metros equivalentes (con velocidad mediana de campo)
  intervalM: number;         // Metros equivalentes al kart delante
  trackTimeS: number;        // Tiempo en pista acumulado (debug/info)
  adjProgressS: number;      // Progreso ajustado: trackTime - pitDebt
  avgLapMs: number;
  tierScore: number;
}

export interface ClassificationMeta {
  minPits: number;             // Pits obligatorios (de config)
  pitTimeRefS: number;         // Mediana del campo de pits ya completados
  medianFieldSpeedMs: number;  // Velocidad mediana del campo (m/s)
  raceTimeS: number;           // Tiempo de carrera transcurrido (s)
}

export interface RaceConfig {
  circuitLengthM: number;
  pitTimeS: number;
  ourKartNumber: number;
  minPits: number;
  maxStintMin: number;
  minStintMin: number;
  durationMin: number;
  boxLines: number;
  boxKarts: number;
  minDriverTimeMin: number;
  /** Configured number of drivers in the team. When > 0 the pit gate
   *  enforces driver-min-time feasibility from lap 1; when 0 it falls
   *  back to the count observed in `kart.driverTotalMs` (Apex-discovered
   *  drivers). Strategists set this in the SessionConfig form. */
  teamDriversCount?: number;
  pitClosedStartMin: number;
  pitClosedEndMin: number;
  rain: boolean;
  finishLat1?: number | null;
  finishLon1?: number | null;
  finishLat2?: number | null;
  finishLon2?: number | null;
}

/** Backend-computed pit-gate decision. Surfaced on every snapshot,
 *  analytics frame and fifo_update so every client (web, iPad
 *  dashboard, iOS / Android driver apps) renders the same badge.
 *
 *  Replaces the old "compute locally from realMinStint" approach. The
 *  feasibility check in `app/engine/pit_gate.py` considers regulation
 *  windows, stint bounds AND the minimum per-driver time — the latter
 *  is the new constraint that was missing before. */
export interface PitStatus {
  isOpen: boolean;
  /** One of:
   *    "regulation_start" | "regulation_end"
   *    "stint_too_short"  (pit would force future stints > max — too early)
   *    "stint_too_long"   (we've overrun — pit URGENT)
   *    "driver_min_time"  (some driver wouldn't reach min)
   *    "no_active_kart"   (no our_kart configured)
   *    "not_running"      (race not started / already finished)
   *    null               (gate is open)
   */
  closeReason:
    | "regulation_start"
    | "regulation_end"
    | "stint_too_short"
    | "stint_too_long"
    | "driver_min_time"
    | "no_active_kart"
    | "not_running"
    | null;
  /** Name of the driver who's blocking the gate (closeReason ==
   *  "driver_min_time"). Drives the badge subtitle. */
  blockingDriver?: string | null;
  blockingDriverRemainingMs?: number;
  /** Predicted countdown value at which the gate will open next.
   *  null when the gate is already open or no feasible future moment
   *  was found within 1 h of horizon. Drives the "Pit abre en
   *  HH:MM:SS" card in the Box tab. */
  nextOpenCountdownMs?: number | null;
  /** Per-driver detail surfaced for the tooltip / detail row. */
  drivers?: { name: string; accumulatedMs: number; remainingMs: number }[];
}

export interface RaceSnapshot {
  raceStarted: boolean;
  raceFinished?: boolean;
  countdownMs: number;
  trackName: string;
  karts: KartState[];
  fifo: FifoState;
  classification: ClassificationEntry[];
  classificationMeta?: ClassificationMeta;
  config: RaceConfig;
  durationMs: number;
  // Sector telemetry — present only when the active session's Apex
  // grid declares `s1|s2|s3` columns. `hasSectors` flips to true the
  // first time a sector event is processed by the backend, gating
  // the sector-related driver cards. `sectorMeta` carries the
  // field-wide leader per sector + the runner-up's bestMs.
  hasSectors?: boolean;
  sectorMeta?: SectorMeta | null;
}

export interface WsUpdateEvent {
  event: string;
  rowId?: string;
  kartNumber?: number;
  [key: string]: unknown;
}

export interface WsMessage {
  type: "snapshot" | "update" | "analytics" | "fifo_update" | "replay_status" | "teams_updated" | "box_call" | "classification_update";
  data?: RaceSnapshot & { teams?: any[]; fifo?: FifoState };
  events?: WsUpdateEvent[];
}

export interface ReplayStatus {
  active: boolean;
  filename: string | null;
  progress: number;
  speed: number;
  paused: boolean;
}
