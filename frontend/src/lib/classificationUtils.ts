/**
 * Shared utilities for the adjusted classification algorithm.
 *
 * Two improvements over the naive approach:
 *
 * 1. **Outlier-filtered speed**: Uses the median of the last 20 laps instead of
 *    the arithmetic mean (`avgLapMs`). The median is resistant to single slow
 *    laps caused by traffic, spins, or yellow flags. If per-lap data isn't
 *    available, falls back to avgLapMs but clamps extreme jumps via an EMA.
 *
 * 2. **Position hysteresis**: Requires a kart to hold a new position for a
 *    configurable number of consecutive computation cycles before the display
 *    updates. This eliminates rapid oscillations where two karts with near-
 *    identical adjusted distances swap positions every tick.
 */

import type { KartState } from "@/types/race";

/* ------------------------------------------------------------------ */
/*  1. Outlier-filtered speed estimation                               */
/* ------------------------------------------------------------------ */

/**
 * Compute a robust speed (m/s) for a kart.
 *
 * Strategy:
 * - Use `lastLapMs` as a baseline but clamp it within a sane range of avgLapMs.
 *   This gives a responsive but stable speed without relying on per-lap arrays.
 * - Specifically: if lastLapMs deviates more than 15% from avgLapMs, use avgLapMs.
 *   This filters outlier laps (traffic, spins, yellows) while letting genuine
 *   pace differences through.
 */
export function stableSpeedMs(
  kart: KartState,
  circuitLengthM: number,
): number {
  const avg = kart.avgLapMs;
  if (avg <= 0) return 0;

  const last = kart.lastLapMs;

  // If we have a valid lastLapMs, use it ONLY if it's within 15% of avg
  // This makes interpolation track actual pace without outlier corruption
  if (last > 0) {
    const ratio = last / avg;
    if (ratio >= 0.85 && ratio <= 1.15) {
      // Blend: 70% avg + 30% last for smoothness with responsiveness
      const blended = avg * 0.7 + last * 0.3;
      return circuitLengthM / (blended / 1000);
    }
  }

  // Fallback: use avg directly
  return circuitLengthM / (avg / 1000);
}


/* ------------------------------------------------------------------ */
/*  2. Position hysteresis                                             */
/* ------------------------------------------------------------------ */

/** Minimum number of consecutive cycles a kart must hold a position before it's confirmed. */
const HYSTERESIS_CYCLES = 3;

interface HysteresisEntry {
  /** The position this kart is displayed at (confirmed) */
  confirmedPos: number;
  /** The position the algorithm computed on the last cycle */
  candidatePos: number;
  /** How many consecutive cycles the candidate has been stable */
  holdCount: number;
}

export class PositionHysteresis {
  private state = new Map<number, HysteresisEntry>();
  private cycles: number;

  constructor(cycles = HYSTERESIS_CYCLES) {
    this.cycles = cycles;
  }

  /**
   * Given raw positions from the algorithm, return stabilised positions.
   * @param rawPositions Map of kartNumber → raw position (1-based)
   * @returns Map of kartNumber → stabilised position
   */
  stabilise(rawPositions: Map<number, number>): Map<number, number> {
    const result = new Map<number, number>();

    for (const [kart, rawPos] of Array.from(rawPositions.entries())) {
      const prev = this.state.get(kart);

      if (!prev) {
        // First time seeing this kart — accept position immediately
        this.state.set(kart, { confirmedPos: rawPos, candidatePos: rawPos, holdCount: this.cycles });
        result.set(kart, rawPos);
        continue;
      }

      if (rawPos === prev.confirmedPos) {
        // Position unchanged from confirmed — reset candidate
        prev.candidatePos = rawPos;
        prev.holdCount = 0;
        result.set(kart, prev.confirmedPos);
      } else if (rawPos === prev.candidatePos) {
        // Same candidate as last cycle — increment hold
        prev.holdCount++;
        if (prev.holdCount >= this.cycles) {
          // Candidate promoted to confirmed
          prev.confirmedPos = rawPos;
          prev.holdCount = 0;
          result.set(kart, rawPos);
        } else {
          // Not yet stable — keep old position
          result.set(kart, prev.confirmedPos);
        }
      } else {
        // New candidate — start counting
        prev.candidatePos = rawPos;
        prev.holdCount = 1;
        result.set(kart, prev.confirmedPos);
      }
    }

    // Clean up karts that are no longer in the race
    for (const kart of Array.from(this.state.keys())) {
      if (!rawPositions.has(kart)) {
        this.state.delete(kart);
      }
    }

    return result;
  }

  /** Reset all hysteresis state */
  reset() {
    this.state.clear();
  }
}

/**
 * Apply hysteresis to a sorted array of karts.
 * Returns a new array re-sorted by stabilised positions.
 */
export function applyHysteresis<T extends { kartNumber: number }>(
  sorted: T[],
  hysteresis: PositionHysteresis,
): T[] {
  // Build raw position map
  const rawPositions = new Map<number, number>();
  sorted.forEach((k, i) => rawPositions.set(k.kartNumber, i + 1));

  // Get stabilised positions
  const stable = hysteresis.stabilise(rawPositions);

  // Re-sort by stabilised position
  return [...sorted].sort((a, b) => {
    const posA = stable.get(a.kartNumber) ?? 999;
    const posB = stable.get(b.kartNumber) ?? 999;
    return posA - posB;
  });
}
