"use client";

import { useState, useCallback } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { msToLapTime, tierHex } from "@/lib/formatters";
import { useT } from "@/lib/i18n";
import clsx from "clsx";
import type { ClassificationEntry } from "@/types/race";

type SortKey = "position" | "kartNumber" | "totalLaps" | "pitCount" | "gap" | "interval" | "avgLapMs" | "tierScore";
type SortDir = "asc" | "desc";

/**
 * Clasificación Real — displays the backend-computed classification.
 *
 * The backend (classification.py) implements the original resumen_karts() algorithm:
 *   distance = (laps × circuitLength) + (speed × timeSinceMeta) - (pitsRemaining × speed × pitTime)
 *   speed = circuitLength / mean(last 20 laps of current stint, excluding first lap)
 *
 * This component simply renders the classification[] data received via WebSocket.
 */
export function RealClassificationBeta() {
  const t = useT();
  const { classification, config } = useRaceStore();
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "avgLapMs" ? "asc" : key === "position" ? "asc" : "desc");
    }
  }, [sortKey]);

  if (!classification || classification.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <div className="text-center">
          <p className="text-lg">{t("adjusted.noData")}</p>
          <p className="text-sm mt-1 text-neutral-700">{t("race.connectHint")}</p>
        </div>
      </div>
    );
  }

  // Sort entries
  const sorted = [...classification].sort((a, b) => {
    let aVal: number | string, bVal: number | string;
    switch (sortKey) {
      case "position": aVal = a.position; bVal = b.position; break;
      case "kartNumber": aVal = a.kartNumber; bVal = b.kartNumber; break;
      case "totalLaps": aVal = a.totalLaps; bVal = b.totalLaps; break;
      case "pitCount": aVal = a.pitCount; bVal = b.pitCount; break;
      case "avgLapMs": aVal = a.avgLapMs > 0 ? a.avgLapMs : Infinity; bVal = b.avgLapMs > 0 ? b.avgLapMs : Infinity; break;
      case "tierScore": aVal = a.tierScore; bVal = b.tierScore; break;
      case "gap": aVal = parseFloat(a.gap) || 0; bVal = parseFloat(b.gap) || 0; break;
      case "interval": aVal = parseFloat(a.interval) || 0; bVal = parseFloat(b.interval) || 0; break;
      default: aVal = 0; bVal = 0;
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface rounded-xl p-3 border border-border">
        <span className="text-xs font-bold text-accent uppercase tracking-wider">
          {t("adjusted.title")}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-2 sm:mx-0">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-surface text-neutral-200 sticky top-0 z-10 text-[10px] sm:text-[11px] uppercase tracking-wider">
            <tr>
              <SortTh align="center" colKey="position" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-8 sm:w-10">#</SortTh>
              <SortTh align="center" colKey="kartNumber" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-8 sm:w-12">{t("race.kart")}</SortTh>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-left">{t("race.team")}</th>
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-left">{t("race.driver")}</th>
              <SortTh align="center" colKey="totalLaps" current={sortKey} dir={sortDir} onSort={toggleSort}>Vlts</SortTh>
              <SortTh align="center" colKey="pitCount" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("race.pit")}</SortTh>
              <SortTh align="right" colKey="gap" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("adjusted.gapSeconds")}</SortTh>
              <SortTh align="right" colKey="interval" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("adjusted.intSeconds")}</SortTh>
              <SortTh align="right" colKey="avgLapMs" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("race.avg20")}</SortTh>
              <SortTh align="center" colKey="tierScore" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-8 sm:w-12">Tier</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => {
              const isOurTeam = config.ourKartNumber > 0 && entry.kartNumber === config.ourKartNumber;

              return (
                <tr
                  key={entry.kartNumber}
                  className={clsx(
                    "border-b border-border hover:bg-surface/50 transition-colors",
                    isOurTeam && "our-team",
                  )}
                >
                  {/* Position */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center font-bold text-base sm:text-lg text-white">
                    {entry.position}
                  </td>

                  {/* Kart */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center font-mono text-neutral-300">
                    {entry.kartNumber}
                  </td>

                  {/* Team */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 font-medium truncate max-w-[100px] sm:max-w-[180px] text-white">
                    {entry.teamName}
                  </td>

                  {/* Driver */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 truncate max-w-[80px] sm:max-w-[140px] text-neutral-400 text-xs">
                    {entry.driverName || "-"}
                  </td>

                  {/* Laps */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center font-mono text-neutral-300">
                    {entry.totalLaps}
                  </td>

                  {/* Pits */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center text-neutral-300">
                    {entry.pitCount}
                  </td>

                  {/* Gap */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {entry.position === 1 ? (
                      <span className="text-accent font-bold">LDR</span>
                    ) : entry.gap ? (
                      <span className="text-red-400">+{entry.gap}s</span>
                    ) : (
                      <span className="text-neutral-600">-</span>
                    )}
                  </td>

                  {/* Interval */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {entry.position === 1 ? (
                      <span className="text-neutral-600">-</span>
                    ) : entry.interval ? (
                      <span className="text-yellow-400">+{entry.interval}s</span>
                    ) : (
                      <span className="text-neutral-600">-</span>
                    )}
                  </td>

                  {/* Avg lap */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-neutral-300">
                    {entry.avgLapMs > 0 ? msToLapTime(Math.round(entry.avgLapMs)) : "-"}
                  </td>

                  {/* Tier */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center">
                    <span className="tier-badge" style={{ backgroundColor: tierHex(entry.tierScore) }}>
                      {entry.tierScore}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable table header                                              */
/* ------------------------------------------------------------------ */

function SortTh({ children, colKey, current, dir, onSort, align, title, className }: {
  children: React.ReactNode;
  colKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align: "left" | "center" | "right";
  title?: string;
  className?: string;
}) {
  const active = current === colKey;
  return (
    <th
      className={clsx(
        "px-1.5 sm:px-2 py-2 sm:py-2.5 cursor-pointer select-none hover:text-accent transition-colors",
        `text-${align}`,
        active && "text-accent",
        className,
      )}
      onClick={() => onSort(colKey)}
      title={title}
    >
      <span className="inline-flex items-center gap-0.5">
        {children}
        {active && (
          <span className="text-[8px] leading-none">{dir === "asc" ? "▲" : "▼"}</span>
        )}
      </span>
    </th>
  );
}
