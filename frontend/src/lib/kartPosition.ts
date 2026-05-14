/**
 * Compute a kart's current position along the circuit polyline.
 *
 * Inputs are the anchor timestamps the backend exposes
 * (`lastLapCompleteCountdownMs`, `lastSectorN`, `lastSectorCountdownMs`)
 * plus the kart's `avgLapMs` for pace estimation, the current race
 * countdown, and the circuit track config (polyline + sector
 * distances + race direction).
 *
 * Output is a distance in METERS from the meta line, measured along
 * the polyline in the forward direction. The caller (`KartMarker`)
 * resolves the distance to a lat/lon via `pointAtDistance` and renders.
 *
 * Returns null when we don't have enough data to estimate (no avg
 * lap, no sector crossings, no track config). The caller skips
 * rendering the marker in that case.
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
 *  the kart has reported. Returns `[anchorCountdownMs, anchorDistanceM]`
 *  in forward-distance terms. */
function pickAnchor(
  kart: KartState,
  cfg: TrackConfig,
): [number, number] | null {
  const total = cfg.trackLengthM ?? 0;
  if (total <= 0) return null;

  const lastLap = kart.lastLapCompleteCountdownMs ?? 0;
  const lastSecN = kart.lastSectorN ?? 0;
  const lastSec = kart.lastSectorCountdownMs ?? 0;

  // No data at all.
  if (!lastLap && !lastSec) return null;

  // Sector anchor wins when it's more recent (= smaller countdown ms,
  // since countdown decreases). Maps the sector number to its distance
  // from meta in forward direction.
  if (lastSecN > 0 && lastSec > 0 && lastSec < lastLap) {
    const dist =
      lastSecN === 1 ? (cfg.s1DistanceM ?? null)
      : lastSecN === 2 ? (cfg.s2DistanceM ?? null)
      : lastSecN === 3 ? (cfg.s3DistanceM ?? null)
      : null;
    if (dist != null) return [lastSec, dist];
  }

  // Fall back to the lap-complete anchor. Anchor distance = META
  // position on the polyline. Usually 0 (polyline[0] = META) but the
  // operator can move META elsewhere via the editor — in that case
  // we still want the kart to render AT META right after a LAP event,
  // not at polyline[0].
  if (lastLap > 0) return [lastLap, cfg.metaDistanceM || 0];
  return null;
}

/**
 * Compute kart progress in meters from meta (forward direction).
 * `countdownMs` is the current race countdown (decreasing while race
 * runs).
 *
 * Cap the result at the next anchor distance so we don't overshoot a
 * sensor that hasn't fired yet (Apex delays). When the next event
 * arrives, the anchor jumps forward and the kart "snaps" — that's a
 * small visual artifact but better than the marker running ahead.
 */
export function computeKartProgressM(
  kart: KartState,
  cfg: TrackConfig,
  countdownMs: number,
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

  // Elapsed since the anchor in ms (countdown decreases as time passes).
  const elapsedMs = Math.max(0, anchorCountdown - countdownMs);

  // Speed estimate: total track / avg lap. m/ms.
  const speedMps = total / kart.avgLapMs;

  let progress = anchorDistance + elapsedMs * speedMps;

  // Cap at the NEXT known reference so we don't run past a sensor we
  // haven't crossed yet. The order is meta → S1 → S2 → S3 → meta.
  const lastN = kart.lastSectorN ?? 0;
  const nextDist =
    lastN === 0 ? (cfg.s1DistanceM ?? null)         // just crossed meta, next = S1
    : lastN === 1 ? (cfg.s2DistanceM ?? null)
    : lastN === 2 ? (cfg.s3DistanceM ?? null)
    : lastN === 3 ? total                            // after S3 the next reference is the meta loop-back
    : null;
  if (nextDist != null && nextDist > anchorDistance) {
    // Leave a tiny buffer so the marker doesn't sit ON the sensor
    // (looks weird with the cap glow); 95 % of segment is fine.
    const cap = anchorDistance + (nextDist - anchorDistance) * 0.95;
    if (progress > cap) progress = cap;
  }

  // Wrap around — if we did somehow overshoot total length (e.g. no
  // sector data and avg lap is wrong), modulo back into [0, total).
  progress = ((progress % total) + total) % total;
  return progress;
}
