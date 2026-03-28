"use client";

import { useState } from "react";
import { msToCountdown } from "@/lib/formatters";
import { useAuth } from "@/hooks/useAuth";
import { useRaceStore } from "@/hooks/useRaceState";
import { api } from "@/lib/api";
import { SessionManager } from "@/components/auth/SessionManager";

interface StatusBarProps {
  connected: boolean;
  trackName: string;
  countdownMs: number;
  username: string;
}

export function StatusBar({ connected, trackName, countdownMs, username }: StatusBarProps) {
  const { logout } = useAuth();
  const [showSessions, setShowSessions] = useState(false);
  const apexConnected = useRaceStore((s) => s.apexConnected);
  const apexStatusMsg = useRaceStore((s) => s.apexStatusMsg);

  const handleLogout = async () => {
    try { await api.logout(); } catch {}
    logout();
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-accent">K</span>
            <span className="text-sm font-semibold tracking-wider text-white">KARTING<span className="text-accent">NOW</span></span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-accent" : "bg-red-500 animate-pulse"
              }`}
            />
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider">
              {connected ? "Live" : "Offline"}
            </span>
          </div>
          {apexConnected && (
            <div className="flex items-center gap-1.5 border-l border-border pl-3">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-[11px] text-accent font-medium">
                {apexStatusMsg || "Apex"}
              </span>
            </div>
          )}
        </div>

        <div className="text-sm font-medium text-neutral-300 tracking-wide">
          {trackName || "Sin circuito"}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-200 uppercase tracking-wider">Carrera</span>
            <span className="text-lg font-bold tabular-nums text-white">
              {countdownMs !== 0 ? msToCountdown(countdownMs) : "--:--:--"}
            </span>
          </div>
          <div className="flex items-center gap-3 border-l border-border pl-4">
            <span className="text-xs text-neutral-200">{username}</span>
            <button
              onClick={() => setShowSessions(true)}
              className="text-[11px] text-neutral-400 hover:text-accent transition-colors uppercase tracking-wider"
            >
              Dispositivos
            </button>
            <button
              onClick={handleLogout}
              className="text-[11px] text-neutral-400 hover:text-accent transition-colors uppercase tracking-wider"
            >
              Salir
            </button>
          </div>
        </div>
      </div>

      {showSessions && <SessionManager onClose={() => setShowSessions(false)} />}
    </>
  );
}
