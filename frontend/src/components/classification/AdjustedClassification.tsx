"use client";

import { useState, useCallback } from "react";
import { useRaceStore } from "@/hooks/useRaceState";
import { msToLapTime, tierHex } from "@/lib/formatters";
import { useT } from "@/lib/i18n";
import clsx from "clsx";
import type { ClassificationEntry } from "@/types/race";

/**
 * Clasificación Real — pure visualizer of the backend's
 * time-domain classification (see backend/app/engine/classification.py).
 *
 * The backend ranks karts by:
 *
 *   adjProgress_K = trackTime_K - pitDebt_K
 *
 * where trackTime is "race time spent on track so far" (T - pit time)
 * and pitDebt is "remaining mandatory pit obligation in seconds"
 * (using the field-median pit duration as the per-pit reference).
 *
 * Gaps and intervals are in seconds; meters are a secondary display
 * computed with the field-median speed for stability.
 */

type SortKey = "position" | "kartNumber" | "totalLaps" | "pitCount" | "gapS" | "intervalS" | "avgLapMs" | "tierScore";
type SortDir = "asc" | "desc";

export function AdjustedClassification() {
  const t = useT();
  const { classification, classificationMeta, config } = useRaceStore();
  const [sortKey, setSortKey] = useState<SortKey>("position");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Default sort direction: position/avgLap ascending, everything else descending
      setSortDir(key === "position" || key === "avgLapMs" ? "asc" : "desc");
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

  // Sort
  const sorted = [...classification].sort((a, b) => {
    const get = (e: ClassificationEntry): number => {
      switch (sortKey) {
        case "position": return e.position;
        case "kartNumber": return e.kartNumber;
        case "totalLaps": return e.totalLaps;
        case "pitCount": return e.pitCount;
        case "avgLapMs": return e.avgLapMs > 0 ? e.avgLapMs : Infinity;
        case "tierScore": return e.tierScore;
        case "gapS": return e.gapS;
        case "intervalS": return e.intervalS;
        default: return 0;
      }
    };
    const av = get(a), bv = get(b);
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const meta = classificationMeta;
  const minPits = meta?.minPits ?? config.minPits ?? 0;
  const pitRefStr = meta ? meta.pitTimeRefS.toFixed(1) : "—";
  const raceTimeStr = meta ? formatRaceTime(meta.raceTimeS) : "—";

  return (
    <div className="space-y-4">
      {/* Header with reference values */}
      <div className="bg-surface rounded-xl p-3 border border-border">
        <p className="text-[11px] text-neutral-400">
          {t("adjusted.explanation", {
            minPits: String(minPits),
            pitRef: pitRefStr,
            raceTime: raceTimeStr,
          })}
        </p>
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
              <th className="px-1.5 sm:px-2 py-2 sm:py-2.5 text-center">{t("adjusted.pendingPits")}</th>
              <SortTh align="right" colKey="gapS" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("adjusted.gapSeconds")}</SortTh>
              <SortTh align="right" colKey="intervalS" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("adjusted.intSeconds")}</SortTh>
              <SortTh align="right" colKey="avgLapMs" current={sortKey} dir={sortDir} onSort={toggleSort}>{t("race.avg20")}</SortTh>
              <SortTh align="center" colKey="tierScore" current={sortKey} dir={sortDir} onSort={toggleSort} className="w-8 sm:w-12">Tier</SortTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => {
              const isOurTeam = config.ourKartNumber > 0 && entry.kartNumber === config.ourKartNumber;
              const inPit = entry.pitStatus === "in_pit";

              return (
                <tr
                  key={entry.kartNumber}
                  className={clsx(
                    "border-b border-border hover:bg-surface/50 transition-colors",
                    isOurTeam && "our-team",
                    inPit && "bg-yellow-950/20",
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

                  {/* Pits done */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center text-neutral-300">
                    {entry.pitCount}
                  </td>

                  {/* Pending pits */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-center">
                    {entry.pitsRemaining > 0 ? (
                      <span className={clsx(
                        "font-medium",
                        inPit ? "text-yellow-400" : "text-orange-400",
                      )}>
                        {entry.pitsRemaining}
                        {inPit && <span className="ml-1 text-[10px] opacity-80">({t("adjusted.inPit")})</span>}
                      </span>
                    ) : (
                      <span className="text-neutral-700">0</span>
                    )}
                  </td>

                  {/* Gap (seconds primary, meters secondary) */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {entry.position === 1 ? (
                      <span className="text-accent font-bold">LDR</span>
                    ) : (
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-red-400">+{entry.gapS.toFixed(1)}s</span>
                        <span className="text-neutral-600 text-[10px]">{entry.gapM.toLocaleString()}m</span>
                      </div>
                    )}
                  </td>

                  {/* Interval (seconds primary, meters secondary) */}
                  <td className="px-1.5 sm:px-2 py-1 sm:py-1.5 text-right font-mono text-xs">
                    {entry.position === 1 ? (
                      <span className="text-neutral-600">-</span>
                    ) : (
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-yellow-400">+{entry.intervalS.toFixed(1)}s</span>
                        <span className="text-neutral-600 text-[10px]">{entry.intervalM.toLocaleString()}m</span>
                      </div>
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRaceTime(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
