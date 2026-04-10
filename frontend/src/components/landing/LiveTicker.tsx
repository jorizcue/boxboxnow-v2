"use client";

import { useEffect, useState } from "react";

interface TickerEntry {
  kart: string;
  pos: number;
  gap: string;
  lap: string;
}

const BASE_DATA: TickerEntry[] = [
  { kart: "K47", pos: 1, gap: "LIDER", lap: "1:02.341" },
  { kart: "K12", pos: 2, gap: "+3.204", lap: "1:02.871" },
  { kart: "K88", pos: 3, gap: "+5.610", lap: "1:03.102" },
  { kart: "K23", pos: 4, gap: "+8.445", lap: "1:03.550" },
  { kart: "K05", pos: 5, gap: "+12.220", lap: "1:04.012" },
  { kart: "K31", pos: 6, gap: "+15.801", lap: "1:04.330" },
  { kart: "K77", pos: 7, gap: "+19.304", lap: "1:04.678" },
  { kart: "K09", pos: 8, gap: "+22.100", lap: "1:05.021" },
];

function varyLap(base: string): string {
  const [min, rest] = base.split(":");
  const [sec, ms] = rest.split(".");
  const newMs = Math.max(0, parseInt(ms) + Math.floor(Math.random() * 60 - 30));
  return `${min}:${sec}.${String(newMs).padStart(3, "0")}`;
}

export function LiveTicker() {
  const [data, setData] = useState(BASE_DATA);

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) =>
        prev.map((entry) => ({
          ...entry,
          lap: varyLap(entry.lap),
        }))
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Double the array for infinite scroll illusion
  const doubled = [...data, ...data];

  return (
    <div className="relative mx-auto max-w-3xl overflow-hidden rounded-lg border border-border/30 bg-black/40 backdrop-blur-sm">
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-black/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-black/80 to-transparent z-10 pointer-events-none" />

      <div className="flex items-center overflow-hidden py-2.5 px-2">
        <div className="ticker-track flex shrink-0 items-center gap-6" style={{ animationDuration: "25s" }}>
          {doubled.map((entry, i) => (
            <div
              key={`${entry.kart}-${i}`}
              className="flex items-center gap-3 whitespace-nowrap"
            >
              <span className="font-mono text-xs font-bold text-accent/60">
                P{entry.pos}
              </span>
              <span className="font-mono text-xs font-semibold text-white/80">
                {entry.kart}
              </span>
              <span className="font-mono text-[11px] text-muted/30">
                {entry.gap}
              </span>
              <span className="font-mono text-[11px] text-muted/20">
                {entry.lap}
              </span>
              <span className="h-3 w-px bg-border/30" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
