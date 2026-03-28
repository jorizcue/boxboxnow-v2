"use client";

import { useRaceStore } from "@/hooks/useRaceState";
import { msToLapTime, tierHex } from "@/lib/formatters";

export function ClassificationTable() {
  const { classification, config } = useRaceStore();

  if (classification.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <p>Sin datos de clasificacion</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface text-neutral-200 sticky top-0 z-10 text-[11px] uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2.5 text-left w-12">Pos</th>
            <th className="px-3 py-2.5 text-left w-12">Kart</th>
            <th className="px-3 py-2.5 text-left">Equipo</th>
            <th className="px-3 py-2.5 text-left">Piloto</th>
            <th className="px-3 py-2.5 text-center">Vueltas</th>
            <th className="px-3 py-2.5 text-center">Pits</th>
            <th className="px-3 py-2.5 text-right">Gap</th>
            <th className="px-3 py-2.5 text-right">Interv.</th>
            <th className="px-3 py-2.5 text-right">Media</th>
            <th className="px-3 py-2.5 text-center w-12">Tier</th>
          </tr>
        </thead>
        <tbody>
          {classification.map((entry) => {
            const isOurTeam =
              config.ourKartNumber > 0 && entry.kartNumber === config.ourKartNumber;

            return (
              <tr
                key={entry.kartNumber}
                className={`border-b border-border hover:bg-surface/50 transition-colors ${
                  isOurTeam ? "our-team" : ""
                }`}
              >
                <td className="px-3 py-2 font-bold text-lg text-white">{entry.position}</td>
                <td className="px-3 py-2 font-mono text-neutral-300">{entry.kartNumber}</td>
                <td className="px-3 py-2 font-medium text-white">{entry.teamName}</td>
                <td className="px-3 py-2 text-neutral-400">{entry.driverName}</td>
                <td className="px-3 py-2 text-center text-neutral-300">{entry.totalLaps}</td>
                <td className="px-3 py-2 text-center text-neutral-300">{entry.pitCount}</td>
                <td className="px-3 py-2 text-right font-mono text-neutral-300">
                  {entry.gap || "-"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-neutral-200">
                  {entry.interval || "-"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-neutral-400">
                  {msToLapTime(entry.avgLapMs)}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className="tier-badge"
                    style={{ backgroundColor: tierHex(entry.tierScore) }}
                  >
                    {entry.tierScore}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
