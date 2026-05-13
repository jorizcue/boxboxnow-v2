"use client";

// Per-microsector consistency view across ALL the laps loaded for the
// current circuit. Lower std-dev = the driver always drives that section
// the same way. High std-dev = inconsistent, ripe for improvement.

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { GpsLapDetail, GpsLapSummary } from "./types";
import { microsectorTimes, formatLapTime, MICROSECTOR_COUNT } from "./helpers";
import { useT } from "@/lib/i18n";

interface Props {
  lapSummaries: GpsLapSummary[];
  /** When provided, the analysis is restricted to this circuit. */
  circuitId?: number | null;
}

interface SectorStat {
  index: number;
  count: number;
  meanMs: number;
  stdMs: number;
  bestMs: number;
}

export function ConsistencyView({ lapSummaries, circuitId }: Props) {
  const t = useT();
  const [details, setDetails] = useState<GpsLapDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const targetLaps = useMemo(() => {
    let pool = lapSummaries.filter((l) => l.duration_ms > 5000 && l.total_distance_m > 100);
    if (circuitId != null) pool = pool.filter((l) => l.circuit_id === circuitId);
    // Cap at 20 laps to avoid hammering the API.
    return pool.slice(0, 20);
  }, [lapSummaries, circuitId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (targetLaps.length === 0) {
        setDetails([]);
        return;
      }
      setLoading(true);
      setProgress(0);
      const out: GpsLapDetail[] = [];
      for (let i = 0; i < targetLaps.length; i++) {
        if (cancelled) return;
        try {
          const d = (await api.getGpsLapDetail(targetLaps[i].id)) as GpsLapDetail;
          if (d && d.distances && d.timestamps && d.distances.length > 5) out.push(d);
        } catch {
          // Skip laps with no detail available
        }
        setProgress(i + 1);
      }
      if (!cancelled) {
        setDetails(out);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [targetLaps]);

  const stats = useMemo<SectorStat[]>(() => {
    if (details.length < 2) return [];
    const perSector: number[][] = Array.from({ length: MICROSECTOR_COUNT }, () => []);
    for (const d of details) {
      const sectors = microsectorTimes(d, MICROSECTOR_COUNT);
      sectors.forEach((s, i) => {
        if (s.durationMs > 0 && i < MICROSECTOR_COUNT) perSector[i].push(s.durationMs);
      });
    }
    return perSector.map((times, i) => {
      if (times.length === 0) {
        return { index: i, count: 0, meanMs: 0, stdMs: 0, bestMs: 0 };
      }
      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const variance = times.reduce((a, b) => a + (b - mean) ** 2, 0) / times.length;
      return {
        index: i,
        count: times.length,
        meanMs: mean,
        stdMs: Math.sqrt(variance),
        bestMs: Math.min(...times),
      };
    });
  }, [details]);

  const maxStd = useMemo(() => Math.max(0.001, ...stats.map((s) => s.stdMs)), [stats]);

  if (targetLaps.length < 2) {
    return (
      <div className="text-neutral-500 text-xs text-center py-6">
        {t("insights.consistency.minLaps")}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-neutral-400 text-xs text-center py-6">
        {t("insights.consistency.loadingProgress", { done: progress, total: targetLaps.length })}
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="text-neutral-500 text-xs text-center py-6">
        {t("insights.consistency.processError")}
      </div>
    );
  }

  // Total best-theoretical time
  const theoreticalMs = stats.reduce((acc, s) => acc + s.bestMs, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider">{t("insights.consistency.theoreticalBest")}</div>
          <div className="text-base font-mono font-semibold text-purple-300">
            {formatLapTime(theoreticalMs)}
          </div>
          <div className="text-[10px] text-neutral-500 mt-0.5">
            {t("insights.consistency.sumOfBest", { n: details.length })}
          </div>
        </div>
        <div className="bg-white/[0.03] border border-border rounded-lg p-3">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider">{t("insights.consistency.sectorsAnalyzed")}</div>
          <div className="text-base font-mono font-semibold text-white">
            {stats.length} <span className="text-neutral-500 text-xs">{t("insights.consistency.lapsLabel", { n: details.length })}</span>
          </div>
          <div className="text-[10px] text-neutral-500 mt-0.5">
            {t("insights.consistency.colorLegend")}
          </div>
        </div>
      </div>

      <div className="bg-black/30 rounded-lg border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="text-[10px] text-neutral-400 uppercase tracking-wider bg-black/40">
            <tr>
              <th className="text-left px-2 py-1.5">{t("insights.consistency.col.sector")}</th>
              <th className="text-right px-2 py-1.5">{t("insights.consistency.col.best")}</th>
              <th className="text-right px-2 py-1.5">{t("insights.consistency.col.avg")}</th>
              <th className="text-right px-2 py-1.5">σ</th>
              <th className="text-left px-2 py-1.5">{t("insights.consistency.col.variability")}</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const pct = s.stdMs / maxStd;
              const isWorst = pct > 0.85;
              return (
                <tr key={s.index} className="border-t border-border">
                  <td className={`px-2 py-1.5 font-medium ${isWorst ? "text-orange-300" : "text-neutral-300"}`}>
                    S{s.index + 1}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-green-400">
                    {formatLapTime(s.bestMs)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-neutral-400">
                    {formatLapTime(s.meanMs)}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono ${isWorst ? "text-orange-400" : "text-neutral-400"}`}>
                    ±{(s.stdMs / 1000).toFixed(2)}s
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="bg-black/60 rounded-sm h-2 overflow-hidden">
                      <div
                        className={pct > 0.85 ? "bg-orange-500" : pct > 0.5 ? "bg-yellow-500" : "bg-green-500"}
                        style={{ width: `${pct * 100}%`, height: "100%" }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
