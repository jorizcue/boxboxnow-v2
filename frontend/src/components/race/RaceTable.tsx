"use client";

import { Fragment, useCallback, useState } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { useT } from "@/lib/i18n";
import { msToLapTime, secondsToStint, secondsToHMS, tierHex, formatDifferential } from "@/lib/formatters";
import { getDriverInfoForKart, DriverDetailsRow } from "@/components/shared/DriverDetails";
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

  // Sort by avg lap time (fastest first), karts without avg go to the end
  const sorted = [...karts].sort((a, b) => {
    const aAvg = a.avgLapMs > 0 ? a.avgLapMs : Infinity;
    const bAvg = b.avgLapMs > 0 ? b.avgLapMs : Infinity;
    return aAvg - bAvg;
  });

  // Helper: compute stint seconds from race clock
  const durationMs = useRaceStore((s) => s.durationMs);
  const stintSecondsFor = (kart: typeof karts[0]) => {
    if (raceClockMs === 0) return 0;
    const stintStart = kart.stintStartCountdownMs || durationMs || raceClockMs;
    return Math.max(0, stintStart - raceClockMs) / 1000;
  };

  // Find our kart
  const ourKart = config.ourKartNumber > 0
    ? sorted.find((k) => k.kartNumber === config.ourKartNumber)
    : undefined;

  const ourStintSec = ourKart ? stintSecondsFor(ourKart) : 0;
  const timeToMaxStint = Math.max(0, config.maxStintMin * 60 - ourStintSec);
  const lapsToMaxStint = ourKart && ourKart.avgLapMs > 0
    ? Math.floor(timeToMaxStint / (ourKart.avgLapMs / 1000))
    : 0;

  const kartsNearPit = sorted.filter((k) => {
    const stintMin = k.stintDurationS / 60;
    return stintMin >= config.maxStintMin - 5 && k.pitStatus !== "in_pit";
  }).length;

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
    <div className="space-y-4">
      {/* Main race table */}
      <div className="overflow-x-auto -mx-2 sm:mx-0">
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
                ? getDriverInfoForKart(kart, config.minDriverTimeMin)
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

      {/* Info panels below the table */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Stint metrics for our kart */}
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

        {/* Right: Driver info for our kart */}
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="bg-neutral-800/50 px-4 py-2 flex justify-between">
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">{t("driver.driver")}</span>
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">{t("driver.info")}</span>
          </div>
          <div className="divide-y divide-border">
            <InfoRow
              label={t("driver.currentDriver")}
              value={ourKart?.driverName || "-"}
            />
            <InfoRow
              label={t("driver.driverTime")}
              value={ourKart?.driverTime || "-"}
            />
            <InfoRow
              label={t("driver.driverDiffTime")}
              value={ourKart ? formatDifferential(ourKart.driverDifferentialMs) : "-"}
            />
            <InfoRow
              label={t("driver.stintLaps")}
              value={ourKart ? String(ourKart.stintLapsCount) : "0"}
            />
            <InfoRow
              label={t("driver.avgPace")}
              value={ourKart && ourKart.avgLapMs > 0 ? msToLapTime(Math.round(ourKart.avgLapMs)) : "-"}
            />
            <InfoRow
              label={t("driver.bestAvg3")}
              value={ourKart && ourKart.bestAvgMs > 0 ? msToLapTime(Math.round(ourKart.bestAvgMs)) : "-"}
            />
          </div>
        </div>
      </div>
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
