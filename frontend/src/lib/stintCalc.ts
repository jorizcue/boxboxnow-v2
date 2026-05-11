/**
 * Shared stint-ceiling math used by Carrera (RaceTable), DriverView and Box
 * (FifoQueue). Encapsulates the "real max stint" concept — the effective
 * ceiling once you reserve time for pit stops that are still mandatory.
 *
 * Before consolidating this, each module had its own copy of the formula,
 * and Box was using a simpler "hard cap" variant that didn't account for
 * pending pits — the strategist saw different numbers depending on which
 * tab they were looking at. See `pending_issues.md` Issue #3.
 */

export interface StintConfig {
  maxStintMin: number;
  minStintMin: number;
  minPits: number;
  pitTimeS: number;
  /** Total race duration in minutes — only used as a fallback for karts
   * that don't yet have a stintStartCountdownMs. */
  durationMin: number;
}

export interface StintKart {
  stintStartCountdownMs: number;
  pitCount: number;
  avgLapMs: number;
  pitStatus?: string;
}

export interface StintMetrics {
  /** Elapsed seconds in the current stint (0 when race not running). */
  stintSec: number;
  /** Effective stint ceiling in seconds: min(configured max, availableAfterReservingFuturePits). */
  realMaxStintSec: number;
  /** Same, expressed in minutes. */
  realMaxStintMin: number;
  /** Seconds remaining until the real max is reached (clamped at 0). */
  timeToMaxStintSec: number;
  /** Laps remaining until the real max at current avg lap time. 0 when avgLapMs unknown. */
  lapsToMaxStint: number;
  /** Minimum stint minutes required before the pit window opens. */
  realMinStintMin: number;
  /**
   * True when the pit window is open (stint ≥ realMinStint), false when it's
   * still too early to pit, null when race isn't running / state is unknown.
   */
  pitWindowOpen: boolean | null;
}

/**
 * Compute all stint metrics for a single kart.
 *
 * Formulas (mirrored from the original inline implementations in
 * `components/race/RaceTable.tsx` and `components/driver/DriverView.tsx`):
 *
 *   stintSec                  = stintStartCountdownMs - raceClockMs (seconds)
 *   pendingPits               = max(0, minPits - pitCount)
 *   reservePerPitSec          = (pitTimeS + minStintMin*60) * pendingPits
 *   timeRemainingFromStart    = stintStartCountdownMs / 1000
 *   availableSec              = timeRemainingFromStart - reservePerPitSec
 *   realMaxStintSec           = min(maxStintMin*60, max(0, availableSec))
 *   timeToMaxStintSec         = max(0, realMaxStintSec - stintSec)
 *   lapsToMaxStint            = timeToMaxStintSec / (avgLapMs/1000)
 *   realMinStintMin           = max(minStintMin, timeRemainingFromStart/60 - reservePerPitMin)
 *
 * @param kart     the kart whose metrics we're computing (typically "our kart"
 *                 from the user's configured kart number). When undefined we
 *                 return a neutral fallback so callers don't need null-guards.
 * @param config   race-session config (pit/stint parameters + total duration).
 * @param raceClockMs   current value of the race countdown clock (ms remaining).
 * @param durationMs    total race duration (ms). Used as a fallback for karts
 *                      that haven't received a stintStartCountdownMs yet.
 * @param raceFinished  true when the race has ended — forces stintSec to 0 and
 *                      pitWindowOpen to null.
 */
export function computeStintMetrics(
  kart: StintKart | undefined,
  config: StintConfig,
  raceClockMs: number,
  durationMs: number,
  raceFinished: boolean,
): StintMetrics {
  const fallback: StintMetrics = {
    stintSec: 0,
    realMaxStintSec: config.maxStintMin * 60,
    realMaxStintMin: config.maxStintMin,
    timeToMaxStintSec: config.maxStintMin * 60,
    lapsToMaxStint: 0,
    realMinStintMin: config.minStintMin,
    pitWindowOpen: null,
  };
  if (!kart) return fallback;

  const running = raceClockMs > 0 && !raceFinished;
  const stintStart = kart.stintStartCountdownMs || durationMs || raceClockMs;
  const stintSec = running ? Math.max(0, stintStart - raceClockMs) / 1000 : 0;

  const timeRemainingFromStintStartSec = stintStart / 1000;
  const pendingPits = Math.max(0, config.minPits - kart.pitCount);
  // realMaxStint and realMinStint reserve different "budgets" for what
  // happens AFTER the current pit. The former asks "what's the maximum
  // I can extend this stint such that remaining stints can still be
  // ≥ minStint each?", so the reserve uses minStint. The latter asks
  // "what's the minimum I MUST run such that remaining stints don't
  // need to be > maxStint each?", so the reserve uses maxStint. Using
  // minStint in both (the previous bug) made realMinStint blow up to
  // values like 80+ minutes during early-race feasibility checks, which
  // didn't match the actual pit-open logic in StatusBar.tsx. Authoritative
  // source is now backend `pit_gate.py` but the local helper still has
  // to match for the legacy widget readouts ("realMinStint", driver-view
  // pitWindow card) that hadn't been ported yet.
  const reserveMinPerPitSec =
    pendingPits > 0 ? (config.pitTimeS + config.minStintMin * 60) * pendingPits : 0;
  const reserveMaxPerPitSec =
    pendingPits > 0 ? (config.pitTimeS + config.maxStintMin * 60) * pendingPits : 0;

  const availableSec = timeRemainingFromStintStartSec - reserveMinPerPitSec;
  const realMaxStintSec = Math.min(config.maxStintMin * 60, Math.max(0, availableSec));
  const realMaxStintMin = realMaxStintSec / 60;

  const timeToMaxStintSec = Math.max(0, realMaxStintSec - stintSec);
  const lapsToMaxStint =
    kart.avgLapMs > 0 ? timeToMaxStintSec / (kart.avgLapMs / 1000) : 0;

  const realMinStintMin = Math.max(
    config.minStintMin,
    timeRemainingFromStintStartSec / 60 - reserveMaxPerPitSec / 60,
  );

  const pitWindowOpen = running ? stintSec / 60 >= realMinStintMin : null;

  return {
    stintSec,
    realMaxStintSec,
    realMaxStintMin,
    timeToMaxStintSec,
    lapsToMaxStint,
    realMinStintMin,
    pitWindowOpen,
  };
}
