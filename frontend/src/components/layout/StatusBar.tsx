"use client";

import { useState, useCallback } from "react";
import { msToCountdown } from "@/lib/formatters";
import { useAuth } from "@/hooks/useAuth";
import { useT, useLangStore, LANGUAGES } from "@/lib/i18n";
import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { useReplayTime } from "@/hooks/useReplayTime";
import { api } from "@/lib/api";
import { SessionManager } from "@/components/auth/SessionManager";

interface StatusBarProps {
  connected: boolean;
  trackName: string;
  countdownMs: number;
  username: string;
}

export function StatusBar({ connected, trackName, countdownMs, username }: StatusBarProps) {
  const t = useT();
  const { lang, setLang } = useLangStore();
  const { logout } = useAuth();
  const [showSessions, setShowSessions] = useState(false);
  const apexConnected = useRaceStore((s) => s.apexConnected);
  const apexStatusMsg = useRaceStore((s) => s.apexStatusMsg);
  const replayActive = useRaceStore((s) => s.replayActive);
  const replayPaused = useRaceStore((s) => s.replayPaused);
  const replayFilename = useRaceStore((s) => s.replayFilename);
  const replayProgress = useRaceStore((s) => s.replayProgress);
  const replaySpeed = useRaceStore((s) => s.replaySpeed);
  const requestWsReconnect = useRaceStore((s) => s.requestWsReconnect);
  const replayTime = useReplayTime();

  const handlePauseResume = useCallback(async () => {
    try { await api.pauseReplay(); } catch {}
  }, []);

  const handleStop = useCallback(async () => {
    try {
      await api.stopReplay();
      requestWsReconnect();
    } catch {}
  }, [requestWsReconnect]);

  const handleSpeedChange = useCallback(async (speed: number) => {
    try { await api.setReplaySpeed(speed); } catch {}
  }, []);

  // Use interpolated race clock that ticks every second
  const raceClockMs = useRaceClock();

  const handleLogout = async () => {
    try { await api.logout(); } catch {}
    logout();
  };

  // Format the timer display using the interpolated clock
  const timerDisplay = raceClockMs !== 0 ? msToCountdown(raceClockMs) : "00:00:00";

  return (
    <>
      {/* Mobile: 2 rows. Desktop: 1 row */}
      <div className="bg-surface border-b border-border">
        {/* Top row */}
        <div className="flex items-center justify-between px-3 py-1.5 sm:px-4 sm:py-2">
          {/* Left: logo + status */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <span className="text-sm font-bold tracking-wider text-white shrink-0">
              BB<span className="text-accent">N</span>
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
            {replayActive && (
              <div className="flex items-center gap-1.5 sm:gap-2 border-l border-border pl-2 min-w-0">
                {/* Indicator dot */}
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${replayPaused ? "bg-orange-400" : "bg-orange-400 animate-pulse"}`} />

                {/* Replay time */}
                {replayTime && (
                  <span className="text-[10px] sm:text-[11px] text-orange-300 font-mono font-semibold">
                    {replayTime}
                  </span>
                )}

                {/* Progress bar (desktop) */}
                <div className="hidden sm:flex items-center gap-1.5 min-w-0">
                  <div className="w-20 lg:w-32 h-1.5 bg-neutral-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-400 rounded-full transition-all duration-500"
                      style={{ width: `${(replayProgress * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-neutral-500 tabular-nums w-7 text-right">
                    {(replayProgress * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Speed selector */}
                <select
                  value={replaySpeed}
                  onChange={(e) => handleSpeedChange(Number(e.target.value))}
                  className="bg-neutral-800 border border-border rounded px-1 py-0 text-[10px] sm:text-[11px] text-orange-300 font-mono cursor-pointer appearance-none text-center w-10"
                >
                  {[1, 2, 3, 5, 10, 20, 50, 100].map((s) => (
                    <option key={s} value={s}>{s}x</option>
                  ))}
                </select>

                {/* Pause/Resume */}
                <button
                  onClick={handlePauseResume}
                  className="text-orange-400 hover:text-orange-300 transition-colors"
                  title={replayPaused ? "Resume" : "Pause"}
                >
                  {replayPaused ? (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.841z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                    </svg>
                  )}
                </button>

                {/* Stop */}
                <button
                  onClick={handleStop}
                  className="text-red-500 hover:text-red-400 transition-colors"
                  title="Stop"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <rect x="4" y="4" width="12" height="12" rx="1.5" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Center: countdown (hidden on very small, visible on sm+) */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider">{t("status.race")}</span>
            <span className="text-base font-bold tabular-nums text-white">
              {timerDisplay}
            </span>
          </div>

          {/* Right: user + actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="text-[10px] sm:text-xs text-neutral-200 hidden sm:inline">{username}</span>
            <button
              onClick={() => {
                window.open(
                  "/driver",
                  "bbn-driver",
                  "width=800,height=400,menubar=no,toolbar=no,location=no,status=no"
                );
              }}
              className="text-[10px] sm:text-[11px] text-neutral-400 hover:text-accent transition-colors"
              title={t("driver.open")}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" d="M5.5 16.5c2-1.5 4.5-2 6.5-2s4.5.5 6.5 2" />
                <path strokeLinecap="round" d="M7 8.5h2M15 8.5h2" />
                <path strokeLinecap="round" d="M12 7v4" />
              </svg>
            </button>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as any)}
              className="bg-black border border-border rounded px-1 py-0.5 text-sm cursor-pointer appearance-none text-center w-10"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.flag}</option>
              ))}
            </select>
            <button
              onClick={() => setShowSessions(true)}
              className="text-[10px] sm:text-[11px] text-neutral-400 hover:text-accent transition-colors"
              title={t("status.devices")}
            >
              <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <span className="hidden sm:inline uppercase tracking-wider">{t("status.devices")}</span>
            </button>
            <button
              onClick={handleLogout}
              className="text-[10px] sm:text-[11px] text-neutral-400 hover:text-accent transition-colors"
              title={t("status.logout")}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile-only: second row with track + countdown */}
        <div className="flex items-center justify-between px-3 py-1 border-t border-border/50 sm:hidden">
          <span className="text-xs text-neutral-300 truncate">
            {trackName || t("status.noCircuit")}
          </span>
          <span className="text-sm font-bold tabular-nums text-white shrink-0">
            {timerDisplay}
          </span>
        </div>

        {/* Desktop-only: track name (shown in center of top row instead) */}
        {/* Track name for sm+ is shown between left and countdown */}
      </div>

      {showSessions && <SessionManager onClose={() => setShowSessions(false)} />}
    </>
  );
}
