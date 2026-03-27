"use client";

import { msToCountdown } from "@/lib/formatters";

interface StatusBarProps {
  connected: boolean;
  trackName: string;
  countdownMs: number;
}

export function StatusBar({ connected, trackName, countdownMs }: StatusBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-gray-800">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500 animate-pulse"
            }`}
          />
          <span className="text-xs text-gray-400">
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
        <span className="text-sm font-semibold text-accent">BOXBOXNOW</span>
      </div>

      <div className="text-sm font-medium">
        {trackName || "Sin circuito"}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">CARRERA</span>
        <span className="text-lg font-bold tabular-nums">
          {countdownMs !== 0 ? msToCountdown(countdownMs) : "--:--:--"}
        </span>
      </div>
    </div>
  );
}
