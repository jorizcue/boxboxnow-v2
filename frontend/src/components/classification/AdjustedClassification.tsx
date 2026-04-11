"use client";

import { useMemo, useRef } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useSimNow } from "@/hooks/useSimNow";
import { msToLapTime, tierHex } from "@/lib/formatters";
import { stableSpeedMs, PositionHysteresis, applyHysteresis } from "@/lib/classificationUtils";
import { useT } from "@/lib/i18n";
import clsx from "clsx";

/**
 * Clasificación Real — distance-based calculation (inspired by Prepro/boxboxnow.py)
 *
 * Algorithm:
 * 1. For each kart, compute average speed (m/s) from avgLapMs and circuit length.
 * 2. Total distance = (completedLaps × circuitLength) + metersExtra
 *    where metersExtra = speed × secondsSinceLastLapCrossing (interpolated position).
 * 3. Pit penalty = missedPits × speed × pitTimeS  (distance NOT covered while in pit).
 * 4. Adjusted distance = totalDistance − pitPenalty
 * 5. Gap (to leader) in seconds = (leaderDist − kartDist) / kartSpeed
 * 6. Interval (to kart ahead) in seconds = (aheadDist − kartDist) / kartSpeed
 * 7. Gap/Interval in meters = gap/int seconds × kartSpeed
 */
export function AdjustedClassification() {
  const t = useT();
  const { karts, config } = useRaceStore();
  const { now, speed } = useSimNow();
  const hysteresisRef = useRef(new PositionHysteresis(3));

  const circuitLengthM = config.circuitLengthM || 1100;
  const pitTimeS = config.pitTimeS || 0;

  const adjusted = useMemo(() => {
    if (karts.length === 0) return [];

    // Only count completed pits (exclude karts currently in pit — their stop isn't done yet)
    const maxPits = Math.max(...karts.filter((k) => k.pitStatus !== "in_pit").map((k) => k.pitCount), 0);

    const rawSorted = karts
      .filter((k) => k.totalLaps > 0)
      .map((kart) => {
        // Stable speed with outlier filtering
        const speedMs = stableSpeedMs(kart, circuitLengthM);

        // Base distance: completed laps × circuit length
        const baseDistanceM = kart.totalLaps * circuitLengthM;

        // Meters extra: interpolated position beyond last completed lap
        let metersExtra = 0;
        if (kart.pitStatus === "racing" && speedMs > 0 && kart.stintStartTime > 0) {
          const wallTimeSinceStintS = Math.max(0, (now - kart.stintStartTime) * speed);
          const stintElapsedS = kart.stintElapsedMs / 1000;
          const secondsSinceLastCrossing = wallTimeSinceStintS - stintElapsedS;
          if (secondsSinceLastCrossing > 0) {
            // Cap at one full lap worth of distance
            metersExtra = Math.min(secondsSinceLastCrossing * speedMs, circuitLengthM * 0.99);
          }
        }

        const totalDistanceM = baseDistanceM + metersExtra;

        // Pit penalty: distance not covered while in pit for missing stops
        const missingPits = Math.max(0, maxPits - kart.pitCount);
        const pitPenaltyM = missingPits * speedMs * pitTimeS;

        const adjustedDistanceM = totalDistanceM - pitPenaltyM;

        return {
          ...kart,
          speedMs,
          totalDistanceM,
          metersExtra,
          missingPits,
          pitPenaltyM,
          adjustedDistanceM,
          maxPits,
        };
      })
      .sort((a, b) => b.adjustedDistanceM - a.adjustedDistanceM);

    return applyHysteresis(rawSorted, hysteresisRef.current);
  }, [karts, now, circuitLengthM, pitTimeS]);

  if (karts.length === 0 || adjusted.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <div className="text-center">
          <p className="text-lg">{t("adjusted.noData")}</p>
          <p className="text-sm mt-1 text-neutral-700">{t("race.connectHint")}</p>
        </div>
      </div>
    );
  }

  const maxPits = adjusted[0]?.maxPits ?? 0;
  const leader = adjusted[0];

  return (
    <div className="space-y-4">
      {/* Explanation */}
      <div className="bg-surface rounded-xl p-3 border border-border">
        <p className="text-[11px] text-neutral-400">
          {t("adjusted.explanation", { maxPits: String(maxPits) })}
        </p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-surface text-neutral-200 sticky top-0 z-10 text-[10px] sm:text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center w-6 sm:w-8">#</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-left w-8 sm:w-12">{t("race.kart")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-left">{t("race.team")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-left">{t("race.driver")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">{t("race.pit")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">{t("adjusted.missingPits")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right font-semibold text-accent">{t("adjusted.adjustedDist")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("adjusted.gapMeters")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("adjusted.gapSeconds")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("adjusted.intMeters")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("adjusted.intSeconds")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("race.avg20")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center w-8 sm:w-12">Tier</th>
            </tr>
          </thead>
          <tbody>
            {adjusted.map((kart, index) => {
              const isOurTeam = config.ourKartNumber > 0 && kart.kartNumber === config.ourKartNumber;

              // Gap to leader (seconds) = distance diff / this kart's speed
              const gapM = leader.adjustedDistanceM - kart.adjustedDistanceM;
              const gapS = kart.speedMs > 0 ? gapM / kart.speedMs : 0;

              // Interval to kart immediately ahead
              const kartAhead = index > 0 ? adjusted[index - 1] : null;
              const intM = kartAhead ? kartAhead.adjustedDistanceM - kart.adjustedDistanceM : 0;
              const intS = kart.speedMs > 0 ? intM / kart.speedMs : 0;

              // Adjusted laps (for display) = adjustedDistance / circuitLength
              const adjustedLaps = kart.adjustedDistanceM / circuitLengthM;

              return (
                <tr
                  key={kart.rowId}
                  className={clsx(
                    "border-b border-border hover:bg-surface/50 transition-colors",
                    isOurTeam && "our-team",
                    kart.pitStatus === "in_pit" && "opacity-50"
                  )}
                >
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center font-bold text-base sm:text-lg text-white">{index + 1}</td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 font-mono text-neutral-300">{kart.kartNumber}</td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 font-medium truncate max-w-[100px] sm:max-w-[180px] text-white">{kart.teamName}</td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 truncate max-w-[80px] sm:max-w-[140px] text-neutral-400 text-xs">{kart.driverName || "-"}</td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center text-neutral-300">{kart.pitCount}</td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center">
                    {kart.missingPits > 0 ? (
                      <span className="text-orange-400 font-medium">{kart.missingPits}</span>
                    ) : (
                      <span className="text-neutral-700">0</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono font-bold text-accent">
                    {adjustedLaps.toFixed(2)}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {index === 0 ? (
                      <span className="text-neutral-500">-</span>
                    ) : (
                      <span className="text-red-400">{Math.round(gapM).toLocaleString()}m</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {index === 0 ? (
                      <span className="text-neutral-500">-</span>
                    ) : (
                      <span className="text-red-400">{gapS.toFixed(1)}s</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {index === 0 ? (
                      <span className="text-neutral-500">-</span>
                    ) : (
                      <span className="text-yellow-400">{Math.round(intM).toLocaleString()}m</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {index === 0 ? (
                      <span className="text-neutral-500">-</span>
                    ) : (
                      <span className="text-yellow-400">{intS.toFixed(1)}s</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-neutral-300">
                    {kart.avgLapMs > 0 ? msToLapTime(Math.round(kart.avgLapMs)) : "-"}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center">
                    <span className="tier-badge" style={{ backgroundColor: tierHex(kart.tierScore) }}>
                      {kart.tierScore}
                    </span>
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
