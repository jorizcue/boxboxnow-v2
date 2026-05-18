"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { useT } from "@/lib/i18n";
import { msToLapTime, secondsToHMS } from "@/lib/formatters";
import { sendBoxCall } from "@/lib/driverChannel";
import { trackAction } from "@/lib/tracker";
import clsx from "clsx";

/**
 * Shared strategy-metrics bar (9 cards) hoisted out of the Carrera/Box
 * modules so it stays mounted while the user switches between Carrera,
 * Box, Live, Tracking and Clasificación — the table/box body swaps
 * underneath but the indicators persist.
 *
 * Math + appearance are an exact port of the Carrera (RaceTable)
 * version — that is the canonical one (NOT the Box variant). The only
 * intentional difference: `sorted` is always avg-lap ascending here
 * (independent of the Carrera table's user-chosen column sort), which
 * is the correct semantic for the "Posición por media" card and makes
 * `kartsNearPit` order-independent anyway.
 */
export function MetricCardsBar() {
  const t = useT();
  const { karts, config } = useRaceStore();
  const raceClockMs = useRaceClock();
  const durationMs = useRaceStore((s) => s.durationMs);
  const raceFinished = useRaceStore((s) => s.raceFinished);
  // Authoritative pit-gate verdict from the backend (same source the
  // StatusBar badge + Box panel use) so all views agree on the colour
  // of "Vueltas hasta stint máximo".
  const pitStatusFromBackend = useRaceStore((s) => s.pitStatus);

  const prevLastLapRef = useRef<number>(0);
  const [lastLapDelta, setLastLapDelta] = useState<"faster" | "slower" | null>(null);

  const stintSecondsFor = (kart: typeof karts[0]) => {
    if (raceClockMs === 0 || raceFinished) return 0;
    const stintStart = kart.stintStartCountdownMs || durationMs || raceClockMs;
    return Math.max(0, stintStart - raceClockMs) / 1000;
  };

  // Avg-lap ascending — the canonical ordering for "Posición por media".
  const sorted = [...karts].sort((a, b) => {
    const aVal = a.avgLapMs > 0 ? a.avgLapMs : Infinity;
    const bVal = b.avgLapMs > 0 ? b.avgLapMs : Infinity;
    return aVal - bVal;
  });

  const ourKart = config.ourKartNumber > 0
    ? sorted.find((k) => k.kartNumber === config.ourKartNumber)
    : undefined;

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

  const ourAvgPosition = ourKart
    ? sorted.findIndex((k) => k.kartNumber === config.ourKartNumber) + 1
    : 0;

  const stintColor = (() => {
    if (ourStintMin < config.minStintMin) return "text-red-400";
    if (ourStintMin >= realMaxStintMin) return "text-red-400 animate-pulse";
    if (ourStintMin >= realMaxStintMin - 5) return "text-orange-400";
    return "text-green-400";
  })();

  const realMinStintMin = (() => {
    if (!ourKart) return config.minStintMin;
    const stintStart = ourKart.stintStartCountdownMs || durationMs || raceClockMs;
    const pendingPits = Math.max(0, config.minPits - ourKart.pitCount);
    const timeFromStintStartToEndMin = stintStart / 1000 / 60;
    const reservePerPitMin = pendingPits > 0 ? (config.pitTimeS / 60 + config.maxStintMin) * pendingPits : 0;
    return Math.max(config.minStintMin, timeFromStintStartToEndMin - reservePerPitMin);
  })();
  const pitWindowOpen: boolean | null = (() => {
    if (pitStatusFromBackend) return pitStatusFromBackend.isOpen;
    if (!ourKart || raceClockMs === 0 || raceFinished) return null;
    return ourStintMin >= realMinStintMin;
  })();

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

  const avgFutureStint = (() => {
    if (!ourKart || raceClockMs === 0 || raceFinished) return null;
    const remainingPits = Math.max(0, config.minPits - ourKart.pitCount);
    if (remainingPits <= 0) return null;
    const totalRaceMin = config.durationMin;
    const elapsedMs = durationMs > 0 ? Math.max(0, durationMs - raceClockMs) : 0;
    const elapsedMin = elapsedMs / 1000 / 60;
    const futureTimeInPitMin = remainingPits * config.pitTimeS / 60;
    const availableRaceMin = totalRaceMin - elapsedMin - futureTimeInPitMin;
    if (availableRaceMin <= 0) return null;
    const avgMin = availableRaceMin / remainingPits;
    const tooEarly = avgMin > config.maxStintMin;
    const tooLate = avgMin <= config.minStintMin + 5;
    return { avgMin, warn: tooEarly || tooLate };
  })();

  return (
    <div
      className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5 sm:gap-2 pb-2 shrink-0"
      data-tour="metric-cards"
    >
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
      <div className={`bg-surface rounded-xl border ${lapsToMaxBorder} p-2 sm:p-3 flex flex-col items-center justify-between`} data-tour="race-card-laps-max">
        <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
          {t("metric.lapsToMaxStint")}
        </span>
        <span className={`text-lg sm:text-xl font-mono font-black leading-none ${lapsToMaxColor}`}>
          {lapsToMaxStint > 0 ? lapsToMaxStint.toFixed(1) : "0"}
        </span>
      </div>

      {/* Average future stint */}
      <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-between" data-tour="race-card-future-stint">
        <span className="text-[8px] sm:text-[9px] text-neutral-300 uppercase tracking-widest font-bold mb-1">
          {t("pit.avgFutureStint")}
        </span>
        <span className={clsx(
          "text-lg sm:text-xl font-mono font-black leading-none",
          avgFutureStint?.warn ? "text-orange-400" : "text-neutral-200"
        )}>
          {avgFutureStint
            ? secondsToHMS(Math.round(avgFutureStint.avgMin * 60))
            : "-"}
        </span>
      </div>

      {/* Karts near pit */}
      <div className="bg-surface rounded-xl border border-border p-2 sm:p-3 flex flex-col items-center justify-between" data-tour="race-card-karts-near-pit">
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
    </div>
  );
}

/* ── BOX call button (shared across all tabs that show the bar) ── */
function BoxCallButton() {
  const t = useT();
  const [sent, setSent] = useState(false);

  const handleClick = useCallback(() => {
    sendBoxCall();
    trackAction("boxcall_sent", { from: "metric-bar" });
    setSent(true);
    setTimeout(() => setSent(false), 2000);
  }, []);

  return (
    <button
      onClick={handleClick}
      data-tour="race-call-box"
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
