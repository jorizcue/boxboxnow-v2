"use client";

import { useState, useEffect } from "react";
import { useRaceStore } from "@/hooks/useRaceState";

/**
 * Hook that returns a "now" timestamp (seconds) that ticks at 200ms intervals.
 * During replay, elapsed time calculations should be multiplied by the returned speed.
 *
 * Usage:
 *   const { now, speed } = useSimNow();
 *   const elapsed = (now - someStartTime) * speed;
 */
export function useSimNow(): { now: number; speed: number } {
  const replayActive = useRaceStore((s) => s.replayActive);
  const replayPaused = useRaceStore((s) => s.replayPaused);
  const replaySpeed = useRaceStore((s) => s.replaySpeed);
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    if (replayPaused) return;
    const interval = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(interval);
  }, [replayPaused]);

  const speed = replayActive && !replayPaused ? (replaySpeed || 1) : 1;

  return { now, speed };
}
