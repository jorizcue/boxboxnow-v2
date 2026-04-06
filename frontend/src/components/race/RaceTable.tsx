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

export function RaceTable() {
  const t = useT();
  const { karts, config } = useRaceStore();
  const raceClockMs = useRaceClock();
  const [expandedKart, setExpandedKart] = useState<number | null>(null);

  const toggleExpand = useCallback(
    (kartNumber: number) => setExpandedKart((prev) => (prev === kartNumber ? null : kartNumber)),
    []
  );

  // Track previous lap time for our kart (for comparison arrow)
  const prevLastLapRef = useRef<number>(0);
  const [lastLapDelta, setLastLapDelta] = useState<"faster" | "slower" | null>(null);

  // Sort by avg lap time (fastest first), karts without avg go to the end
  const sorted = [...karts].sort((a, b) => {
    const aAvg = a.avgLapMs > 0 ? a.avgLapMs : Infinity;
    const bAvg = b.avgLapMs > 0 ? b.avgLapMs : Infinity;
    return aAvg - bAvg;
  });

  // Helper: compute stint seconds from race clock
  const durationMs = useRaceStore((s) => s.durationMs);
  const raceFinished = useRaceStore((s) => s.raceFinished);
  const stintSecondsFor = (kart: typeof karts[0]) => {
    if (raceClockMs === 0 || raceFinished) return 0;
    const stintStart = kart.stintStartCountdownMs || durationMs || raceClockMs;
    return Math.max(0, stintStart - raceClockMs) / 1000;
  };

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
  const timeToMaxStint = Math.max(0, config.maxStintMin * 60 - ourStintSec);
  const lapsToMaxStint = ourKart && ourKart.avgLapMs > 0
    ? timeToMaxStint / (ourKart.avgLapMs / 1000)
    : 0;

  const kartsNearPit = sorted.filter((k) => {
    const stintSec = stintSecondsFor(k);
    const stintMin = stintSec / 60;
    return stintMin >= config.maxStintMin - 5 && k.pitStatus !== "in_pit";
  }).length;

  // Our kart position in the avg-sorted table (1-based)
  const ourAvgPosition = ourKart
    ? sorted.findIndex((k) => k.kartNumber === config.ourKartNumber) + 1
    : 0;

  // Stint color logic:
  // Red if < minStintMin (can't pit yet) or >= maxStintMin (overdue)
  // Orange if within 5min of maxStintMin
  // Green otherwise (safe window)
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

      {/* Scrollable race table */}
      <div className="race-table-scroll flex-1 overflow-y-auto overflow-x-auto -mx-2 sm:mx-0">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-surface text-neutral-200 sticky top-0 z-10 text-[10px] sm:text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center w-6 sm:w-8">#</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-left w-8 sm:w-12">{t("race.kart")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-left">{t("race.team")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-left">{t("race.driver")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right" title={t("race.avg20Title")}>{t("race.avg20")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right" title={t("race.best3Title")}>{t("race.best3")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("race.last")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("race.best")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">{t("race.laps")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">{t("race.pit")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center w-8 sm:w-12">Tier</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">{t("race.stint")}</th>
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
                      {msToLapTime(kart.bestLapMs)}
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
                      <span className="text-xs text-neutral-700 ml-0.5">
                        ({kart.stintLapsCount}v)
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {(() => {
                        if (kart.pitStatus !== "in_pit") {
                          return (
                            <span
                              className="pit-indicator racing"
                              title={t("race.onTrack")}
                            />
                          );
                        }
                        // Check if kart has been in pit > 15 min
                        const raceElapsedMs = durationMs > 0 ? Math.max(0, durationMs - raceClockMs) : 0;
                        const lastPit = kart.pitHistory.length > 0 ? kart.pitHistory[kart.pitHistory.length - 1] : null;
                        const pitInSec = lastPit && lastPit.pitTimeMs === 0 && lastPit.raceTimeMs > 0
                          ? (raceElapsedMs - lastPit.raceTimeMs) / 1000
                          : 0;
                        const frozen = pitInSec > 15 * 60;
                        return (
                          <span title={t("race.inPit")}>
                            <span className="pit-indicator in_pit" />
                            {frozen && <span className="ml-0.5 text-[11px]" title={`>${Math.round(pitInSec / 60)}min in pit`}>&#10052;</span>}
                          </span>
                        );
                      })()}
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

/* RainToggle imported from @/components/shared/RainToggle */
