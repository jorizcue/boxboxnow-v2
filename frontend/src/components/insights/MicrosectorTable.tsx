"use client";

// Compare two laps subdivided into N microsectors. Highlights which lap is
// faster in each sector and shows the gap so the driver can spot exactly
// where time was lost.

import { useMemo } from "react";
import type { GpsLapDetail } from "./types";
import { microsectorTimes, formatLapTime, formatDelta, MICROSECTOR_COUNT } from "./helpers";
import { useT } from "@/lib/i18n";

export interface SelectedMicro {
  index: number;
  startDist: number;
  endDist: number;
}

interface Props {
  lapA: GpsLapDetail;
  lapB: GpsLapDetail;
  count?: number;
  /** Currently selected microsector index (controlled), or null. */
  selectedIndex?: number | null;
  /** Toggle a microsector. Passes null when the same row is clicked again. */
  onSelect?: (m: SelectedMicro | null) => void;
  /** Override the V-number labels (e.g. "Piloto · V12" when comparing
   *  laps from different pilots). Defaults to "V{lap_number}". */
  labelA?: string;
  labelB?: string;
}

export function MicrosectorTable({
  lapA,
  lapB,
  count = MICROSECTOR_COUNT,
  selectedIndex = null,
  onSelect,
  labelA: labelAProp,
  labelB: labelBProp,
}: Props) {
  const t = useT();
  const data = useMemo(() => {
    const a = microsectorTimes(lapA, count);
    const b = microsectorTimes(lapB, count);
    const n = Math.min(a.length, b.length);
    let sumA = 0;
    let sumB = 0;
    let sumBest = 0;
    const rows = [];
    for (let i = 0; i < n; i++) {
      const dA = a[i].durationMs;
      const dB = b[i].durationMs;
      const delta = dA - dB; // negative = A is faster in this sector
      const best = Math.min(dA, dB);
      sumA += dA;
      sumB += dB;
      sumBest += best;
      rows.push({
        index: i,
        startDist: a[i].startDist,
        endDist: a[i].endDist,
        durA: dA,
        durB: dB,
        delta,
        bestDur: best,
        winner: dA < dB ? "A" : dA > dB ? "B" : "tie",
      });
    }
    // The per-microsector durations come from interpolating the GPS trace
    // at 20 equally-spaced distance points, so sumA / sumB equal
    // (ts[last] - ts[first]) of the GPS samples — which is a few ms short
    // of `lap.duration_ms` (the canonical finish-line-to-finish-line lap
    // time stored in the DB) because GPS samples don't fall exactly on
    // the finish line at the 25 Hz cadence. We surface the canonical
    // duration in the header cards so the totals match the lap selector,
    // and rescale the "theoretical best" into the same canonical reference
    // by applying the microsector savings vs the better actual lap. The
    // per-row deltas stay in microsector units (correct for sampling
    // since both laps come from the same trace shape).
    const microSavings = Math.max(0, Math.min(sumA, sumB) - sumBest);
    const bestCanonical = Math.min(lapA.duration_ms, lapB.duration_ms);
    const theoreticalCanonical = Math.max(0, bestCanonical - microSavings);
    return { rows, sumA, sumB, sumBest, microSavings, bestCanonical, theoreticalCanonical };
  }, [lapA, lapB, count]);

  const labelA = labelAProp ?? `V${lapA.lap_number}`;
  const labelB = labelBProp ?? `V${lapB.lap_number}`;

  const pick = (r: { index: number; startDist: number; endDist: number }) => {
    if (!onSelect) return;
    if (selectedIndex === r.index) onSelect(null);
    else onSelect({ index: r.index, startDist: r.startDist, endDist: r.endDist });
  };

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider">{labelA}</div>
          <div className="text-base font-mono font-semibold text-blue-300">
            {formatLapTime(lapA.duration_ms)}
          </div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider">{labelB}</div>
          <div className="text-base font-mono font-semibold text-orange-300">
            {formatLapTime(lapB.duration_ms)}
          </div>
        </div>
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider">
            {t("insights.microsector.theoretical")}
          </div>
          <div className="text-base font-mono font-semibold text-purple-300">
            {formatLapTime(data.theoreticalCanonical)}
          </div>
          <div className="text-[10px] text-neutral-500 mt-0.5">
            {formatDelta(-data.microSavings)} {t("insights.microsector.vsBest")}
          </div>
        </div>
      </div>

      {/* Sector bars */}
      <div className="bg-black/30 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider">
            {t("insights.microsector.summary", { n: data.rows.length })}
          </div>
          {onSelect && (
            selectedIndex != null ? (
              <button
                onClick={() => onSelect(null)}
                className="text-[10px] text-accent hover:text-accent/80 transition-colors"
              >
                {t("insights.microsector.clearFocus")} ✕
              </button>
            ) : (
              <span className="text-[10px] text-neutral-600">
                {t("insights.microsector.clickHint")}
              </span>
            )
          )}
        </div>
        <div className="flex gap-0.5 h-8">
          {data.rows.map((r) => {
            const bg =
              r.winner === "A"
                ? "bg-blue-500"
                : r.winner === "B"
                ? "bg-orange-500"
                : "bg-neutral-500";
            const isSel = selectedIndex === r.index;
            return (
              <div
                key={r.index}
                onClick={() => pick(r)}
                className={`flex-1 ${bg} transition-all cursor-pointer ${
                  isSel
                    ? "opacity-100 ring-2 ring-white scale-y-110"
                    : selectedIndex != null
                    ? "opacity-30 hover:opacity-70"
                    : "opacity-80 hover:opacity-100"
                }`}
                title={`Sector ${r.index + 1}: ${formatDelta(r.delta)} (${labelA} ${formatLapTime(r.durA)} | ${labelB} ${formatLapTime(r.durB)})`}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px]">
          <span className="text-blue-400 flex items-center gap-1">
            <span className="w-2 h-2 bg-blue-500 inline-block rounded-sm" />
            {labelA} {t("insights.microsector.fasterPrefix")} ({data.rows.filter((r) => r.winner === "A").length})
          </span>
          <span className="text-orange-400 flex items-center gap-1">
            <span className="w-2 h-2 bg-orange-500 inline-block rounded-sm" />
            {labelB} {t("insights.microsector.fasterPrefix")} ({data.rows.filter((r) => r.winner === "B").length})
          </span>
        </div>
      </div>

      {/* Detailed table */}
      <div className="bg-black/30 rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] text-neutral-400 uppercase tracking-wider bg-black/40">
              <tr>
                <th className="text-left px-2 py-1.5">{t("insights.microsector.col.sector")}</th>
                <th className="text-right px-2 py-1.5">{t("insights.microsector.col.from")}</th>
                <th className="text-right px-2 py-1.5">{t("insights.microsector.col.to")}</th>
                <th className="text-right px-2 py-1.5 text-blue-300">{labelA}</th>
                <th className="text-right px-2 py-1.5 text-orange-300">{labelB}</th>
                <th className="text-right px-2 py-1.5">{t("insights.microsector.col.delta")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.index}
                  onClick={() => pick(r)}
                  className={`border-t border-border cursor-pointer transition-colors ${
                    selectedIndex === r.index
                      ? "bg-accent/15 ring-1 ring-inset ring-accent/40"
                      : "hover:bg-white/[0.04]"
                  }`}
                >
                  <td className="px-2 py-1.5 text-neutral-400">
                    {selectedIndex === r.index ? "▸ " : ""}S{r.index + 1}
                  </td>
                  <td className="px-2 py-1.5 text-right text-neutral-500 font-mono">
                    {Math.round(r.startDist)}m
                  </td>
                  <td className="px-2 py-1.5 text-right text-neutral-500 font-mono">
                    {Math.round(r.endDist)}m
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right font-mono ${
                      r.winner === "A" ? "text-blue-300 font-semibold" : "text-neutral-400"
                    }`}
                  >
                    {formatLapTime(r.durA)}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right font-mono ${
                      r.winner === "B" ? "text-orange-300 font-semibold" : "text-neutral-400"
                    }`}
                  >
                    {formatLapTime(r.durB)}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right font-mono ${
                      r.delta < 0 ? "text-blue-400" : r.delta > 0 ? "text-orange-400" : "text-neutral-500"
                    }`}
                  >
                    {formatDelta(r.delta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
