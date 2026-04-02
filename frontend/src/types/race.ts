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
  stintLapsCount: number;
  stintDurationS: number;
  stintStartTime: number;  // epoch seconds
  stintElapsedMs: number;  // accumulated lap time in stint (ms)
  stintStartCountdownMs: number;  // race clock (ms) when stint started
  pitHistory: PitRecord[];
  driverTotalMs: Record<string, number>;
  driverAvgLapMs: Record<string, number>;
  tierScore: number;
  avgLapMs: number;
  bestAvgMs: number;
  driverDifferentialMs: number;
  recentLaps: { lapTime: number; totalLap: number; driverName: string }[];
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
  gap: string;
  interval: string;
  avgLapMs: number;
  tierScore: number;
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
  pitClosedStartMin: number;
  pitClosedEndMin: number;
  rain: boolean;
}

export interface RaceSnapshot {
  raceStarted: boolean;
  raceFinished?: boolean;
  countdownMs: number;
  trackName: string;
  karts: KartState[];
  fifo: FifoState;
  classification: ClassificationEntry[];
  config: RaceConfig;
  durationMs: number;
}

export interface WsUpdateEvent {
  event: string;
  rowId?: string;
  kartNumber?: number;
  [key: string]: unknown;
}

export interface WsMessage {
  type: "snapshot" | "update" | "analytics" | "fifo_update" | "replay_status" | "teams_updated";
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
