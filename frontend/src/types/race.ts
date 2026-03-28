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
  tierScore: number;
  avgLapMs: number;
  bestAvgMs: number;
  driverDifferentialMs: number;
}

export interface FifoState {
  queue: number[];
  score: number;
  history: FifoSnapshot[];
}

export interface FifoSnapshot {
  timestamp: number;
  queue: number[];
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
}

export interface RaceSnapshot {
  raceStarted: boolean;
  countdownMs: number;
  trackName: string;
  karts: KartState[];
  fifo: FifoState;
  classification: ClassificationEntry[];
  config: RaceConfig;
}

export interface WsUpdateEvent {
  event: string;
  rowId?: string;
  kartNumber?: number;
  [key: string]: unknown;
}

export interface WsMessage {
  type: "snapshot" | "update" | "analytics";
  data?: RaceSnapshot;
  events?: WsUpdateEvent[];
}

export interface ReplayStatus {
  active: boolean;
  filename: string | null;
  progress: number;
  speed: number;
  paused: boolean;
}
