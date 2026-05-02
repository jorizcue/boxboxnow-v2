"use client";

import { useState, useCallback, Fragment } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { msToLapTime, tierHex } from "@/lib/formatters";
import { useT } from "@/lib/i18n";
import { getDriverInfoForKart, DriverDetailsRow } from "@/components/shared/DriverDetails";

const COL_COUNT = 10; // number of <th> columns

export function ClassificationTable() {
  const t = useT();
  const { classification, config, karts, durationMs } = useRaceStore();
  const raceClockMs = useRaceClock();
  const [expandedKart, setExpandedKart] = useState<number | null>(null);

  const stintMsFor = (kart: typeof karts[0]) => {
    if (raceClockMs === 0) return 0;
    const stintStart = kart.stintStartCountdownMs || durationMs || raceClockMs;
    return Math.max(0, stintStart - raceClockMs);
  };

  const toggleExpand = useCallback((kartNumber: number) => {
    setExpandedKart((prev) => (prev === kartNumber ? null : kartNumber));
  }, []);

  if (classification.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <p>{t("class.noData")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-2 sm:mx-0">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-surface text-neutral-200 sticky top-0 z-10 text-[10px] sm:text-[11px] uppercase tracking-wider">
          <tr>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-left w-8 sm:w-12">{t("class.pos")}</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-left w-8 sm:w-12">{t("race.kart")}</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-left">{t("race.team")}</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-left">{t("race.driver")}</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-center">{t("race.laps")}</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-center">{t("race.pit")}</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-right">{t("class.gap")}</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-right">{t("class.interval")}</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-right">{t("class.avg")}</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-center w-8 sm:w-12">Tier</th>
          </tr>
        </thead>
        <tbody>
          {classification.map((entry) => {
            const isOurTeam =
              config.ourKartNumber > 0 && entry.kartNumber === config.ourKartNumber;
            const isExpanded = expandedKart === entry.kartNumber;
            const kart = isExpanded
              ? karts.find((k) => k.kartNumber === entry.kartNumber)
              : undefined;
            const drivers = kart
              ? getDriverInfoForKart(kart, config.minDriverTimeMin, stintMsFor(kart))
              : [];

            return (
              <Fragment key={entry.kartNumber}>
                <tr
                  className={`border-b border-border hover:bg-surface/50 transition-colors cursor-pointer select-none ${
                    isOurTeam ? "our-team" : ""
                  }`}
                  onDoubleClick={() => toggleExpand(entry.kartNumber)}
                >
                  <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 font-bold text-base sm:text-lg text-white">{entry.position}</td>
                  <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 font-mono text-neutral-300">{entry.kartNumber}</td>
                  <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 font-medium text-white truncate max-w-[100px] sm:max-w-none">
                    {entry.teamName}
                    {isExpanded ? (
                      <span className="ml-1 text-neutral-500 text-xs">&#9650;</span>
                    ) : (
                      <span className="ml-1 text-neutral-600 text-xs">&#9660;</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-neutral-400 truncate max-w-[80px] sm:max-w-none">{entry.driverName}</td>
                  <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-center text-neutral-300">{entry.totalLaps}</td>
                  <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-center text-neutral-300">{entry.pitCount}</td>
                  <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-right font-mono text-neutral-300">
                    {entry.position === 1 ? "-" : `+${entry.gapS.toFixed(1)}s`}
                  </td>
                  <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-right font-mono text-neutral-200">
                    {entry.position === 1 ? "-" : `+${entry.intervalS.toFixed(1)}s`}
                  </td>
                  <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-right font-mono text-neutral-400">
                    {msToLapTime(entry.avgLapMs)}
                  </td>
                  <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-center">
                    <span
                      className="tier-badge"
                      style={{ backgroundColor: tierHex(entry.tierScore) }}
                    >
                      {entry.tierScore}
                    </span>
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
