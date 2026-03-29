"use client";

import { useState, useEffect, useMemo } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { msToLapTime, tierHex } from "@/lib/formatters";
import { useT } from "@/lib/i18n";
import clsx from "clsx";

export function AdjustedClassification() {
  const t = useT();
  const { karts, config } = useRaceStore();
  const [now, setNow] = useState(() => Date.now() / 1000);

  // Tick every second for fractional lap updates
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(interval);
  }, []);

  const circuitLengthM = config.circuitLengthM || 1100;
  const pitTimeMs = config.pitTimeS * 1000;

  const adjusted = useMemo(() => {
    if (karts.length === 0) return [];

    const maxPits = Math.max(...karts.map((k) => k.pitCount), 0);

    return karts
      .filter((k) => k.totalLaps > 0)
      .map((kart) => {
        // Calculate fractional laps based on time since last lap crossing
        let fraction = 0;
        if (kart.pitStatus === "racing" && kart.avgLapMs > 0 && kart.stintStartTime > 0) {
          const wallTimeSinceStintMs = Math.max(0, (now - kart.stintStartTime) * 1000);
          const timeSinceLastLapMs = wallTimeSinceStintMs - kart.stintElapsedMs;
          if (timeSinceLastLapMs > 0) {
            fraction = Math.min(timeSinceLastLapMs / kart.avgLapMs, 0.99);
          }
        }

        const currentLaps = kart.totalLaps + Math.max(0, fraction);

        // Pit penalty
        const missingPits = Math.max(0, maxPits - kart.pitCount);
        const penaltyLaps = kart.avgLapMs > 0 ? (missingPits * pitTimeMs) / kart.avgLapMs : 0;
        const adjustedLaps = currentLaps - penaltyLaps;

        return {
          ...kart,
          currentLaps,
          missingPits,
          penaltyLaps,
          adjustedLaps,
          maxPits,
        };
      })
      .sort((a, b) => b.adjustedLaps - a.adjustedLaps);
  }, [karts, now, pitTimeMs]);

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
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right font-semibold text-accent">{t("adjusted.adjustedLaps")}</th>
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

              // Gap to leader
              const gapLaps = leader.adjustedLaps - kart.adjustedLaps;
              const gapMeters = Math.round(gapLaps * circuitLengthM);
              const gapSeconds = kart.avgLapMs > 0 ? (gapLaps * kart.avgLapMs) / 1000 : 0;

              // Interval to kart immediately ahead
              const kartAhead = index > 0 ? adjusted[index - 1] : null;
              const intLaps = kartAhead ? kartAhead.adjustedLaps - kart.adjustedLaps : 0;
              const intMeters = Math.round(intLaps * circuitLengthM);
              const intSeconds = kart.avgLapMs > 0 ? (intLaps * kart.avgLapMs) / 1000 : 0;

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
                    {kart.adjustedLaps.toFixed(2)}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {index === 0 ? (
                      <span className="text-neutral-500">-</span>
                    ) : (
                      <span className="text-red-400">{gapMeters.toLocaleString()}m</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {index === 0 ? (
                      <span className="text-neutral-500">-</span>
                    ) : (
                      <span className="text-red-400">{gapSeconds.toFixed(1)}s</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {index === 0 ? (
                      <span className="text-neutral-500">-</span>
                    ) : (
                      <span className="text-yellow-400">{intMeters.toLocaleString()}m</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {index === 0 ? (
                      <span className="text-neutral-500">-</span>
                    ) : (
                      <span className="text-yellow-400">{intSeconds.toFixed(1)}s</span>
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
