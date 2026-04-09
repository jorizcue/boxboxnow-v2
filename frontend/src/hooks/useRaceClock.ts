"use client";

import { useEffect, useRef, useState } from "react";
import { useRaceStore } from "@/hooks/useRaceState";

/**
 * Hook that returns a race clock (countdownMs) that ticks smoothly.
 *
 * The Apex timing system sends countdown updates every ~30s. This hook
 * interpolates between updates so the UI ticks smoothly.
 *
 * During replay, advances at the replay speed multiplier.
 * Pauses interpolation when replay is paused.
 *
 * Returns the interpolated countdownMs value.
 */
export function useRaceClock(): number {
  const serverCountdownMs = useRaceStore((s) => s.countdownMs);
  const replayActive = useRaceStore((s) => s.replayActive);
  const replayPaused = useRaceStore((s) => s.replayPaused);
  const replaySpeed = useRaceStore((s) => s.replaySpeed);
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
      pausedAtRef.current = localMs;
    } else if (pausedAtRef.current !== null) {
      lastServerRef.current = pausedAtRef.current;
      lastServerTimeRef.current = Date.now();
      pausedAtRef.current = null;
    }
  }, [replayPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tick at 1s intervals, applying replay speed
  useEffect(() => {
    if (serverCountdownMs === 0 || replayPaused) return;

    const speed = replayActive ? (replaySpeed || 1) : 1;

    const interval = setInterval(() => {
      const wallElapsed = Date.now() - lastServerTimeRef.current;
      const simElapsed = wallElapsed * speed;
      const serverVal = lastServerRef.current;

      setLocalMs(Math.max(0, serverVal - simElapsed));
    }, 1000);

    return () => clearInterval(interval);
  }, [serverCountdownMs, replayPaused, replayActive, replaySpeed]);

  return localMs;
}
