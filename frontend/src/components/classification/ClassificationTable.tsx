"use client";

import { useRaceStore } from "@/hooks/useRaceState";
import { msToLapTime, tierHex } from "@/lib/formatters";

export function ClassificationTable() {
  const { classification, config } = useRaceStore();

  if (classification.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <p>Sin datos de clasificacion</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-card text-gray-400 sticky top-0 z-10">
          <tr>
            <th className="px-3 py-2 text-left w-12">POS</th>
            <th className="px-3 py-2 text-left w-12">KART</th>
            <th className="px-3 py-2 text-left">EQUIPO</th>
            <th className="px-3 py-2 text-left">PILOTO</th>
            <th className="px-3 py-2 text-center">VUELTAS</th>
            <th className="px-3 py-2 text-center">PITS</th>
            <th className="px-3 py-2 text-right">GAP</th>
            <th className="px-3 py-2 text-right">INTERV.</th>
            <th className="px-3 py-2 text-right">MEDIA</th>
            <th className="px-3 py-2 text-center w-12">TIER</th>
          </tr>
        </thead>
        <tbody>
          {classification.map((entry) => {
            const isOurTeam =
              config.ourKartNumber > 0 && entry.kartNumber === config.ourKartNumber;

            return (
              <tr
                key={entry.kartNumber}
                className={`border-b border-gray-800/50 hover:bg-surface/50 ${
                  isOurTeam ? "our-team" : ""
                }`}
              >
                <td className="px-3 py-2 font-bold text-lg">{entry.position}</td>
                <td className="px-3 py-2 font-mono">{entry.kartNumber}</td>
                <td className="px-3 py-2 font-medium">{entry.teamName}</td>
                <td className="px-3 py-2 text-gray-400">{entry.driverName}</td>
                <td className="px-3 py-2 text-center">{entry.totalLaps}</td>
                <td className="px-3 py-2 text-center">{entry.pitCount}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {entry.gap || "-"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-400">
                  {entry.interval || "-"}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-400">
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
