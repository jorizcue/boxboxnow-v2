/**
 * Compute a kart's current position along the circuit polyline.
 *
 * Inputs are the anchor timestamps the backend exposes
 * (`lastLapCompleteCountdownMs`, `lastSectorN`, `lastSectorCountdownMs`)
 * plus the kart's `avgLapMs` for pace estimation, the current race
 * countdown, the circuit track config, and the EFFECTIVE race
 * direction (TrackingTab's runtime override or the stored default).
 *
 * Returns a polyline-walk distance from polyline[0]: the same
 * coordinate system the editor saves sensors in. The caller resolves
 * it to a lat/lon via `pointAtDistance(polyline, progress, true)`
 * directly — no further direction transformation needed.
 *
 * Returns null when we don't have enough data to estimate (no avg
 * lap, no sector/lap crossing, no track config). The caller skips
 * rendering the marker in that case.
 *
 * Design note (2026-05-14): the previous version returned "forward
 * distance from META assuming meta=0", and the caller mirrored it for
 * reversed direction via `effectiveDistanceForward`. That hack only
 * worked when META happened to coincide with polyline[0]; on
 * circuits where the operator moved META (e.g. Ariza's
 * meta_distance_m = 619 m on a 707 m polyline) the kart marker
 * rendered at the OPPOSITE side of the polyline from META at every
 * lap crossing. Now everything is in polyline-walk space and
 * direction is handled here.
 */
import type { KartState, TrackConfig } from "@/types/race";

/** A kart is "in pit" if its pitStatus is "in_pit". The map renders
 *  these on the pit_lane_polyline at pit_box_distance_m instead of on
 *  the main track polyline. The helper here is just for the call site
 *  to branch cleanly. */
export function isKartInPit(kart: Pick<KartState, "pitStatus">): boolean {
  return kart.pitStatus === "in_pit";
}

/** Pick the most accurate anchor (lap completion vs sector crossing)
 *  the kart has reported. Returns `[anchorCountdownMs, anchorPolylineDistanceM]`.
 *  Both distances are in the polyline-walk coordinate system. */
function pickAnchor(
  kart: KartState,
  cfg: TrackConfig,
): [number, number] | null {
  const total = cfg.trackLengthM ?? 0;
  if (total <= 0) return null;

  const lastLap = kart.lastLapCompleteCountdownMs ?? 0;
  const lastSecN = kart.lastSectorN ?? 0;
  const lastSec = kart.lastSectorCountdownMs ?? 0;

  const sectorDist =
    lastSecN === 1 ? (cfg.s1DistanceM ?? null)
    : lastSecN === 2 ? (cfg.s2DistanceM ?? null)
    : lastSecN === 3 ? (cfg.s3DistanceM ?? null)
    : null;
  const hasSector = lastSecN > 0 && lastSec > 0 && sectorDist != null;
  const hasLap = lastLap > 0;

  if (!hasSector && !hasLap) return null;
  if (!hasLap) return [lastSec, sectorDist as number];
  if (!hasSector) return [lastLap, cfg.metaDistanceM || 0];
  // Both present, pick the more recent (smaller countdown_ms = more
  // recent, since countdown decreases as time passes).
  return lastSec < lastLap
    ? [lastSec, sectorDist as number]
    : [lastLap, cfg.metaDistanceM || 0];
}

/**
 * Compute kart progress as a polyline-walk distance from polyline[0]
 * (modulo `trackLengthM`).
 *
 *   - `countdownMs` — current race countdown (decreasing while race runs).
 *   - `direction`   — effective race direction. "forward" means the kart
 *                     moves in polyline-index order; "reversed" means it
 *                     moves the opposite way and `progress` decreases as
 *                     time passes (mod wrap).
 *
 * Caps `traveled` at 95 % of the segment to the next sensor in race
 * direction so the marker doesn't visually overshoot a sensor whose
 * event hasn't arrived yet due to Apex delays. When the event lands
 * the anchor flips forward and the kart "snaps" — the CSS transition
 * on `.tracking-kart-icon` (220 ms) smooths the snap.
 */
export function computeKartProgressM(
  kart: KartState,
  cfg: TrackConfig,
  countdownMs: number,
  direction: "forward" | "reversed" = "forward",
): number | null {
  const total = cfg.trackLengthM ?? 0;
  if (total <= 0) return null;
  if (!kart.avgLapMs || kart.avgLapMs <= 0) {
    // No pace estimate — drop the kart on its last anchor without
    // moving forward. Better than not rendering at all.
    const anchor = pickAnchor(kart, cfg);
    return anchor ? anchor[1] : null;
  }

  const anchor = pickAnchor(kart, cfg);
  if (!anchor) return null;
  const [anchorCountdown, anchorDistance] = anchor;

  const elapsedMs = Math.max(0, anchorCountdown - countdownMs);
  const speedMps = total / kart.avgLapMs;
  let traveled = elapsedMs * speedMps;

  // Cap at the next sensor IN RACE DIRECTION. The cap segment depends
  // on the lap order in this direction:
  //   - Forward:  META → S1 → S2 → S3 → META
  //   - Reversed: META → S3 → S2 → S1 → META
  const lastN = kart.lastSectorN ?? 0;
  let nextDist: number | null = null;
  if (direction === "forward") {
    nextDist =
      lastN === 0 ? (cfg.s1DistanceM ?? null)
      : lastN === 1 ? (cfg.s2DistanceM ?? null)
      : lastN === 2 ? (cfg.s3DistanceM ?? null)
      : lastN === 3 ? (cfg.metaDistanceM ?? 0)
      : null;
  } else {
    nextDist =
      lastN === 0 ? (cfg.s3DistanceM ?? null)
      : lastN === 3 ? (cfg.s2DistanceM ?? null)
      : lastN === 2 ? (cfg.s1DistanceM ?? null)
      : lastN === 1 ? (cfg.metaDistanceM ?? 0)
      : null;
  }
  if (nextDist != null) {
    // Race-direction distance from anchor to next sensor, with wrap.
    const rawDelta = direction === "forward"
      ? (nextDist - anchorDistance)
      : (anchorDistance - nextDist);
    const segLen = ((rawDelta % total) + total) % total;
    if (segLen > 0) {
      const cap = segLen * 0.95;
      if (traveled > cap) traveled = cap;
    }
  }

  // Move along the polyline. In reversed direction the polyline-walk
  // distance DECREASES as the kart progresses.
  const sign = direction === "reversed" ? -1 : 1;
  let progress = anchorDistance + sign * traveled;
  progress = ((progress % total) + total) % total;
  return progress;
}
