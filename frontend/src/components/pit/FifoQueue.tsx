"use client";

import { useState, useEffect } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { tierHex, secondsToHMS, msToLapTime, formatDifferential } from "@/lib/formatters";
import clsx from "clsx";

export function FifoQueue() {
  const { fifo, config, karts } = useRaceStore();
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(interval);
  }, []);

  const scoreColor =
    fifo.score >= 75 ? "text-accent" :
    fifo.score >= 50 ? "text-tier-75" :
    fifo.score >= 25 ? "text-tier-50" :
    "text-tier-1";

  const scoreBg =
    fifo.score >= 75 ? "bg-accent/20 border-accent/40" :
    fifo.score >= 50 ? "bg-yellow-500/10 border-yellow-500/30" :
    fifo.score >= 25 ? "bg-orange-500/10 border-orange-500/30" :
    "bg-red-500/10 border-red-500/30";

  // Our kart info
  const ourKart = config.ourKartNumber > 0
    ? karts.find((k) => k.kartNumber === config.ourKartNumber)
    : undefined;

  const ourStintSec = ourKart
    ? (ourKart.stintStartTime > 0 ? Math.max(0, now - ourKart.stintStartTime) : ourKart.stintDurationS)
    : 0;

  const timeToMaxStint = Math.max(0, config.maxStintMin * 60 - ourStintSec);
  const lapsToMaxStint = ourKart && ourKart.avgLapMs > 0
    ? Math.floor(timeToMaxStint / (ourKart.avgLapMs / 1000))
    : 0;

  const kartsNearPit = karts.filter((k) => {
    const stintSec = k.stintStartTime > 0 ? Math.max(0, now - k.stintStartTime) : k.stintDurationS;
    return stintSec / 60 >= config.maxStintMin - 5 && k.pitStatus !== "in_pit";
  }).length;

  const boxLines = config.boxLines || 2;

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className={`rounded-xl p-4 border text-center ${scoreBg}`}>
        <div className="flex items-center justify-center gap-3">
          <span className="text-2xl">🏁</span>
          <span className={`text-3xl font-bold ${scoreColor}`}>
            Box (Score = {fifo.score.toFixed(1)})
          </span>
        </div>
        <p className="text-neutral-400 text-xs mt-2">
          {fifo.score >= 75
            ? "BUEN MOMENTO PARA ENTRAR A BOXES"
            : fifo.score >= 50
            ? "MOMENTO NEUTRAL"
            : fifo.score >= 25
            ? "MUCHOS COCHES RÁPIDOS EN BOX"
            : "NO ENTRAR - BOX LLENO DE RÁPIDOS"}
        </p>
      </div>

      {/* Visual FIFO queue */}
      <div className="bg-surface rounded-xl p-4 border border-border">
        <div className="flex items-start gap-3 overflow-x-auto pb-2">
          {/* Checkered flag at the front */}
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-20 text-3xl">
            🏁
          </div>

          {/* Queue cards */}
          {fifo.queue.map((score, i) => {
            const isFirstRow = i < boxLines;
            return (
              <div key={i} className="flex-shrink-0 relative">
                <div
                  className={clsx(
                    "w-20 h-20 rounded-lg flex flex-col items-center justify-center border-2 transition-all",
                    isFirstRow ? "border-accent/60 shadow-lg shadow-accent/10" : "border-neutral-700"
                  )}
                  style={{ backgroundColor: `${tierHex(score)}20` }}
                >
                  <span
                    className="text-2xl font-bold"
                    style={{ color: tierHex(score) }}
                  >
                    {score}
                  </span>
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Box</span>
                </div>
                {/* "Fila 1" marker at the boundary */}
                {i === boxLines - 1 && (
                  <div className="absolute -right-2 top-0 bottom-0 flex items-center z-10">
                    <div className="flex items-center gap-1 bg-accent/20 border border-accent/40 rounded px-1.5 py-0.5">
                      <span className="text-[10px] text-accent font-bold whitespace-nowrap">Fila {boxLines}</span>
                      <span className="text-accent">⬅</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Info panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Stint metrics */}
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

        {/* Right: Pit info */}
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="bg-neutral-800/50 px-4 py-2 flex justify-between">
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">Pits</span>
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider font-semibold">Valor</span>
          </div>
          <div className="divide-y divide-border">
            <InfoRow
              label="Pit en curso"
              value={ourKart?.pitStatus === "in_pit" ? secondsToHMS(ourStintSec) : secondsToHMS(0)}
            />
            <InfoRow
              label="Tiempo mínimo de pit"
              value={secondsToHMS(config.pitTimeS)}
            />
            <InfoRow
              label="Número de pits"
              value={ourKart ? String(ourKart.pitCount) : "0"}
            />
            <InfoRow
              label="Número mínimo de pits"
              value={String(config.minPits)}
            />
          </div>
        </div>
      </div>

      {/* FIFO history */}
      {fifo.history.length > 0 && (
        <div className="bg-surface rounded-xl p-4 border border-border">
          <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">
            Historial ({fifo.history.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-neutral-400 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-right">Score</th>
                  <th className="px-2 py-1 text-left">Cola</th>
                </tr>
              </thead>
              <tbody>
                {[...fifo.history].reverse().slice(0, 10).map((snap, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1 text-neutral-400">{fifo.history.length - i}</td>
                    <td className="px-2 py-1 text-right font-mono font-bold">
                      <span style={{ color: tierHex(snap.score) }}>
                        {snap.score.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex gap-0.5">
                        {snap.queue.slice(-10).map((s: number, j: number) => (
                          <div
                            key={j}
                            className="w-4 h-4 rounded-sm"
                            style={{ backgroundColor: tierHex(s) }}
                            title={`${s} pts`}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
