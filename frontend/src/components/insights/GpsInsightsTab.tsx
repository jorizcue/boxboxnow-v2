"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api } from "@/lib/api";
import { msToLapTime } from "@/lib/formatters";

/* ---------- Types ---------- */

interface CircuitOption {
  id: number;
  name: string;
}

interface GpsLap {
  id: number;
  circuit_id: number;
  circuit_name?: string;
  lap_number: number;
  lap_time_ms: number;
  distance_m: number;
  max_speed_kmh: number;
  avg_speed_kmh?: number;
  source?: string;
  recorded_at: string;
  positions?: Position[];
  speed_trace?: SpeedPoint[];
  gforce_data?: GForcePoint[];
}

interface GpsStats {
  total_laps: number;
  best_lap_ms: number;
  avg_lap_ms: number;
  top_speed_kmh: number;
  total_distance_m: number;
}

interface Position {
  lat: number;
  lon: number;
  speed?: number;
}

interface SpeedPoint {
  distance_m: number;
  speed_kmh: number;
}

interface GForcePoint {
  lat_g: number;
  lon_g: number;
}

/* ---------- Helpers ---------- */

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function lapTimeColor(ms: number, bestMs: number, avgMs: number): string {
  if (ms <= bestMs * 1.005) return "text-green-400";
  if (ms <= avgMs) return "text-yellow-400";
  return "text-red-400";
}

/* ---------- Canvas: Track Map ---------- */

function TrackMapCanvas({ positions }: { positions: Position[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || positions.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const lats = positions.map((p) => p.lat);
    const lons = positions.map((p) => p.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const pad = 16;
    const rangeX = maxLon - minLon || 1e-5;
    const rangeY = maxLat - minLat || 1e-5;
    const scaleX = (w - pad * 2) / rangeX;
    const scaleY = (h - pad * 2) / rangeY;
    const scale = Math.min(scaleX, scaleY);
    const offX = (w - rangeX * scale) / 2;
    const offY = (h - rangeY * scale) / 2;

    const toX = (lon: number) => offX + (lon - minLon) * scale;
    const toY = (lat: number) => offY + (maxLat - lat) * scale;

    // Draw path
    ctx.beginPath();
    ctx.moveTo(toX(positions[0].lon), toY(positions[0].lat));
    for (let i = 1; i < positions.length; i++) {
      ctx.lineTo(toX(positions[i].lon), toY(positions[i].lat));
    }
    ctx.strokeStyle = "rgba(59,130,246,0.8)";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Start dot (green)
    ctx.beginPath();
    ctx.arc(toX(positions[0].lon), toY(positions[0].lat), 4, 0, Math.PI * 2);
    ctx.fillStyle = "#4ade80";
    ctx.fill();

    // End dot (red)
    const last = positions[positions.length - 1];
    ctx.beginPath();
    ctx.arc(toX(last.lon), toY(last.lat), 4, 0, Math.PI * 2);
    ctx.fillStyle = "#f87171";
    ctx.fill();
  }, [positions]);

  if (positions.length < 2) {
    return <div className="text-neutral-500 text-xs text-center py-8">Sin datos de posicion</div>;
  }

  return <canvas ref={canvasRef} className="w-full h-full" style={{ minHeight: 200 }} />;
}

/* ---------- Canvas: Speed Trace ---------- */

function SpeedTraceCanvas({
  traces,
  colors,
  labels,
}: {
  traces: SpeedPoint[][];
  colors: string[];
  labels?: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || traces.length === 0 || traces[0].length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 12, right: 12, bottom: 28, left: 40 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Compute ranges across all traces
    let maxDist = 0;
    let maxSpeed = 0;
    for (const trace of traces) {
      for (const pt of trace) {
        if (pt.distance_m > maxDist) maxDist = pt.distance_m;
        if (pt.speed_kmh > maxSpeed) maxSpeed = pt.speed_kmh;
      }
    }
    maxSpeed = Math.ceil(maxSpeed / 10) * 10 || 100;
    maxDist = maxDist || 1;

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    for (let s = 0; s <= maxSpeed; s += 20) {
      const y = pad.top + plotH - (s / maxSpeed) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillText(`${s}`, pad.left - 4, y + 3);
    }

    // X-axis label
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "8px sans-serif";
    ctx.fillText(`Distancia (${maxDist >= 1000 ? (maxDist / 1000).toFixed(1) + " km" : Math.round(maxDist) + " m"})`, pad.left + plotW / 2, h - 4);

    // Y-axis label
    ctx.save();
    ctx.translate(10, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillText("km/h", 0, 0);
    ctx.restore();

    // Draw traces
    traces.forEach((trace, ti) => {
      if (trace.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(
        pad.left + (trace[0].distance_m / maxDist) * plotW,
        pad.top + plotH - (trace[0].speed_kmh / maxSpeed) * plotH
      );
      for (let i = 1; i < trace.length; i++) {
        ctx.lineTo(
          pad.left + (trace[i].distance_m / maxDist) * plotW,
          pad.top + plotH - (trace[i].speed_kmh / maxSpeed) * plotH
        );
      }
      ctx.strokeStyle = colors[ti] || "rgba(59,130,246,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Legend
    if (labels && labels.length > 1) {
      let lx = pad.left + 8;
      labels.forEach((label, i) => {
        ctx.fillStyle = colors[i] || "#fff";
        ctx.fillRect(lx, pad.top + 4, 12, 3);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(label, lx + 16, pad.top + 10);
        lx += ctx.measureText(label).width + 32;
      });
    }
  }, [traces, colors, labels]);

  return <canvas ref={canvasRef} className="w-full h-full" style={{ minHeight: 180 }} />;
}

/* ---------- Canvas: Delta Time ---------- */

function DeltaTimeCanvas({
  traceA,
  traceB,
  labelA,
  labelB,
}: {
  traceA: SpeedPoint[];
  traceB: SpeedPoint[];
  labelA: string;
  labelB: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || traceA.length < 2 || traceB.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 16, right: 12, bottom: 28, left: 40 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Compute cumulative time at each distance for both traces
    const cumTimeA = computeCumulativeTime(traceA);
    const cumTimeB = computeCumulativeTime(traceB);

    // Sample delta at regular intervals
    const maxDist = Math.min(
      traceA[traceA.length - 1].distance_m,
      traceB[traceB.length - 1].distance_m
    );
    const samples = 200;
    const deltaPoints: { dist: number; delta: number }[] = [];
    for (let i = 0; i <= samples; i++) {
      const d = (i / samples) * maxDist;
      const tA = interpolate(cumTimeA, d);
      const tB = interpolate(cumTimeB, d);
      if (tA !== null && tB !== null) {
        deltaPoints.push({ dist: d, delta: tB - tA }); // positive = A is faster
      }
    }

    if (deltaPoints.length < 2) return;

    let maxDelta = Math.max(...deltaPoints.map((p) => Math.abs(p.delta)), 0.5);
    maxDelta = Math.ceil(maxDelta * 10) / 10;

    // Zero line
    const zeroY = pad.top + plotH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(pad.left + plotW, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Grid
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    for (let v = -maxDelta; v <= maxDelta; v += maxDelta > 2 ? 1 : 0.5) {
      const y = zeroY - (v / maxDelta) * (plotH / 2);
      if (Math.abs(v) > 0.01) {
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.stroke();
      }
      ctx.fillText(`${v > 0 ? "+" : ""}${v.toFixed(1)}s`, pad.left - 4, y + 3);
    }

    // Labels
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "8px sans-serif";
    ctx.fillText("Distancia", pad.left + plotW / 2, h - 4);

    // Delta curve
    ctx.beginPath();
    deltaPoints.forEach((pt, i) => {
      const x = pad.left + (pt.dist / maxDist) * plotW;
      const y = zeroY - (pt.delta / maxDelta) * (plotH / 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Fill areas
    ctx.beginPath();
    deltaPoints.forEach((pt, i) => {
      const x = pad.left + (pt.dist / maxDist) * plotW;
      const y = zeroY - (pt.delta / maxDelta) * (plotH / 2);
      if (i === 0) ctx.moveTo(x, zeroY);
      ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + plotW, zeroY);
    ctx.closePath();
    ctx.fillStyle = "rgba(167,139,250,0.08)";
    ctx.fill();

    // Legend
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`+ = ${labelA} mas rapido`, pad.left + 8, pad.top + 8);
    ctx.fillText(`- = ${labelB} mas rapido`, pad.left + 8, pad.top + 20);
  }, [traceA, traceB, labelA, labelB]);

  return <canvas ref={canvasRef} className="w-full h-full" style={{ minHeight: 160 }} />;
}

function computeCumulativeTime(trace: SpeedPoint[]): { dist: number; time: number }[] {
  const result: { dist: number; time: number }[] = [{ dist: 0, time: 0 }];
  for (let i = 1; i < trace.length; i++) {
    const dd = trace[i].distance_m - trace[i - 1].distance_m;
    const avgSpeed = ((trace[i].speed_kmh + trace[i - 1].speed_kmh) / 2) * (1000 / 3600); // m/s
    const dt = avgSpeed > 0 ? dd / avgSpeed : 0;
    result.push({ dist: trace[i].distance_m, time: result[i - 1].time + dt });
  }
  return result;
}

function interpolate(data: { dist: number; time: number }[], targetDist: number): number | null {
  if (data.length === 0) return null;
  if (targetDist <= data[0].dist) return data[0].time;
  if (targetDist >= data[data.length - 1].dist) return data[data.length - 1].time;
  for (let i = 1; i < data.length; i++) {
    if (data[i].dist >= targetDist) {
      const ratio = (targetDist - data[i - 1].dist) / (data[i].dist - data[i - 1].dist);
      return data[i - 1].time + ratio * (data[i].time - data[i - 1].time);
    }
  }
  return null;
}

/* ---------- Canvas: G-Force Scatter ---------- */

function GForceScatterCanvas({ points }: { points: GForcePoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxG = 2.0;
    const radius = Math.min(cx, cy) - 16;

    // Rings
    for (let g = 0.5; g <= maxG; g += 0.5) {
      const r = (g / maxG) * radius;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "8px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${g.toFixed(1)}G`, cx + r + 2, cy - 2);
    }

    // Crosshairs
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    // Labels
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ACEL", cx, cy - radius - 4);
    ctx.fillText("FREN", cx, cy + radius + 12);
    ctx.textAlign = "left";
    ctx.fillText("IZQ", cx - radius - 2, cy - 4);
    ctx.textAlign = "right";
    ctx.fillText("DER", cx + radius + 2, cy - 4);

    // Points
    for (const pt of points) {
      const x = cx + (pt.lat_g / maxG) * radius;
      const y = cy - (pt.lon_g / maxG) * radius;
      const mag = Math.sqrt(pt.lat_g * pt.lat_g + pt.lon_g * pt.lon_g);
      const hue = mag > 1.2 ? 0 : mag > 0.7 ? 40 : 140;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.4)`;
      ctx.fill();
    }
  }, [points]);

  if (points.length === 0) {
    return <div className="text-neutral-500 text-xs text-center py-8">Sin datos de G-Force</div>;
  }

  return <canvas ref={canvasRef} className="w-full h-full" style={{ minHeight: 200 }} />;
}

/* ========== Main Component ========== */

export function GpsInsightsTab() {
  const [circuits, setCircuits] = useState<CircuitOption[]>([]);
  const [selectedCircuit, setSelectedCircuit] = useState<number | null>(null);
  const [laps, setLaps] = useState<GpsLap[]>([]);
  const [stats, setStats] = useState<GpsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLap, setDetailLap] = useState<GpsLap | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Comparison
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set());
  const [comparing, setComparing] = useState(false);
  const [compareLaps, setCompareLaps] = useState<GpsLap[]>([]);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Load circuits
  useEffect(() => {
    api.getAnalyticsCircuits().then((c: any[]) => {
      setCircuits(c.map((x: any) => ({ id: x.id, name: x.name })));
    }).catch(() => {});
  }, []);

  // Load laps + stats when circuit changes
  const loadData = useCallback(async () => {
    setLoading(true);
    setDetailLap(null);
    setComparing(false);
    setCompareLaps([]);
    setCompareIds(new Set());
    try {
      const params = selectedCircuit ? { circuit_id: selectedCircuit, limit: 200 } : { limit: 200 };
      const [lapsData, statsData] = await Promise.all([
        api.getGpsLaps(params) as Promise<any>,
        api.getGpsStats(selectedCircuit ?? undefined) as Promise<any>,
      ]);
      setLaps(Array.isArray(lapsData) ? lapsData : lapsData?.laps ?? []);
      setStats(statsData);
    } catch {
      setLaps([]);
      setStats(null);
    }
    setLoading(false);
  }, [selectedCircuit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open lap detail
  const openDetail = async (lapId: number) => {
    setLoadingDetail(true);
    setDetailLap(null);
    setComparing(false);
    try {
      const detail = (await api.getGpsLapDetail(lapId)) as any;
      setDetailLap(detail);
    } catch {}
    setLoadingDetail(false);
  };

  // Delete lap
  const deleteLap = async (lapId: number) => {
    if (!confirm("Eliminar esta vuelta?")) return;
    try {
      await api.deleteGpsLap(lapId);
      setLaps((prev) => prev.filter((l) => l.id !== lapId));
      if (detailLap?.id === lapId) setDetailLap(null);
      // Refresh stats
      const statsData = (await api.getGpsStats(selectedCircuit ?? undefined)) as any;
      setStats(statsData);
    } catch {}
  };

  // Toggle comparison selection
  const toggleCompare = (lapId: number) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(lapId)) {
        next.delete(lapId);
      } else if (next.size < 2) {
        next.add(lapId);
      }
      return next;
    });
  };

  // Execute comparison
  const doCompare = async () => {
    const ids = Array.from(compareIds);
    if (ids.length !== 2) return;
    setLoadingCompare(true);
    setComparing(true);
    setDetailLap(null);
    try {
      const [a, b] = await Promise.all([
        api.getGpsLapDetail(ids[0]) as Promise<any>,
        api.getGpsLapDetail(ids[1]) as Promise<any>,
      ]);
      setCompareLaps([a, b]);
    } catch {
      setCompareLaps([]);
    }
    setLoadingCompare(false);
  };

  // Computed values
  const bestLapMs = useMemo(() => {
    if (laps.length === 0) return 0;
    return Math.min(...laps.filter((l) => l.lap_time_ms > 0).map((l) => l.lap_time_ms));
  }, [laps]);

  const avgLapMs = useMemo(() => {
    const valid = laps.filter((l) => l.lap_time_ms > 0);
    if (valid.length === 0) return 0;
    return valid.reduce((a, l) => a + l.lap_time_ms, 0) / valid.length;
  }, [laps]);

  // Stat cards data
  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Total vueltas", value: String(stats.total_laps || 0) },
      { label: "Mejor vuelta", value: stats.best_lap_ms > 0 ? msToLapTime(stats.best_lap_ms) : "-", accent: true },
      { label: "Vuelta media", value: stats.avg_lap_ms > 0 ? msToLapTime(stats.avg_lap_ms) : "-" },
      { label: "Vel. maxima", value: stats.top_speed_kmh > 0 ? `${stats.top_speed_kmh.toFixed(1)} km/h` : "-" },
      { label: "Distancia total", value: stats.total_distance_m > 0 ? formatDistance(stats.total_distance_m) : "-" },
    ];
  }, [stats]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">GPS Insights</h2>
          </div>

          {/* Circuit selector */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-neutral-400 uppercase tracking-wider">Circuito</label>
            <select
              value={selectedCircuit ?? ""}
              onChange={(e) => setSelectedCircuit(e.target.value ? Number(e.target.value) : null)}
              className="bg-black/40 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent/50 transition-colors"
            >
              <option value="">Todos</option>
              {circuits.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stat cards */}
        {loading ? (
          <div className="flex gap-3 mt-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex-1 bg-white/[0.03] rounded-lg p-3 border border-border animate-pulse">
                <div className="h-3 bg-neutral-800 rounded w-16 mb-2" />
                <div className="h-5 bg-neutral-800 rounded w-20" />
              </div>
            ))}
          </div>
        ) : stats && statCards.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
            {statCards.map((card) => (
              <div key={card.label} className="bg-white/[0.03] rounded-lg p-3 border border-border">
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider">{card.label}</div>
                <div className={`text-lg font-mono font-semibold mt-0.5 ${card.accent ? "text-green-400" : "text-white"}`}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>
        ) : !loading && laps.length === 0 ? (
          <div className="mt-4 text-center py-8">
            <svg className="w-12 h-12 text-neutral-700 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <p className="text-neutral-500 text-sm">No hay datos GPS todavia</p>
            <p className="text-neutral-600 text-xs mt-1">Las vueltas GPS se guardan automaticamente desde la vista de piloto</p>
          </div>
        ) : null}
      </div>

      {/* Compare bar */}
      {compareIds.size > 0 && !comparing && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-purple-300">
            {compareIds.size}/2 vueltas seleccionadas para comparar
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCompareIds(new Set())}
              className="text-[10px] text-neutral-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={doCompare}
              disabled={compareIds.size !== 2}
              className="text-[10px] bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1 rounded-lg transition-colors"
            >
              Comparar
            </button>
          </div>
        </div>
      )}

      {/* Comparison view */}
      {comparing && (
        <div className="bg-white/[0.03] rounded-xl border border-border p-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] text-neutral-200 uppercase tracking-wider font-medium">Comparacion de vueltas</h3>
            <button
              onClick={() => { setComparing(false); setCompareLaps([]); setCompareIds(new Set()); }}
              className="text-neutral-500 hover:text-white text-lg leading-none transition-colors"
            >
              &times;
            </button>
          </div>

          {loadingCompare ? (
            <div className="text-neutral-500 text-xs animate-pulse text-center py-8">Cargando...</div>
          ) : compareLaps.length === 2 ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                {compareLaps.map((lap, i) => (
                  <div key={lap.id} className="bg-black/30 rounded-lg p-3 border border-border">
                    <div className="text-[10px] text-neutral-400 uppercase">Vuelta {lap.lap_number}</div>
                    <div className={`text-lg font-mono font-semibold ${i === 0 ? "text-blue-400" : "text-orange-400"}`}>
                      {msToLapTime(lap.lap_time_ms)}
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-1">
                      {formatDistance(lap.distance_m)} | Max: {lap.max_speed_kmh?.toFixed(1) ?? "-"} km/h
                    </div>
                  </div>
                ))}
              </div>

              {/* Overlaid speed traces */}
              {compareLaps[0].speed_trace && compareLaps[1].speed_trace && (
                <div>
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">Velocidad superpuesta</div>
                  <div className="bg-black/30 rounded-lg border border-border p-2 h-48">
                    <SpeedTraceCanvas
                      traces={[compareLaps[0].speed_trace, compareLaps[1].speed_trace]}
                      colors={["rgba(96,165,250,0.9)", "rgba(251,146,60,0.9)"]}
                      labels={[`V${compareLaps[0].lap_number}`, `V${compareLaps[1].lap_number}`]}
                    />
                  </div>
                </div>
              )}

              {/* Delta time */}
              {compareLaps[0].speed_trace && compareLaps[1].speed_trace &&
                compareLaps[0].speed_trace.length > 1 && compareLaps[1].speed_trace.length > 1 && (
                <div>
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">Delta tiempo</div>
                  <div className="bg-black/30 rounded-lg border border-border p-2 h-40">
                    <DeltaTimeCanvas
                      traceA={compareLaps[0].speed_trace}
                      traceB={compareLaps[1].speed_trace}
                      labelA={`V${compareLaps[0].lap_number}`}
                      labelB={`V${compareLaps[1].lap_number}`}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-neutral-500 text-xs text-center py-8">No se pudieron cargar los datos de comparacion</div>
          )}
        </div>
      )}

      {/* Lap list */}
      {!loading && laps.length > 0 && !comparing && (
        <div className="bg-white/[0.03] rounded-xl border border-border p-4">
          <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider font-medium">
            Vueltas registradas
            <span className="text-neutral-500 font-normal ml-2">({laps.length})</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] text-neutral-400 uppercase tracking-wider">
                <tr>
                  <th className="text-center px-1 py-1.5 w-8" title="Comparar"></th>
                  <th className="text-center px-2 py-1.5 w-8">#</th>
                  <th className="text-right px-2 py-1.5">Tiempo</th>
                  <th className="text-right px-2 py-1.5 hidden sm:table-cell">Distancia</th>
                  <th className="text-right px-2 py-1.5">Vel. max</th>
                  <th className="text-left px-2 py-1.5 hidden md:table-cell">Fuente</th>
                  <th className="text-left px-2 py-1.5 hidden sm:table-cell">Fecha</th>
                  <th className="text-center px-2 py-1.5 w-20">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {laps.map((lap) => (
                  <tr key={lap.id} className="border-t border-border hover:bg-black/30 transition-colors">
                    <td className="px-1 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={compareIds.has(lap.id)}
                        onChange={() => toggleCompare(lap.id)}
                        disabled={!compareIds.has(lap.id) && compareIds.size >= 2}
                        className="w-3 h-3 rounded border-neutral-600 bg-transparent accent-purple-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center text-neutral-500 text-xs">{lap.lap_number}</td>
                    <td className={`px-2 py-1.5 text-right font-mono font-semibold ${lapTimeColor(lap.lap_time_ms, bestLapMs, avgLapMs)}`}>
                      {msToLapTime(lap.lap_time_ms)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-neutral-400 text-xs hidden sm:table-cell">
                      {formatDistance(lap.distance_m)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-neutral-300 text-xs">
                      {lap.max_speed_kmh?.toFixed(1) ?? "-"} km/h
                    </td>
                    <td className="px-2 py-1.5 text-left text-neutral-500 text-xs hidden md:table-cell">
                      {lap.source || "-"}
                    </td>
                    <td className="px-2 py-1.5 text-left text-neutral-500 text-xs hidden sm:table-cell whitespace-nowrap">
                      {formatDateShort(lap.recorded_at)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openDetail(lap.id)}
                          className="text-neutral-500 hover:text-accent transition-colors p-1"
                          title="Ver detalle"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteLap(lap.id)}
                          className="text-neutral-500 hover:text-red-400 transition-colors p-1"
                          title="Eliminar"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-4 text-[10px]">
            <span className="text-green-400">Rapida</span>
            <span className="text-yellow-400">Media</span>
            <span className="text-red-400">Lenta</span>
          </div>
        </div>
      )}

      {/* Lap Detail Modal */}
      {(detailLap || loadingDetail) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => { setDetailLap(null); setLoadingDetail(false); }}
        >
          <div
            className="bg-[#1a1a2e] border border-border rounded-xl shadow-xl p-5 w-[640px] max-w-[95vw] max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {loadingDetail ? (
              <div className="text-neutral-500 text-xs animate-pulse text-center py-12">Cargando detalle...</div>
            ) : detailLap ? (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                      Vuelta {detailLap.lap_number}
                    </h3>
                    <div className="flex items-center gap-3 text-[10px] text-neutral-400 mt-1">
                      <span className="text-green-400 font-mono font-semibold text-base">
                        {msToLapTime(detailLap.lap_time_ms)}
                      </span>
                      <span>{formatDistance(detailLap.distance_m)}</span>
                      <span>Max: {detailLap.max_speed_kmh?.toFixed(1) ?? "-"} km/h</span>
                    </div>
                  </div>
                  <button
                    onClick={() => { setDetailLap(null); setLoadingDetail(false); }}
                    className="text-neutral-500 hover:text-white text-lg leading-none transition-colors"
                  >
                    &times;
                  </button>
                </div>

                {/* Track map */}
                {detailLap.positions && detailLap.positions.length > 1 && (
                  <div>
                    <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">Trazado</div>
                    <div className="bg-black/30 rounded-lg border border-border p-2 h-52">
                      <TrackMapCanvas positions={detailLap.positions} />
                    </div>
                  </div>
                )}

                {/* Speed trace */}
                {detailLap.speed_trace && detailLap.speed_trace.length > 1 && (
                  <div>
                    <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">Velocidad</div>
                    <div className="bg-black/30 rounded-lg border border-border p-2 h-44">
                      <SpeedTraceCanvas
                        traces={[detailLap.speed_trace]}
                        colors={["rgba(59,130,246,0.8)"]}
                      />
                    </div>
                  </div>
                )}

                {/* G-Force scatter */}
                {detailLap.gforce_data && detailLap.gforce_data.length > 0 && (
                  <div>
                    <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">G-Force</div>
                    <div className="bg-black/30 rounded-lg border border-border p-2 h-52">
                      <GForceScatterCanvas points={detailLap.gforce_data} />
                    </div>
                  </div>
                )}

                {/* No telemetry data message */}
                {(!detailLap.positions || detailLap.positions.length < 2) &&
                  (!detailLap.speed_trace || detailLap.speed_trace.length < 2) &&
                  (!detailLap.gforce_data || detailLap.gforce_data.length === 0) && (
                  <div className="text-neutral-500 text-xs text-center py-6">
                    No hay datos de telemetria detallados para esta vuelta
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
