"use client";

import { useRaceStore } from "@/hooks/useRaceState";
import { msToLapTime, secondsToStint, tierColor, tierHex } from "@/lib/formatters";
import clsx from "clsx";

export function RaceTable() {
  const { karts, config } = useRaceStore();

  const sorted = [...karts].sort((a, b) => (a.position || 999) - (b.position || 999));

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <p className="text-lg">Sin datos de carrera</p>
          <p className="text-sm mt-1">Conecta al WebSocket de Apex o inicia un replay</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-card text-gray-400 sticky top-0 z-10">
          <tr>
            <th className="px-2 py-2 text-left w-12">POS</th>
            <th className="px-2 py-2 text-left w-12">KART</th>
            <th className="px-2 py-2 text-left">EQUIPO</th>
            <th className="px-2 py-2 text-left">PILOTO</th>
            <th className="px-2 py-2 text-right">ULT. VUELTA</th>
            <th className="px-2 py-2 text-right">MEJOR</th>
            <th className="px-2 py-2 text-right">MEDIA</th>
            <th className="px-2 py-2 text-right">GAP</th>
            <th className="px-2 py-2 text-right">INTERV.</th>
            <th className="px-2 py-2 text-center">VUELTAS</th>
            <th className="px-2 py-2 text-center">PITS</th>
            <th className="px-2 py-2 text-center">STINT</th>
            <th className="px-2 py-2 text-center w-12">TIER</th>
            <th className="px-2 py-2 text-center w-8"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((kart) => {
            const isOurTeam = config.ourKartNumber > 0 && kart.kartNumber === config.ourKartNumber;
            const stintMin = kart.stintDurationS / 60;
            const stintWarning = stintMin >= config.maxStintMin;
            const stintAlert = stintMin >= config.maxStintMin - 5 && stintMin < config.maxStintMin;
            const pitsRemaining = Math.max(0, config.minPits - kart.pitCount);

            return (
              <tr
                key={kart.rowId}
                className={clsx(
                  "border-b border-gray-800/50 hover:bg-surface/50 transition-colors",
                  isOurTeam && "our-team",
                  kart.pitStatus === "in_pit" && "opacity-60"
                )}
              >
                <td className="px-2 py-1.5 font-bold">{kart.position}</td>
                <td className="px-2 py-1.5 font-mono">{kart.kartNumber}</td>
                <td className="px-2 py-1.5 font-medium truncate max-w-[200px]">
                  {kart.teamName}
                </td>
                <td className="px-2 py-1.5 text-gray-400 truncate max-w-[160px]">
                  {kart.driverName}
                  {kart.driverTime && (
                    <span className="ml-1 text-xs text-gray-600">[{kart.driverTime}]</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {msToLapTime(kart.lastLapMs)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-purple-400">
                  {msToLapTime(kart.bestLapMs)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-400">
                  {kart.avgLapMs > 0 ? msToLapTime(Math.round(kart.avgLapMs)) : "-"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {kart.gap || "-"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-400">
                  {kart.interval || "-"}
                </td>
                <td className="px-2 py-1.5 text-center">{kart.totalLaps}</td>
                <td className="px-2 py-1.5 text-center">
                  <span className={pitsRemaining > 0 ? "text-yellow-400" : ""}>
                    {kart.pitCount}
                  </span>
                  {pitsRemaining > 0 && (
                    <span className="text-xs text-gray-600 ml-0.5">/{config.minPits}</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <span
                    className={clsx(
                      "font-mono",
                      stintWarning && "text-red-500 font-bold animate-pulse",
                      stintAlert && "text-yellow-400"
                    )}
                  >
                    {secondsToStint(kart.stintDurationS)}
                  </span>
                  <span className="text-xs text-gray-600 ml-0.5">
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
