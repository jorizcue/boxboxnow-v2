"use client";

import { useEffect, useRef } from "react";
import { useRaceBoxStore } from "@/hooks/useRaceBox";
import { useDriverConfig } from "@/hooks/useDriverConfig";
import { api } from "@/lib/api";

/**
 * Downsample an array by picking every N-th element to reduce payload size.
 * Keeps first and last element always. Target: ~1 sample per second (~25Hz → 25x reduction).
 */
function downsample<T>(arr: T[], targetHz: number = 1, sourceHz: number = 25): T[] {
  if (arr.length <= 2) return arr;
  const step = Math.max(1, Math.round(sourceHz / targetHz));
  const result: T[] = [arr[0]];
  for (let i = step; i < arr.length - 1; i += step) {
    result.push(arr[i]);
  }
  result.push(arr[arr.length - 1]);
  return result;
}

/**
 * Auto-saves completed GPS laps to the backend.
 * Watches the RaceBox store's laps array and sends new ones.
 * Includes positions, speeds, g-forces and max speed.
 */
export function useGpsTelemetrySave() {
  const laps = useRaceBoxStore((s) => s.laps);
  const sample = useRaceBoxStore((s) => s.sample);
  const savedCount = useRef(0);
  const circuitId = useDriverConfig((s) => s.selectedCircuitId);

  useEffect(() => {
    if (laps.length <= savedCount.current) return;

    // New laps to save
    const newLaps = laps.slice(savedCount.current);
    const gpsSource = sample?.batteryPercent !== undefined ? "racebox" : "phone";

    const payload = newLaps.map((lap) => ({
      circuit_id: circuitId ?? undefined,
      lap_number: lap.lapNumber,
      duration_ms: lap.durationMs,
      total_distance_m: lap.totalDistanceM,
      max_speed_kmh: lap.maxSpeedKmh,
      distances: lap.distances,
      timestamps: lap.timestamps,
      // Downsample heavy arrays (~25Hz → ~2Hz) to save bandwidth and storage
      positions: downsample(lap.positions, 2),
      speeds: downsample(lap.speeds, 2),
      gforce_lat: downsample(lap.gforceLat, 2),
      gforce_lon: downsample(lap.gforceLon, 2),
      gps_source: gpsSource,
    }));

    api.saveGpsLaps(payload)
      .then(() => {
        savedCount.current = laps.length;
      })
      .catch((err: any) => {
        console.warn("[GPS Save] Failed to save laps:", err);
        // Will retry on next lap completion
      });
  }, [laps.length]);
}
