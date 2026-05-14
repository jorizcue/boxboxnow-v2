/**
 * Polyline geometry helpers for the Tracking module.
 *
 * Mirrors backend `app/engine/polyline_geometry.py`. The frontend needs
 * its own copy because the kart position interpolation runs on the
 * client (every 100 ms with the live countdown) — sending coordinates
 * for every kart over WS at that cadence would be wasteful when the
 * backend already broadcasts the anchor timestamps.
 */

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance between two lat/lon points, in meters. */
export function haversineM(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const toRad = Math.PI / 180;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const dphi = (lat2 - lat1) * toRad;
  const dlmb = (lon2 - lon1) * toRad;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlmb / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Cumulative distance at each vertex of a polyline.
 *  When `closed`, the returned array has length+1 entries and the last
 *  one is the perimeter (includes the closing segment). */
export function cumulativeDistances(
  polyline: [number, number][],
  closed: boolean = false,
): number[] {
  if (polyline.length < 2) return polyline.map(() => 0);
  const out: number[] = [0];
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1];
    const b = polyline[i];
    out.push(out[out.length - 1] + haversineM(a[0], a[1], b[0], b[1]));
  }
  if (closed) {
    const a = polyline[polyline.length - 1];
    const b = polyline[0];
    out.push(out[out.length - 1] + haversineM(a[0], a[1], b[0], b[1]));
  }
  return out;
}

export function totalLengthM(polyline: [number, number][], closed: boolean = false): number {
  if (polyline.length < 2) return 0;
  const d = cumulativeDistances(polyline, closed);
  return d[d.length - 1];
}

/** Resolve a distance-along-polyline to a (lat, lon) point.
 *  For `closed` loops, distance wraps modulo the perimeter so callers
 *  can pass any non-negative number. */
export function pointAtDistance(
  polyline: [number, number][],
  distanceM: number,
  closed: boolean = false,
): [number, number] {
  if (polyline.length === 0) return [0, 0];
  if (polyline.length === 1) return polyline[0];

  const total = totalLengthM(polyline, closed);
  if (total <= 0) return polyline[0];

  let d = closed ? ((distanceM % total) + total) % total : Math.max(0, Math.min(distanceM, total));

  let cum = 0;
  const n = polyline.length;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const a = polyline[i];
    const b = polyline[(i + 1) % n];
    const seg = haversineM(a[0], a[1], b[0], b[1]);
    if (seg <= 0) continue;
    if (cum + seg >= d) {
      const t = (d - cum) / seg;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    cum += seg;
  }
  return closed ? polyline[0] : polyline[n - 1];
}

/** Find the closest point on the polyline to a given (lat, lon).
 *  Returns `[distanceAlong_m, snappedPoint]`. Used by the admin
 *  editor to translate a click on the map into a sensor distance. */
export function snapToPolyline(
  polyline: [number, number][],
  point: [number, number],
  closed: boolean = false,
): [number, [number, number]] {
  if (polyline.length < 2) return [0, polyline[0] ?? point];

  const n = polyline.length;
  const segments = closed ? n : n - 1;
  let cum = 0;
  let best: { perp2: number; along: number; snapped: [number, number] } | null = null;

  for (let i = 0; i < segments; i++) {
    const a = polyline[i];
    const b = polyline[(i + 1) % n];
    const segLen = haversineM(a[0], a[1], b[0], b[1]);
    if (segLen <= 0) continue;
    // Local planar projection.
    const lonScale = Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180);
    const ax = a[1] * lonScale, ay = a[0];
    const bx = b[1] * lonScale, by = b[0];
    const px = point[1] * lonScale, py = point[0];
    const dx = bx - ax, dy = by - ay;
    const denom = dx * dx + dy * dy;
    let t = 0;
    if (denom > 0) {
      t = ((px - ax) * dx + (py - ay) * dy) / denom;
      t = Math.max(0, Math.min(1, t));
    }
    const snapped: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const sx = ax + dx * t, sy = ay + dy * t;
    const perp2 = (sx - px) ** 2 + (sy - py) ** 2;
    const along = cum + segLen * t;
    if (best === null || perp2 < best.perp2) {
      best = { perp2, along, snapped };
    }
    cum += segLen;
  }

  return best ? [best.along, best.snapped] : [0, polyline[0]];
}

/** Translate a progress value into "forward distance from meta".
 *  Mirrors `effective_distance_forward` in the backend. */
export function effectiveDistanceForward(
  progressM: number,
  direction: "forward" | "reversed",
  totalM: number,
): number {
  if (totalM <= 0) return 0;
  if (direction === "reversed") {
    return ((totalM - progressM) % totalM + totalM) % totalM;
  }
  return ((progressM % totalM) + totalM) % totalM;
}
