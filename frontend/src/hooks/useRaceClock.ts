"use client";

import { useEffect, useRef, useState } from "react";
import { useRaceStore } from "@/hooks/useRaceState";

/**
 * Hook that returns a race clock (countdownMs) that ticks every second.
 *
 * The Apex timing system sends countdown updates every ~30s. This hook
 * interpolates between updates so the UI ticks second-by-second.
 *
 * Pauses interpolation when replay is paused.
 *
 * Returns the interpolated countdownMs value.
 */
export function useRaceClock(): number {
  const serverCountdownMs = useRaceStore((s) => s.countdownMs);
  const replayPaused = useRaceStore((s) => s.replayPaused);
  const [localMs, setLocalMs] = useState(serverCountdownMs);
  const lastServerRef = useRef(serverCountdownMs);
  const lastServerTimeRef = useRef(Date.now());
  const pausedAtRef = useRef<number | null>(null);

  // Recalibrate when server sends a new value
  useEffect(() => {
    lastServerRef.current = serverCountdownMs;
    lastServerTimeRef.current = Date.now();
    pausedAtRef.current = null;
    setLocalMs(serverCountdownMs);
  }, [serverCountdownMs]);

  // Track pause transitions
  useEffect(() => {
    if (replayPaused) {
      // Freeze at current interpolated value
      pausedAtRef.current = localMs;
    } else if (pausedAtRef.current !== null) {
      // Resume: recalibrate from current value
      lastServerRef.current = pausedAtRef.current;
      lastServerTimeRef.current = Date.now();
      pausedAtRef.current = null;
    }
  }, [replayPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick every second (only when not paused)
  useEffect(() => {
    if (serverCountdownMs === 0 || replayPaused) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastServerTimeRef.current;
      const serverVal = lastServerRef.current;

      if (serverVal > 0) {
        setLocalMs(Math.max(0, serverVal - elapsed));
      } else {
        setLocalMs(serverVal - elapsed);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [serverCountdownMs, replayPaused]);

  return localMs;
}
