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
  // Pace estimate: prefer `lastLapMs` (the kart's most recent actual
  // lap) over the 20-lap rolling average. In an endurance race where
  // lap-to-lap variance is small (the strategist's empirical finding),
  // lastLap is the best single-number forecast for the lap in
  // progress — it reacts immediately to driver changes, rain, traffic,
  // etc., while `avgLapMs` lags behind by ~20 laps. We fall back to
  // `avgLapMs` only when no full lap has been recorded yet (cold
  // start) and bail out if we still don't have anything.
  const lapMs =
    kart.lastLapMs && kart.lastLapMs > 0
      ? kart.lastLapMs
      : (kart.avgLapMs && kart.avgLapMs > 0 ? kart.avgLapMs : 0);
  if (lapMs <= 0) {
    // No pace estimate — drop the kart on its last anchor without
    // moving forward. Better than not rendering at all.
    const anchor = pickAnchor(kart, cfg);
    return anchor ? anchor[1] : null;
  }

  const anchor = pickAnchor(kart, cfg);
  if (!anchor) return null;
  const [anchorCountdown, anchorDistance] = anchor;

  const elapsedMs = Math.max(0, anchorCountdown - countdownMs);
  const speedMps = total / lapMs;
  let traveled = elapsedMs * speedMps;

  // Safety cap at 99 % of the segment to the next reference (next
  // sector if placed, else META a vuelta entera). Esto es solo una
  // RED DE SEGURIDAD para casos patológicos:
  //   - Kart con `lastLapMs` claramente erróneo (boxes, trompo, primera
  //     vuelta lenta tras safety car…).
  //   - Eventos LAP que llegan con retraso anómalo de Apex.
  //
  // En operación normal, con varianza ±0.5 % típica de un piloto
  // consistente, el cap NUNCA se activa antes del evento LAP y el
  // kart llega de forma natural a META justo cuando llega el evento.
  // El cap del 95 % anterior era demasiado agresivo: se activaba con
  // ±5 % de error y dejaba al marker congelado los últimos segundos.
  const lastN = kart.lastSectorN ?? 0;
  const metaPos = cfg.metaDistanceM ?? 0;
  let nextDist: number;
  if (direction === "forward") {
    nextDist =
      lastN === 0 ? (cfg.s1DistanceM ?? cfg.s2DistanceM ?? cfg.s3DistanceM ?? metaPos)
      : lastN === 1 ? (cfg.s2DistanceM ?? cfg.s3DistanceM ?? metaPos)
      : lastN === 2 ? (cfg.s3DistanceM ?? metaPos)
      : metaPos;
  } else {
    nextDist =
      lastN === 0 ? (cfg.s3DistanceM ?? cfg.s2DistanceM ?? cfg.s1DistanceM ?? metaPos)
      : lastN === 3 ? (cfg.s2DistanceM ?? cfg.s1DistanceM ?? metaPos)
      : lastN === 2 ? (cfg.s1DistanceM ?? metaPos)
      : metaPos;
  }
  {
    const rawDelta = direction === "forward"
      ? (nextDist - anchorDistance)
      : (anchorDistance - nextDist);
    const wrapped = ((rawDelta % total) + total) % total;
    // If anchor and next coincide (lastN→META with anchor=META), the
    // wrapped delta is 0; treat it as a full lap to allow forward
    // motion until the next LAP event arrives.
    const segLen = wrapped === 0 ? total : wrapped;
    const cap = segLen * 0.99;
    if (traveled > cap) traveled = cap;
  }

  // Move along the polyline. In reversed direction the polyline-walk
  // distance DECREASES as the kart progresses.
  const sign = direction === "reversed" ? -1 : 1;
  let progress = anchorDistance + sign * traveled;
  progress = ((progress % total) + total) % total;
  return progress;
}

/**
 * Polyline-walk distance for the "if I pit NOW" ghost marker of our own
 * kart. It answers the strategist's question "where would I rejoin
 * relative to the field shown right now?": a static-field estimate that
 * drops our current track position back by the distance the field
 * advances during the configured pit time at our own pace.
 *
 *   offsetM = (pitTimeS / lapSeconds) · trackLengthM
 *   ghost   = currentProgress − offsetM   (in race direction)
 *
 * Because `computeKartProgressM` places the kart at
 * `anchor + sign·traveled`, shifting `traveled` by −offsetM is just
 * `currentProgress − sign·offsetM` (sign = +1 forward, −1 reversed).
 *
 * Returns null when not meaningful: no kart / in pit / no pace / no
 * pit time / no track length. The pace is clamped to a sane karting
 * lap range so a garbage out-lap can't yield an absurd offset. This is
 * an estimate (rivals assumed to hold pace, no SC/traffic/their pits).
 */
export function computePitGhostProgressM(
  kart: KartState,
  cfg: TrackConfig,
  countdownMs: number,
  direction: "forward" | "reversed",
  pitTimeS: number,
): number | null {
  const total = cfg.trackLengthM ?? 0;
  if (total <= 0 || !pitTimeS || pitTimeS <= 0) return null;
  if (isKartInPit(kart)) return null;

  const current = computeKartProgressM(kart, cfg, countdownMs, direction);
  if (current == null) return null;

  let lapMs =
    kart.lastLapMs && kart.lastLapMs > 0
      ? kart.lastLapMs
      : kart.avgLapMs && kart.avgLapMs > 0
        ? kart.avgLapMs
        : 0;
  if (lapMs <= 0) return null;
  // Clamp to a plausible kart lap (20s–10min) so a bad out-lap or a
  // stale 0.x value doesn't produce a nonsensical offset.
  lapMs = Math.min(600_000, Math.max(20_000, lapMs));

  const offsetM = (pitTimeS * 1000 / lapMs) * total;
  const sign = direction === "reversed" ? -1 : 1;
  const ghost = current - sign * offsetM;
  return ((ghost % total) + total) % total;
}
