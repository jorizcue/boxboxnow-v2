"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { msToLapTime } from "@/lib/formatters";

/**
 * useDriverSpeech — Web Speech API narration for driver view.
 *
 * Speaks once per lap with key race data:
 *   - Last lap time (and delta vs previous)
 *   - Real (adjusted) position
 *   - Box score
 *   - Laps remaining to max stint
 *
 * Audio routes to whatever output device is active (including Bluetooth headphones).
 * On iOS, requires a user gesture to unlock speechSynthesis (handled by the toggle).
 */

interface SpeechData {
  lastLapMs: number;
  prevLapMs: number;
  lapDelta: "faster" | "slower" | null;
  realPosition: number | null;
  totalKarts: number | null;
  boxScore: number;
  lapsToMaxStint: number | null;
}

export function useDriverSpeech(data: SpeechData, enabled: boolean) {
  const lastSpokenLap = useRef<number>(0);
  const [supported, setSupported] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // Check support on mount
  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  // iOS unlock: speak an empty utterance on first enable (needs user gesture context)
  const unlock = useCallback(() => {
    if (!supported) return;
    try {
      const u = new SpeechSynthesisUtterance("");
      u.volume = 0;
      window.speechSynthesis.speak(u);
      setUnlocked(true);
    } catch {
      // Ignore — will retry on next gesture
    }
  }, [supported]);

  // Speak on new lap
  useEffect(() => {
    if (!enabled || !supported || data.lastLapMs <= 0) return;
    if (data.lastLapMs === lastSpokenLap.current) return;

    lastSpokenLap.current = data.lastLapMs;

    // Build message parts
    const parts: string[] = [];

    // 1. Last lap time
    const lapTimeStr = msToLapTime(data.lastLapMs);
    parts.push(lapTimeStr);

    // 2. Delta vs previous lap
    if (data.lapDelta && data.prevLapMs > 0) {
      const deltaMs = data.lastLapMs - data.prevLapMs;
      const absDelta = Math.abs(deltaMs) / 1000;
      if (data.lapDelta === "faster") {
        parts.push(`menos ${absDelta.toFixed(1)}`);
      } else {
        parts.push(`más ${absDelta.toFixed(1)}`);
      }
    }

    // 3. Real position
    if (data.realPosition) {
      parts.push(`posición ${data.realPosition}`);
    }

    // 4. Box score
    if (data.boxScore > 0) {
      parts.push(`box ${data.boxScore}`);
    }

    // 5. Laps to max stint
    if (data.lapsToMaxStint !== null && data.lapsToMaxStint > 0) {
      const rounded = Math.round(data.lapsToMaxStint);
      if (rounded <= 10) {
        parts.push(`${rounded} vueltas para stint`);
      }
    }

    const message = parts.join(", ");

    // Cancel any pending speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "es-ES";
    utterance.rate = 1.1; // Slightly faster for brevity
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
  }, [enabled, supported, data.lastLapMs, data.prevLapMs, data.lapDelta, data.realPosition, data.boxScore, data.lapsToMaxStint]);

  return { supported, unlocked, unlock };
}
