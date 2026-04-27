// Pure helpers for the GPS Insights module. No React, no DOM.

import type { GpsLapDetail } from "./types";

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !isFinite(meters)) return "-";
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export function formatLapTime(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms) || ms <= 0) return "-";
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  return `${min}:${sec.toFixed(3).padStart(6, "0")}`;
}

export function formatDelta(ms: number): string {
  const sign = ms < 0 ? "" : "+";
  return `${sign}${(ms / 1000).toFixed(3)}s`;
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

/** Sample at a given cumulative distance from a parallel-array trace.
 * Linear interpolation between samples. Returns null when out of range. */
export function sampleAtDist(distances: number[], values: number[], target: number): number | null {
  const n = Math.min(distances.length, values.length);
  if (n < 2) return null;
  if (target <= distances[0]) return values[0];
  if (target >= distances[n - 1]) return values[n - 1];
  // Binary search
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (distances[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(0, lo - 1);
  const j = Math.min(lo, n - 1);
  if (i === j || distances[j] === distances[i]) return values[i];
  const frac = (target - distances[i]) / (distances[j] - distances[i]);
  return values[i] + frac * (values[j] - values[i]);
}

/** Compute the time-at-distance curve for a lap. Used by the delta and
 * microsector comparison logic. Returns ms since start at each sample's
 * cumulative distance. */
export function cumulativeTimeMs(detail: GpsLapDetail): { dist: number; tMs: number }[] {
  const ts = detail.timestamps ?? [];
  const ds = detail.distances ?? [];
  const n = Math.min(ts.length, ds.length);
  const out: { dist: number; tMs: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ dist: ds[i], tMs: ts[i] * 1000 });
  return out;
}

/** Linear interpolation in a (sorted-by-dist) [dist, value] curve. */
export function interpolateAtDist(
  curve: { dist: number; tMs: number }[],
  targetDist: number,
): number | null {
  if (curve.length === 0) return null;
  if (targetDist <= curve[0].dist) return curve[0].tMs;
  if (targetDist >= curve[curve.length - 1].dist) return curve[curve.length - 1].tMs;
  let lo = 0;
  let hi = curve.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (curve[mid].dist < targetDist) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(0, lo - 1);
  const j = Math.min(lo, curve.length - 1);
  if (i === j || curve[j].dist === curve[i].dist) return curve[i].tMs;
  const frac = (targetDist - curve[i].dist) / (curve[j].dist - curve[i].dist);
  return curve[i].tMs + frac * (curve[j].tMs - curve[i].tMs);
}

/** Default microsector count for lap subdivision. 20 sectors on a 1000m
 * circuit gives 50m sectors — short enough to localize a mistake to a
 * single corner exit, long enough to be statistically meaningful at 25Hz. */
export const MICROSECTOR_COUNT = 20;

export interface MicrosectorTime {
  index: number;
  startDist: number;
  endDist: number;
  durationMs: number;
}

/** Split a lap into N equal-distance microsectors and return time per sector. */
export function microsectorTimes(detail: GpsLapDetail, count = MICROSECTOR_COUNT): MicrosectorTime[] {
  const curve = cumulativeTimeMs(detail);
  if (curve.length < 2) return [];
  const totalDist = curve[curve.length - 1].dist;
  if (totalDist <= 0) return [];
  const step = totalDist / count;
  const out: MicrosectorTime[] = [];
  let prevTime = 0;
  for (let i = 0; i < count; i++) {
    const startDist = i * step;
    const endDist = (i + 1) * step;
    const tEnd = interpolateAtDist(curve, endDist) ?? 0;
    const tStart = i === 0 ? 0 : prevTime;
    out.push({
      index: i,
      startDist,
      endDist,
      durationMs: Math.max(0, tEnd - tStart),
    });
    prevTime = tEnd;
  }
  return out;
}

/**
 * Estimate longitudinal acceleration (m/s²) from a speed array using a
 * centered finite difference. Used to colour map segments brake/accel even
 * when raw gforce_lon is too noisy. Result has same length as input.
 */
export function speedToAccelMps2(speedsKmh: number[], timestamps: number[]): number[] {
  const n = Math.min(speedsKmh.length, timestamps.length);
  const out = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const dt = timestamps[i + 1] - timestamps[i - 1];
    if (dt <= 0) continue;
    const dvMs = ((speedsKmh[i + 1] - speedsKmh[i - 1]) * 1000) / 3600;
    out[i] = dvMs / dt;
  }
  return out;
}

/** Smooth a numeric array with a centered moving average of size `window`. */
export function smooth(arr: number[], window = 5): number[] {
  if (window <= 1) return arr.slice();
  const half = Math.floor(window / 2);
  const out = new Array<number>(arr.length).fill(0);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let count = 0;
    for (let k = i - half; k <= i + half; k++) {
      if (k >= 0 && k < arr.length) {
        sum += arr[k];
        count++;
      }
    }
    out[i] = count > 0 ? sum / count : arr[i];
  }
  return out;
}

/** Detect local minima of speed (apexes). Returns indices into the speed
 * array. A point counts as an apex when:
 *   - it's lower than its neighbours within ±lookahead
 *   - speed is below `maxApexKmh` (skip straights)
 *   - distance to the previous apex is at least `minSepM` meters */
export function detectApexes(
  speeds: number[],
  distances: number[],
  opts: { lookahead?: number; maxApexKmh?: number; minSepM?: number } = {},
): number[] {
  const lookahead = opts.lookahead ?? 8;
  const maxApex = opts.maxApexKmh ?? 60;
  const minSep = opts.minSepM ?? 30;
  const sm = smooth(speeds, 5);
  const out: number[] = [];
  let lastDist = -Infinity;
  for (let i = lookahead; i < sm.length - lookahead; i++) {
    if (sm[i] > maxApex) continue;
    let isMin = true;
    for (let k = 1; k <= lookahead; k++) {
      if (sm[i - k] < sm[i] || sm[i + k] < sm[i]) { isMin = false; break; }
    }
    if (!isMin) continue;
    if (distances[i] - lastDist < minSep) continue;
    out.push(i);
    lastDist = distances[i];
  }
  return out;
}

/** Binary-search for the sample index in `distances` closest to `target`.
 * Returns the index with the minimum absolute distance difference.
 * Useful for snapping a hover position to the nearest GPS sample. */
export function indexAtDist(distances: number[], target: number): number {
  const n = distances.length;
  if (n === 0) return 0;
  if (target <= distances[0]) return 0;
  if (target >= distances[n - 1]) return n - 1;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (distances[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(distances[lo - 1] - target) < Math.abs(distances[lo] - target)) return lo - 1;
  return lo;
}

/** Velocity-bucket histogram. Returns counts per bucket. */
export function speedHistogram(speeds: number[], bucketKmh = 10, maxKmh?: number): number[] {
  const top = maxKmh ?? Math.ceil(Math.max(...speeds, 0) / bucketKmh) * bucketKmh;
  const buckets = Math.max(1, Math.ceil(top / bucketKmh));
  const out = new Array<number>(buckets).fill(0);
  for (const s of speeds) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor(s / bucketKmh)));
    out[idx]++;
  }
  return out;
}

/** Build a GPX 1.1 string from a lap detail. */
export function lapToGpx(detail: GpsLapDetail, lapLabel: string): string {
  const ts = detail.timestamps ?? [];
  const pos = detail.positions ?? [];
  const sp = detail.speeds ?? [];
  const baseDate = detail.recorded_at ? new Date(detail.recorded_at) : new Date();
  const baseTime = baseDate.getTime();
  const n = Math.min(ts.length, pos.length);
  const trkpts: string[] = [];
  for (let i = 0; i < n; i++) {
    const time = new Date(baseTime + ts[i] * 1000).toISOString();
    const speed = sp[i] != null ? (sp[i] / 3.6).toFixed(3) : "0";
    trkpts.push(
      `<trkpt lat="${pos[i].lat.toFixed(7)}" lon="${pos[i].lon.toFixed(7)}">` +
        `<time>${time}</time>` +
        `<extensions><speed>${speed}</speed></extensions>` +
        `</trkpt>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BoxBoxNow" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${lapLabel}</name>
    <trkseg>
      ${trkpts.join("\n      ")}
    </trkseg>
  </trk>
</gpx>`;
}

/** Build a CSV from a lap detail (one row per sample). */
export function lapToCsv(detail: GpsLapDetail): string {
  const ts = detail.timestamps ?? [];
  const ds = detail.distances ?? [];
  const pos = detail.positions ?? [];
  const sp = detail.speeds ?? [];
  const gx = detail.gforce_lat ?? [];
  const gy = detail.gforce_lon ?? [];
  const n = Math.max(ts.length, ds.length, pos.length, sp.length);
  const rows: string[] = ["time_s,distance_m,lat,lon,speed_kmh,gforce_lat,gforce_lon"];
  for (let i = 0; i < n; i++) {
    rows.push(
      [
        ts[i]?.toFixed(3) ?? "",
        ds[i]?.toFixed(2) ?? "",
        pos[i]?.lat?.toFixed(7) ?? "",
        pos[i]?.lon?.toFixed(7) ?? "",
        sp[i]?.toFixed(2) ?? "",
        gx[i]?.toFixed(3) ?? "",
        gy[i]?.toFixed(3) ?? "",
      ].join(","),
    );
  }
  return rows.join("\n");
}

/** Trigger a browser download of an in-memory blob. */
export function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
