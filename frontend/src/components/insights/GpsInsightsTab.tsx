"use client";

// Top-level GPS Insights tab. Lists all uploaded laps for the selected
// circuit, lets the user open one for detailed analysis (satellite map,
// speed trace, apexes, G-G diagram, histogram), compare two laps with
// microsectors, and view aggregate analytics (speed heatmap and
// per-sector consistency) across all loaded laps.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useRaceStore } from "@/hooks/useRaceState";
import { useReplayClockMs } from "@/hooks/useReplayClockMs";
import { useT } from "@/lib/i18n";
import type { CircuitOption, GpsLapDetail, GpsLapSummary, GpsStats, LatLon } from "./types";
import {
  formatDateShort,
  formatDistance,
  formatLapTime,
  detectApexes,
  downloadBlob,
  lapToGpx,
  lapToCsv,
} from "./helpers";
import { TrackMap } from "./TrackMap";
import { SpeedTrace } from "./SpeedTrace";
import { SpeedTraceCompare } from "./SpeedTraceCompare";
import { GForceScatter } from "./GForceScatter";
import { SpeedHistogram } from "./SpeedHistogram";
import { ApexList } from "./ApexList";
import { MicrosectorTable } from "./MicrosectorTable";
import { ConsistencyView } from "./ConsistencyView";
import { SpeedHeatmap } from "./SpeedHeatmap";
import { ReplayGpsMap } from "@/components/replay/ReplayGpsMap";

type ViewMode = "list" | "detail" | "compare" | "consistency" | "heatmap";

function lapTimeColor(ms: number, bestMs: number, avgMs: number): string {
  if (!isFinite(ms) || ms <= 0) return "text-neutral-500";
  if (bestMs > 0 && ms <= bestMs * 1.005) return "text-green-400";
  if (avgMs > 0 && ms <= avgMs) return "text-yellow-400";
  return "text-red-400";
}

export function GpsInsightsTab() {
  const t = useT();

  // ── Replay overlay (live during a replay session) ──────────────────
  // The overlay state (circuit/kart/window) is set in ReplayTab when the
  // user hits Play, and lives in the global race store so this panel
  // survives switching tabs and coming back. The replay clock is
  // interpolated locally at 10 Hz to drive the marker animation.
  const replayActive = useRaceStore((s) => s.replayActive);
  const replayGpsOverlay = useRaceStore((s) => s.replayGpsOverlay);
  const setReplayGpsOverlay = useRaceStore((s) => s.setReplayGpsOverlay);
  const replayClockMs = useReplayClockMs(100);

  // ── Circuit list & filter ───────────────────────────────────────────
  const [circuits, setCircuits] = useState<CircuitOption[]>([]);
  const [selectedCircuit, setSelectedCircuit] = useState<number | null>(null);

  // ── Laps & stats ────────────────────────────────────────────────────
  const [laps, setLaps] = useState<GpsLapSummary[]>([]);
  const [stats, setStats] = useState<GpsStats | null>(null);
  const [loading, setLoading] = useState(false);

  // ── View mode ──────────────────────────────────────────────────────
  const [view, setView] = useState<ViewMode>("list");
  const [detailLap, setDetailLap] = useState<GpsLapDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [colorMode, setColorMode] = useState<"accel" | "speed" | "sectors">("accel");
  const [detailHoverDist, setDetailHoverDist] = useState<number | null>(null);
  const [compareHoverDist, setCompareHoverDist] = useState<number | null>(null);

  // ── Compare ─────────────────────────────────────────────────────────
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set());
  const [compareLaps, setCompareLaps] = useState<GpsLapDetail[]>([]);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Fetch the user's accessible circuits once. Used to populate the
  // dropdown and to look up the configured GPS finish line for each.
  useEffect(() => {
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = (await api.getAnalyticsCircuits()) as any[];
        setCircuits(
          c.map((x) => ({
            id: x.id,
            name: x.name,
            finish_lat1: x.finish_lat1 ?? null,
            finish_lon1: x.finish_lon1 ?? null,
            finish_lat2: x.finish_lat2 ?? null,
            finish_lon2: x.finish_lon2 ?? null,
          })),
        );
      } catch { /* ignore */ }
    })();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setView("list");
    setDetailLap(null);
    setCompareIds(new Set());
    setCompareLaps([]);
    try {
      const params = selectedCircuit
        ? { circuit_id: selectedCircuit, limit: 200 }
        : { limit: 200 };
      const [lapsData, statsData] = await Promise.all([
        api.getGpsLaps(params) as Promise<unknown>,
        api.getGpsStats(selectedCircuit ?? undefined) as Promise<unknown>,
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lapsArr = Array.isArray(lapsData) ? lapsData : (lapsData as any)?.laps ?? [];
      setLaps(lapsArr as GpsLapSummary[]);
      setStats(statsData as GpsStats);
    } catch {
      setLaps([]);
      setStats(null);
    }
    setLoading(false);
  }, [selectedCircuit]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Lap detail ───────────────────────────────────────────────────────
  const openDetail = async (lapId: number) => {
    setLoadingDetail(true);
    setView("detail");
    setDetailLap(null);
    try {
      const detail = (await api.getGpsLapDetail(lapId)) as GpsLapDetail;
      setDetailLap(detail);
    } catch { /* ignore */ }
    setLoadingDetail(false);
  };

  const deleteLap = async (lapId: number) => {
    if (!confirm(t("insights.list.confirmDelete"))) return;
    try {
      await api.deleteGpsLap(lapId);
      setLaps((prev) => prev.filter((l) => l.id !== lapId));
      if (detailLap?.id === lapId) {
        setDetailLap(null);
        setView("list");
      }
      const statsData = (await api.getGpsStats(selectedCircuit ?? undefined)) as GpsStats;
      setStats(statsData);
    } catch { /* ignore */ }
  };

  // ── Compare flow ─────────────────────────────────────────────────────
  const toggleCompare = (lapId: number) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(lapId)) next.delete(lapId);
      else if (next.size < 2) next.add(lapId);
      return next;
    });
  };

  const doCompare = async () => {
    const ids = Array.from(compareIds);
    if (ids.length !== 2) return;
    setLoadingCompare(true);
    setView("compare");
    setDetailLap(null);
    try {
      const [a, b] = await Promise.all([
        api.getGpsLapDetail(ids[0]) as Promise<GpsLapDetail>,
        api.getGpsLapDetail(ids[1]) as Promise<GpsLapDetail>,
      ]);
      setCompareLaps([a, b]);
    } catch {
      setCompareLaps([]);
    }
    setLoadingCompare(false);
  };

  // ── Derived values ──────────────────────────────────────────────────
  const bestLapMs = useMemo(() => {
    const valid = laps.filter((l) => l.duration_ms > 0).map((l) => l.duration_ms);
    return valid.length ? Math.min(...valid) : 0;
  }, [laps]);

  const avgLapMs = useMemo(() => {
    const valid = laps.filter((l) => l.duration_ms > 0);
    if (valid.length === 0) return 0;
    return valid.reduce((a, l) => a + l.duration_ms, 0) / valid.length;
  }, [laps]);

  const statCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: t("insights.stats.totalLaps"), value: String(stats.total_laps ?? 0) },
      {
        label: t("insights.stats.bestLap"),
        value: stats.best_lap_ms ? formatLapTime(stats.best_lap_ms) : "-",
        accent: true,
      },
      {
        label: t("insights.stats.avgLap"),
        value: stats.avg_lap_ms ? formatLapTime(stats.avg_lap_ms) : "-",
      },
      {
        label: t("insights.stats.maxSpeed"),
        value: stats.top_speed_kmh ? `${stats.top_speed_kmh.toFixed(1)} km/h` : "-",
      },
      {
        label: t("insights.stats.totalDistance"),
        value: stats.total_distance_km
          ? `${stats.total_distance_km.toFixed(1)} km`
          : "-",
      },
    ];
  }, [stats, t]);

  const finishLine: { p1: LatLon; p2: LatLon } | null = useMemo(() => {
    if (!detailLap) return null;
    const c = circuits.find((x) => x.id === detailLap.circuit_id);
    if (!c || c.finish_lat1 == null || c.finish_lon1 == null || c.finish_lat2 == null || c.finish_lon2 == null) return null;
    return {
      p1: { lat: c.finish_lat1, lon: c.finish_lon1 },
      p2: { lat: c.finish_lat2, lon: c.finish_lon2 },
    };
  }, [detailLap, circuits]);

  const apexIndices = useMemo(() => {
    if (!detailLap || !detailLap.speeds || !detailLap.distances) return [];
    return detectApexes(detailLap.speeds, detailLap.distances);
  }, [detailLap]);

  const compareApexesA = useMemo(() => {
    const lap = compareLaps[0];
    if (!lap?.speeds || !lap?.distances) return [];
    return detectApexes(lap.speeds, lap.distances);
  }, [compareLaps]);

  const compareApexesB = useMemo(() => {
    const lap = compareLaps[1];
    if (!lap?.speeds || !lap?.distances) return [];
    return detectApexes(lap.speeds, lap.distances);
  }, [compareLaps]);

  const exportLap = (kind: "gpx" | "csv") => {
    if (!detailLap) return;
    const label = `lap-${detailLap.id}-V${detailLap.lap_number}`;
    if (kind === "gpx") downloadBlob(lapToGpx(detailLap, label), `${label}.gpx`, "application/gpx+xml");
    else downloadBlob(lapToCsv(detailLap), `${label}.csv`, "text/csv");
  };

  return (
    <div className="space-y-4">
      {/* Live GPS marker synced to the active replay session. The overlay
          window is populated by ReplayTab when Play is pressed and lives in
          the global store, so this panel persists across tab switches. */}
      {replayActive && replayGpsOverlay && (
        <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] text-neutral-200 uppercase tracking-wider font-medium flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {t("insights.replay.title")}
              <span className="text-neutral-500 font-normal normal-case tracking-normal">
                · {t("insights.replay.syncedSubtitle")}
              </span>
            </h3>
            <button
              onClick={() => setReplayGpsOverlay(null)}
              className="text-neutral-500 hover:text-white text-xs transition-colors"
              title={t("insights.replay.hideMap")}
            >
              {t("insights.replay.hide")}
            </button>
          </div>
          <ReplayGpsMap
            circuitId={replayGpsOverlay.circuitId}
            kartNumber={replayGpsOverlay.kartNumber}
            windowStart={replayGpsOverlay.windowStart}
            windowEnd={replayGpsOverlay.windowEnd}
            replayClockMs={replayClockMs}
          />
        </div>
      )}

      {/* ── Header + filter + stats ────────────────────────────────── */}
      <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{t("insights.title")}</h2>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] text-neutral-400 uppercase tracking-wider">{t("insights.circuit")}</label>
            <select
              value={selectedCircuit ?? ""}
              onChange={(e) => setSelectedCircuit(e.target.value ? Number(e.target.value) : null)}
              className="bg-black/40 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent/50 transition-colors"
            >
              <option value="">{t("insights.circuitAll")}</option>
              {circuits.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex gap-3 mt-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex-1 bg-white/[0.03] rounded-lg p-3 border border-border animate-pulse">
                <div className="h-3 bg-neutral-800 rounded w-16 mb-2" />
                <div className="h-5 bg-neutral-800 rounded w-20" />
              </div>
            ))}
          </div>
        ) : statCards.length > 0 && (stats?.total_laps ?? 0) > 0 ? (
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
            <p className="text-neutral-500 text-sm">{t("insights.empty.title")}</p>
            <p className="text-neutral-600 text-xs mt-1">
              {t("insights.empty.hint")}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Top-level tabs ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setView("list"); setDetailLap(null); }}
          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${view === "list" ? "bg-accent/20 text-accent border border-accent/40" : "bg-white/[0.03] text-neutral-400 border border-border hover:text-white"}`}
        >
          {t("insights.tab.laps")}
        </button>
        <button
          onClick={() => setView("heatmap")}
          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${view === "heatmap" ? "bg-accent/20 text-accent border border-accent/40" : "bg-white/[0.03] text-neutral-400 border border-border hover:text-white"}`}
        >
          {t("insights.tab.heatmap")}
        </button>
        <button
          onClick={() => setView("consistency")}
          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${view === "consistency" ? "bg-accent/20 text-accent border border-accent/40" : "bg-white/[0.03] text-neutral-400 border border-border hover:text-white"}`}
        >
          {t("insights.tab.consistency")}
        </button>
        {compareIds.size > 0 && view !== "compare" && (
          <button
            onClick={doCompare}
            disabled={compareIds.size !== 2}
            className="ml-auto bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            {t("insights.compare.button", { n: compareIds.size })}
          </button>
        )}
      </div>

      {/* ── List view ─────────────────────────────────────────────── */}
      {view === "list" && !loading && laps.length > 0 && (
        <div className="bg-white/[0.03] rounded-xl border border-border p-4">
          <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider font-medium">
            {t("insights.list.title")}
            <span className="text-neutral-500 font-normal ml-2">({laps.length})</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] text-neutral-400 uppercase tracking-wider">
                <tr>
                  <th className="text-center px-1 py-1.5 w-8" />
                  <th className="text-center px-2 py-1.5 w-8">#</th>
                  <th className="text-right px-2 py-1.5">{t("insights.list.col.time")}</th>
                  <th className="text-right px-2 py-1.5 hidden sm:table-cell">{t("insights.list.col.distance")}</th>
                  <th className="text-right px-2 py-1.5">{t("insights.list.col.maxSpeed")}</th>
                  <th className="text-left px-2 py-1.5 hidden md:table-cell">{t("insights.list.col.source")}</th>
                  <th className="text-left px-2 py-1.5 hidden sm:table-cell">{t("insights.list.col.date")}</th>
                  <th className="text-center px-2 py-1.5 w-20">{t("insights.list.col.actions")}</th>
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
                    <td className={`px-2 py-1.5 text-right font-mono font-semibold ${lapTimeColor(lap.duration_ms, bestLapMs, avgLapMs)}`}>
                      {formatLapTime(lap.duration_ms)}
                    </td>
                    <td className="px-2 py-1.5 text-right text-neutral-400 text-xs hidden sm:table-cell">
                      {formatDistance(lap.total_distance_m)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-neutral-300 text-xs">
                      {lap.max_speed_kmh?.toFixed(1) ?? "-"} km/h
                    </td>
                    <td className="px-2 py-1.5 text-left text-neutral-500 text-xs hidden md:table-cell">
                      {lap.gps_source || "-"}
                    </td>
                    <td className="px-2 py-1.5 text-left text-neutral-500 text-xs hidden sm:table-cell whitespace-nowrap">
                      {formatDateShort(lap.recorded_at)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openDetail(lap.id)}
                          className="text-neutral-500 hover:text-accent transition-colors p-1"
                          title={t("insights.list.viewDetail")}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteLap(lap.id)}
                          className="text-neutral-500 hover:text-red-400 transition-colors p-1"
                          title={t("insights.list.delete")}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79M9 5.79V4.875c0-1.18.91-2.165 2.09-2.201a51.964 51.964 0 013.32 0c1.18.036 2.09 1.022 2.09 2.201V5.79" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-4 text-[10px]">
            <span className="text-green-400">{t("insights.list.legend.fast")}</span>
            <span className="text-yellow-400">{t("insights.list.legend.medium")}</span>
            <span className="text-red-400">{t("insights.list.legend.slow")}</span>
          </div>
        </div>
      )}

      {/* ── Heatmap view ─────────────────────────────────────────── */}
      {view === "heatmap" && (
        <div className="bg-white/[0.03] rounded-xl border border-border p-4">
          <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider font-medium">
            {t("insights.heatmap.title")}
            <span className="text-neutral-500 font-normal ml-2">
              {t("insights.heatmap.subtitle", { n: Math.min(20, laps.length) })}
            </span>
          </h3>
          <SpeedHeatmap lapSummaries={laps} circuitId={selectedCircuit} />
        </div>
      )}

      {/* ── Consistency view ──────────────────────────────────────── */}
      {view === "consistency" && (
        <div className="bg-white/[0.03] rounded-xl border border-border p-4">
          <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider font-medium">
            {t("insights.consistency.title")}
          </h3>
          <ConsistencyView lapSummaries={laps} circuitId={selectedCircuit} />
        </div>
      )}

      {/* ── Detail view ──────────────────────────────────────────── */}
      {view === "detail" && (
        <div className="bg-white/[0.03] rounded-xl border border-border p-4 space-y-4">
          {loadingDetail ? (
            <div className="text-neutral-500 text-xs animate-pulse text-center py-12">{t("insights.detail.loading")}</div>
          ) : detailLap ? (
            <>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                    {t("insights.detail.lapPrefix")} {detailLap.lap_number}
                  </h3>
                  <div className="flex items-center gap-3 text-[10px] text-neutral-400 mt-1">
                    <span className="text-green-400 font-mono font-semibold text-base">
                      {formatLapTime(detailLap.duration_ms)}
                    </span>
                    <span>{formatDistance(detailLap.total_distance_m)}</span>
                    <span>{t("insights.detail.max")}: {detailLap.max_speed_kmh?.toFixed(1) ?? "-"} km/h</span>
                    <span className="text-neutral-500">
                      {(detailLap.distances?.length ?? 0)} samples
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => exportLap("gpx")}
                    className="text-[10px] bg-white/[0.03] hover:bg-white/[0.06] border border-border text-neutral-300 px-2 py-1 rounded transition-colors"
                  >
                    GPX
                  </button>
                  <button
                    onClick={() => exportLap("csv")}
                    className="text-[10px] bg-white/[0.03] hover:bg-white/[0.06] border border-border text-neutral-300 px-2 py-1 rounded transition-colors"
                  >
                    CSV
                  </button>
                  <button
                    onClick={() => { setView("list"); setDetailLap(null); }}
                    className="text-neutral-500 hover:text-white text-lg leading-none transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {detailLap.positions && detailLap.positions.length > 1 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] text-neutral-400 uppercase tracking-wider">
                      {t("insights.detail.trackTitle")}
                    </div>
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        onClick={() => setColorMode("accel")}
                        className={`px-2 py-0.5 rounded ${colorMode === "accel" ? "bg-accent/20 text-accent" : "text-neutral-500 hover:text-white"}`}
                      >
                        {t("insights.detail.colorAccel")}
                      </button>
                      <button
                        onClick={() => setColorMode("speed")}
                        className={`px-2 py-0.5 rounded ${colorMode === "speed" ? "bg-accent/20 text-accent" : "text-neutral-500 hover:text-white"}`}
                      >
                        {t("insights.detail.colorSpeed")}
                      </button>
                      <button
                        onClick={() => setColorMode("sectors")}
                        className={`px-2 py-0.5 rounded ${colorMode === "sectors" ? "bg-accent/20 text-accent" : "text-neutral-500 hover:text-white"}`}
                      >
                        {t("insights.detail.colorSectors")}
                      </button>
                    </div>
                  </div>
                  <TrackMap
                    lap={detailLap}
                    finishLine={finishLine}
                    colorMode={colorMode}
                    apexes={apexIndices}
                    hoverDistance={detailHoverDist}
                  />
                  {colorMode === "accel" && (
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-neutral-400">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-1 rounded" style={{ background: "rgb(240,50,50)" }} />
                        {t("insights.detail.legend.braking")}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-1 rounded bg-neutral-300" />
                        {t("insights.detail.legend.constant")}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-1 rounded" style={{ background: "rgb(40,240,70)" }} />
                        {t("insights.detail.legend.accelerating")}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#facc15" }} />
                        {t("insights.detail.legend.apex")}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {detailLap.speeds && detailLap.distances && detailLap.speeds.length > 1 && (
                <div>
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">
                    {t("insights.detail.speedTrace")}
                  </div>
                  <div className="bg-black/30 rounded-lg border border-border p-2">
                    <SpeedTrace
                      lap={detailLap}
                      apexes={apexIndices}
                      height={200}
                      onHoverDistance={setDetailHoverDist}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {detailLap.gforce_lat && detailLap.gforce_lon && detailLap.gforce_lat.length > 0 && (
                  <div>
                    <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">
                      {t("insights.detail.gg")}
                    </div>
                    <div className="bg-black/30 rounded-lg border border-border p-2">
                      <GForceScatter
                        gforceLat={detailLap.gforce_lat}
                        gforceLon={detailLap.gforce_lon}
                      />
                    </div>
                  </div>
                )}
                {detailLap.speeds && detailLap.speeds.length > 0 && (
                  <div>
                    <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">
                      {t("insights.detail.speedDistribution")}
                    </div>
                    <div className="bg-black/30 rounded-lg border border-border p-2">
                      <SpeedHistogram speeds={detailLap.speeds} />
                    </div>
                  </div>
                )}
              </div>

              {apexIndices.length > 0 && (
                <div>
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">
                    {t("insights.detail.apexCount", { n: apexIndices.length })}
                  </div>
                  <ApexList lap={detailLap} apexes={apexIndices} />
                </div>
              )}
            </>
          ) : (
            <div className="text-neutral-500 text-xs text-center py-8">
              {t("insights.detail.notLoaded")}
            </div>
          )}
        </div>
      )}

      {/* ── Compare view ─────────────────────────────────────────── */}
      {view === "compare" && (
        <div className="bg-white/[0.03] rounded-xl border border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              {t("insights.compare.title")}
            </h3>
            <button
              onClick={() => { setView("list"); setCompareLaps([]); setCompareIds(new Set()); }}
              className="text-neutral-500 hover:text-white text-lg leading-none transition-colors"
            >
              ✕
            </button>
          </div>

          {loadingCompare ? (
            <div className="text-neutral-500 text-xs animate-pulse text-center py-8">{t("insights.compare.loading")}</div>
          ) : compareLaps.length === 2 ? (
            <>
              <MicrosectorTable lapA={compareLaps[0]} lapB={compareLaps[1]} />

              <div>
                <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">
                  {t("insights.compare.speedOverlay")}
                </div>
                <div className="bg-black/30 rounded-lg border border-border p-2">
                  <SpeedTraceCompare
                    lapA={compareLaps[0]}
                    lapB={compareLaps[1]}
                    height={220}
                    onHoverDistance={setCompareHoverDist}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {compareLaps.map((lap, i) => (
                  <div key={lap.id}>
                    <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">
                      {t("insights.compare.trackPrefix")} V{lap.lap_number}{" "}
                      <span className={i === 0 ? "text-blue-400" : "text-orange-400"}>
                        ({formatLapTime(lap.duration_ms)})
                      </span>
                    </div>
                    {lap.positions && lap.positions.length > 1 && (
                      <TrackMap
                        lap={lap}
                        colorMode="accel"
                        height={260}
                        apexes={i === 0 ? compareApexesA : compareApexesB}
                        hoverDistance={compareHoverDist}
                      />
                    )}
                  </div>
                ))}
              </div>

              {(compareApexesA.length > 0 || compareApexesB.length > 0) && (
                <div>
                  <div className="text-[10px] text-neutral-400 uppercase tracking-wider mb-2">
                    {t("insights.compare.apexDetected")}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {compareLaps.map((lap, i) => {
                      const apx = i === 0 ? compareApexesA : compareApexesB;
                      return (
                        <div key={lap.id}>
                          <div className="text-[10px] mb-1.5">
                            <span className={i === 0 ? "text-blue-400" : "text-orange-400"}>
                              V{lap.lap_number}
                            </span>
                            <span className="text-neutral-500 ml-1.5">{t("insights.compare.apexesSuffix", { n: apx.length })}</span>
                          </div>
                          {apx.length > 0 ? (
                            <ApexList lap={lap} apexes={apx} />
                          ) : (
                            <div className="text-neutral-600 text-xs">{t("insights.compare.noApexes")}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-neutral-500 text-xs text-center py-8">
              {t("insights.compare.notLoaded")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
