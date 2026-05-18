"use client";

import { Fragment, useCallback, useState } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { useT } from "@/lib/i18n";
import { msToLapTime, secondsToStint, tierHex } from "@/lib/formatters";
import { getDriverInfoForKart, DriverDetailsRow } from "@/components/shared/DriverDetails";
import clsx from "clsx";

// The strategy-metrics card bar that used to live here is now the
// shared <MetricCardsBar/> rendered by the dashboard shell (so it
// persists across Carrera / Box / Live / Tracking / Clasificación).
// This component is the race table body only.

const COL_COUNT = 13; // number of <th> columns

type SortKey = "avgLapMs" | "bestAvgMs" | "lastLapMs" | "bestLapMs" | "totalLaps" | "pitCount" | "tierScore" | "stint" | "kartNumber";
type SortDir = "asc" | "desc";

export function RaceTable() {
  const t = useT();
  const { karts, config } = useRaceStore();
  const raceClockMs = useRaceClock();
  const [expandedKart, setExpandedKart] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("avgLapMs");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Sensible defaults: higher is better for laps/tier, lower is better for times
      setSortDir(key === "totalLaps" || key === "tierScore" || key === "pitCount" ? "desc" : "asc");
    }
  }, [sortKey]);

  const toggleExpand = useCallback(
    (kartNumber: number) => setExpandedKart((prev) => (prev === kartNumber ? null : kartNumber)),
    []
  );

  // Helper: compute stint seconds from race clock
  const durationMs = useRaceStore((s) => s.durationMs);
  const raceFinished = useRaceStore((s) => s.raceFinished);
  const stintSecondsFor = (kart: typeof karts[0]) => {
    if (raceClockMs === 0 || raceFinished) return 0;
    const stintStart = kart.stintStartCountdownMs || durationMs || raceClockMs;
    return Math.max(0, stintStart - raceClockMs) / 1000;
  };

  // Sort karts by selected column
  const sorted = [...karts].sort((a, b) => {
    let aVal: number, bVal: number;
    switch (sortKey) {
      case "avgLapMs": aVal = a.avgLapMs > 0 ? a.avgLapMs : Infinity; bVal = b.avgLapMs > 0 ? b.avgLapMs : Infinity; break;
      case "bestAvgMs": aVal = a.bestAvgMs > 0 ? a.bestAvgMs : Infinity; bVal = b.bestAvgMs > 0 ? b.bestAvgMs : Infinity; break;
      case "lastLapMs": aVal = a.lastLapMs > 0 ? a.lastLapMs : Infinity; bVal = b.lastLapMs > 0 ? b.lastLapMs : Infinity; break;
      case "bestLapMs": aVal = a.bestStintLapMs > 0 ? a.bestStintLapMs : Infinity; bVal = b.bestStintLapMs > 0 ? b.bestStintLapMs : Infinity; break;
      case "totalLaps": aVal = a.totalLaps; bVal = b.totalLaps; break;
      case "pitCount": aVal = a.pitCount; bVal = b.pitCount; break;
      case "tierScore": aVal = a.tierScore; bVal = b.tierScore; break;
      case "stint": aVal = stintSecondsFor(a); bVal = stintSecondsFor(b); break;
      case "kartNumber": aVal = a.kartNumber; bVal = b.kartNumber; break;
      default: aVal = 0; bVal = 0;
    }
    return sortDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <div className="text-center">
          <p className="text-lg">{t("race.noData")}</p>
          <p className="text-sm mt-1 text-neutral-700">{t("race.connectHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="race-table-scroll h-full overflow-y-auto overflow-x-auto -mx-2 sm:mx-0">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-surface text-neutral-200 sticky top-0 z-10 text-[10px] sm:text-[11px] uppercase tracking-wider" data-tour="race-table">
          <tr>
            <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center w-6 sm:w-8">#</th>
            <SortTh align="left" colKey="kartNumber" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-8 sm:w-12">{t("race.kart")}</SortTh>
            <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-left">{t("race.team")}</th>
            <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-left">{t("race.driver")}</th>
            <SortTh align="right" colKey="avgLapMs" current={sortKey} dir={sortDir} onSort={toggleSort} title={t("race.avg20Title")}>{t("race.avg20")}</SortTh>
            <SortTh align="right" colKey="bestAvgMs" current={sortKey} dir={sortDir} onSort={toggleSort} title={t("race.best3Title")}>{t("race.best3")}</SortTh>
            <SortTh align="right" colKey="lastLapMs" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("race.last")}</SortTh>
            <SortTh align="right" colKey="bestLapMs" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("race.best")}</SortTh>
            <SortTh align="center" colKey="totalLaps" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("race.laps")}</SortTh>
            <SortTh align="center" colKey="pitCount" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("race.pit")}</SortTh>
            <SortTh align="center" colKey="tierScore" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-8 sm:w-12">Tier</SortTh>
            <SortTh align="center" colKey="stint" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("race.stint")}</SortTh>
            <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center w-6 sm:w-8"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((kart, index) => {
            const isOurTeam = config.ourKartNumber > 0 && kart.kartNumber === config.ourKartNumber;
            const stintSec = stintSecondsFor(kart);
            const stintMin = stintSec / 60;
            const stintWarning = stintMin >= config.maxStintMin;
            const stintAlert = stintMin >= config.maxStintMin - 5 && stintMin < config.maxStintMin;
            const pitsRemaining = Math.max(0, config.minPits - kart.pitCount);
            const isExpanded = expandedKart === kart.kartNumber;
            const drivers = isExpanded
              ? getDriverInfoForKart(kart, config.minDriverTimeMin, stintSecondsFor(kart) * 1000)
              : [];

            return (
              <Fragment key={kart.rowId}>
                <tr
                  className={clsx(
                    "border-b border-border hover:bg-surface/50 transition-colors cursor-pointer select-none",
                    isOurTeam && "our-team",
                    kart.pitStatus === "in_pit" && "opacity-50"
                  )}
                  onDoubleClick={() => toggleExpand(kart.kartNumber)}
                >
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center font-mono text-neutral-500">{index + 1}</td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 font-mono text-neutral-300">{kart.kartNumber}</td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 font-medium truncate max-w-[100px] sm:max-w-[180px] text-white">
                    {kart.teamName}
                    {isExpanded ? (
                      <span className="ml-1 text-neutral-500 text-xs">&#9650;</span>
                    ) : (
                      <span className="ml-1 text-neutral-600 text-xs">&#9660;</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 truncate max-w-[80px] sm:max-w-[140px] text-neutral-400 text-xs">
                    {kart.driverName || "-"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-neutral-300">
                    {kart.avgLapMs > 0 ? msToLapTime(Math.round(kart.avgLapMs)) : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-neutral-400">
                    {kart.bestAvgMs > 0 ? msToLapTime(Math.round(kart.bestAvgMs)) : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-white">
                    {msToLapTime(kart.lastLapMs)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-accent">
                    {kart.bestStintLapMs > 0 ? msToLapTime(kart.bestStintLapMs) : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-center text-neutral-300">
                    <span className="inline-flex items-center gap-1">
                      {kart.totalLaps}
                      {(kart.lapTimesMissing ?? 0) > 0 && (
                        <span
                          className="text-[9px] font-mono text-amber-400 leading-none"
                          title={`Apex registró ${kart.totalLaps} vueltas pero solo recibimos ${kart.totalLaps - (kart.lapTimesMissing ?? 0)} tiempos`}
                        >
                          ⚠-{kart.lapTimesMissing}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={pitsRemaining > 0 ? "text-tier-25" : "text-neutral-300"}>
                      {kart.pitCount}
                    </span>
                    {pitsRemaining > 0 && (
                      <span className="text-xs text-neutral-700 ml-0.5">/{config.minPits}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className="tier-badge"
                      style={{ backgroundColor: tierHex(kart.tierScore) }}
                    >
                      {kart.tierScore}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className={clsx(
                        "font-mono",
                        stintWarning && "text-tier-1 font-bold animate-pulse",
                        stintAlert && "text-tier-25"
                      )}
                    >
                      {secondsToStint(stintSec)}
                    </span>
                    <span className="text-xs text-neutral-400 ml-0.5">
                      ({kart.stintLapsCount}v)
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span
                      className={`pit-indicator ${kart.pitStatus}`}
                      title={kart.pitStatus === "in_pit" ? t("race.inPit") : t("race.onTrack")}
                    />
                  </td>
                </tr>

                {/* Expanded driver detail rows */}
                {isExpanded && drivers.length > 0 && (
                  <tr className="border-b border-border">
                    <DriverDetailsRow
                      drivers={drivers}
                      minDriverTimeMin={config.minDriverTimeMin}
                      colSpan={COL_COUNT}
                    />
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Sortable table header ── */
function SortTh({ children, colKey, current, dir, onSort, align, title, className }: {
  children: React.ReactNode;
  colKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align: "left" | "center" | "right";
  title?: string;
  className?: string;
}) {
  const active = current === colKey;
  return (
    <th
      className={clsx(
        "px-1.5 sm:px-2 py-2 sm:py-2.5 cursor-pointer select-none hover:text-accent transition-colors",
        `text-${align}`,
        active && "text-accent",
        className,
      )}
      onClick={() => onSort(colKey)}
      title={title}
    >
      <span className="inline-flex items-center gap-0.5">
        {children}
        {active && (
          <span className="text-[8px] leading-none">{dir === "asc" ? "▲" : "▼"}</span>
        )}
      </span>
    </th>
  );
}
