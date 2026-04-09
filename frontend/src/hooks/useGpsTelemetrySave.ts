"use client";

import { useEffect, useRef } from "react";
import { useRaceBoxStore } from "@/hooks/useRaceBox";
import { useDriverConfig } from "@/hooks/useDriverConfig";
import { api } from "@/lib/api";

/**
 * Auto-saves completed GPS laps to the backend.
 * Watches the RaceBox store's laps array and sends new ones.
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
      max_speed_kmh: undefined,
      distances: lap.distances,
      timestamps: lap.timestamps,
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
