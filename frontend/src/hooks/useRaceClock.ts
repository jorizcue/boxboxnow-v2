"use client";

import { useEffect, useRef, useState } from "react";
import { useRaceStore } from "@/hooks/useRaceState";

/**
 * Hook that returns a race clock (countdownMs) that ticks every second.
 *
 * The Apex timing system sends countdown updates every ~30s. This hook
 * interpolates between updates so the UI ticks second-by-second.
 *
 * For countdown (positive ms): decrements by 1000ms each second.
 * For count-up (negative ms): decrements by 1000ms each second (more negative = more elapsed).
 *
 * Returns the interpolated countdownMs value.
 */
export function useRaceClock(): number {
  const serverCountdownMs = useRaceStore((s) => s.countdownMs);
  const [localMs, setLocalMs] = useState(serverCountdownMs);
  const lastServerRef = useRef(serverCountdownMs);
  const lastServerTimeRef = useRef(Date.now());

  // Recalibrate when server sends a new value
  useEffect(() => {
    lastServerRef.current = serverCountdownMs;
    lastServerTimeRef.current = Date.now();
    setLocalMs(serverCountdownMs);
  }, [serverCountdownMs]);

  // Tick every second
  useEffect(() => {
    if (serverCountdownMs === 0) return; // Race not started

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastServerTimeRef.current;
      const serverVal = lastServerRef.current;

      if (serverVal > 0) {
        // Countdown: race hasn't finished yet, counting down
        setLocalMs(Math.max(0, serverVal - elapsed));
      } else {
        // Count-up: race timer past zero, counting elapsed time
        // serverVal is negative, elapsed makes it more negative
        setLocalMs(serverVal - elapsed);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [serverCountdownMs]);

  return localMs;
}
