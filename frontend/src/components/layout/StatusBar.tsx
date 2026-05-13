"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { msToCountdown } from "@/lib/formatters";
import { useAuth } from "@/hooks/useAuth";
import { useT, useLangStore, LANGUAGES } from "@/lib/i18n";
import { useRaceStore } from "@/hooks/useRaceState";
import { useRaceClock } from "@/hooks/useRaceClock";
import { useReplayTime } from "@/hooks/useReplayTime";
import { api } from "@/lib/api";
import { StyledSelect } from "@/components/shared/StyledSelect";
import { SessionManager } from "@/components/auth/SessionManager";
import { RainToggle } from "@/components/shared/RainToggle";

/** Parse HH:MM:SS (or HH:MM) into total seconds; returns -1 on failure. */
function parseHMS(t: string): number {
  if (!t) return -1;
  const parts = t.split(":");
  if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  return -1;
}

/**
 * Convert a local-time HH:MM:SS string to its UTC equivalent.
 * The orange clock now shows local time, but the backend's seek_time
 * endpoint searches log timestamps which are stored in UTC — so we
 * must convert back before sending.
 */
function localHmsToUtcHms(hms: string): string {
  const parts = hms.split(":");
  if (parts.length < 2) return hms;
  const now = new Date();
  const d = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(),
    parseInt(parts[0]), parseInt(parts[1]),
    parts.length >= 3 ? parseInt(parts[2]) : 0,
  );
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface StatusBarProps {
  connected: boolean;
  trackName: string;
  countdownMs: number;
  /** Kept optional for backwards compatibility but no longer rendered —
   * the username moved to the pinned account row at the bottom of the
   * sidebar (Claude Desktop style). */
  username?: string;
}

export function StatusBar({ connected, trackName, countdownMs }: StatusBarProps) {
  const t = useT();
  const { lang, setLang } = useLangStore();
  const { logout } = useAuth();
  const [showSessions, setShowSessions] = useState(false);
  const apexConnected = useRaceStore((s) => s.apexConnected);
  const apexStatusMsg = useRaceStore((s) => s.apexStatusMsg);
  const raceStarted = useRaceStore((s) => s.raceStarted);
  const raceFinished = useRaceStore((s) => s.raceFinished);
  const durationMs = useRaceStore((s) => s.durationMs);
  const pitClosedStartMin = useRaceStore((s) => s.config.pitClosedStartMin);
  const pitClosedEndMin = useRaceStore((s) => s.config.pitClosedEndMin);
  const minStintMin = useRaceStore((s) => s.config.minStintMin);
  const maxStintMin = useRaceStore((s) => s.config.maxStintMin);
  const pitTimeS = useRaceStore((s) => s.config.pitTimeS);
  const minPitsConfig = useRaceStore((s) => s.config.minPits);
  const ourKartNumber = useRaceStore((s) => s.config.ourKartNumber);
  const karts = useRaceStore((s) => s.karts);
  const replayActive = useRaceStore((s) => s.replayActive);
  const replayPaused = useRaceStore((s) => s.replayPaused);
  const replayFilename = useRaceStore((s) => s.replayFilename);
  const replayProgress = useRaceStore((s) => s.replayProgress);
  const replaySpeed = useRaceStore((s) => s.replaySpeed);
  const replayTotalBlocks = useRaceStore((s) => s.replayTotalBlocks);
  const replayStartBlock = useRaceStore((s) => s.replayStartBlock);
  const requestWsReconnect = useRaceStore((s) => s.requestWsReconnect);
  const setReplayStatus = useRaceStore((s) => s.setReplayStatus);
  const replayTime = useReplayTime();

  // Optimistic UI: update local state immediately, then send to server
  const handlePauseResume = useCallback(async () => {
    setReplayStatus(replayActive, !replayPaused);
    try { await api.pauseReplay(); } catch {}
  }, [replayActive, replayPaused, setReplayStatus]);

  const handleStop = useCallback(async () => {
    setReplayStatus(false);
    try {
      await api.stopReplay();
      requestWsReconnect();
    } catch {}
  }, [requestWsReconnect, setReplayStatus]);

  const handleRestart = useCallback(async () => {
    try { await api.restartReplay(replayStartBlock); } catch {}
  }, [replayStartBlock]);

  const handleSpeedChange = useCallback(async (speed: number) => {
    setReplayStatus(replayActive, replayPaused, undefined, undefined, undefined, speed);
    try { await api.setReplaySpeed(speed); } catch {}
  }, [replayActive, replayPaused, setReplayStatus]);

  const handleProgressBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (replayTotalBlocks <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const block = Math.round(pct * replayTotalBlocks);
    api.seekReplay(block).catch(() => {});
  }, [replayTotalBlocks]);

  // ── Time-jump: click the orange clock to type an exact HH:MM:SS ──
  // The backend resolves to the nearest block via binary search on the
  // parsed timestamps, so jumping +2h in a 4h replay is O(log n) — no
  // fast-forwarding through messages on the client side.
  const [timeEditing, setTimeEditing] = useState(false);
  const [timeInput, setTimeInput] = useState("");
  const [seeking, setSeeking] = useState(false);
  const seekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTimeEdit = useCallback(() => {
    setTimeInput(replayTime || "");
    setTimeEditing(true);
  }, [replayTime]);

  const submitTimeJump = useCallback(async () => {
    const v = timeInput.trim();
    setTimeEditing(false);
    if (!v) return;
    // Accept HH:MM:SS or HH:MM (basic validation — backend rejects junk).
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) return;
    setSeeking(true);
    // Safety: clear spinner after 10s even if no WS update arrives.
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => setSeeking(false), 10_000);
    // The orange clock now shows local time, but the backend searches UTC
    // log timestamps — convert before sending.
    const utcTime = localHmsToUtcHms(v);
    try { await api.seekReplayTime(utcTime); } catch { setSeeking(false); }
  }, [timeInput]);

  // Clear the seeking spinner once the replay clock reaches within ±5 s of
  // the requested time. Comparing times (not just "any change") prevents the
  // spinner from vanishing on every regular 1-s clock tick while the backend
  // is still processing the seek.
  useEffect(() => {
    if (!seeking || !replayTime || !timeInput) return;
    const requestedSecs = parseHMS(timeInput);
    const currentSecs = parseHMS(replayTime);
    if (requestedSecs < 0 || currentSecs < 0) return;
    if (Math.abs(currentSecs - requestedSecs) <= 5) {
      setSeeking(false);
      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    }
  }, [replayTime, seeking, timeInput]);

  const cancelTimeEdit = useCallback(() => {
    setTimeEditing(false);
    setTimeInput("");
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

  // Safety net: reconcile replay state against the server on mount and
  // every 5s while the header thinks a replay is active. This recovers from
  // stale `replayActive=true` state left over from a prior session where the
  // backend never emitted a final `active: false` message (e.g. on hard
  // reload, replay natural completion before the fix, admin switching users).
  useEffect(() => {
    let cancelled = false;
    const reconcile = async () => {
      try {
        const st = await api.getReplayStatus();
        if (cancelled) return;
        setReplayStatus(
          st.active, st.paused, st.filename || "",
          st.progress || 0, st.currentTime || "",
          st.speed, st.totalBlocks || 0,
        );
      } catch {}
    };
    // Reconcile once on mount regardless, then keep polling only while active.
    reconcile();
    if (!replayActive) return () => { cancelled = true; };
    const id = setInterval(reconcile, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [replayActive, setReplayStatus]);

  const handleLogout = async () => {
    // Surface backend logout errors instead of swallowing them. The
    // local logout always runs so the user is never stranded, but we
    // log loud so a chronically failing logout endpoint doesn't ship
    // silently and leave dead sessions accumulating server-side.
    try {
      await api.logout();
    } catch (e) {
      console.error("[logout] backend logout failed; clearing local state anyway", e);
    }
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

  // Pit window status: the backend's `pitStatus` is now the source of
  // truth. It combines regulation windows, stint-length feasibility AND
  // the new driver-min-time feasibility check (see
  // `backend/app/engine/pit_gate.py`). We still compute the legacy
  // formulas for callers that need a fallback if `pitStatus` hasn't
  // arrived yet (initial WS frame race condition).
  const ourKart = ourKartNumber > 0 ? karts.find((k) => k.kartNumber === ourKartNumber) : undefined;
  const hasPitWindow = raceStarted && (pitClosedStartMin > 0 || pitClosedEndMin > 0 || minStintMin > 0);
  const pitStatusFromBackend = useRaceStore((s) => s.pitStatus);

  // Local fallback: only used when backend hasn't pushed a pitStatus yet
  // (very first paint, or older backend). Same formula StatusBar shipped
  // with — kept verbatim for behavioural compatibility.
  const localPitIsClosed = (() => {
    if (!raceStarted || raceClockMs === 0 || durationMs === 0) return false;
    const elapsedMin = (durationMs - raceClockMs) / 60000;
    const remainingMin = raceClockMs / 60000;
    if (pitClosedStartMin > 0 && elapsedMin < pitClosedStartMin) return true;
    if (pitClosedEndMin > 0 && remainingMin < pitClosedEndMin) return true;
    if (minStintMin > 0 && ourKart && ourKart.pitStatus === "racing" && ourKart.stintStartCountdownMs > 0) {
      const stintElapsedMin = (ourKart.stintStartCountdownMs - raceClockMs) / 60000;
      const pendingPits = Math.max(0, minPitsConfig - ourKart.pitCount);
      const timeFromStintStartToEndMin = ourKart.stintStartCountdownMs / 1000 / 60;
      const reservePerPitMin = pendingPits > 0 ? (pitTimeS / 60 + maxStintMin) * pendingPits : 0;
      const realMinStintMin = Math.max(minStintMin, timeFromStintStartToEndMin - reservePerPitMin);
      if (stintElapsedMin >= 0 && stintElapsedMin < realMinStintMin) return true;
    }
    return false;
  })();

  const pitIsClosed = pitStatusFromBackend
    ? !pitStatusFromBackend.isOpen
    : localPitIsClosed;

  // Subtitle / tooltip text for the badge. Whenever the backend surfaces
  // a `blockingDriver` (currently for stint_too_short AND driver_min_time
  // close reasons) we render the personalized template:
  //   "Matías necesita 12 min más"
  // The blocking-driver-remaining-ms already represents the binding
  // constraint between (stint mín. restante) and (tiempo mín. piloto
  // restante) — backend computes the max of the two so the badge stays
  // consistent as Matías keeps driving and the binding constraint shifts
  // from "stint mín." to "tiempo mín. piloto" without the number jumping
  // up unexpectedly.
  const pitCloseSubtitle: string | null = (() => {
    if (!pitStatusFromBackend || pitStatusFromBackend.isOpen) return null;
    const reason = pitStatusFromBackend.closeReason;
    const rem = pitStatusFromBackend.blockingDriverRemainingMs || 0;
    const blocker = pitStatusFromBackend.blockingDriver;

    // Ghost-driver heuristic: when the backend pads `team_drivers_count`
    // beyond the number of Apex-observed drivers, it injects fantasma
    // entries named `Driver 2`, `Driver 3`, … with 0 ms accumulated.
    // If THAT is the blocker, the actionable advice for the user is
    // "fix your team_drivers_count config", not "Driver 3 needs 45 min
    // more". Detect by the literal "Driver " prefix the backend uses
    // (see `_driver_times_for_kart` in pit_gate.py).
    if (blocker && /^Driver \d+$/.test(blocker)) {
      return t("status.pitReason.ghost_driver");
    }
    if (blocker && rem > 0) {
      const remMin = Math.max(1, Math.ceil(rem / 60000));
      return t("status.pitReason.driver_min_time_long")
        .replace("{driver}", blocker)
        .replace("{minutes}", String(remMin));
    }
    if (reason && reason !== "no_active_kart" && reason !== "not_running") {
      return t(`status.pitReason.${reason}`);
    }
    return null;
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

                {/* Replay time — clickable, opens an inline HH:MM:SS input
                    that jumps the replay to that exact wall-clock moment via
                    /api/replay/seek_time (no fast-forwarding).
                    While seeking, shows a spinner + the requested time so
                    the user knows the jump is in progress. */}
                {timeEditing ? (
                  <input
                    type="text"
                    autoFocus
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    onBlur={submitTimeJump}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); submitTimeJump(); }
                      else if (e.key === "Escape") { e.preventDefault(); cancelTimeEdit(); }
                    }}
                    placeholder="HH:MM:SS"
                    className="w-[78px] sm:w-[88px] text-[10px] sm:text-[11px] bg-orange-400/10 border border-orange-400/40 rounded px-1.5 py-0.5 text-orange-300 font-mono font-semibold focus:outline-none focus:border-orange-400 placeholder:text-orange-400/40"
                  />
                ) : seeking ? (
                  <span className="flex items-center gap-1 text-orange-300 font-mono font-semibold text-[10px] sm:text-[11px]">
                    <svg className="w-3 h-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16 8 8 0 01-8-8z" />
                    </svg>
                    <span className="opacity-60">{timeInput}</span>
                  </span>
                ) : (
                  replayTime && (
                    <button
                      onClick={startTimeEdit}
                      title="Saltar a hora exacta (HH:MM:SS)"
                      className="text-[10px] sm:text-[11px] text-orange-300 font-mono font-semibold hover:bg-orange-400/15 hover:text-orange-200 rounded px-1 -mx-1 transition-colors"
                    >
                      {replayTime}
                    </button>
                  )
                )}

                {/* Progress bar (desktop) — clickable to seek */}
                <div className="hidden sm:flex items-center gap-1.5 min-w-0">
                  <div
                    className="w-20 lg:w-32 h-1.5 bg-neutral-700 rounded-full overflow-hidden cursor-pointer hover:h-2.5 transition-all"
                    onClick={handleProgressBarClick}
                    title="Click to seek"
                  >
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
            {raceFinished ? (
              <span className="text-base font-bold text-white">🏁</span>
            ) : (
              <span className="text-base font-bold tabular-nums text-white">
                {timerDisplay}
              </span>
            )}
            {hasPitWindow && !raceFinished && (
              <span
                className={`flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  pitIsClosed
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-green-500/20 text-green-400 border border-green-500/30"
                }`}
                title={pitCloseSubtitle ?? undefined}
              >
                <span>{pitIsClosed ? t("status.pitClosed") : t("status.pitOpen")}</span>
                {/* On wider viewports we render the close reason inline
                    next to the badge so the strategist sees WHY without
                    hovering. On narrow screens the title= tooltip is the
                    fallback. */}
                {pitCloseSubtitle && (
                  <span className="hidden md:inline normal-case font-medium text-red-300/80">
                    · {pitCloseSubtitle}
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Right: actions. Username used to live here but moved to
              the sidebar account row at the bottom. */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Rain-mode toggle. Lives here so the strategist can flip
                lluvia on/off from any tab without scrolling back to the
                metric grid (where it used to live as a card). */}
            <RainToggle />
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
            {hasPitWindow && !raceFinished && (
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
            {raceFinished ? (
              <span className="text-sm font-bold text-white">🏁</span>
            ) : (
              <span className="text-sm font-bold tabular-nums text-white">
                {timerDisplay}
              </span>
            )}
          </div>
        </div>

        {/* Desktop-only: track name (shown in center of top row instead) */}
        {/* Track name for sm+ is shown between left and countdown */}
      </div>

      {showSessions && <SessionManager onClose={() => setShowSessions(false)} />}
    </>
  );
}
