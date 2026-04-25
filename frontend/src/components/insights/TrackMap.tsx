"use client";

// Satellite-imagery track map with a multi-segment polyline whose colour
// reflects either longitudinal G-force (brake / coast / accel) or speed.
// Built on Leaflet + ESRI World Imagery (no token required).

import { useEffect, useRef } from "react";
import type { GpsLapDetail, LatLon } from "./types";
import { speedToAccelMps2, smooth } from "./helpers";

type ColorMode = "accel" | "speed";

interface Props {
  lap: GpsLapDetail;
  finishLine?: { p1: LatLon; p2: LatLon } | null;
  colorMode?: ColorMode;
  apexes?: number[];           // sample indices to mark as apex
  height?: number;
}

// Lazy-load Leaflet on the client only — Next.js SSR doesn't have `window`.
async function loadLeaflet() {
  const L = (await import("leaflet")).default;
  // The CSS is loaded once globally; we import it here so any consumer of
  // this component picks it up without having to add it to layout.tsx.
  await import("leaflet/dist/leaflet.css");
  return L;
}

/** Map G-longitudinal (m/s² or g, both work — we just compare to thresholds)
 * to a colour. Positive = accelerating (green), negative = braking (red),
 * close to zero = constant (neutral grey/white). */
function accelColor(value: number, hardThreshold = 4): string {
  // value in m/s². 4 m/s² ~= 0.4G ~= a clearly noticeable brake/accel.
  const ratio = Math.max(-1, Math.min(1, value / hardThreshold));
  if (ratio > 0.15) {
    // green gradient: 0.15..1 → light → bright green
    const t = (ratio - 0.15) / 0.85;
    const intensity = Math.round(140 + t * 100);
    return `rgb(40, ${intensity}, 70)`;
  }
  if (ratio < -0.15) {
    const t = (-ratio - 0.15) / 0.85;
    const intensity = Math.round(140 + t * 100);
    return `rgb(${intensity}, 50, 50)`;
  }
  return "rgba(220, 220, 230, 0.85)";
}

/** Speed → colour gradient (blue slow → cyan → green → yellow → red fast). */
function speedColor(kmh: number, maxKmh: number): string {
  const t = Math.max(0, Math.min(1, kmh / maxKmh));
  // 5-stop gradient: 0=blue, 0.25=cyan, 0.5=green, 0.75=yellow, 1=red
  if (t < 0.25) {
    const k = t / 0.25;
    return `rgb(${Math.round(40 + k * 0)}, ${Math.round(80 + k * 175)}, ${Math.round(255 - k * 0)})`;
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

export function TrackMap({ lap, finishLine, colorMode = "accel", apexes, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const layerRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    const positions = lap.positions ?? [];
    if (!containerRef.current || positions.length < 2) return;

    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !containerRef.current) return;

      // Init the map exactly once. Subsequent renders update the layers.
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
        // ESRI World Imagery: free, no API key, global satellite coverage.
        Lany.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 22, attribution: "Tiles © Esri" },
        ).addTo(map);
        mapRef.current = map;
      }

      // Replace the existing trace layer (if any) with a fresh one.
      if (layerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.removeLayer(layerRef.current as any);
        layerRef.current = null;
      }
      const group = Lany.layerGroup();
      layerRef.current = group;
      group.addTo(map);

      // Build the per-segment colour. We segment-by-segment polyline to avoid
      // a single shader path. Each ~5 samples we emit a short polyline with
      // the colour at that location.
      const speeds = lap.speeds ?? [];
      const ts = lap.timestamps ?? [];
      const accel = colorMode === "accel" ? smooth(speedToAccelMps2(speeds, ts), 7) : [];
      const maxSpeed = colorMode === "speed" ? Math.max(1, ...speeds) : 0;
      const segLen = 4; // samples per coloured segment

      for (let i = 0; i < positions.length - 1; i += segLen) {
        const j = Math.min(positions.length - 1, i + segLen);
        const segPts = positions
          .slice(i, j + 1)
          .map((p) => [p.lat, p.lon]) as [number, number][];
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

      // Apex markers
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

      // Start / end pins
      const start = positions[0];
      const end = positions[positions.length - 1];
      Lany.circleMarker([start.lat, start.lon], {
        radius: 6,
        color: "#0f0",
        weight: 2,
        fillColor: "#34d399",
        fillOpacity: 0.95,
      })
        .addTo(group)
        .bindTooltip("Inicio", { direction: "right", offset: [8, 0] });
      Lany.circleMarker([end.lat, end.lon], {
        radius: 6,
        color: "#f00",
        weight: 2,
        fillColor: "#f87171",
        fillOpacity: 0.95,
      })
        .addTo(group)
        .bindTooltip("Fin", { direction: "right", offset: [8, 0] });

      // Finish line (if provided)
      if (
        finishLine &&
        isFinite(finishLine.p1.lat) &&
        isFinite(finishLine.p1.lon) &&
        isFinite(finishLine.p2.lat) &&
        isFinite(finishLine.p2.lon)
      ) {
        Lany.polyline(
          [
            [finishLine.p1.lat, finishLine.p1.lon],
            [finishLine.p2.lat, finishLine.p2.lon],
          ],
          { color: "#fef08a", weight: 3, opacity: 0.95, dashArray: "6,4" },
        )
          .addTo(group)
          .bindTooltip("Línea de meta", { direction: "top" });
      }

      // Fit the map to the trace extents.
      const bounds = Lany.latLngBounds(positions.map((p: LatLon) => [p.lat, p.lon] as [number, number]));
      map.fitBounds(bounds, { padding: [20, 20] });
      // The container may have been initialised at 0×0 (e.g. inside a tab
      // that wasn't visible yet). invalidateSize resyncs the renderer.
      setTimeout(() => map.invalidateSize(), 60);
    })();

    return () => { cancelled = true; };
  }, [lap, finishLine, colorMode, apexes]);

  // Cleanup when the component unmounts.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = mapRef.current as any;
      if (map) {
        map.remove();
        mapRef.current = null;
        layerRef.current = null;
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
