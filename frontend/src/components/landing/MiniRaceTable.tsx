"use client";

import { useEffect, useState, useCallback } from "react";

interface RaceRow {
  pos: number;
  kart: string;
  team: string;
  lastLap: string;
  bestLap: string;
  gap: string;
  laps: number;
  status: "racing" | "pit";
}

const INITIAL_DATA: RaceRow[] = [
  { pos: 1, kart: "K47", team: "Velocity Racing", lastLap: "1:02.341", bestLap: "1:01.892", gap: "—", laps: 87, status: "racing" },
  { pos: 2, kart: "K12", team: "Thunder Kart", lastLap: "1:02.871", bestLap: "1:02.103", gap: "+3.204", laps: 87, status: "racing" },
  { pos: 3, kart: "K88", team: "Apex Endurance", lastLap: "1:03.102", bestLap: "1:02.450", gap: "+5.610", laps: 87, status: "racing" },
  { pos: 4, kart: "K23", team: "Pit Crew Pro", lastLap: "1:03.550", bestLap: "1:02.980", gap: "+8.445", laps: 86, status: "racing" },
  { pos: 5, kart: "K05", team: "Green Machine", lastLap: "1:04.012", bestLap: "1:03.200", gap: "+12.220", laps: 86, status: "pit" },
  { pos: 6, kart: "K31", team: "Night Owls", lastLap: "1:04.330", bestLap: "1:03.510", gap: "+15.801", laps: 86, status: "racing" },
];

function varyTime(base: string, range: number): string {
  const [min, rest] = base.split(":");
  const [sec, ms] = rest.split(".");
  const newMs = Math.max(0, Math.min(999, parseInt(ms) + Math.floor(Math.random() * range - range / 2)));
  return `${min}:${sec}.${String(newMs).padStart(3, "0")}`;
}

export function MiniRaceTable() {
  const [data, setData] = useState(INITIAL_DATA);
  const [updatedRows, setUpdatedRows] = useState<Set<number>>(new Set());

  const updateData = useCallback(() => {
    setData((prev) => {
      const next = prev.map((row) => ({
        ...row,
        lastLap: varyTime(row.lastLap, 80),
        laps: row.laps + (Math.random() > 0.7 ? 1 : 0),
        status: (Math.random() > 0.92 ? (row.status === "pit" ? "racing" : "pit") : row.status) as "racing" | "pit",
      }));
      // Randomly flash 1-2 rows
      const flashSet = new Set<number>();
      const flashCount = Math.random() > 0.5 ? 2 : 1;
      for (let n = 0; n < flashCount; n++) {
        flashSet.add(Math.floor(Math.random() * next.length));
      }
      setUpdatedRows(flashSet);
      return next;
    });

    // Clear flash after animation
    setTimeout(() => setUpdatedRows(new Set()), 400);
  }, []);

  useEffect(() => {
    const interval = setInterval(updateData, 2500);
    return () => clearInterval(interval);
  }, [updateData]);

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="led-dot" />
          <span className="font-mono text-xs font-semibold text-accent/70 uppercase tracking-wider">
            Live — 4H Endurance
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] text-muted/30">Vuelta 87/120</span>
          <span className="font-mono text-[11px] text-muted/30">02:14:33</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border/30">
              <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted/25 w-12">Pos</th>
              <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted/25">Kart</th>
              <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted/25 hidden sm:table-cell">Equipo</th>
              <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted/25">Ultima</th>
              <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted/25 hidden sm:table-cell">Mejor</th>
              <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted/25">Gap</th>
              <th className="py-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted/25 w-16 text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={row.kart}
                className={`border-b border-border/10 transition-colors duration-300 ${
                  updatedRows.has(i)
                    ? "bg-accent/[0.06]"
                    : i === 0
                    ? "bg-accent/[0.03]"
                    : ""
                }`}
              >
                <td className="py-2.5 px-3">
                  <span className={`font-mono text-sm font-bold ${
                    row.pos === 1 ? "text-accent" : row.pos <= 3 ? "text-white" : "text-muted/50"
                  }`}>
                    {row.pos}
                  </span>
                </td>
                <td className="py-2.5 px-3">
                  <span className="font-mono text-sm font-semibold text-white/90">{row.kart}</span>
                </td>
                <td className="py-2.5 px-3 hidden sm:table-cell">
                  <span className="text-sm text-muted/40">{row.team}</span>
                </td>
                <td className="py-2.5 px-3">
                  <span className={`font-mono text-sm ${
                    updatedRows.has(i) ? "text-accent" : "text-muted/60"
                  } transition-colors`}>
                    {row.lastLap}
                  </span>
                </td>
                <td className="py-2.5 px-3 hidden sm:table-cell">
                  <span className="font-mono text-sm text-accent/50">{row.bestLap}</span>
                </td>
                <td className="py-2.5 px-3">
                  <span className="font-mono text-sm text-muted/40">{row.gap}</span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  {row.status === "pit" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                      PIT
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent/70 uppercase tracking-wider">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      OK
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
