"use client";

// Live GPS marker overlay synced to the replay clock. Loads every GPS
// telemetry lap that finished within the replay's time window for the
// configured circuit/kart, then animates a marker on the satellite map
// at the position recorded at the current replay moment.
//
// All sample lookups are O(log n) per tick (binary search on the sorted
// distances array), so a stint of 30 laps × 2000 samples doesn't slow
// the UI even at 10 Hz tick rate.

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";

interface GpsLapDetail {
  id: number;
  circuit_id: number | null;
  kart_number: number | null;
  lap_number: number;
  duration_ms: number;
  total_distance_m: number;
  recorded_at: string | null;
  distances: number[] | null;
  timestamps: number[] | null;        // seconds, relative to lap start
  positions: { lat: number; lon: number }[] | null;
  speeds: number[] | null;
  gforce_lat: number[] | null;
  gforce_lon: number[] | null;
}

interface PreparedLap {
  id: number;
  lapNumber: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  positions: { lat: number; lon: number }[];
  speeds: number[];
  timestamps: number[];      // seconds since lap start
  distances: number[];
  gforceLon: number[];
}

interface Props {
  circuitId: number;
  kartNumber?: number | null;
  windowStart: string;          // ISO
  windowEnd: string;            // ISO
  replayClockMs: number;        // 0 when idle
  height?: number;
}

async function loadLeaflet() {
  const L = (await import("leaflet")).default;
  return L;
}

/** Find the lap whose [startMs, endMs] window contains `t`. Linear scan
 * is fine — typical stints have <50 laps. */
function findActiveLap(laps: PreparedLap[], t: number): PreparedLap | null {
  for (const lap of laps) {
    if (t >= lap.startMs && t <= lap.endMs) return lap;
  }
  return null;
}

/** Binary search the timestamps array for `relativeSec` and linearly
 * interpolate the indexed value (or position). */
function findSampleIndex(timestamps: number[], relativeSec: number): { i: number; frac: number } {
  if (timestamps.length === 0) return { i: 0, frac: 0 };
  if (relativeSec <= timestamps[0]) return { i: 0, frac: 0 };
  if (relativeSec >= timestamps[timestamps.length - 1]) return { i: timestamps.length - 1, frac: 0 };
  let lo = 0;
  let hi = timestamps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timestamps[mid] < relativeSec) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(0, lo - 1);
  const j = Math.min(lo, timestamps.length - 1);
  if (i === j || timestamps[j] === timestamps[i]) return { i, frac: 0 };
  const frac = (relativeSec - timestamps[i]) / (timestamps[j] - timestamps[i]);
  return { i, frac };
}

/** Centered finite difference for longitudinal acceleration in m/s². */
function speedToAccel(speeds: number[], timestamps: number[], i: number): number {
  const n = Math.min(speeds.length, timestamps.length);
  if (n < 3 || i < 1 || i >= n - 1) return 0;
  const dt = timestamps[i + 1] - timestamps[i - 1];
  if (dt <= 0) return 0;
  const dvMs = ((speeds[i + 1] - speeds[i - 1]) * 1000) / 3600;
  return dvMs / dt;
}

function accelColor(accel: number): string {
  if (accel > 1.5) return "rgb(40, 220, 70)";   // accelerating
  if (accel < -1.5) return "rgb(240, 60, 60)";  // braking
  return "rgba(220, 220, 230, 0.85)";
}

export function ReplayGpsMap({
  circuitId,
  kartNumber,
  windowStart,
  windowEnd,
  replayClockMs,
  height = 360,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const traceLayerRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const trailRef = useRef<unknown>(null);

  const [laps, setLaps] = useState<GpsLapDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<{ lap: number; speed: number; accel: number } | null>(null);

  // Fetch GPS laps for the replay window once per (circuit, kart, window) change
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setLaps([]);
      try {
        const data = (await api.getGpsLapsWindow({
          circuit_id: circuitId,
          kart_number: kartNumber ?? undefined,
          start: windowStart,
          end: windowEnd,
        })) as GpsLapDetail[];
        if (!cancelled) setLaps(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error cargando GPS");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (circuitId && windowStart && windowEnd) load();
    return () => { cancelled = true; };
  }, [circuitId, kartNumber, windowStart, windowEnd]);

  // Pre-compute per-lap data with absolute time ranges (recorded_at is
  // the upload time = end of lap, so start = end - duration).
  const prepared = useMemo<PreparedLap[]>(() => {
    return laps
      .filter((l) => l.positions && l.timestamps && l.positions.length === l.timestamps.length && l.positions.length > 1)
      .map((l) => {
        const endMs = l.recorded_at ? new Date(l.recorded_at).getTime() : 0;
        const startMs = endMs - l.duration_ms;
        return {
          id: l.id,
          lapNumber: l.lap_number,
          startMs,
          endMs,
          durationMs: l.duration_ms,
          positions: l.positions ?? [],
          speeds: l.speeds ?? [],
          timestamps: l.timestamps ?? [],
          distances: l.distances ?? [],
          gforceLon: l.gforce_lon ?? [],
        };
      })
      .sort((a, b) => a.startMs - b.startMs);
  }, [laps]);

  // Init the Leaflet map and draw the static trace once `prepared` is ready
  useEffect(() => {
    if (!containerRef.current || prepared.length === 0) return;
    let cancelled = false;
    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !containerRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Lany = L as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let map: any = mapRef.current;
      if (!map) {
        map = Lany.map(containerRef.current, {
          zoomControl: true,
          attributionControl: false,
          preferCanvas: true,
        });
        Lany.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 22, attribution: "Tiles © Esri" },
        ).addTo(map);
        mapRef.current = map;
      }

      // Replace the static trace + marker
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (traceLayerRef.current) map.removeLayer(traceLayerRef.current as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (trailRef.current)      map.removeLayer(trailRef.current as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (markerRef.current)     map.removeLayer(markerRef.current as any);

      const traceGroup = Lany.layerGroup();
      const allPts: [number, number][] = [];
      for (const lap of prepared) {
        const segPts = lap.positions.map((p) => [p.lat, p.lon]) as [number, number][];
        allPts.push(...segPts);
        Lany.polyline(segPts, {
          color: "rgba(255,255,255,0.30)",
          weight: 2,
          opacity: 0.7,
        }).addTo(traceGroup);
      }
      traceGroup.addTo(map);
      traceLayerRef.current = traceGroup;

      // Marker that follows the replay clock
      const start = prepared[0].positions[0];
      const marker = Lany.circleMarker([start.lat, start.lon], {
        radius: 7,
        color: "#fde047",
        weight: 2,
        fillColor: "#facc15",
        fillOpacity: 0.95,
      }).addTo(map);
      markerRef.current = marker;

      // Trail polyline (last few seconds of marker history) — short and
      // dynamic, redrawn on every animation tick.
      const trail = Lany.polyline([], {
        color: "rgba(250,204,21,0.8)",
        weight: 4,
        opacity: 0.9,
      }).addTo(map);
      trailRef.current = trail;

      // Fit bounds to the full circuit trace
      if (allPts.length >= 2) {
        const bounds = Lany.latLngBounds(allPts);
        map.fitBounds(bounds, { padding: [30, 30] });
      }
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => { cancelled = true; };
  }, [prepared]);

  // Animate the marker on every replay clock tick
  useEffect(() => {
    if (replayClockMs <= 0 || prepared.length === 0) {
      if (markerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (markerRef.current as any).setStyle?.({ opacity: 0.4, fillOpacity: 0.4 });
      }
      setHud(null);
      return;
    }
    const lap = findActiveLap(prepared, replayClockMs);
    if (!lap) {
      if (markerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (markerRef.current as any).setStyle?.({ opacity: 0.3, fillOpacity: 0.3 });
      }
      setHud(null);
      return;
    }
    const relSec = (replayClockMs - lap.startMs) / 1000;
    const { i, frac } = findSampleIndex(lap.timestamps, relSec);
    const j = Math.min(i + 1, lap.positions.length - 1);
    const lat = lap.positions[i].lat + frac * (lap.positions[j].lat - lap.positions[i].lat);
    const lon = lap.positions[i].lon + frac * (lap.positions[j].lon - lap.positions[i].lon);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marker = markerRef.current as any;
    if (marker) {
      marker.setLatLng([lat, lon]);
      marker.setStyle({ opacity: 1, fillOpacity: 0.95 });
    }

    // Build a 3-second trail behind the marker
    const trailWindow = 3.0;
    const trailFromSec = Math.max(0, relSec - trailWindow);
    const start = findSampleIndex(lap.timestamps, trailFromSec).i;
    const trailPts = lap.positions.slice(start, i + 1).map((p) => [p.lat, p.lon]) as [number, number][];
    trailPts.push([lat, lon]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trail = trailRef.current as any;
    if (trail) trail.setLatLngs(trailPts);

    // HUD: speed + accel at the active sample
    const speed = lap.speeds[i] ?? 0;
    const accel = speedToAccel(lap.speeds, lap.timestamps, i);
    setHud({ lap: lap.lapNumber, speed, accel });

    // Marker tint by accel state
    if (marker) {
      marker.setStyle({ color: accelColor(accel), fillColor: accelColor(accel) });
    }
  }, [replayClockMs, prepared]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = mapRef.current as any;
      if (map) {
        map.remove();
        mapRef.current = null;
        traceLayerRef.current = null;
        markerRef.current = null;
        trailRef.current = null;
      }
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-neutral-400">
        <span>
          {loading
            ? "Cargando telemetría GPS..."
            : prepared.length === 0
            ? "Sin telemetría GPS para esta ventana"
            : `${prepared.length} vuelta${prepared.length === 1 ? "" : "s"} GPS · kart ${kartNumber ?? "?"}`}
        </span>
        {hud && (
          <span className="font-mono text-white">
            V{hud.lap} · {hud.speed.toFixed(0)} km/h ·{" "}
            <span className={hud.accel < -1.5 ? "text-red-400" : hud.accel > 1.5 ? "text-green-400" : "text-neutral-300"}>
              {hud.accel >= 0 ? "+" : ""}{hud.accel.toFixed(1)} m/s²
            </span>
          </span>
        )}
      </div>
      {error && <div className="text-xs text-red-400">{error}</div>}
      {/* Map container — spinner shown while loading, empty-state when no laps */}
      <div
        className="relative w-full rounded-lg overflow-hidden border border-border bg-black/40"
        style={{ height }}
      >
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 z-10">
            <div className="w-8 h-8 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
            <span className="text-[11px] text-neutral-400">Cargando datos GPS…</span>
          </div>
        )}
        {!loading && prepared.length === 0 && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <svg className="w-8 h-8 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[11px] text-neutral-600">Sin telemetría GPS para esta ventana</span>
          </div>
        )}
      </div>
    </div>
  );
}
