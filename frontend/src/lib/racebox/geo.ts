/**
 * Lightweight geo utilities for GPS lap tracking.
 * Uses flat-earth approximation (accurate enough for circuits < 5km).
 */

export interface GeoPoint {
  lat: number;
  lon: number;
}

const DEG_TO_M_LAT = 111_320; // meters per degree latitude

function degToMeterLon(lat: number): number {
  return DEG_TO_M_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Flat-earth distance in meters between two GPS points. */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const dx = (b.lat - a.lat) * DEG_TO_M_LAT;
  const dy = (b.lon - a.lon) * degToMeterLon((a.lat + b.lat) / 2);
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Check if segment (a1->a2) crosses segment (b1->b2).
 * Returns the interpolation fraction along a1->a2 [0..1], or null if no crossing.
 */
export function segmentCrossingFraction(
  a1: GeoPoint, a2: GeoPoint,
  b1: GeoPoint, b2: GeoPoint,
): number | null {
  // Convert to local meters from a1
  const mLon = degToMeterLon((a1.lat + b1.lat) / 2);

  const ax1 = 0, ay1 = 0;
  const ax2 = (a2.lat - a1.lat) * DEG_TO_M_LAT;
  const ay2 = (a2.lon - a1.lon) * mLon;
  const bx1 = (b1.lat - a1.lat) * DEG_TO_M_LAT;
  const by1 = (b1.lon - a1.lon) * mLon;
  const bx2 = (b2.lat - a1.lat) * DEG_TO_M_LAT;
  const by2 = (b2.lon - a1.lon) * mLon;

  const dx = ax2 - ax1;
  const dy = ay2 - ay1;
  const ex = bx2 - bx1;
  const ey = by2 - by1;

  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-10) return null; // parallel

  const t = ((bx1 - ax1) * ey - (by1 - ay1) * ex) / denom;
  const u = ((bx1 - ax1) * dy - (by1 - ay1) * dx) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}
