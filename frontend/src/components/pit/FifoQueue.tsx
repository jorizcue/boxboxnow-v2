"use client";

import { useRaceStore } from "@/hooks/useRaceState";
import { tierHex } from "@/lib/formatters";

export function FifoQueue() {
  const { fifo } = useRaceStore();

  const scoreColor =
    fifo.score >= 75 ? "text-tier-100" :
    fifo.score >= 50 ? "text-tier-75" :
    fifo.score >= 25 ? "text-tier-50" :
    "text-tier-1";

  return (
    <div className="space-y-6">
      {/* Score gauge */}
      <div className="bg-card rounded-lg p-6 text-center">
        <h2 className="text-gray-400 text-sm mb-2">PUNTUACION BOX</h2>
        <div className={`text-6xl font-bold ${scoreColor}`}>
          {fifo.score.toFixed(1)}
        </div>
        <p className="text-gray-500 text-xs mt-2">
          {fifo.score >= 75
            ? "BUEN MOMENTO PARA ENTRAR"
            : fifo.score >= 50
            ? "MOMENTO NEUTRAL"
            : fifo.score >= 25
            ? "MUCHOS COCHES RAPIDOS EN BOX"
            : "NO ENTRAR - BOX LLENO DE RAPIDOS"}
        </p>
      </div>

      {/* Current FIFO queue */}
      <div className="bg-card rounded-lg p-4">
        <h3 className="text-gray-400 text-sm mb-3">COLA FIFO ACTUAL</h3>
        <div className="flex flex-wrap gap-1">
          {fifo.queue.map((score, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold text-black"
              style={{ backgroundColor: tierHex(score) }}
              title={`Posicion ${i + 1}: ${score} pts`}
            >
              {score}
            </div>
          ))}
        </div>
      </div>

      {/* FIFO history */}
      <div className="bg-card rounded-lg p-4">
        <h3 className="text-gray-400 text-sm mb-3">
          HISTORIAL ({fifo.history.length} snapshots)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500">
              <tr>
                <th className="px-2 py-1 text-left">#</th>
                <th className="px-2 py-1 text-right">Score</th>
                <th className="px-2 py-1 text-left">Cola</th>
              </tr>
            </thead>
            <tbody>
              {[...fifo.history].reverse().slice(0, 10).map((snap, i) => (
                <tr key={i} className="border-t border-gray-800/50">
                  <td className="px-2 py-1 text-gray-500">{fifo.history.length - i}</td>
                  <td className="px-2 py-1 text-right font-mono font-bold">
                    <span style={{ color: tierHex(snap.score) }}>
                      {snap.score.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex gap-0.5">
                      {snap.queue.slice(-10).map((s, j) => (
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
    </div>
  );
}
