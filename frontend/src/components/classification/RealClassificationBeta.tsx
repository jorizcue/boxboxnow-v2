"use client";

import { useMemo, useRef, useEffect } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useSimNow } from "@/hooks/useSimNow";
import { msToLapTime, tierHex } from "@/lib/formatters";
import { useT } from "@/lib/i18n";
import clsx from "clsx";
import type { KartState } from "@/types/race";

/**
 * Clasificacion Real Beta — improved distance-based classification.
 *
 * Fixes over the original AdjustedClassification:
 *
 * 1. Uses countdown-based time calculation instead of wall clock.
 *    Both `stintStartCountdownMs` and `countdownMs` come from the same Apex source,
 *    eliminating server↔browser clock sync errors.
 *
 * 2. `stintElapsedMs` is now updated on every lap event in useRaceState
 *    (not just every 30s analytics broadcast), preventing position jumps.
 *
 * 3. Uses `config.minPits` as the expected pit count instead of dynamic `maxPits`,
 *    which avoids the fragility of one kart doing an accidental extra stop
 *    penalizing the entire field.
 *
 * 4. Tracks per-kart "last lap browser timestamp" to provide a secondary
 *    interpolation method when countdown data is stale.
 *
 * 5. Properly freezes distance for karts currently in pit (no phantom metros_extra).
 *
 * Algorithm:
 *   distance = (completedLaps × circuitLength) + metros_extra - pit_penalty
 *   metros_extra = speed × time_since_last_crossing (countdown-based)
 *   pit_penalty = missing_pits × speed × pit_time_s
 */
export function RealClassificationBeta() {
  const t = useT();
  const { karts, config, countdownMs, durationMs } = useRaceStore();
  const { now, speed: replaySpeed } = useSimNow();

  const circuitLengthM = config.circuitLengthM || 1100;
  const pitTimeS = config.pitTimeS || 0;
  const expectedPits = config.minPits || 0;

  // Track when each kart last changed totalLaps (browser timestamp in seconds)
  // This provides a fallback interpolation when countdown isn't ticking
  const lastLapTs = useRef<Map<number, { laps: number; ts: number }>>(new Map());

  useEffect(() => {
    for (const kart of karts) {
      const prev = lastLapTs.current.get(kart.kartNumber);
      if (!prev || kart.totalLaps > prev.laps) {
        lastLapTs.current.set(kart.kartNumber, {
          laps: kart.totalLaps,
          ts: Date.now() / 1000,
        });
      }
    }
  }, [karts]);

  const adjusted = useMemo(() => {
    if (karts.length === 0) return [];

    // Use configured minPits as the expected number of stops.
    // If no kart has pitted yet and minPits is 0, no penalty applies.
    // If a kart has done MORE than expected, no bonus (clamped to 0).
    const targetPits = expectedPits;

    return karts
      .filter((k) => k.totalLaps > 0)
      .map((kart) => {
        // Average speed (m/s) from avgLapMs
        const speedMs = kart.avgLapMs > 0
          ? circuitLengthM / (kart.avgLapMs / 1000)
          : 0;

        // Base distance from completed laps
        const baseDistanceM = kart.totalLaps * circuitLengthM;

        // Interpolated position between laps (metros_extra)
        let metersExtra = 0;
        let interpolationMethod: "countdown" | "wallclock" | "none" = "none";

        if (kart.pitStatus === "racing" && speedMs > 0) {
          // METHOD 1 (preferred): Countdown-based
          // Both values come from the same Apex source → no clock sync issues
          if (kart.stintStartCountdownMs > 0 && countdownMs !== 0) {
            const stintTimeMs = kart.stintStartCountdownMs - countdownMs;
            if (stintTimeMs > 0) {
              const timeSinceLastCrossingMs = stintTimeMs - kart.stintElapsedMs;
              if (timeSinceLastCrossingMs > 0) {
                metersExtra = (timeSinceLastCrossingMs / 1000) * speedMs;
                interpolationMethod = "countdown";
              }
            }
          }

          // METHOD 2 (fallback): Browser timestamp of last lap change
          // Used when countdown isn't available (e.g., race hasn't started countdown yet)
          if (interpolationMethod === "none") {
            const lastTs = lastLapTs.current.get(kart.kartNumber);
            if (lastTs && lastTs.ts > 0) {
              const secondsSinceLap = Math.max(0, (now - lastTs.ts) * replaySpeed);
              if (secondsSinceLap > 0 && secondsSinceLap < 300) {
                metersExtra = secondsSinceLap * speedMs;
                interpolationMethod = "wallclock";
              }
            }
          }

          // Cap at slightly less than one full lap
          metersExtra = Math.min(metersExtra, circuitLengthM * 0.95);
        }

        const totalDistanceM = baseDistanceM + metersExtra;

        // Pit penalty: karts that haven't completed expected stops are penalized
        const missingPits = Math.max(0, targetPits - kart.pitCount);
        const pitPenaltyM = missingPits * speedMs * pitTimeS;

        const adjustedDistanceM = totalDistanceM - pitPenaltyM;

        // Estimate progress within current lap (0-100%)
        const lapProgress = speedMs > 0
          ? Math.min(100, (metersExtra / circuitLengthM) * 100)
          : 0;

        return {
          ...kart,
          speedMs,
          baseDistanceM,
          totalDistanceM,
          metersExtra,
          missingPits,
          pitPenaltyM,
          adjustedDistanceM,
          lapProgress,
          interpolationMethod,
          targetPits,
        };
      })
      .sort((a, b) => b.adjustedDistanceM - a.adjustedDistanceM);
  }, [karts, countdownMs, now, circuitLengthM, pitTimeS, expectedPits, replaySpeed]);

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

  const leader = adjusted[0];

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="bg-surface rounded-xl p-3 border border-border space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-accent uppercase tracking-wider">Clasificacion Real</span>
          <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-bold uppercase">Beta</span>
        </div>
        <p className="text-[11px] text-neutral-400">
          Posiciones calculadas por distancia recorrida, interpolando posicion entre vueltas usando el reloj de carrera (countdown).
          {expectedPits > 0 && (
            <> Se penaliza a karts con menos de <span className="text-white font-medium">{expectedPits} paradas</span> obligatorias (configurado en sesion).</>
          )}
          {expectedPits === 0 && (
            <> No hay paradas obligatorias configuradas — sin penalizacion por pits.</>
          )}
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
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">Vlts</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">{t("race.pit")}</th>
              {expectedPits > 0 && (
                <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">{t("adjusted.missingPits")}</th>
              )}
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">Dist. (m)</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("adjusted.gapSeconds")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("adjusted.intSeconds")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-right">{t("race.avg20")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center w-8 sm:w-12">Tier</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center w-16">Progreso</th>
            </tr>
          </thead>
          <tbody>
            {adjusted.map((kart, index) => {
              const isOurTeam = config.ourKartNumber > 0 && kart.kartNumber === config.ourKartNumber;

              // Gap to leader (seconds)
              const gapM = leader.adjustedDistanceM - kart.adjustedDistanceM;
              const gapS = kart.speedMs > 0 ? gapM / kart.speedMs : 0;

              // Interval to kart immediately ahead
              const kartAhead = index > 0 ? adjusted[index - 1] : null;
              const intM = kartAhead ? kartAhead.adjustedDistanceM - kart.adjustedDistanceM : 0;
              const intS = kart.speedMs > 0 ? intM / kart.speedMs : 0;

              return (
                <tr
                  key={kart.rowId}
                  className={clsx(
                    "border-b border-border hover:bg-surface/50 transition-colors",
                    isOurTeam && "our-team",
                    kart.pitStatus === "in_pit" && "opacity-50"
                  )}
                >
                  {/* Position */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center font-bold text-base sm:text-lg text-white">
                    {index + 1}
                  </td>

                  {/* Kart number */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 font-mono text-neutral-300">
                    {kart.kartNumber}
                  </td>

                  {/* Team */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 font-medium truncate max-w-[100px] sm:max-w-[180px] text-white">
                    {kart.teamName}
                  </td>

                  {/* Driver */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 truncate max-w-[80px] sm:max-w-[140px] text-neutral-400 text-xs">
                    {kart.driverName || "-"}
                  </td>

                  {/* Laps */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center font-mono text-neutral-300">
                    {kart.totalLaps}
                  </td>

                  {/* Pit count */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center text-neutral-300">
                    {kart.pitCount}
                    {kart.pitStatus === "in_pit" && (
                      <span className="ml-1 text-[8px] text-yellow-500 font-bold align-top">PIT</span>
                    )}
                  </td>

                  {/* Missing pits */}
                  {expectedPits > 0 && (
                    <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center">
                      {kart.missingPits > 0 ? (
                        <span className="text-orange-400 font-medium">{kart.missingPits}</span>
                      ) : (
                        <span className="text-neutral-700">0</span>
                      )}
                    </td>
                  )}

                  {/* Total distance */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs font-bold text-accent">
                    {Math.round(kart.adjustedDistanceM).toLocaleString()}
                  </td>

                  {/* Gap to leader */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {index === 0 ? (
                      <span className="text-accent font-bold">LDR</span>
                    ) : (
                      <span className="text-red-400">+{gapS.toFixed(1)}s</span>
                    )}
                  </td>

                  {/* Interval to kart ahead */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {index === 0 ? (
                      <span className="text-neutral-600">-</span>
                    ) : (
                      <span className="text-yellow-400">+{intS.toFixed(1)}s</span>
                    )}
                  </td>

                  {/* Avg lap */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-neutral-300">
                    {kart.avgLapMs > 0 ? msToLapTime(Math.round(kart.avgLapMs)) : "-"}
                  </td>

                  {/* Tier */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center">
                    <span className="tier-badge" style={{ backgroundColor: tierHex(kart.tierScore) }}>
                      {kart.tierScore}
                    </span>
                  </td>

                  {/* Lap progress bar */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5">
                    <LapProgressBar
                      progress={kart.lapProgress}
                      inPit={kart.pitStatus === "in_pit"}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Debug footer — shows interpolation health */}
      <div className="bg-surface/50 rounded-lg p-2 border border-border/50">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-neutral-600">
          <span>Circuito: <span className="text-neutral-400 font-mono">{circuitLengthM}m</span></span>
          <span>Pit time: <span className="text-neutral-400 font-mono">{pitTimeS}s</span></span>
          <span>Pits esperados: <span className="text-neutral-400 font-mono">{expectedPits}</span></span>
          <span>Countdown: <span className="text-neutral-400 font-mono">{Math.round(countdownMs / 1000)}s</span></span>
          <span>Metodo: {(() => {
            const methods = adjusted.map((k) => k.interpolationMethod);
            const cd = methods.filter((m) => m === "countdown").length;
            const wc = methods.filter((m) => m === "wallclock").length;
            const no = methods.filter((m) => m === "none").length;
            return (
              <>
                {cd > 0 && <span className="text-green-500 font-mono">{cd} countdown</span>}
                {wc > 0 && <span className="text-yellow-500 font-mono ml-1">{wc} wallclock</span>}
                {no > 0 && <span className="text-red-500 font-mono ml-1">{no} none</span>}
              </>
            );
          })()}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mini lap progress bar                                              */
/* ------------------------------------------------------------------ */

function LapProgressBar({ progress, inPit }: { progress: number; inPit: boolean }) {
  if (inPit) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-[9px] text-yellow-500 font-bold animate-pulse">PIT</span>
      </div>
    );
  }
  return (
    <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-accent/70 rounded-full transition-all duration-200"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}
