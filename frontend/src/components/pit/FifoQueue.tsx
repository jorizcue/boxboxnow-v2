"use client";

import { useState, useEffect, useMemo } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { tierHex, secondsToHMS, msToLapTime } from "@/lib/formatters";
import type { FifoEntry } from "@/types/race";
import clsx from "clsx";
import { useT } from "@/lib/i18n";

export function FifoQueue() {
  const { fifo, config, karts } = useRaceStore();
  const t = useT();
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(interval);
  }, []);

  const scoreColor =
    fifo.score >= 75 ? "text-accent" :
    fifo.score >= 50 ? "text-tier-75" :
    fifo.score >= 25 ? "text-tier-50" :
    "text-tier-1";

  const scoreDotColor =
    fifo.score >= 75 ? "bg-accent" :
    fifo.score >= 50 ? "bg-yellow-500" :
    fifo.score >= 25 ? "bg-orange-500" :
    "bg-red-500";

  const boxLines = config.boxLines || 2;
  const boxKarts = config.boxKarts || 4;
  const kartsPerRow = Math.max(1, Math.ceil(boxKarts / boxLines));

  // Helper to extract score from entry (handles both old number[] and new FifoEntry[] formats)
  const entryScore = (e: FifoEntry | number): number =>
    typeof e === "number" ? e : (e?.score ?? 25);
  const entryTeam = (e: FifoEntry | number): string =>
    typeof e === "object" && e ? (e.teamName || "") : "";
  const entryDriver = (e: FifoEntry | number): string =>
    typeof e === "object" && e ? (e.driverName || "") : "";

  // Split queue into rows of `kartsPerRow`
  const rows = useMemo(() => {
    const result: (FifoEntry | number)[][] = [];
    const queue = fifo.queue.slice(0, boxKarts);
    for (let r = 0; r < boxLines; r++) {
      const start = r * kartsPerRow;
      const end = Math.min(start + kartsPerRow, queue.length);
      if (start < queue.length) {
        result.push(queue.slice(start, end));
      }
    }
    return result;
  }, [fifo.queue, boxLines, boxKarts, kartsPerRow]);

  // Our kart info
  const ourKart = config.ourKartNumber > 0
    ? karts.find((k) => k.kartNumber === config.ourKartNumber)
    : undefined;

  const ourStintSec = ourKart
    ? (ourKart.stintStartTime > 0 ? Math.max(0, now - ourKart.stintStartTime) : ourKart.stintDurationS)
    : 0;

  const timeToMaxStint = Math.max(0, config.maxStintMin * 60 - ourStintSec);
  const lapsToMaxStint = ourKart && ourKart.avgLapMs > 0
    ? Math.floor(timeToMaxStint / (ourKart.avgLapMs / 1000))
    : 0;

  const kartsNearPit = karts.filter((k) => {
    const stintSec = k.stintStartTime > 0 ? Math.max(0, now - k.stintStartTime) : k.stintDurationS;
    return stintSec / 60 >= config.maxStintMin - 5 && k.pitStatus !== "in_pit";
  }).length;

  return (
    <div className="space-y-4">
      {/* Visual FIFO queue grid */}
      <div className="bg-surface rounded-xl p-3 sm:p-6 border border-border">
        <div className="space-y-3 sm:space-y-4">
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-center gap-2 sm:gap-3">
              {/* Checkered flag */}
              <div className="flex-shrink-0 w-7 sm:w-10 text-center text-lg sm:text-2xl">🏁</div>

              {/* Cards in this row */}
              <div className="flex gap-1.5 sm:gap-3 flex-1 overflow-x-auto">
                {row.map((entry, colIdx) => {
                  const score = entryScore(entry);
                  const team = entryTeam(entry);
                  const driver = entryDriver(entry);
                  const hasInfo = team || driver;
                  return (
                    <div
                      key={colIdx}
                      className="flex-1 min-w-[56px] sm:min-w-[100px] max-w-[160px] rounded-lg border-2 border-neutral-600 bg-neutral-800/50 flex flex-col items-center justify-center py-1.5 sm:py-2 px-1 sm:px-2"
                    >
                      <span
                        className="text-xl sm:text-3xl font-bold leading-tight"
                        style={{ color: tierHex(score) }}
                      >
                        {score}
                      </span>
                      {hasInfo ? (
                        <>
                          <span className="text-[8px] sm:text-[10px] text-neutral-300 mt-0.5 truncate w-full text-center leading-tight font-medium">
                            {team}
                          </span>
                          <span className="text-[7px] sm:text-[9px] text-neutral-500 truncate w-full text-center leading-tight">
                            {driver}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] sm:text-xs text-neutral-500 mt-0.5">Box</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Fila label */}
              <div className="flex-shrink-0 flex items-center gap-1">
                <span className="text-xs sm:text-sm text-red-400 font-bold">F{rowIdx + 1}</span>
                <span className="text-red-400 text-sm sm:text-lg">&larr;</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Score */}
      <div className="bg-surface rounded-xl p-3 sm:p-4 border border-border flex items-center justify-center gap-2 sm:gap-3">
        <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${scoreDotColor}`} />
        <span className={`text-base sm:text-xl font-bold ${scoreColor}`}>
          Score = {fifo.score.toFixed(1)}
        </span>
      </div>

      {/* Info panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Stint metrics */}
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="bg-neutral-800/50 px-4 py-2 flex justify-between">
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">{t("metric.metric")}</span>
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">{t("metric.value")}</span>
          </div>
          <div className="divide-y divide-border">
            <InfoRow
              label={t("metric.currentStint")}
              value={secondsToHMS(ourStintSec)}
              highlight={ourStintSec / 60 >= config.maxStintMin}
            />
            <InfoRow label={t("metric.timeToMaxStint")} value={secondsToHMS(timeToMaxStint)} />
            <InfoRow label={t("metric.lapsToMaxStint")} value={String(lapsToMaxStint)} />
            <InfoRow label={t("metric.kartsNearPit")} value={String(kartsNearPit)} />
            <InfoRow label={t("metric.maxStint")} value={secondsToHMS(config.maxStintMin * 60)} />
            <InfoRow label={t("metric.minStint")} value={secondsToHMS(config.minStintMin * 60)} />
          </div>
        </div>

        {/* Right: Pit info */}
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="bg-neutral-800/50 px-4 py-2 flex justify-between">
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">{t("pit.pits")}</span>
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">{t("metric.value")}</span>
          </div>
          <div className="divide-y divide-border">
            <InfoRow
              label={t("pit.currentPit")}
              value={ourKart?.pitStatus === "in_pit" ? secondsToHMS(ourStintSec) : secondsToHMS(0)}
            />
            <InfoRow
              label={t("pit.minPitTime")}
              value={secondsToHMS(config.pitTimeS)}
            />
            <InfoRow
              label={t("pit.pitCount")}
              value={ourKart ? String(ourKart.pitCount) : "0"}
            />
            <InfoRow
              label={t("pit.minPitCount")}
              value={String(config.minPits)}
            />
          </div>
        </div>
      </div>

      {/* FIFO history (only shows entries from actual pit events) */}
      {fifo.history.length > 0 && (
        <div className="bg-surface rounded-xl p-4 border border-border">
          <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">
            {t("pit.history")} ({fifo.history.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-neutral-400 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-right">Score</th>
                  <th className="px-2 py-1 text-left">{t("pit.queue")}</th>
                </tr>
              </thead>
              <tbody>
                {[...fifo.history].reverse().slice(0, 15).map((snap, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1 text-neutral-400">{fifo.history.length - i}</td>
                    <td className="px-2 py-1 text-right font-mono font-bold">
                      <span style={{ color: tierHex(snap.score) }}>
                        {snap.score.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-2 py-1">
                      <div className="space-y-0.5">
                        {(() => {
                          const q = snap.queue.slice(0, boxKarts);
                          const histRows: (FifoEntry | number)[][] = [];
                          for (let r = 0; r < boxLines; r++) {
                            const start = r * kartsPerRow;
                            const end = Math.min(start + kartsPerRow, q.length);
                            if (start < q.length) histRows.push(q.slice(start, end));
                          }
                          return histRows.map((hr, ri) => (
                            <div key={ri} className="flex gap-0.5 items-center">
                              <span className="text-[7px] text-neutral-600 w-3 flex-shrink-0">F{ri + 1}</span>
                              {hr.map((entry, j) => {
                                const s = entryScore(entry);
                                const t = entryTeam(entry);
                                return (
                                  <div
                                    key={j}
                                    className="w-5 h-5 rounded-sm flex items-center justify-center text-[8px] font-bold text-black"
                                    style={{ backgroundColor: tierHex(s) }}
                                    title={t || undefined}
                                  >
                                    {s}
                                  </div>
                                );
                              })}
                            </div>
                          ));
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center px-4 py-2">
      <span className={clsx("text-sm", highlight ? "text-tier-1 font-semibold" : "text-neutral-300")}>
        {label}
      </span>
      <span className={clsx("text-sm font-mono", highlight ? "text-tier-1 font-bold" : "text-white")}>
        {value}
      </span>
    </div>
  );
}
