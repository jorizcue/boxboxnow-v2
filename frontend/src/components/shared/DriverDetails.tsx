"use client";

import { useRaceStore } from "@/hooks/useRaceState";
import { secondsToHMS, msToLapTime } from "@/lib/formatters";
import { useT } from "@/lib/i18n";
import type { KartState } from "@/types/race";

/**
 * Estado del piloto respecto a sus topes legales.
 *  - "under_min": no llegó al mínimo todavía → rojo, mostrar lo que falta a min.
 *  - "ok":        ya pasó el min y aún le sobra holgura para ≥ 1 stint completo.
 *  - "near_max":  pasó el min pero ya no le cabe otro stint entero antes del max
 *                 → naranja, mostrar lo que le queda hasta max.
 *  - "over_max":  excedió el max (el pit gate debería estar URGENT) → rojo.
 *
 * Umbral "near_max": `acc + max_stint > max`. Es decir, naranja cuando al
 * piloto NO le da para otro stint legal sin pasarse del techo. Depende
 * solo de la config existente (max_stint_min + max_driver_time_min) → no
 * introduce parámetros nuevos.
 */
export type DriverGateStatus = "under_min" | "ok" | "near_max" | "over_max";

export interface DriverInfo {
  name: string;
  totalMs: number;
  remainingMs: number;           // a min (rojo)
  maxRemainingMs: number;        // a max (naranja) — 0 cuando no hay max
  metMinimum: boolean;
  status: DriverGateStatus;
  avgLapMs: number;
}

export function getDriverInfoForKart(
  kart: KartState | undefined,
  minDriverTimeMin: number,
  /** Tope superior por piloto (min). 0 = sin restricción. */
  maxDriverTimeMin: number,
  /** Tope superior de stint individual (min) — necesario para el umbral
   *  "near_max" (acc + max_stint > max). */
  maxStintMin: number,
  /** Override stint elapsed ms (e.g. interpolated from race clock at replay speed) */
  stintElapsedOverrideMs?: number
): DriverInfo[] {
  if (!kart || !kart.driverTotalMs) return [];

  const minDriverTimeMs = (minDriverTimeMin || 30) * 60 * 1000;
  const maxDriverTimeMs = (maxDriverTimeMin || 0) * 60 * 1000;
  const maxStintMs = (maxStintMin || 0) * 60 * 1000;
  const hasMax = maxDriverTimeMs > 0;

  // Add current stint time for active driver (not yet committed to driver_total_ms)
  const stintMs = stintElapsedOverrideMs !== undefined ? stintElapsedOverrideMs : kart.stintElapsedMs;
  const currentDriverStintMs =
    kart.pitStatus === "racing" && kart.driverName ? stintMs : 0;

  // Ensure current driver appears even if they haven't pitted yet
  const driverMap = { ...kart.driverTotalMs };
  if (kart.driverName && !(kart.driverName in driverMap)) {
    driverMap[kart.driverName] = 0;
  }

  const avgMap = kart.driverAvgLapMs || {};

  return Object.entries(driverMap)
    .map(([name, totalMs]) => {
      const effectiveMs =
        name === kart.driverName && kart.pitStatus === "racing"
          ? totalMs + currentDriverStintMs
          : totalMs;
      const remainingMs = Math.max(0, minDriverTimeMs - effectiveMs);
      const maxRemainingMs = hasMax ? Math.max(0, maxDriverTimeMs - effectiveMs) : 0;
      const metMinimum = remainingMs <= 0;

      // Estado compuesto: ver type DriverGateStatus arriba.
      let status: DriverGateStatus;
      if (hasMax && effectiveMs > maxDriverTimeMs) {
        status = "over_max";
      } else if (!metMinimum) {
        status = "under_min";
      } else if (hasMax && effectiveMs + maxStintMs > maxDriverTimeMs) {
        // Ya cumplió min y sigue dentro de max, pero no cabe otro stint
        // entero sin pasarse → marcar naranja.
        status = "near_max";
      } else {
        status = "ok";
      }

      const avgLapMs = avgMap[name] || 0;
      return { name, totalMs: effectiveMs, remainingMs, maxRemainingMs, metMinimum, status, avgLapMs };
    })
    .sort((a, b) => b.totalMs - a.totalMs);
}

/**
 * Expandable driver detail sub-table.
 * Renders inside a <td colSpan={...}>.
 */
export function DriverDetailsRow({
  drivers,
  minDriverTimeMin,
  maxDriverTimeMin,
  colSpan,
}: {
  drivers: DriverInfo[];
  minDriverTimeMin: number;
  /** 0 = sin restricción → no mostramos columna de "margen a max". */
  maxDriverTimeMin: number;
  colSpan: number;
}) {
  const t = useT();
  if (drivers.length === 0) return null;
  const hasMax = (maxDriverTimeMin || 0) > 0;

  return (
    <td colSpan={colSpan} className="px-0 py-0">
      <div className="bg-neutral-900/80 border-l-2 border-accent/30 mx-2 sm:mx-4 my-1 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-500 text-[10px] uppercase tracking-wider">
              <th className="px-3 py-1.5 text-left">{t("driver.driver")}</th>
              <th className="px-3 py-1.5 text-right">{t("driver.totalTime")}</th>
              <th className="px-3 py-1.5 text-right">{t("driver.avgLap")}</th>
              <th className="px-3 py-1.5 text-right">{t("driver.remainingMin")}</th>
              {hasMax && (
                <th className="px-3 py-1.5 text-right">{t("driver.remainingMax")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.name} className="border-t border-neutral-800">
                <td className="px-3 py-1.5 text-neutral-200 font-medium">
                  {d.name}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-neutral-300">
                  {secondsToHMS(d.totalMs / 1000)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-neutral-400">
                  {d.avgLapMs > 0 ? msToLapTime(Math.round(d.avgLapMs)) : "-"}
                </td>
                {/* Columna "tiempo para llegar al min".
                    Rojo cuando bajo min, verde "OK" en el resto de estados
                    (cuando ya pasó el min, la información relevante pasa a
                    la columna de margen a max si existe). */}
                <td
                  className={`px-3 py-1.5 text-right font-mono font-bold ${
                    d.status === "under_min" ? "text-tier-1" : "text-accent"
                  }`}
                >
                  {d.status === "under_min" ? secondsToHMS(d.remainingMs / 1000) : "OK"}
                </td>
                {hasMax && (
                  /* Columna "margen al max". Solo cuando max está configurado.
                      - over_max: rojo, "MAX!" (el gate ya está en URGENT).
                      - near_max: naranja, lo que le queda hasta max.
                      - resto: verde, "OK". */
                  <td
                    className={`px-3 py-1.5 text-right font-mono font-bold ${
                      d.status === "over_max"
                        ? "text-tier-1"
                        : d.status === "near_max"
                          ? "text-tier-25"
                          : "text-accent"
                    }`}
                  >
                    {d.status === "over_max"
                      ? "MAX!"
                      : d.status === "near_max"
                        ? secondsToHMS(d.maxRemainingMs / 1000)
                        : "OK"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-1 text-[10px] text-neutral-600 border-t border-neutral-800 flex justify-between gap-3">
          <span>
            {t("driver.minPerDriver")}: {secondsToHMS((minDriverTimeMin || 30) * 60)}
          </span>
          {hasMax && (
            <span>
              {t("driver.maxPerDriver")}: {secondsToHMS((maxDriverTimeMin || 0) * 60)}
            </span>
          )}
        </div>
      </div>
    </td>
  );
}
