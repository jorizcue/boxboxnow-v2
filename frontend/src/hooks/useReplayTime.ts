"use client";

import { useEffect, useRef, useState } from "react";
import { useRaceStore } from "@/hooks/useRaceState";

/**
 * Hook that returns a replay timestamp that ticks smoothly at replay speed.
 *
 * The backend sends replay_status with currentTime (ISO datetime or HH:MM:SS)
 * only when a new message block is processed. This hook interpolates between
 * updates using the replay speed multiplier so the clock advances smoothly.
 *
 * IMPORTANT: log file timestamps are the server's wall-clock time (UTC).
 * We display them verbatim — NOT converted to the browser's local timezone —
 * so "21:20" in the log shows as "21:20" in the clock regardless of where
 * the browser is. This keeps the display consistent with what the user types
 * when they want to jump to a specific moment.
 */
export function useReplayTime(): string {
  const serverTime = useRaceStore((s) => s.replayTime);
  const replayActive = useRaceStore((s) => s.replayActive);
  const replayPaused = useRaceStore((s) => s.replayPaused);
  const replaySpeed = useRaceStore((s) => s.replaySpeed);

  const [display, setDisplay] = useState(serverTime);
  const lastServerSecsRef = useRef(0);
  const lastWallRef = useRef(Date.now());

  /**
   * Parse ISO datetime or HH:MM:SS into seconds-of-day.
   *
   * For ISO strings (e.g. "2026-04-25T21:20:10Z") we extract the HH:MM:SS
   * component directly from the string — NOT via new Date().getHours() which
   * would shift the value to the browser's local timezone.  The log clock
   * should display the server's own timestamp as-is.
   */
  const parseTime = (t: string): number => {
    if (!t) return 0;
    // ISO datetime: extract time part directly to avoid local-TZ offset
    if (t.includes("T")) {
      // "2026-04-25T21:20:10Z" → "21:20:10"
      const timePart = t.split("T")[1].replace(/[Z+-].*$/, "");
      const parts = timePart.split(":");
      if (parts.length >= 2) {
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 +
          (parts.length >= 3 ? Math.floor(parseFloat(parts[2])) : 0);
      }
    }
    // HH:MM:SS or HH:MM format (legacy / seek-input)
    const parts = t.split(":");
    if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    return 0;
  };

  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600) % 24;
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Recalibrate when server sends a new time
  useEffect(() => {
    if (!serverTime) return;
    lastServerSecsRef.current = parseTime(serverTime);
    lastWallRef.current = Date.now();
    setDisplay(formatTime(lastServerSecsRef.current));
  }, [serverTime]);

  // Tick at 1s intervals, advancing at replay speed
  useEffect(() => {
    if (!replayActive || replayPaused || !serverTime) return;

    const interval = setInterval(() => {
      const elapsedWallMs = Date.now() - lastWallRef.current;
      const simElapsedSecs = (elapsedWallMs * (replaySpeed || 1)) / 1000;
      const currentSecs = lastServerSecsRef.current + Math.floor(simElapsedSecs);
      setDisplay(formatTime(currentSecs));
    }, 1000);

    return () => clearInterval(interval);
  }, [replayActive, replayPaused, serverTime, replaySpeed]);

  useEffect(() => {
    if (!replayActive) setDisplay("");
  }, [replayActive]);

  return display;
}
