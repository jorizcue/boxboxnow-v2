"use client";

// Satellite-imagery track map with a multi-segment polyline whose colour
// reflects either longitudinal G-force (brake / coast / accel), speed, or
// 20 equal-distance microsectors with a hue-rotated rainbow palette.
// Optionally tracks a hoverDistance (metres from lap start) emitted by a
// SpeedTrace sibling so a white dot follows the cursor position on both.

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { GpsLapDetail, LatLon } from "./types";
import {
  speedToAccelMps2,
  smooth,
  sampleAtDist,
  microsectorTimes,
  indexAtDist,
  MICROSECTOR_COUNT,
} from "./helpers";

export type ColorMode = "accel" | "speed" | "sectors";

interface Props {
  lap: GpsLapDetail;
  finishLine?: { p1: LatLon; p2: LatLon } | null;
  colorMode?: ColorMode;
  apexes?: number[];           // sample indices to mark as apex
  hoverDistance?: number | null; // metres from start; drives white dot
  height?: number;
}

// Lazy-load Leaflet on the client only — Next.js SSR doesn't have `window`.
async function loadLeaflet() {
  const L = (await import("leaflet")).default;
  return L;
}

/** Map G-longitudinal (m/s²) to a colour. */
function accelColor(value: number, hardThreshold = 4): string {
  const ratio = Math.max(-1, Math.min(1, value / hardThreshold));
  if (ratio > 0.15) {
    const t = (ratio - 0.15) / 0.85;
    return `rgb(40, ${Math.round(140 + t * 100)}, 70)`;
  }
  if (ratio < -0.15) {
    const t = (-ratio - 0.15) / 0.85;
    return `rgb(${Math.round(140 + t * 100)}, 50, 50)`;
  }
  return "rgba(220, 220, 230, 0.85)";
}

/** Speed → colour gradient (blue slow → cyan → green → yellow → red fast). */
function speedColor(kmh: number, maxKmh: number): string {
  const t = Math.max(0, Math.min(1, kmh / maxKmh));
  if (t < 0.25) {
    const k = t / 0.25;
    return `rgb(${Math.round(40)}, ${Math.round(80 + k * 175)}, 255)`;
  }
  if (t < 0.5) {
    const k = (t - 0.25) / 0.25;
    return `rgb(${Math.round(40 + k * 60)}, 255, ${Math.round(255 - k * 155)})`;
  }
  if (t < 0.75) {
    const k = (t - 0.5) / 0.25;
    return `rgb(${Math.round(100 + k * 155)}, 255, ${Math.round(100 - k * 100)})`;
  }
  const k = (t - 0.75) / 0.25;
  return `rgb(255, ${Math.round(255 - k * 200)}, 0)`;
}

/** Hue-rotated rainbow for sector index 0..total-1. */
function sectorColor(index: number, total: number): string {
  const hue = Math.round((index / total) * 360);
  return `hsl(${hue}, 85%, 58%)`;
}

export function TrackMap({
  lap,
  finishLine,
  colorMode = "accel",
  apexes,
  hoverDistance,
  height = 360,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hoverMarkerRef = useRef<any>(null);
  const posLatsRef = useRef<number[]>([]);
  const posLonsRef = useRef<number[]>([]);
  const posDistsRef = useRef<number[]>([]);

  // Bumped after each successful async map draw so the hover effect knows
  // Leaflet is ready and can create/update the white dot marker.
  const [mapReady, setMapReady] = useState(0);

  // ── Draw effect ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let t1: ReturnType<typeof setTimeout> | undefined;
    const positions = lap.positions ?? [];
    if (!containerRef.current || positions.length < 2) return;

    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !containerRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Lany = L as any;
      let map = mapRef.current;

      if (!map) {
        map = Lany.map(containerRef.current, {
          zoomControl: true,
          attributionControl: false,
          renderer: Lany.svg(),   // SVG renderer avoids _pxBounds crash
        });
        Lany.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 22, attribution: "Tiles © Esri" },
        ).addTo(map);
        mapRef.current = map;
        LRef.current = L;
      }

      // Set a sane initial view before adding any layers so the SVG
      // renderer has valid pixel bounds from the start.
      map.setView([positions[0].lat, positions[0].lon], 15);

      // Replace the existing trace layer (if any).
      if (layerRef.current) {
        try { map.removeLayer(layerRef.current); } catch { /* noop */ }
        layerRef.current = null;
      }
      const group = Lany.layerGroup();
      layerRef.current = group;
      group.addTo(map);

      const speeds = lap.speeds ?? [];
      const ts = lap.timestamps ?? [];
      const distances = lap.distances ?? [];

      if (colorMode === "sectors") {
        // ── Sector mode: 20 equal-distance bands, hue-rotated rainbow ──
        const sectors = microsectorTimes(lap, MICROSECTOR_COUNT);
        for (const sector of sectors) {
          const startIdx = indexAtDist(distances, sector.startDist);
          const endIdx   = indexAtDist(distances, sector.endDist);
          const segPts = positions
            .slice(startIdx, endIdx + 1)
            .map((p) => [p.lat, p.lon] as [number, number]);
          if (segPts.length < 2) continue;
          Lany.polyline(segPts, {
            color: sectorColor(sector.index, MICROSECTOR_COUNT),
            weight: 5,
            opacity: 0.95,
            lineJoin: "round",
            lineCap: "round",
          })
            .addTo(group)
            .bindTooltip(`Sector ${sector.index + 1}`, { direction: "top", sticky: true });
        }
      } else {
        // ── Accel / speed mode: per-segment coloured polylines ──────────
        const accel = colorMode === "accel" ? smooth(speedToAccelMps2(speeds, ts), 7) : [];
        const maxSpeed = colorMode === "speed" ? Math.max(1, ...speeds) : 0;
        const segLen = 4;

        for (let i = 0; i < positions.length - 1; i += segLen) {
          const j = Math.min(positions.length - 1, i + segLen);
          const segPts = positions
            .slice(i, j + 1)
            .map((p) => [p.lat, p.lon] as [number, number]);
          const idx = Math.floor((i + j) / 2);
          const color =
            colorMode === "accel"
              ? accelColor(accel[idx] ?? 0)
              : speedColor(speeds[idx] ?? 0, maxSpeed);
          Lany.polyline(segPts, {
            color,
            weight: 4,
            opacity: 0.95,
            lineJoin: "round",
            lineCap: "round",
          }).addTo(group);
        }
      }

      // ── Apex markers ──────────────────────────────────────────────────
      if (apexes && apexes.length) {
        for (const idx of apexes) {
          if (idx < 0 || idx >= positions.length) continue;
          const p = positions[idx];
          Lany.circleMarker([p.lat, p.lon], {
            radius: 4,
            color: "#fde047",
            weight: 2,
            fillColor: "#facc15",
            fillOpacity: 0.95,
          })
            .addTo(group)
            .bindTooltip(`Apex · ${(speeds[idx] ?? 0).toFixed(0)} km/h`, {
              direction: "top",
              offset: [0, -6],
            });
        }
      }

      // ── Start / finish pins ───────────────────────────────────────────
      const start = positions[0];
      const end = positions[positions.length - 1];
      Lany.circleMarker([start.lat, start.lon], {
        radius: 6, color: "#0f0", weight: 2, fillColor: "#34d399", fillOpacity: 0.95,
      }).addTo(group).bindTooltip("Inicio", { direction: "right", offset: [8, 0] });
      Lany.circleMarker([end.lat, end.lon], {
        radius: 6, color: "#f00", weight: 2, fillColor: "#f87171", fillOpacity: 0.95,
      }).addTo(group).bindTooltip("Fin", { direction: "right", offset: [8, 0] });

      // ── Finish line ───────────────────────────────────────────────────
      if (
        finishLine &&
        isFinite(finishLine.p1.lat) && isFinite(finishLine.p1.lon) &&
        isFinite(finishLine.p2.lat) && isFinite(finishLine.p2.lon)
      ) {
        Lany.polyline(
          [[finishLine.p1.lat, finishLine.p1.lon], [finishLine.p2.lat, finishLine.p2.lon]],
          { color: "#fef08a", weight: 3, opacity: 0.95, dashArray: "6,4" },
        ).addTo(group).bindTooltip("Línea de meta", { direction: "top" });
      }

      // ── Fit bounds (invalidateSize first so the container isn't 0×0) ──
      const bounds = Lany.latLngBounds(
        positions.map((p: LatLon) => [p.lat, p.lon] as [number, number]),
      );
      t1 = setTimeout(() => {
        if (cancelled) return;
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [20, 20] });
      }, 120);

      if (!cancelled) setMapReady((v) => v + 1);
    })();

    return () => {
      cancelled = true;
      if (t1) clearTimeout(t1);
    };
  }, [lap, finishLine, colorMode, apexes]);

  // ── Cache lat/lon/dist arrays when lap changes ────────────────────────
  useEffect(() => {
    const positions = lap.positions ?? [];
    posLatsRef.current  = positions.map((p) => p.lat);
    posLonsRef.current  = positions.map((p) => p.lon);
    posDistsRef.current = lap.distances ?? [];
  }, [lap]);

  // ── Hover marker ──────────────────────────────────────────────────────
  // Runs whenever hoverDistance changes OR after a fresh draw (mapReady bump).
  useEffect(() => {
    const map = mapRef.current;
    const L   = LRef.current;
    if (!map || !L) return;

    const dists = posDistsRef.current;
    const lats  = posLatsRef.current;
    const lons  = posLonsRef.current;

    if (hoverDistance == null || dists.length === 0) {
      if (hoverMarkerRef.current) {
        try { map.removeLayer(hoverMarkerRef.current); } catch { /* noop */ }
        hoverMarkerRef.current = null;
      }
      return;
    }

    const lat = sampleAtDist(dists, lats, hoverDistance);
    const lon = sampleAtDist(dists, lons, hoverDistance);
    if (lat == null || lon == null) return;

    if (!hoverMarkerRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hoverMarkerRef.current = (L as any).circleMarker([lat, lon], {
        radius: 7,
        color: "#fff",
        weight: 2.5,
        fillColor: "#fff",
        fillOpacity: 0.9,
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      hoverMarkerRef.current.setLatLng([lat, lon]);
    }
  }, [hoverDistance, mapReady]);

  // ── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (map) {
        map.remove();
        mapRef.current      = null;
        layerRef.current    = null;
        hoverMarkerRef.current = null;
        LRef.current        = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden border border-border bg-black/40"
      style={{ height }}
    />
  );
}
