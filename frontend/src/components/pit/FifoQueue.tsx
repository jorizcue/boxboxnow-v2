"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { useSimNow } from "@/hooks/useSimNow";
import { tierHex, secondsToHMS, msToLapTime } from "@/lib/formatters";
import { sendBoxCall } from "@/lib/driverChannel";
import { api } from "@/lib/api";
import type { FifoEntry } from "@/types/race";
import clsx from "clsx";
import { useT } from "@/lib/i18n";
import { RainToggle } from "@/components/shared/RainToggle";

export function FifoQueue() {
  const { fifo, config, karts } = useRaceStore();
  const t = useT();
  const { now, speed } = useSimNow();
  const raceClockMs = useRaceClock();
  const durationMs = useRaceStore((s) => s.durationMs);
  const raceStarted = useRaceStore((s) => s.raceStarted);
  const [selectedEntry, setSelectedEntry] = useState<FifoEntry | null>(null);

  const boxLines = config.boxLines || 2;
  const boxKarts = config.boxKarts || 4;
  const kartsPerRow = Math.max(1, Math.ceil(boxKarts / boxLines));

  // Entry helpers (handles old number[] and new FifoEntry[] formats)
  const entryScore = (e: FifoEntry | number): number =>
    typeof e === "number" ? e : (e?.score ?? 25);
  const entryTeam = (e: FifoEntry | number): string =>
    typeof e === "object" && e ? (e.teamName || "") : "";
  const entryDriver = (e: FifoEntry | number): string =>
    typeof e === "object" && e ? (e.driverName || "") : "";

  // Split queue into rows (round-robin: idx % boxLines)
  const rows = useMemo(() => {
    const result: (FifoEntry | number)[][] = Array.from({ length: boxLines }, () => []);
    const queue = fifo.queue.slice(0, boxKarts);
    for (let idx = 0; idx < queue.length; idx++) {
      const row = idx % boxLines;
      result[row].push(queue[idx]);
    }
    return result.filter((r) => r.length > 0);
  }, [fifo.queue, boxLines, boxKarts]);

  // Sort karts by avg for position calc
  const sorted = useMemo(() =>
    [...karts].sort((a, b) => {
      const aAvg = a.avgLapMs > 0 ? a.avgLapMs : Infinity;
      const bAvg = b.avgLapMs > 0 ? b.avgLapMs : Infinity;
      return aAvg - bAvg;
    }), [karts]);

  // Our kart
  const ourKart = config.ourKartNumber > 0
    ? karts.find((k) => k.kartNumber === config.ourKartNumber)
    : undefined;

  // Stint calc using race clock (same as RaceTable)
  const raceFinished = useRaceStore((s) => s.raceFinished);
  const stintSecondsFor = (kart: typeof karts[0]) => {
    if (raceClockMs === 0 || raceFinished) return 0;
    const stintStart = kart.stintStartCountdownMs || durationMs || raceClockMs;
    return Math.max(0, stintStart - raceClockMs) / 1000;
  };

  const ourStintSec = ourKart ? stintSecondsFor(ourKart) : 0;
  const ourStintMin = ourStintSec / 60;
  const timeToMaxStint = Math.max(0, config.maxStintMin * 60 - ourStintSec);
  const lapsToMaxStint = ourKart && ourKart.avgLapMs > 0
    ? timeToMaxStint / (ourKart.avgLapMs / 1000)
    : 0;

  const kartsNearPit = sorted.filter((k) => {
    const stintSec = stintSecondsFor(k);
    return stintSec / 60 >= config.maxStintMin - 5 && k.pitStatus !== "in_pit";
  }).length;

  const ourAvgPosition = ourKart
    ? sorted.findIndex((k) => k.kartNumber === config.ourKartNumber) + 1
    : 0;

  // Compute actual pit-in elapsed time (independent of stint timer)
  const pitElapsedSec = useMemo(() => {
    if (!ourKart || ourKart.pitStatus !== "in_pit" || durationMs === 0 || raceClockMs === 0) return 0;
    // Find last pit record still in pit (pitTimeMs === 0)
    const history = ourKart.pitHistory;
    if (history.length > 0) {
      const last = history[history.length - 1];
      if (last.pitTimeMs === 0 && last.raceTimeMs > 0) {
        const raceElapsedMs = durationMs - raceClockMs;
        return Math.max(0, (raceElapsedMs - last.raceTimeMs) / 1000);
      }
    }
    // Fallback: use stint timer
    return ourStintSec;
  }, [ourKart, durationMs, raceClockMs, ourStintSec]);

  // Lap delta tracking for last lap card
  const prevLastLapRef = useRef<number>(0);
  const [lastLapDelta, setLastLapDelta] = useState<"faster" | "slower" | null>(null);
  const ourLastLapMs = ourKart?.lastLapMs ?? 0;
  useEffect(() => {
    if (ourLastLapMs > 0 && prevLastLapRef.current > 0 && ourLastLapMs !== prevLastLapRef.current) {
      setLastLapDelta(ourLastLapMs < prevLastLapRef.current ? "faster" : "slower");
    }
    if (ourLastLapMs > 0) {
      prevLastLapRef.current = ourLastLapMs;
    }
  }, [ourLastLapMs]);

  // Stint colors
  const stintColor = (() => {
    if (ourStintMin < config.minStintMin) return "text-red-400";
    if (ourStintMin >= config.maxStintMin) return "text-red-400 animate-pulse";
    if (ourStintMin >= config.maxStintMin - 5) return "text-orange-400";
    return "text-green-400";
  })();

  const timeToMaxColor = (() => {
    if (timeToMaxStint <= 0) return "text-red-400 animate-pulse";
    if (timeToMaxStint / 60 <= 5) return "text-orange-400";
    return "text-neutral-200";
  })();

  // Score
  const boxScore = fifo.score ?? 0;
  const scoreDotColor =
    boxScore >= 75 ? "bg-accent" :
    boxScore >= 50 ? "bg-yellow-500" :
    boxScore >= 25 ? "bg-orange-500" :
    "bg-red-500";

  return (
    <div className="race-layout flex flex-col h-full">
      {/* ── Indicator cards (same as race tab) ── */}
      <div className="sticky-cards sticky top-0 z-20 bg-black pb-2">
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5 sm:gap-2">
          {/* Driver / Last lap */}
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-center">
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("metric.driverLastLap")}
            </span>
            <span className="text-sm sm:text-base font-bold leading-none text-neutral-200 truncate max-w-full mb-0.5">
              {ourKart?.driverName || ourKart?.teamName || "-"}
            </span>
            <span className={clsx(
              "text-lg sm:text-xl font-mono font-black leading-none",
              lastLapDelta === "faster" ? "text-green-400" :
              lastLapDelta === "slower" ? "text-yellow-400" : "text-white"
            )}>
              {ourKart && ourKart.lastLapMs > 0 ? (
                <>
                  {lastLapDelta === "faster" && <span className="mr-0.5">↓</span>}
                  {lastLapDelta === "slower" && <span className="mr-0.5">↑</span>}
                  {msToLapTime(ourKart.lastLapMs)}
                </>
              ) : "-"}
            </span>
          </div>

          {/* Avg 20 laps */}
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-center">
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("metric.avgLap")}
            </span>
            <span className="text-lg sm:text-xl font-mono font-black leading-none text-neutral-200">
              {ourKart && ourKart.avgLapMs > 0 ? msToLapTime(Math.round(ourKart.avgLapMs)) : "-"}
            </span>
          </div>

          {/* Position by avg */}
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-center">
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("metric.avgPosition")}
            </span>
            <span className={clsx(
              "text-lg sm:text-xl font-mono font-black leading-none",
              ourAvgPosition <= 3 ? "text-accent" : ourAvgPosition <= 10 ? "text-green-400" : "text-neutral-200"
            )}>
              {ourAvgPosition > 0 ? `${ourAvgPosition}/${sorted.length}` : "-"}
            </span>
          </div>

          {/* Stint time */}
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-center">
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("metric.currentStint")}
            </span>
            <span className={clsx("text-lg sm:text-xl font-mono font-black leading-none", stintColor)}>
              {secondsToHMS(ourStintSec)}
            </span>
          </div>

          {/* Time to max stint */}
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-center">
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("metric.timeToMaxStint")}
            </span>
            <span className={clsx("text-lg sm:text-xl font-mono font-black leading-none", timeToMaxColor)}>
              {secondsToHMS(timeToMaxStint)}
            </span>
          </div>

          {/* Laps to max stint */}
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-center">
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("metric.lapsToMaxStint")}
            </span>
            <span className="text-lg sm:text-xl font-mono font-black leading-none text-neutral-200">
              {lapsToMaxStint > 0 ? lapsToMaxStint.toFixed(1) : "0"}
            </span>
          </div>

          {/* Karts near pit */}
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-center">
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("metric.kartsNearPit")}
            </span>
            <span className={clsx(
              "text-lg sm:text-xl font-mono font-black leading-none",
              kartsNearPit > 3 ? "text-orange-400" : kartsNearPit > 0 ? "text-yellow-400" : "text-neutral-200"
            )}>
              {kartsNearPit}
            </span>
          </div>

          {/* BOX call button */}
          <BoxCallButton />

          {/* Rain toggle */}
          <RainToggle />
        </div>
      </div>

      {/* ── Box score + FIFO queue rows ── */}
      <div className="flex gap-2 sm:gap-3 mt-2">
        {/* Box score card (left) */}
        <div className="flex-shrink-0 bg-surface rounded-xl border border-border p-3 sm:p-4 flex flex-col items-center justify-center w-24 sm:w-28">
          <span className={`w-2.5 h-2.5 rounded-full ${scoreDotColor} mb-1.5`} />
          <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
            {t("driver.boxScore")}
          </span>
          <span
            className="text-3xl sm:text-4xl font-black leading-none"
            style={{ color: tierHex(boxScore) }}
          >
            {boxScore > 0 ? boxScore.toFixed(1) : "-"}
          </span>
          <span className="text-[8px] text-neutral-600 uppercase tracking-widest mt-0.5">/ 100</span>
        </div>

        {/* FIFO queue rows (right, takes remaining space) */}
        <div className="flex-1 bg-surface rounded-xl border border-border p-2 sm:p-3">
          <div className="space-y-2 sm:space-y-3">
            {rows.map((row, rowIdx) => (
              <div key={rowIdx} className="flex items-center gap-1.5 sm:gap-2">
                {/* Checkered flag */}
                <div className="flex-shrink-0 w-6 sm:w-8 text-center text-base sm:text-xl">🏁</div>

                {/* Cards */}
                <div className="flex gap-1 sm:gap-2 flex-1 overflow-x-auto">
                  {row.map((entry, colIdx) => {
                    const score = entryScore(entry);
                    const team = entryTeam(entry);
                    const driver = entryDriver(entry);
                    const kartNum = typeof entry === "object" && entry ? entry.kartNumber : null;
                    const hasInfo = team || driver;
                    return (
                      <button
                        key={colIdx}
                        onClick={() => typeof entry === "object" && entry && setSelectedEntry(entry)}
                        className="flex-1 min-w-[48px] sm:min-w-[80px] max-w-[140px] rounded-lg border-2 border-neutral-600 bg-neutral-800/50 flex flex-col items-center justify-center py-1 sm:py-1.5 px-1 transition-all hover:border-accent/50 hover:bg-neutral-700/50 cursor-pointer active:scale-95"
                      >
                        <span
                          className="text-lg sm:text-2xl font-bold leading-tight"
                          style={{ color: tierHex(score) }}
                        >
                          {score}
                        </span>
                        {hasInfo ? (
                          <>
                            <span className="text-[7px] sm:text-[9px] text-neutral-300 mt-0.5 truncate w-full text-center leading-tight font-medium">
                              {team}
                            </span>
                            <span className="text-[6px] sm:text-[8px] text-neutral-500 truncate w-full text-center leading-tight">
                              {driver}
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] sm:text-[10px] text-neutral-500 mt-0.5">Box</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Row label */}
                <div className="flex-shrink-0 flex items-center gap-0.5">
                  <span className="text-[10px] sm:text-xs text-red-400 font-bold">F{rowIdx + 1}</span>
                  <span className="text-red-400 text-xs sm:text-sm">&larr;</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Pit info cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 sm:gap-2 mt-3">
        {/* Current pit time */}
        <PitCard
          label={t("pit.currentPit")}
          value={ourKart?.pitStatus === "in_pit" ? secondsToHMS(pitElapsedSec) : secondsToHMS(0)}
          accent={ourKart?.pitStatus === "in_pit"}
        />
        {/* Min pit time */}
        <PitCard
          label={t("pit.minPitTime")}
          value={secondsToHMS(config.pitTimeS)}
        />
        {/* Pit count */}
        <PitCard
          label={t("pit.pitCount")}
          value={ourKart ? String(ourKart.pitCount) : "0"}
        />
        {/* Min pit count */}
        <PitCard
          label={t("pit.minPitCount")}
          value={String(config.minPits)}
        />
        {/* Min stint (before max) */}
        <PitCard
          label={t("metric.minStint")}
          value={secondsToHMS(config.minStintMin * 60)}
        />
        {/* Max stint */}
        <PitCard
          label={t("metric.maxStint")}
          value={secondsToHMS(config.maxStintMin * 60)}
        />
        {/* Box lines (+/-) */}
        <AdjustableCard
          label={t("config.boxLines")}
          value={config.boxLines}
          field="box_lines"
          min={1}
          max={6}
        />
        {/* Box karts (+/-) */}
        <AdjustableCard
          label={t("config.boxKarts")}
          value={config.boxKarts}
          field="box_karts"
          min={1}
          max={60}
        />
      </div>

      {/* ── Kart detail modal ── */}
      {selectedEntry !== null && (
        <KartDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}

      {/* ── FIFO history ── */}
      {fifo.history.length > 0 && (
        <div className="bg-surface rounded-xl p-3 sm:p-4 border border-border mt-3">
          <h3 className="text-[11px] text-neutral-300 mb-3 uppercase tracking-wider font-bold">
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
                          const histRows: (FifoEntry | number)[][] = Array.from({ length: boxLines }, () => []);
                          for (let idx = 0; idx < q.length; idx++) {
                            histRows[idx % boxLines].push(q[idx]);
                          }
                          return histRows.map((hr, ri) => (
                            <div key={ri} className="flex gap-1 items-center">
                              <span className="text-[7px] text-neutral-600 w-3 flex-shrink-0">F{ri + 1}</span>
                              {hr.map((entry, j) => {
                                const s = entryScore(entry);
                                const tm = entryTeam(entry);
                                const dr = entryDriver(entry);
                                const kn = typeof entry === "object" && entry ? entry.kartNumber : null;
                                return (
                                  <div
                                    key={j}
                                    className="min-w-[70px] h-8 rounded flex items-center gap-1.5 px-1.5 text-black"
                                    style={{ backgroundColor: tierHex(s) }}
                                  >
                                    <span className="text-[10px] font-black leading-none">{kn ?? s}</span>
                                    <div className="flex flex-col min-w-0 flex-1">
                                      {tm && <span className="text-[7px] font-bold leading-tight truncate">{tm}</span>}
                                      {dr && <span className="text-[7px] leading-tight truncate opacity-80">{dr}</span>}
                                    </div>
                                    <span className="text-[8px] font-bold leading-none ml-auto flex-shrink-0">{s}</span>
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

/* ── BOX call button ── */
function BoxCallButton() {
  const t = useT();
  const [sent, setSent] = useState(false);

  const handleClick = useCallback(() => {
    sendBoxCall();
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  }, []);

  return (
    <button
      onClick={handleClick}
      className={clsx(
        "rounded-xl border-2 p-2 sm:p-3 flex flex-col items-center justify-center transition-all active:scale-95",
        sent
          ? "bg-red-500/20 border-red-400/60"
          : "bg-red-500/10 border-red-500/40 hover:bg-red-500/25 hover:border-red-400/60"
      )}
    >
      <span className="text-[8px] sm:text-[9px] text-red-300 uppercase tracking-widest font-bold mb-1">
        {t("box.callBox")}
      </span>
      <span className={clsx(
        "text-lg sm:text-xl font-black leading-none",
        sent ? "text-red-300" : "text-red-500"
      )}>
        {sent ? t("box.sent") : "BOX"}
      </span>
    </button>
  );
}

/* ── Adjustable +/- card ── */
function AdjustableCard({ label, value, field, min, max }: {
  label: string; value: number; field: string; min: number; max: number;
}) {
  // configKey maps DB field name to RaceConfig key
  const configKey = field === "box_lines" ? "boxLines" : "boxKarts";

  const adjust = useCallback((delta: number) => {
    const newVal = Math.max(min, Math.min(max, value + delta));
    if (newVal === value) return;
    // Optimistic update
    useRaceStore.setState((s) => ({ config: { ...s.config, [configKey]: newVal } }));
    // Persist (fire and forget)
    api.updateSession({ [field]: newVal }).catch(() => {
      useRaceStore.setState((s) => ({ config: { ...s.config, [configKey]: value } }));
    });
  }, [value, field, configKey, min, max]);

  return (
    <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-center">
      <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1 text-center leading-tight">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => adjust(-1)}
          disabled={value <= min}
          className="w-6 h-6 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-sm disabled:opacity-30 transition-colors"
        >
          -
        </button>
        <span className="text-lg sm:text-xl font-mono font-black leading-none text-white min-w-[2ch] text-center">
          {value}
        </span>
        <button
          onClick={() => adjust(1)}
          disabled={value >= max}
          className="w-6 h-6 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-sm disabled:opacity-30 transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}

/* ── Kart detail modal (snapshot at pit entry) ── */
function KartDetailModal({ entry, onClose }: {
  entry: FifoEntry;
  onClose: () => void;
}) {
  const t = useT();
  const avgPosition = entry.avgPosition ?? 0;
  const avgLapMs = entry.avgLapMs ?? 0;
  const recentLaps = entry.recentLaps ?? [];
  const pitCount = entry.pitCount ?? 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-surface border border-accent/40 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-black text-black"
              style={{ backgroundColor: tierHex(entry.score) }}
            >
              {entry.kartNumber}
            </span>
            <div>
              <div className="text-sm font-bold text-white leading-tight">{entry.teamName || `Kart ${entry.kartNumber}`}</div>
              <div className="text-xs text-neutral-400 leading-tight">{entry.driverName || "-"}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <div className="bg-black/30 rounded-xl p-3 text-center">
            <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-bold block mb-1">{t("metric.avgPosition")}</span>
            <span className={clsx(
              "text-2xl font-black",
              avgPosition <= 3 ? "text-accent" : avgPosition <= 10 ? "text-green-400" : "text-neutral-200"
            )}>
              {avgPosition > 0 ? `${avgPosition}°` : "-"}
            </span>
          </div>
          <div className="bg-black/30 rounded-xl p-3 text-center">
            <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-bold block mb-1">{t("metric.avgLap")}</span>
            <span className="text-2xl font-black font-mono text-neutral-200">
              {avgLapMs > 0 ? msToLapTime(Math.round(avgLapMs)) : "-"}
            </span>
          </div>
          <div className="bg-black/30 rounded-xl p-3 text-center">
            <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-bold block mb-1">{t("pit.pitCount")}</span>
            <span className="text-2xl font-black text-neutral-200">{pitCount}</span>
          </div>
          <div className="bg-black/30 rounded-xl p-3 text-center">
            <span className="text-[9px] text-neutral-400 uppercase tracking-wider font-bold block mb-1">Score</span>
            <span className="text-2xl font-black" style={{ color: tierHex(entry.score) }}>{entry.score}</span>
          </div>
        </div>

        {/* Recent laps (at time of pit entry) */}
        {recentLaps.length > 0 && (
          <div className="px-5 pb-4">
            <h4 className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold mb-2">
              {t("pit.recentLaps")}
            </h4>
            <div className="bg-black/30 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] text-neutral-500 uppercase tracking-wider">
                    <th className="px-3 py-1.5 text-left">{t("pit.lapNumber")}</th>
                    <th className="px-3 py-1.5 text-right">{t("pit.lapTime")}</th>
                    <th className="px-3 py-1.5 text-left">{t("pit.lapDriver")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLaps.map((lap, i) => {
                    const best = Math.min(...recentLaps.map((l) => l.lapTime));
                    const isBest = lap.lapTime === best;
                    return (
                      <tr key={i} className="border-t border-neutral-800">
                        <td className="px-3 py-1.5 text-neutral-400 font-mono">{lap.totalLap}</td>
                        <td className={clsx(
                          "px-3 py-1.5 text-right font-mono font-bold",
                          isBest ? "text-accent" : "text-neutral-200"
                        )}>
                          {msToLapTime(lap.lapTime)}
                        </td>
                        <td className="px-3 py-1.5 text-neutral-400 text-xs truncate max-w-[120px]">{lap.driverName || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Small pit info card ── */
function PitCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={clsx(
      "bg-surface rounded-xl border p-2 sm:p-3 flex flex-col items-center justify-center",
      accent ? "border-accent/40" : "border-border"
    )}>
      <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1 text-center leading-tight">
        {label}
      </span>
      <span className={clsx(
        "text-lg sm:text-xl font-mono font-black leading-none",
        accent ? "text-accent" : "text-white"
      )}>
        {value}
      </span>
    </div>
  );
}
