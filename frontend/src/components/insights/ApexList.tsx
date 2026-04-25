"use client";

// List of detected apexes (local minima of speed) for one lap. Each entry
// shows the apex speed, the lateral G at that instant and how far through
// the lap it sits — useful as a hand-rail when watching a replay.

import type { GpsLapDetail } from "./types";

interface Props {
  lap: GpsLapDetail;
  apexes: number[];
}

export function ApexList({ lap, apexes }: Props) {
  const speeds = lap.speeds ?? [];
  const dists = lap.distances ?? [];
  const ts = lap.timestamps ?? [];
  const gx = lap.gforce_lat ?? [];
  if (apexes.length === 0) {
    return (
      <div className="text-neutral-500 text-xs text-center py-4">
        No se han detectado apex (puede que la vuelta sea muy corta o sin curvas marcadas).
      </div>
    );
  }
  const total = dists[dists.length - 1] ?? 1;
  return (
    <div className="bg-black/30 rounded-lg border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="text-[10px] text-neutral-400 uppercase tracking-wider bg-black/40">
          <tr>
            <th className="text-left px-2 py-1.5">#</th>
            <th className="text-right px-2 py-1.5">Distancia</th>
            <th className="text-right px-2 py-1.5">% vuelta</th>
            <th className="text-right px-2 py-1.5">Tiempo</th>
            <th className="text-right px-2 py-1.5">Velocidad</th>
            <th className="text-right px-2 py-1.5">G lateral</th>
          </tr>
        </thead>
        <tbody>
          {apexes.map((idx, i) => {
            const d = dists[idx] ?? 0;
            const t = ts[idx] ?? 0;
            const sp = speeds[idx] ?? 0;
            const lat = gx[idx];
            return (
              <tr key={idx} className="border-t border-border">
                <td className="px-2 py-1.5 text-yellow-400 font-medium">A{i + 1}</td>
                <td className="px-2 py-1.5 text-right text-neutral-400 font-mono">{Math.round(d)}m</td>
                <td className="px-2 py-1.5 text-right text-neutral-500 font-mono">
                  {((d / total) * 100).toFixed(0)}%
                </td>
                <td className="px-2 py-1.5 text-right text-neutral-400 font-mono">
                  {t.toFixed(2)}s
                </td>
                <td className="px-2 py-1.5 text-right text-white font-mono font-semibold">
                  {sp.toFixed(1)} <span className="text-neutral-500 text-[10px]">km/h</span>
                </td>
                <td className="px-2 py-1.5 text-right text-neutral-400 font-mono">
                  {lat != null ? `${lat >= 0 ? "+" : ""}${lat.toFixed(2)}G` : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
