"use client";

import { useEffect, useRef, useState } from "react";
import { useRaceStore } from "@/hooks/useRaceState";

/**
 * Hook that returns a replay timestamp that ticks every second.
 *
 * The backend sends replay_status with currentTime (HH:MM:SS) only when
 * a new message block is processed, which can have gaps of 30+ seconds.
 * This hook interpolates between updates so the clock ticks smoothly.
 */
export function useReplayTime(): string {
  const serverTime = useRaceStore((s) => s.replayTime);
  const replayActive = useRaceStore((s) => s.replayActive);
  const replayPaused = useRaceStore((s) => s.replayPaused);

  const [display, setDisplay] = useState(serverTime);
  const lastServerSecsRef = useRef(0);
  const lastWallRef = useRef(Date.now());

  // Parse HH:MM:SS to seconds
  const parseTime = (t: string): number => {
    if (!t) return 0;
    const parts = t.split(":");
    if (parts.length === 3) {
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    return 0;
  };

  // Format seconds back to HH:MM:SS
  const formatTime = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Recalibrate when server sends a new time
  useEffect(() => {
    if (!serverTime) return;
    lastServerSecsRef.current = parseTime(serverTime);
    lastWallRef.current = Date.now();
    setDisplay(serverTime);
  }, [serverTime]);

  // Tick every second
  useEffect(() => {
    if (!replayActive || replayPaused || !serverTime) return;

    const interval = setInterval(() => {
      const elapsedMs = Date.now() - lastWallRef.current;
      const currentSecs = lastServerSecsRef.current + Math.floor(elapsedMs / 1000);
      setDisplay(formatTime(currentSecs));
    }, 1000);

    return () => clearInterval(interval);
  }, [replayActive, replayPaused, serverTime]);

  // Reset when replay stops
  useEffect(() => {
    if (!replayActive) setDisplay("");
  }, [replayActive]);

  return display;
}
