"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { msToCountdown } from "@/lib/formatters";
import { useAuth } from "@/hooks/useAuth";
import { useT, useLangStore, LANGUAGES } from "@/lib/i18n";
import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { useReplayTime } from "@/hooks/useReplayTime";
import { api } from "@/lib/api";
import { StyledSelect } from "@/components/shared/StyledSelect";
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
  const raceStarted = useRaceStore((s) => s.raceStarted);
  const durationMs = useRaceStore((s) => s.durationMs);
  const pitClosedStartMin = useRaceStore((s) => s.config.pitClosedStartMin);
  const pitClosedEndMin = useRaceStore((s) => s.config.pitClosedEndMin);
  const minStintMin = useRaceStore((s) => s.config.minStintMin);
  const ourKartNumber = useRaceStore((s) => s.config.ourKartNumber);
  const karts = useRaceStore((s) => s.karts);
  const replayActive = useRaceStore((s) => s.replayActive);
  const replayPaused = useRaceStore((s) => s.replayPaused);
  const replayFilename = useRaceStore((s) => s.replayFilename);
  const replayProgress = useRaceStore((s) => s.replayProgress);
  const replaySpeed = useRaceStore((s) => s.replaySpeed);
  const requestWsReconnect = useRaceStore((s) => s.requestWsReconnect);
  const setReplayStatus = useRaceStore((s) => s.setReplayStatus);
  const replayTime = useReplayTime();

  const handlePauseResume = useCallback(async () => {
    try { await api.pauseReplay(); } catch {}
  }, []);

  const handleStop = useCallback(async () => {
    try {
      setReplayStatus(false);
      await api.stopReplay();
      requestWsReconnect();
    } catch {}
  }, [requestWsReconnect, setReplayStatus]);

  const handleRestart = useCallback(async () => {
    try { await api.restartReplay(); } catch {}
  }, []);

  const handleSpeedChange = useCallback(async (speed: number) => {
    try { await api.setReplaySpeed(speed); } catch {}
  }, []);

  // Use interpolated race clock that ticks every second
  const raceClockMs = useRaceClock();

  // Wall clock that ticks every second
  const [clockStr, setClockStr] = useState("");
  useEffect(() => {
    const tick = () => setClockStr(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = async () => {
    try { await api.logout(); } catch {}
    logout();
  };

  // Format the timer display using the interpolated clock
  const timerDisplay = raceClockMs !== 0 ? msToCountdown(raceClockMs) : "00:00:00";

  // Compute race start wall-clock time (HH:MM:SS)
  const raceStartTime = useMemo(() => {
    if (!raceStarted || durationMs === 0 || raceClockMs === 0) return null;
    const elapsedMs = durationMs - raceClockMs;
    const startEpoch = Date.now() - elapsedMs;
    const d = new Date(startEpoch);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, [raceStarted, durationMs, Math.floor(raceClockMs / 60000)]); // recalc every ~1min

  // Pit window status: closed during first/last N minutes AND during min stint after pit out
  const ourKart = ourKartNumber > 0 ? karts.find((k) => k.kartNumber === ourKartNumber) : undefined;
  const hasPitWindow = raceStarted && (pitClosedStartMin > 0 || pitClosedEndMin > 0 || minStintMin > 0);
  const pitIsClosed = (() => {
    if (!raceStarted || raceClockMs === 0 || durationMs === 0) return false;
    const elapsedMin = (durationMs - raceClockMs) / 60000;
    const remainingMin = raceClockMs / 60000;
    // Regulation window: first/last N minutes
    if (pitClosedStartMin > 0 && elapsedMin < pitClosedStartMin) return true;
    if (pitClosedEndMin > 0 && remainingMin < pitClosedEndMin) return true;
    // Min stint lockout: after our kart's pit out, closed until minStintMin elapsed
    if (minStintMin > 0 && ourKart && ourKart.pitStatus === "racing" && ourKart.stintStartCountdownMs > 0) {
      const stintElapsedMin = (ourKart.stintStartCountdownMs - raceClockMs) / 60000;
      if (stintElapsedMin >= 0 && stintElapsedMin < minStintMin) return true;
    }
    return false;
  })();

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
            {clockStr && (
              <span className="text-[10px] sm:text-[11px] text-neutral-400 font-mono tabular-nums shrink-0">
                {clockStr}
              </span>
            )}
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
                <StyledSelect
                  compact
                  value={replaySpeed}
                  onChange={(v) => handleSpeedChange(Number(v))}
                  options={[1, 2, 3, 5, 10, 20, 50, 100].map((s) => ({ value: s, label: `${s}x` }))}
                  className="w-12 font-mono"
                />

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

                {/* Restart */}
                <button
                  onClick={handleRestart}
                  className="text-orange-400 hover:text-orange-300 transition-colors"
                  title="Restart"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
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

          {/* Center: countdown + pit status (hidden on very small, visible on sm+) */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[11px] text-neutral-400 uppercase tracking-wider">{t("status.race")}</span>
            {raceStartTime && (
              <span className="text-[10px] text-neutral-400 font-mono tabular-nums">
                {raceStartTime}
              </span>
            )}
            <span className="text-base font-bold tabular-nums text-white">
              {timerDisplay}
            </span>
            {hasPitWindow && (
              <span
                className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  pitIsClosed
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-green-500/20 text-green-400 border border-green-500/30"
                }`}
              >
                {pitIsClosed ? t("status.pitClosed") : t("status.pitOpen")}
              </span>
            )}
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

        {/* Mobile-only: second row with track + countdown + pit status */}
        <div className="flex items-center justify-between px-3 py-1 border-t border-border/50 sm:hidden">
          <span className="text-xs text-neutral-300 truncate">
            {trackName || t("status.noCircuit")}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasPitWindow && (
              <span
                className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                  pitIsClosed
                    ? "bg-red-500/20 text-red-400"
                    : "bg-green-500/20 text-green-400"
                }`}
              >
                {pitIsClosed ? t("status.pitClosed") : t("status.pitOpen")}
              </span>
            )}
            {raceStartTime && (
              <span className="text-[9px] text-neutral-400 font-mono tabular-nums">
                {raceStartTime}
              </span>
            )}
            <span className="text-sm font-bold tabular-nums text-white">
              {timerDisplay}
            </span>
          </div>
        </div>

        {/* Desktop-only: track name (shown in center of top row instead) */}
        {/* Track name for sm+ is shown between left and countdown */}
      </div>

      {showSessions && <SessionManager onClose={() => setShowSessions(false)} />}
    </>
  );
}
