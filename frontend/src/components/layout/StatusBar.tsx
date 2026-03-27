"use client";

import { useState } from "react";
import { msToCountdown } from "@/lib/formatters";
import { useAuth } from "@/hooks/useAuth";
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

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    logout();
  };

  return (
    <>
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

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">CARRERA</span>
            <span className="text-lg font-bold tabular-nums">
              {countdownMs !== 0 ? msToCountdown(countdownMs) : "--:--:--"}
            </span>
          </div>
          <div className="flex items-center gap-2 border-l border-gray-700 pl-4">
            <span className="text-xs text-gray-400">{username}</span>
            <button
              onClick={() => setShowSessions(true)}
              className="text-xs text-gray-500 hover:text-accent transition-colors"
              title="Gestionar dispositivos"
            >
              Dispositivos
            </button>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-accent transition-colors"
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
