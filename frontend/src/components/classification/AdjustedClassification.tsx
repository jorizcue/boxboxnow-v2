"use client";

import { useRaceStore } from "@/hooks/useRaceState";
import { msToLapTime, tierHex, secondsToStint } from "@/lib/formatters";
import { useT } from "@/lib/i18n";
import clsx from "clsx";

export function AdjustedClassification() {
  const t = useT();
  const { karts, config } = useRaceStore();

  if (karts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <div className="text-center">
          <p className="text-lg">{t("adjusted.noData")}</p>
          <p className="text-sm mt-1 text-neutral-700">{t("race.connectHint")}</p>
        </div>
      </div>
    );
  }

  const maxPits = Math.max(...karts.map((k) => k.pitCount), 0);
  const pitTimeMs = config.pitTimeS * 1000;

  // Calculate adjusted laps for each kart
  const adjusted = karts
    .filter((k) => k.totalLaps > 0)
    .map((kart) => {
      const missingPits = Math.max(0, maxPits - kart.pitCount);
      const penaltyMs = missingPits * pitTimeMs;
      const avgMs = kart.avgLapMs > 0 ? kart.avgLapMs : 0;
      const lapsLost = avgMs > 0 ? penaltyMs / avgMs : 0;
      const adjustedLaps = kart.totalLaps - lapsLost;
      const diff = adjustedLaps - kart.totalLaps;
      return { ...kart, missingPits, penaltyMs, lapsLost, adjustedLaps, diff };
    })
    .sort((a, b) => b.adjustedLaps - a.adjustedLaps);

  // Gap to leader
  const leaderLaps = adjusted.length > 0 ? adjusted[0].adjustedLaps : 0;

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
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">{t("adjusted.realLaps")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">{t("race.pit")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">{t("adjusted.missingPits")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("adjusted.penalty")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right font-semibold text-accent">{t("adjusted.adjustedLaps")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("adjusted.diffLaps")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("race.avg20")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center w-8 sm:w-12">Tier</th>
            </tr>
          </thead>
          <tbody>
            {adjusted.map((kart, index) => {
              const isOurTeam = config.ourKartNumber > 0 && kart.kartNumber === config.ourKartNumber;
              const gapToLeader = kart.adjustedLaps - leaderLaps;
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
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center text-neutral-300">{kart.totalLaps}</td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center text-neutral-300">{kart.pitCount}</td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center">
                    {kart.missingPits > 0 ? (
                      <span className="text-orange-400 font-medium">{kart.missingPits}</span>
                    ) : (
                      <span className="text-neutral-700">0</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {kart.penaltyMs > 0 ? (
                      <span className="text-red-400">-{msToLapTime(kart.penaltyMs)}</span>
                    ) : (
                      <span className="text-neutral-700">-</span>
                    )}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono font-bold text-accent">
                    {kart.adjustedLaps.toFixed(1)}
                  </td>
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {index === 0 ? (
                      <span className="text-neutral-500">-</span>
                    ) : (
                      <span className="text-red-400">{gapToLeader.toFixed(1)}</span>
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
