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
      {/* Mobile: 2 rows. Desktop: 1 row */}
      <div className="bg-surface border-b border-border">
        {/* Top row */}
        <div className="flex items-center justify-between px-3 py-1.5 sm:px-4 sm:py-2">
          {/* Left: logo + status */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <span className="text-sm font-bold tracking-wider text-white shrink-0">
              K<span className="text-accent">N</span>
            </span>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  connected ? "bg-accent" : "bg-red-500 animate-pulse"
                }`}
              />
              <span className="text-[10px] sm:text-[11px] text-neutral-200 uppercase tracking-wider">
                {connected ? "Live" : "Off"}
              </span>
            </div>
            {apexConnected && (
              <div className="flex items-center gap-1 border-l border-border pl-2 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
                <span className="text-[10px] sm:text-[11px] text-accent font-medium truncate">
                  {apexStatusMsg || "Apex"}
                </span>
              </div>
            )}
          </div>

          {/* Center: countdown (hidden on very small, visible on sm+) */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider">Carrera</span>
            <span className="text-base font-bold tabular-nums text-white">
              {countdownMs !== 0 ? msToCountdown(countdownMs) : "--:--:--"}
            </span>
          </div>

          {/* Right: user + actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="text-[10px] sm:text-xs text-neutral-200 hidden sm:inline">{username}</span>
            <button
              onClick={() => setShowSessions(true)}
              className="text-[10px] sm:text-[11px] text-neutral-400 hover:text-accent transition-colors"
              title="Dispositivos"
            >
              <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <span className="hidden sm:inline uppercase tracking-wider">Dispositivos</span>
            </button>
            <button
              onClick={handleLogout}
              className="text-[10px] sm:text-[11px] text-neutral-400 hover:text-accent transition-colors"
              title="Salir"
            >
              <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              <span className="hidden sm:inline uppercase tracking-wider">Salir</span>
            </button>
          </div>
        </div>

        {/* Mobile-only: second row with track + countdown */}
        <div className="flex items-center justify-between px-3 py-1 border-t border-border/50 sm:hidden">
          <span className="text-xs text-neutral-300 truncate">
            {trackName || "Sin circuito"}
          </span>
          <span className="text-sm font-bold tabular-nums text-white shrink-0">
            {countdownMs !== 0 ? msToCountdown(countdownMs) : "--:--:--"}
          </span>
        </div>

        {/* Desktop-only: track name (shown in center of top row instead) */}
        {/* Track name for sm+ is shown between left and countdown */}
      </div>

      {showSessions && <SessionManager onClose={() => setShowSessions(false)} />}
    </>
  );
}
