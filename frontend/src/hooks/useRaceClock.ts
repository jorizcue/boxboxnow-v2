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
 * `intervalMs` controls the local refresh cadence:
 *   - 1000 (default) — fine for the HH:MM:SS clock display and most
 *     dashboards: minimises React re-renders to ~1 per second.
 *   - 100 (10 Hz) — needed by the live Tracking map so the kart
 *     interpolation has enough resolution for the CSS transition on
 *     `.tracking-kart-icon` to render smooth motion between server
 *     snapshots. At 1 Hz the kart visibly teleports once per second
 *     even with the transition in place.
 *
 * Returns the interpolated countdownMs value.
 */
export function useRaceClock(intervalMs: number = 1000): number {
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

  // Tick at the requested interval, applying replay speed
  useEffect(() => {
    if (serverCountdownMs === 0 || replayPaused) return;

    const speed = replayActive ? (replaySpeed || 1) : 1;

    const interval = setInterval(() => {
      const wallElapsed = Date.now() - lastServerTimeRef.current;
      const simElapsed = wallElapsed * speed;
      const serverVal = lastServerRef.current;

      setLocalMs(Math.max(0, serverVal - simElapsed));
    }, intervalMs);

    return () => clearInterval(interval);
  }, [serverCountdownMs, replayPaused, replayActive, replaySpeed, intervalMs]);

  return localMs;
}
