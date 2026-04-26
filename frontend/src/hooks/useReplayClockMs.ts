"use client";

// Returns the current replay moment as an absolute UTC epoch (ms),
// recalibrated whenever the backend pushes a new `replay_status` and
// interpolated locally between updates using the active replay speed.
//
// The existing `useReplayTime()` hook returns a formatted "HH:MM:SS"
// string updated every 1s — fine for the clock display but too coarse
// for smooth marker animation on the GPS replay map.

import { useEffect, useRef, useState } from "react";
import { useRaceStore } from "@/hooks/useRaceState";

/**
 * Parses the backend's replayTime string (either ISO datetime
 * `2026-04-25T21:11:28` or HH:MM:SS) into an absolute epoch in ms.
 *
 * For HH:MM:SS we resolve relative to *today* in the user's local
 * timezone. The replay log files always have a date too, but the
 * websocket sometimes only sends the time-of-day part. Anchoring to
 * "today" gives us a sensible monotonically increasing clock for the
 * simple HH:MM:SS case.
 */
function parseToEpochMs(t: string): number {
  if (!t) return 0;
  if (t.includes("T") || t.includes("-")) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  const parts = t.split(":");
  if (parts.length === 3) {
    const now = new Date();
    now.setHours(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]), 0);
    return now.getTime();
  }
  return 0;
}

/**
 * Returns the current replay moment as `epoch ms` (UTC), updated at ~10
 * Hz while the replay is running. Returns `0` when the replay is idle.
 *
 * The hook recalibrates on every `replayTime` push from the server and
 * advances locally between pushes by `wallElapsed * replaySpeed`. The
 * tick rate is configurable; 100ms strikes a good balance between
 * smoothness and CPU on the marker animation.
 */
export function useReplayClockMs(tickMs: number = 100): number {
  const serverTime = useRaceStore((s) => s.replayTime);
  const replayActive = useRaceStore((s) => s.replayActive);
  const replayPaused = useRaceStore((s) => s.replayPaused);
  const replaySpeed = useRaceStore((s) => s.replaySpeed);

  const [clockMs, setClockMs] = useState(0);
  const baseSimMsRef = useRef(0);
  const baseWallMsRef = useRef(0);

  // Recalibrate whenever the backend sends a new server time
  useEffect(() => {
    if (!serverTime) {
      setClockMs(0);
      return;
    }
    baseSimMsRef.current = parseToEpochMs(serverTime);
    baseWallMsRef.current = Date.now();
    setClockMs(baseSimMsRef.current);
  }, [serverTime]);

  // Local interpolation tick
  useEffect(() => {
    if (!replayActive || replayPaused || !serverTime) return;
    const id = setInterval(() => {
      const wallElapsed = Date.now() - baseWallMsRef.current;
      const simElapsed = wallElapsed * (replaySpeed || 1);
      setClockMs(baseSimMsRef.current + simElapsed);
    }, tickMs);
    return () => clearInterval(id);
  }, [replayActive, replayPaused, serverTime, replaySpeed, tickMs]);

  // Reset when replay stops
  useEffect(() => {
    if (!replayActive) setClockMs(0);
  }, [replayActive]);

  return clockMs;
}
