"use client";

// Aggregated speed heatmap for the circuit. Each sample from every loaded
// lap is plotted on the satellite map; colour represents the AVERAGE speed
// at that approximate location. Slow corners light up blue, fast straights
// red — a quick visual map of where you're consistently slow.

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { GpsLapDetail, GpsLapSummary } from "./types";

interface Props {
  lapSummaries: GpsLapSummary[];
  circuitId?: number | null;
  height?: number;
}

interface Pt {
  lat: number;
  lon: number;
  speed: number;
}

async function loadLeaflet() {
  const L = (await import("leaflet")).default;
  await import("leaflet/dist/leaflet.css");
  return L;
}

function speedColor(t: number): string {
  if (t < 0.25) {
    const k = t / 0.25;
    return `rgb(${Math.round(40 + k * 0)}, ${Math.round(80 + k * 175)}, ${Math.round(255)})`;
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

export function SpeedHeatmap({ lapSummaries, circuitId, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const layerRef = useRef<unknown>(null);

  const [points, setPoints] = useState<Pt[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const targetLaps = useMemo(() => {
    let pool = lapSummaries.filter((l) => l.duration_ms > 5000 && l.total_distance_m > 100);
    if (circuitId != null) pool = pool.filter((l) => l.circuit_id === circuitId);
    return pool.slice(0, 20);
  }, [lapSummaries, circuitId]);

  // Fetch detail for the selected laps and aggregate samples.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (targetLaps.length === 0) {
        setPoints([]);
        return;
      }
      setLoading(true);
      setProgress(0);
      const acc: Pt[] = [];
      for (let i = 0; i < targetLaps.length; i++) {
        if (cancelled) return;
        try {
          const d = (await api.getGpsLapDetail(targetLaps[i].id)) as GpsLapDetail;
          const pos = d.positions ?? [];
          const sp = d.speeds ?? [];
          const n = Math.min(pos.length, sp.length);
          // Stride down to keep the map snappy at 25Hz × 60s × 20 laps = 30k pts
          const stride = Math.max(1, Math.floor(n / 400));
          for (let k = 0; k < n; k += stride) {
            acc.push({ lat: pos[k].lat, lon: pos[k].lon, speed: sp[k] });
          }
        } catch {
          // ignore broken laps
        }
        setProgress(i + 1);
      }
      if (!cancelled) {
        setPoints(acc);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [targetLaps]);

  // Render the points on Leaflet.
  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;
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
      if (layerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.removeLayer(layerRef.current as any);
      }
      const group = Lany.layerGroup();
      layerRef.current = group;
      group.addTo(map);

      const maxSpeed = Math.max(...points.map((p) => p.speed)) || 1;
      for (const p of points) {
        const t = Math.min(1, p.speed / maxSpeed);
        Lany.circleMarker([p.lat, p.lon], {
          radius: 3,
          color: speedColor(t),
          fillColor: speedColor(t),
          fillOpacity: 0.55,
          opacity: 0.55,
          weight: 0,
        }).addTo(group);
      }

      const bounds = Lany.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
      map.fitBounds(bounds, { padding: [20, 20] });
      setTimeout(() => map.invalidateSize(), 60);
    })();
    return () => { cancelled = true; };
  }, [points]);

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

  if (targetLaps.length === 0) {
    return (
      <div className="text-neutral-500 text-xs text-center py-6">
        Selecciona un circuito con vueltas registradas para ver el mapa de calor.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-neutral-400">
        <span>
          Agregando {targetLaps.length} vuelta{targetLaps.length === 1 ? "" : "s"} ·{" "}
          {points.length} puntos
        </span>
        <div className="flex items-center gap-2">
          <span>Lento</span>
          <div className="h-2 w-32 rounded-sm" style={{
            background:
              "linear-gradient(90deg, rgb(40,80,255), rgb(40,255,200), rgb(150,255,50), rgb(255,200,0), rgb(255,55,0))",
          }} />
          <span>Rápido</span>
        </div>
      </div>
      {loading && (
        <div className="text-[10px] text-neutral-500">
          Cargando vueltas... ({progress}/{targetLaps.length})
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full rounded-lg overflow-hidden border border-border bg-black/40"
        style={{ height }}
      />
    </div>
  );
}
