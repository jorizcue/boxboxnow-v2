"use client";

import { useState, useCallback, Fragment } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { msToLapTime, tierHex, secondsToHMS } from "@/lib/formatters";

export function ClassificationTable() {
  const { classification, config, karts } = useRaceStore();
  const [expandedKart, setExpandedKart] = useState<number | null>(null);

  const toggleExpand = useCallback((kartNumber: number) => {
    setExpandedKart((prev) => (prev === kartNumber ? null : kartNumber));
  }, []);

  if (classification.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <p>Sin datos de clasificacion</p>
      </div>
    );
  }

  // Build driver info from kart state
  const getDriverInfo = (kartNumber: number) => {
    const kart = karts.find((k) => k.kartNumber === kartNumber);
    if (!kart || !kart.driverTotalMs) return [];

    const minDriverTimeMs = (config.minDriverTimeMin || 30) * 60 * 1000;

    // Add current stint time for active driver (not yet committed to driver_total_ms)
    const currentDriverStintMs = kart.pitStatus === "racing" && kart.driverName
      ? kart.stintElapsedMs
      : 0;

    // Ensure current driver appears even if they haven't pitted yet
    const driverMap = { ...kart.driverTotalMs };
    if (kart.driverName && !(kart.driverName in driverMap)) {
      driverMap[kart.driverName] = 0;
    }

    return Object.entries(driverMap).map(([name, totalMs]) => {
      // If this is the current driver on track, add ongoing stint
      const effectiveMs = name === kart.driverName && kart.pitStatus === "racing"
        ? totalMs + currentDriverStintMs
        : totalMs;
      const remainingMs = Math.max(0, minDriverTimeMs - effectiveMs);
      const metMinimum = remainingMs <= 0;
      return { name, totalMs: effectiveMs, remainingMs, metMinimum };
    }).sort((a, b) => b.totalMs - a.totalMs); // Sort by most time first
  };

  return (
    <div className="overflow-x-auto -mx-2 sm:mx-0">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-surface text-neutral-200 sticky top-0 z-10 text-[10px] sm:text-[11px] uppercase tracking-wider">
          <tr>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-left w-8 sm:w-12">Pos</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-left w-8 sm:w-12">Kart</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-left">Equipo</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-left">Piloto</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-center">Vlt</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-center">Pit</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-right">Gap</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-right">Int.</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-right">Media</th>
            <th className="px-1.5 sm:px-3 py-2 sm:py-2.5 text-center w-8 sm:w-12">Tier</th>
          </tr>
        </thead>
        <tbody>
          {classification.map((entry) => {
            const isOurTeam =
              config.ourKartNumber > 0 && entry.kartNumber === config.ourKartNumber;
            const isExpanded = expandedKart === entry.kartNumber;
            const drivers = isExpanded ? getDriverInfo(entry.kartNumber) : [];

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
                    {entry.gap || "-"}
                  </td>
                  <td className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-right font-mono text-neutral-200">
                    {entry.interval || "-"}
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
                  <tr key={`${entry.kartNumber}-drivers`} className="border-b border-border">
                    <td colSpan={10} className="px-0 py-0">
                      <div className="bg-neutral-900/80 border-l-2 border-accent/30 mx-2 sm:mx-4 my-1 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-neutral-500 text-[10px] uppercase tracking-wider">
                              <th className="px-3 py-1.5 text-left">Piloto</th>
                              <th className="px-3 py-1.5 text-right">Tiempo total</th>
                              <th className="px-3 py-1.5 text-right">Restante min.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drivers.map((d) => (
                              <tr key={d.name} className="border-t border-neutral-800">
                                <td className="px-3 py-1.5 text-neutral-200 font-medium">{d.name}</td>
                                <td className="px-3 py-1.5 text-right font-mono text-neutral-300">
                                  {secondsToHMS(d.totalMs / 1000)}
                                </td>
                                <td className={`px-3 py-1.5 text-right font-mono font-bold ${
                                  d.metMinimum ? "text-accent" : "text-tier-1"
                                }`}>
                                  {d.metMinimum ? "OK" : secondsToHMS(d.remainingMs / 1000)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="px-3 py-1 text-[10px] text-neutral-600 border-t border-neutral-800">
                          Min. por piloto: {secondsToHMS((config.minDriverTimeMin || 30) * 60)}
                        </div>
                      </div>
                    </td>
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
