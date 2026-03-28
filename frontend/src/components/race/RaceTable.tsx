"use client";

import { useState, useEffect } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { msToLapTime, secondsToStint, tierHex, formatDifferential } from "@/lib/formatters";
import clsx from "clsx";

export function RaceTable() {
  const { karts, config } = useRaceStore();
  const [now, setNow] = useState(() => Date.now() / 1000);

  // Tick every second for real-time stint timer
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(interval);
  }, []);

  const sorted = [...karts].sort((a, b) => (a.position || 999) - (b.position || 999));

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <div className="text-center">
          <p className="text-lg">Sin datos de carrera</p>
          <p className="text-sm mt-1 text-neutral-700">Conecta al WebSocket de Apex o inicia un replay</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface text-neutral-200 sticky top-0 z-10 text-[11px] uppercase tracking-wider">
          <tr>
            <th className="px-2 py-2.5 text-left w-12">Pos</th>
            <th className="px-2 py-2.5 text-left w-12">Kart</th>
            <th className="px-2 py-2.5 text-left">Equipo</th>
            <th className="px-2 py-2.5 text-left">Piloto</th>
            <th className="px-2 py-2.5 text-right">Ult. Vuelta</th>
            <th className="px-2 py-2.5 text-right">Mejor</th>
            <th className="px-2 py-2.5 text-right">Media</th>
            <th className="px-2 py-2.5 text-right">Gap</th>
            <th className="px-2 py-2.5 text-right">Interv.</th>
            <th className="px-2 py-2.5 text-center">Vueltas</th>
            <th className="px-2 py-2.5 text-center">Pits</th>
            <th className="px-2 py-2.5 text-center">Stint</th>
            <th className="px-2 py-2.5 text-center w-12">Tier</th>
            <th className="px-2 py-2.5 text-center w-8"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((kart) => {
            const isOurTeam = config.ourKartNumber > 0 && kart.kartNumber === config.ourKartNumber;

            // Compute stint duration in real-time from epoch start time
            const stintSec = kart.stintStartTime > 0
              ? Math.max(0, now - kart.stintStartTime)
              : kart.stintDurationS;
            const stintMin = stintSec / 60;
            const stintWarning = stintMin >= config.maxStintMin;
            const stintAlert = stintMin >= config.maxStintMin - 5 && stintMin < config.maxStintMin;
            const pitsRemaining = Math.max(0, config.minPits - kart.pitCount);

            return (
              <tr
                key={kart.rowId}
                className={clsx(
                  "border-b border-border hover:bg-surface/50 transition-colors",
                  isOurTeam && "our-team",
                  kart.pitStatus === "in_pit" && "opacity-50"
                )}
              >
                <td className="px-2 py-1.5 font-bold text-white">{kart.position}</td>
                <td className="px-2 py-1.5 font-mono text-neutral-300">{kart.kartNumber}</td>
                <td className="px-2 py-1.5 font-medium truncate max-w-[200px] text-white">
                  {kart.teamName}
                </td>
                <td className="px-2 py-1.5 text-neutral-400 truncate max-w-[180px]">
                  {kart.driverName}
                  {kart.driverTime && (
                    <span className="ml-1 text-xs text-neutral-400">[{kart.driverTime}]</span>
                  )}
                  {kart.driverDifferentialMs !== undefined && kart.driverDifferentialMs !== 0 && (
                    <span
                      className={`ml-1 text-[10px] font-mono ${
                        kart.driverDifferentialMs > 0 ? "text-tier-1" : "text-accent"
                      }`}
                      title="Diferencial de piloto aplicado al clustering"
                    >
                      {formatDifferential(kart.driverDifferentialMs)}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-white">
                  {msToLapTime(kart.lastLapMs)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-accent">
                  {msToLapTime(kart.bestLapMs)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-neutral-400">
                  {kart.avgLapMs > 0 ? msToLapTime(Math.round(kart.avgLapMs)) : "-"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-neutral-300">
                  {kart.gap || "-"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-neutral-200">
                  {kart.interval || "-"}
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
                    className="tier-badge"
                    style={{ backgroundColor: tierHex(kart.tierScore) }}
                  >
                    {kart.tierScore}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-center">
                  <span
                    className={`pit-indicator ${kart.pitStatus}`}
                    title={kart.pitStatus === "in_pit" ? "En boxes" : "En pista"}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
