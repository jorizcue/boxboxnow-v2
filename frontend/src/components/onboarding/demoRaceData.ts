/**
 * Fictional demo race state for the onboarding tour.
 *
 * A first-run user has no live session, so the real Carrera / Box
 * screens would be empty. During the tour we seed the zustand race
 * store with THIS data and render the real `RaceTable` / `FifoQueue`
 * components — so the walkthrough is pixel-identical to a live race
 * while using entirely invented teams/drivers (no real customer data).
 *
 * Numbers are chosen so the tour can point at concrete states:
 *  - our kart (#7) mid-stint (~24 min) → green STINT card,
 *  - 3 karts in the [maxStint-5, maxStint) band → amber STINT cells,
 *  - 1 kart over max stint → red-pulse cell, so KARTS CERCA DE PIT > 3,
 *  - 2 karts in pit (greyed rows),
 *  - tierScore spanning all five badge colours,
 *  - a 2-lane box queue incl. one "frozen" kart (>15 min in box → snow),
 *  - an 8-row pit-entry history.
 */
import type {
  KartState,
  FifoEntry,
  FifoSnapshot,
  RaceConfig,
  PitStatus,
} from "@/types/race";

const DURATION_MIN = 180;
const DURATION_MS = DURATION_MIN * 60_000; // 10_800_000
const COUNTDOWN_MS = 95 * 60_000; //  remaining → ~85 min elapsed
const RACE_ELAPSED_MS = DURATION_MS - COUNTDOWN_MS; // 5_100_000
const OUR_KART = 7;
const MAX_STINT_MIN = 35;
const MIN_STINT_MIN = 12;

/** stintStartCountdownMs for a kart whose current stint lasts ~minutes. */
function stintStart(minutes: number): number {
  return COUNTDOWN_MS + Math.round(minutes * 60_000);
}

const TEAMS = [
  "Halcones Racing", "Escudería Relámpago", "Team Nebulosa", "Lobos GP",
  "Cobra Motorsport", "Vértice Racing", "Team Cierzo", "Aurora Karting",
  "Delta Pista", "Brújula Race", "Team Quásar", "Pulsar Speed",
  "Equipo Mistral", "Tritón Racing", "Volcán GP", "Team Solsticio",
  "Ráfaga Motorsport", "Team Helios", "Cénit Racing", "Galerna GP",
  "Team Bóreas", "Estela Racing", "Ígneo Motorsport", "Team Austral",
  "Meridiano GP", "Team Vórtice", "Caudal Racing", "Ámbar Speed",
  "Team Perseo", "Zafiro Racing",
];
const DRIVERS = [
  "Mario Quiñones", "Lucas Verdejo", "Iván Carmona", "Hugo Salcedo",
  "Bruno Padilla", "Adrián Becerra", "Pablo Mansilla", "Diego Arén",
  "Marcos Tejedor", "Aitor Villena", "Nacho Robledo", "Saúl Maroto",
  "Gael Bermúdez", "Unai Lozano", "Iker Pelayo", "Álex Cifuentes",
  "Rubén Calatayud", "Dani Esteve", "Sergio Bonilla", "Mateo Aranda",
  "Pau Gallardo", "Nico Vidal", "Hugo Lorente", "Teo Manrique",
  "Leo Bastida", "Asier Pinto", "Jon Carbajo", "Eric Salas",
  "Biel Català", "Izan Prado",
];

function mkKart(i: number, over: Partial<KartState>): KartState {
  const n = i + 1;
  const base: KartState = {
    rowId: `demo-${n}`,
    kartNumber: n,
    teamName: TEAMS[i % TEAMS.length],
    driverName: DRIVERS[i % DRIVERS.length],
    driverTime: "",
    position: n,
    totalLaps: 0,
    lastLapMs: 0,
    bestLapMs: 0,
    gap: "",
    interval: "",
    pitCount: 0,
    pitStatus: "racing",
    pitTime: "",
    visualStatus: "",
    arrowStatus: "",
    stintLapsCount: 0,
    stintDurationS: 0,
    stintStartTime: 0,
    stintElapsedMs: 0,
    stintStartCountdownMs: stintStart(18),
    pitHistory: [],
    driverTotalMs: {},
    driverAvgLapMs: {},
    tierScore: 50,
    avgLapMs: 0,
    bestAvgMs: 0,
    bestStintLapMs: 0,
    driverDifferentialMs: 0,
    recentLaps: [],
    lapTimesMissing: 0,
  };
  return { ...base, ...over };
}

// tierScore values to surface all five badge colours (≥100,≥75,≥50,≥25,<25).
const TIERS = [100, 100, 88, 82, 76, 70, 64, 58, 52, 50, 48, 44, 40, 36,
  33, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 100, 75, 50, 25];

// Minutes-into-current-stint per kart index. Most mid-stint; a cluster
// near/over max so the table shows amber + red-pulse STINT cells and
// KARTS CERCA DE PIT > 3. Indices 6 = our kart (#7).
const STINT_MIN: Record<number, number> = {
  6: 24, 0: 31, 3: 32, 9: 34, 12: 37,
};

export interface DemoRaceState {
  raceStarted: boolean;
  raceFinished: boolean;
  countdownMs: number;
  trackName: string;
  durationMs: number;
  karts: KartState[];
  fifo: { queue: FifoEntry[]; score: number; history: FifoSnapshot[] };
  classification: [];
  classificationMeta: null;
  config: RaceConfig;
  pitStatus: PitStatus;
  connected: boolean;
}

export function buildDemoRaceState(): DemoRaceState {
  const karts: KartState[] = [];
  for (let i = 0; i < 30; i++) {
    const avg = 54_800 + i * 270; // ~1:04.8 → ~1:12.6 spread
    const stintMin = STINT_MIN[i] ?? 14 + ((i * 7) % 11);
    const inPit = i === 17 || i === 23; // two karts serving a stop
    const k = mkKart(i, {
      kartNumber: i + 1,
      position: i + 1,
      avgLapMs: avg,
      bestAvgMs: avg - 380,
      lastLapMs: avg + ((i % 5) - 2) * 90,
      bestLapMs: avg - 520,
      bestStintLapMs: avg - 520,
      totalLaps: 88 - i,
      pitCount: i % 4,
      tierScore: TIERS[i],
      stintLapsCount: Math.max(1, Math.round((stintMin * 60) / (avg / 1000))),
      stintStartCountdownMs: stintStart(stintMin),
      pitStatus: inPit ? "in_pit" : "racing",
    });
    karts.push(k);
  }

  // Box-queue karts: give a few a pit history so the Box tab shows the
  // "time since last box" badge; one OLD enough to trip the >15-min
  // frozen/snow state, the rest recent (not frozen).
  const setPit = (kartNumber: number, minsAgo: number) => {
    const k = karts[kartNumber - 1];
    if (!k) return;
    k.pitHistory = [
      {
        pitNumber: 1,
        lap: 26,
        raceTimeMs: RACE_ELAPSED_MS - minsAgo * 60_000,
        onTrackMs: 24 * 60_000,
        driverName: k.driverName,
        totalDriverMs: 48 * 60_000,
        pitTimeMs: 120_000,
        stintLaps: 24,
      },
    ];
  };
  setPit(12, 17); // > 15 min → frozen + snow + ~17:00 badge
  setPit(4, 5);
  setPit(9, 3);
  setPit(21, 8);

  const fe = (
    kartNumber: number,
    score: number,
    line: number,
  ): FifoEntry => ({
    kartNumber,
    score,
    teamName: kartNumber ? TEAMS[(kartNumber - 1) % TEAMS.length] : "",
    driverName: kartNumber ? DRIVERS[(kartNumber - 1) % DRIVERS.length] : "",
    line,
    pitCount: 1,
    stintLaps: 24,
  });

  // Live queue: real karts (kartNumber>0) interleaved with empty boxes
  // (kartNumber 0) so two lanes render like the screenshot.
  const queue: FifoEntry[] = [
    fe(12, 25, 0), fe(4, 75, 0), fe(9, 1, 1), fe(21, 50, 1),
    fe(2, 100, 0), fe(18, 25, 1),
    fe(0, 25, 0), fe(0, 25, 1), fe(0, 25, 0), fe(0, 25, 1),
    fe(0, 25, 0), fe(0, 25, 1), fe(0, 25, 0), fe(0, 25, 1),
  ];

  // Pit-entry history: 8 snapshots, growing queues, low box scores
  // (realistic early-race churn) — colours the chips red/orange.
  const nowSec = Math.floor(Date.now() / 1000);
  const history: FifoSnapshot[] = [];
  for (let h = 0; h < 8; h++) {
    const len = 2 + h; // 2 → 9 entries
    const q: FifoEntry[] = [];
    for (let j = 0; j < len; j++) {
      const kn = j < 4 ? [12, 4, 9, 21][j] : 0;
      q.push(fe(kn, kn ? [25, 75, 1, 50][j] : 25, j % 2));
    }
    history.push({
      timestamp: nowSec - (8 - h) * 240,
      queue: q,
      score: 19 + h * 0.7,
    });
  }

  const config: RaceConfig = {
    circuitLengthM: 1100,
    pitTimeS: 120,
    ourKartNumber: OUR_KART,
    minPits: 4,
    maxStintMin: MAX_STINT_MIN,
    minStintMin: MIN_STINT_MIN,
    durationMin: DURATION_MIN,
    boxLines: 2,
    boxKarts: 30,
    minDriverTimeMin: 25,
    teamDriversCount: 4,
    pitClosedStartMin: 0,
    pitClosedEndMin: 0,
    rain: false,
    finishLat1: null,
    finishLon1: null,
    finishLat2: null,
    finishLon2: null,
  };

  const pitStatus: PitStatus = {
    isOpen: false,
    closeReason: "stint_too_short",
    blockingDriver: null,
    blockingDriverRemainingMs: 0,
    nextOpenCountdownMs: 6 * 60_000,
    drivers: [],
  };

  return {
    raceStarted: true,
    raceFinished: false,
    countdownMs: COUNTDOWN_MS,
    trackName: "Karting Demo Circuit",
    durationMs: DURATION_MS,
    karts,
    fifo: { queue, score: 21.5, history },
    classification: [],
    classificationMeta: null,
    config,
    pitStatus,
    connected: true,
  };
}
