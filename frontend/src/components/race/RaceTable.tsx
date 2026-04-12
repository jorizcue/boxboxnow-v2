"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { useT } from "@/lib/i18n";
import { msToLapTime, secondsToStint, secondsToHMS, tierHex, formatDifferential } from "@/lib/formatters";
import { getDriverInfoForKart, DriverDetailsRow } from "@/components/shared/DriverDetails";
import { sendBoxCall } from "@/lib/driverChannel";
import { api } from "@/lib/api";
import { RainToggle } from "@/components/shared/RainToggle";
import clsx from "clsx";

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

  // Track previous lap time for our kart (for comparison arrow)
  const prevLastLapRef = useRef<number>(0);
  const [lastLapDelta, setLastLapDelta] = useState<"faster" | "slower" | null>(null);

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

  // Find our kart
  const ourKart = config.ourKartNumber > 0
    ? sorted.find((k) => k.kartNumber === config.ourKartNumber)
    : undefined;

  // Update lap comparison when our kart's last lap changes
  const ourLastLapMs = ourKart?.lastLapMs ?? 0;
  useEffect(() => {
    if (ourLastLapMs > 0 && prevLastLapRef.current > 0 && ourLastLapMs !== prevLastLapRef.current) {
      setLastLapDelta(ourLastLapMs < prevLastLapRef.current ? "faster" : "slower");
    }
    if (ourLastLapMs > 0) {
      prevLastLapRef.current = ourLastLapMs;
    }
  }, [ourLastLapMs]);

  const ourStintSec = ourKart ? stintSecondsFor(ourKart) : 0;
  const ourStintMin = ourStintSec / 60;

  // Real max stint: min(maxStintConfig, timeFromPitOut - reserve for pending pits)
  const realMaxStintSec = (() => {
    if (!ourKart) return config.maxStintMin * 60;
    const stintStart = ourKart.stintStartCountdownMs || durationMs || raceClockMs;
    const timeRemainingFromStintStartSec = stintStart / 1000;
    const pendingPits = Math.max(0, config.minPits - ourKart.pitCount);
    const reservePerPitSec = pendingPits > 0 ? (config.pitTimeS + config.minStintMin * 60) * pendingPits : 0;
    const availableSec = timeRemainingFromStintStartSec - reservePerPitSec;
    return Math.min(config.maxStintMin * 60, Math.max(0, availableSec));
  })();

  const timeToMaxStint = Math.max(0, realMaxStintSec - ourStintSec);
  const lapsToMaxStint = ourKart && ourKart.avgLapMs > 0
    ? timeToMaxStint / (ourKart.avgLapMs / 1000)
    : 0;

  const realMaxStintMin = realMaxStintSec / 60;

  const kartsNearPit = sorted.filter((k) => {
    const stintSec = stintSecondsFor(k);
    const stintMin = stintSec / 60;
    return stintMin >= realMaxStintMin - 5 && k.pitStatus !== "in_pit";
  }).length;

  // Our kart position in the avg-sorted table (1-based)
  const ourAvgPosition = ourKart
    ? sorted.findIndex((k) => k.kartNumber === config.ourKartNumber) + 1
    : 0;

  // Stint color logic:
  // Red if < minStintMin (can't pit yet) or >= realMaxStint (overdue)
  // Orange if within 5min of realMaxStint
  // Green otherwise (safe window)
  const stintColor = (() => {
    if (ourStintMin < config.minStintMin) return "text-red-400";
    if (ourStintMin >= realMaxStintMin) return "text-red-400 animate-pulse";
    if (ourStintMin >= realMaxStintMin - 5) return "text-orange-400";
    return "text-green-400";
  })();

  // Pit window: open when stint >= realMinStint
  const realMinStintMin = (() => {
    if (!ourKart) return config.minStintMin;
    const stintStart = ourKart.stintStartCountdownMs || durationMs || raceClockMs;
    const pendingPits = Math.max(0, config.minPits - ourKart.pitCount);
    const timeFromStintStartToEndMin = stintStart / 1000 / 60;
    const reservePerPitMin = pendingPits > 0 ? (config.pitTimeS / 60 + config.maxStintMin) * pendingPits : 0;
    return Math.max(config.minStintMin, timeFromStintStartToEndMin - reservePerPitMin);
  })();
  const pitWindowOpen = ourKart && raceClockMs > 0 && !raceFinished
    ? ourStintMin >= realMinStintMin
    : null;

  const timeToMaxColor = (() => {
    if (timeToMaxStint <= 0) return "text-red-400 animate-pulse";
    if (timeToMaxStint / 60 <= 5) return "text-orange-400";
    return "text-neutral-200";
  })();

  const lapsToMaxColor = (() => {
    if (pitWindowOpen === false) return "text-red-400";
    if (lapsToMaxStint <= 2) return "text-red-400 animate-pulse";
    if (lapsToMaxStint <= 5) return "text-orange-400";
    if (pitWindowOpen === true) return "text-green-400";
    return "text-neutral-200";
  })();

  const lapsToMaxBorder = (() => {
    if (pitWindowOpen === false) return "border-red-500/60";
    if (lapsToMaxStint <= 2) return "border-red-400/50";
    if (lapsToMaxStint <= 5) return "border-orange-400/40";
    if (pitWindowOpen === true) return "border-green-500/40";
    return "border-border";
  })();

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
    <div className="race-layout flex flex-col h-full">
      {/* Sticky indicator cards at the top */}
      <div className="sticky-cards sticky top-0 z-20 bg-black pb-2">
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5 sm:gap-2">
          {/* Driver / Last lap */}
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-between">
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
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-between">
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("metric.avgLap")}
            </span>
            <span className="text-lg sm:text-xl font-mono font-black leading-none text-neutral-200">
              {ourKart && ourKart.avgLapMs > 0 ? msToLapTime(Math.round(ourKart.avgLapMs)) : "-"}
            </span>
          </div>

          {/* Position by avg */}
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-between">
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
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-between">
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("metric.currentStint")}
            </span>
            <span className={clsx("text-lg sm:text-xl font-mono font-black leading-none", stintColor)}>
              {secondsToHMS(ourStintSec)}
            </span>
          </div>

          {/* Time to max stint */}
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-between">
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("metric.timeToMaxStint")}
            </span>
            <span className={clsx("text-lg sm:text-xl font-mono font-black leading-none", timeToMaxColor)}>
              {secondsToHMS(timeToMaxStint)}
            </span>
            {realMaxStintMin < config.maxStintMin && (
              <span className="text-[7px] text-orange-400 font-mono">
                max {Math.floor(realMaxStintMin)}:{String(Math.round((realMaxStintMin % 1) * 60)).padStart(2, "0")}
              </span>
            )}
          </div>

          {/* Laps to max stint */}
          <div className={`bg-surface rounded-xl border ${lapsToMaxBorder} p-2 sm:p-3 flex flex-col items-center justify-between`}>
            <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
              {t("metric.lapsToMaxStint")}
            </span>
            <span className={`text-lg sm:text-xl font-mono font-black leading-none ${lapsToMaxColor}`}>
              {lapsToMaxStint > 0 ? lapsToMaxStint.toFixed(1) : "0"}
            </span>
          </div>

          {/* Karts near pit */}
          <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-between">
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

      {/* Scrollable race table */}
      <div className="race-table-scroll flex-1 overflow-y-auto overflow-x-auto -mx-2 sm:mx-0">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-surface text-neutral-200 sticky top-0 z-10 text-[10px] sm:text-[11px] uppercase tracking-wider">
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
                    <td className="px-2 py-1.5 text-center text-neutral-300">{kart.totalLaps}</td>
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
    </div>
  );
}

/* ── BOX call button (shared between race/pit tabs) ── */
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

/* RainToggle imported from @/components/shared/RainToggle */
