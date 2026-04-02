"use client";

import { useEffect, useRef, useState } from "react";
import { useRaceStore } from "@/hooks/useRaceState";

/**
 * Hook that returns a replay timestamp that ticks smoothly at replay speed.
 *
 * The backend sends replay_status with currentTime (HH:MM:SS) only when
 * a new message block is processed. This hook interpolates between updates
 * using the replay speed multiplier so the clock advances smoothly.
 */
export function useReplayTime(): string {
  const serverTime = useRaceStore((s) => s.replayTime);
  const replayActive = useRaceStore((s) => s.replayActive);
  const replayPaused = useRaceStore((s) => s.replayPaused);
  const replaySpeed = useRaceStore((s) => s.replaySpeed);

  const [display, setDisplay] = useState(serverTime);
  const lastServerSecsRef = useRef(0);
  const lastWallRef = useRef(Date.now());

  const parseTime = (t: string): number => {
    if (!t) return 0;
    const parts = t.split(":");
    if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    return 0;
  };

  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Recalibrate when server sends a new time
  useEffect(() => {
    if (!serverTime) return;
    lastServerSecsRef.current = parseTime(serverTime);
    lastWallRef.current = Date.now();
    setDisplay(serverTime);
  }, [serverTime]);

  // Tick at 200ms intervals, advancing at replay speed
  useEffect(() => {
    if (!replayActive || replayPaused || !serverTime) return;

    const interval = setInterval(() => {
      const elapsedWallMs = Date.now() - lastWallRef.current;
      const simElapsedSecs = (elapsedWallMs * (replaySpeed || 1)) / 1000;
      const currentSecs = lastServerSecsRef.current + Math.floor(simElapsedSecs);
      setDisplay(formatTime(currentSecs));
    }, 200);

    return () => clearInterval(interval);
  }, [replayActive, replayPaused, serverTime, replaySpeed]);

  useEffect(() => {
    if (!replayActive) setDisplay("");
  }, [replayActive]);

  return display;
}
