"use client";

import { useRaceStore } from "@/hooks/useRaceState";
import { secondsToHMS } from "@/lib/formatters";
import { useT } from "@/lib/i18n";
import type { KartState } from "@/types/race";

export interface DriverInfo {
  name: string;
  totalMs: number;
  remainingMs: number;
  metMinimum: boolean;
}

export function getDriverInfoForKart(
  kart: KartState | undefined,
  minDriverTimeMin: number
): DriverInfo[] {
  if (!kart || !kart.driverTotalMs) return [];

  const minDriverTimeMs = (minDriverTimeMin || 30) * 60 * 1000;

  // Add current stint time for active driver (not yet committed to driver_total_ms)
  const currentDriverStintMs =
    kart.pitStatus === "racing" && kart.driverName ? kart.stintElapsedMs : 0;

  // Ensure current driver appears even if they haven't pitted yet
  const driverMap = { ...kart.driverTotalMs };
  if (kart.driverName && !(kart.driverName in driverMap)) {
    driverMap[kart.driverName] = 0;
  }

  return Object.entries(driverMap)
    .map(([name, totalMs]) => {
      const effectiveMs =
        name === kart.driverName && kart.pitStatus === "racing"
          ? totalMs + currentDriverStintMs
          : totalMs;
      const remainingMs = Math.max(0, minDriverTimeMs - effectiveMs);
      const metMinimum = remainingMs <= 0;
      return { name, totalMs: effectiveMs, remainingMs, metMinimum };
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
  colSpan,
}: {
  drivers: DriverInfo[];
  minDriverTimeMin: number;
  colSpan: number;
}) {
  const t = useT();
  if (drivers.length === 0) return null;

  return (
    <td colSpan={colSpan} className="px-0 py-0">
      <div className="bg-neutral-900/80 border-l-2 border-accent/30 mx-2 sm:mx-4 my-1 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-neutral-500 text-[10px] uppercase tracking-wider">
              <th className="px-3 py-1.5 text-left">{t("driver.driver")}</th>
              <th className="px-3 py-1.5 text-right">{t("driver.totalTime")}</th>
              <th className="px-3 py-1.5 text-right">{t("driver.remainingMin")}</th>
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
                <td
                  className={`px-3 py-1.5 text-right font-mono font-bold ${
                    d.metMinimum ? "text-accent" : "text-tier-1"
                  }`}
                >
                  {d.metMinimum ? "OK" : secondsToHMS(d.remainingMs / 1000)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-1 text-[10px] text-neutral-600 border-t border-neutral-800">
          {t("driver.minPerDriver")}: {secondsToHMS((minDriverTimeMin || 30) * 60)}
        </div>
      </div>
    </td>
  );
}
