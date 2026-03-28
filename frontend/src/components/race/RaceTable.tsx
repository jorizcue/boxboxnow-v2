"use client";

import { useState, useEffect, useMemo } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { msToLapTime, secondsToStint, secondsToHMS, tierHex, formatDifferential } from "@/lib/formatters";
import clsx from "clsx";

export function RaceTable() {
  const { karts, config, classification } = useRaceStore();
  const [now, setNow] = useState(() => Date.now() / 1000);

  // Tick every second for real-time stint timer
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(interval);
  }, []);

  const sorted = [...karts].sort((a, b) => (a.position || 999) - (b.position || 999));

  // Map classification positions by kart number for "Posición estimada"
  const estimatedPositions = useMemo(() => {
    const map: Record<number, number> = {};
    classification.forEach((c) => { map[c.kartNumber] = c.position; });
    return map;
  }, [classification]);

  // Find our kart
  const ourKart = config.ourKartNumber > 0
    ? sorted.find((k) => k.kartNumber === config.ourKartNumber)
    : undefined;

  // Compute stint duration for our kart
  const ourStintSec = ourKart
    ? (ourKart.stintStartTime > 0 ? Math.max(0, now - ourKart.stintStartTime) : ourKart.stintDurationS)
    : 0;

  // Time until max stint
  const timeToMaxStint = Math.max(0, config.maxStintMin * 60 - ourStintSec);

  // Laps until max stint
  const lapsToMaxStint = ourKart && ourKart.avgLapMs > 0
    ? Math.floor(timeToMaxStint / (ourKart.avgLapMs / 1000))
    : 0;

  // Count karts near PIT (within 5 min of max stint)
  const kartsNearPit = sorted.filter((k) => {
    const stintSec = k.stintStartTime > 0 ? Math.max(0, now - k.stintStartTime) : k.stintDurationS;
    const stintMin = stintSec / 60;
    return stintMin >= config.maxStintMin - 5 && k.pitStatus !== "in_pit";
  }).length;

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
    <div className="space-y-4">
      {/* Main race table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface text-neutral-200 sticky top-0 z-10 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="px-2 py-2.5 text-left w-12">Pos</th>
              <th className="px-2 py-2.5 text-center w-12">Est.</th>
              <th className="px-2 py-2.5 text-left w-12">Kart</th>
              <th className="px-2 py-2.5 text-left">Equipo</th>
              <th className="px-2 py-2.5 text-right">Tiempo medio</th>
              <th className="px-2 py-2.5 text-right">Best Avg</th>
              <th className="px-2 py-2.5 text-right">Ult. Vuelta</th>
              <th className="px-2 py-2.5 text-right">Mejor</th>
              <th className="px-2 py-2.5 text-right">Gap</th>
              <th className="px-2 py-2.5 text-right">Interv.</th>
              <th className="px-2 py-2.5 text-center">Vueltas</th>
              <th className="px-2 py-2.5 text-center">Pits</th>
              <th className="px-2 py-2.5 text-center w-12">Punt.</th>
              <th className="px-2 py-2.5 text-center">Stint</th>
              <th className="px-2 py-2.5 text-center w-8"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((kart) => {
              const isOurTeam = config.ourKartNumber > 0 && kart.kartNumber === config.ourKartNumber;
              const stintSec = kart.stintStartTime > 0
                ? Math.max(0, now - kart.stintStartTime)
                : kart.stintDurationS;
              const stintMin = stintSec / 60;
              const stintWarning = stintMin >= config.maxStintMin;
              const stintAlert = stintMin >= config.maxStintMin - 5 && stintMin < config.maxStintMin;
              const pitsRemaining = Math.max(0, config.minPits - kart.pitCount);
              const estPos = estimatedPositions[kart.kartNumber];

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
                  <td className="px-2 py-1.5 text-center font-mono text-neutral-400">
                    {estPos || "-"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-neutral-300">{kart.kartNumber}</td>
                  <td className="px-2 py-1.5 font-medium truncate max-w-[180px] text-white">
                    {kart.teamName}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-neutral-300">
                    {kart.avgLapMs > 0 ? msToLapTime(Math.round(kart.avgLapMs)) : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-neutral-400">
                    {kart.bestAvgMs > 0 ? msToLapTime(Math.round(kart.bestAvgMs)) : "-"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-white">
                    {msToLapTime(kart.lastLapMs)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-accent">
                    {msToLapTime(kart.bestLapMs)}
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
                      className="tier-badge"
                      style={{ backgroundColor: tierHex(kart.tierScore) }}
                    >
                      {kart.tierScore}
                    </span>
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

      {/* Info panels below the table */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Stint metrics for our kart */}
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="bg-neutral-800/50 px-4 py-2 flex justify-between">
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">Métrica</span>
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">Valor</span>
          </div>
          <div className="divide-y divide-border">
            <InfoRow
              label="Stint en curso"
              value={secondsToHMS(ourStintSec)}
              highlight={ourStintSec / 60 >= config.maxStintMin}
            />
            <InfoRow label="Tiempo hasta stint máximo" value={secondsToHMS(timeToMaxStint)} />
            <InfoRow label="Vueltas hasta stint máximo" value={String(lapsToMaxStint)} />
            <InfoRow label="Karts cerca de PIT" value={String(kartsNearPit)} />
            <InfoRow label="Stint máximo" value={secondsToHMS(config.maxStintMin * 60)} />
            <InfoRow label="Stint mínimo" value={secondsToHMS(config.minStintMin * 60)} />
          </div>
        </div>

        {/* Right: Driver info for our kart */}
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="bg-neutral-800/50 px-4 py-2 flex justify-between">
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">Piloto</span>
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">Info</span>
          </div>
          <div className="divide-y divide-border">
            <InfoRow
              label="Piloto actual"
              value={ourKart?.driverName || "-"}
            />
            <InfoRow
              label="Tiempo piloto"
              value={ourKart?.driverTime || "-"}
            />
            <InfoRow
              label="Dif. Tiempo piloto"
              value={ourKart ? formatDifferential(ourKart.driverDifferentialMs) : "-"}
            />
            <InfoRow
              label="Vueltas en stint"
              value={ourKart ? String(ourKart.stintLapsCount) : "0"}
            />
            <InfoRow
              label="Ritmo medio"
              value={ourKart && ourKart.avgLapMs > 0 ? msToLapTime(Math.round(ourKart.avgLapMs)) : "-"}
            />
            <InfoRow
              label="Mejor media (3 mejores)"
              value={ourKart && ourKart.bestAvgMs > 0 ? msToLapTime(Math.round(ourKart.bestAvgMs)) : "-"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center px-4 py-2">
      <span className={clsx("text-sm", highlight ? "text-tier-1 font-semibold" : "text-neutral-300")}>
        {label}
      </span>
      <span className={clsx("text-sm font-mono", highlight ? "text-tier-1 font-bold" : "text-white")}>
        {value}
      </span>
    </div>
  );
}
