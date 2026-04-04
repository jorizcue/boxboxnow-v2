"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { CalendarPicker } from "@/components/shared/CalendarPicker";

interface CircuitRow {
  id: number;
  name: string;
}

interface KartStat {
  kart_number: number;
  races: number;
  total_laps: number;
  valid_laps: number;
  avg_lap_ms: number;
  best5_avg_ms: number;
  best_lap_ms: number;
  teams: string[];
}

interface BestLap {
  lap_time_ms: number;
  lap_number: number;
  team_name: string;
  driver_name: string;
  race_date: string;
}

interface CircuitSummary {
  circuit: CircuitRow;
  races: number;
  karts: number;
  validLaps: number;
  stats: KartStat[];
}

type SortField = "best5_avg_ms" | "avg_lap_ms" | "best_lap_ms";
type SortDir = "asc" | "desc";

function msToLapTime(ms: number): string {
  if (ms <= 0) return "-";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
  }
  return `${seconds}.${millis.toString().padStart(3, "0")}`;
}

export function KartAnalyticsTab() {
  const t = useT();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [summaries, setSummaries] = useState<CircuitSummary[]>([]);
  const [selectedCircuitId, setSelectedCircuitId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterOutliers, setFilterOutliers] = useState(true);
  const [sortBy, setSortBy] = useState<SortField>("best5_avg_ms");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Best laps modal
  const [modalKart, setModalKart] = useState<number | null>(null);
  const [bestLaps, setBestLaps] = useState<BestLap[]>([]);
  const [loadingBestLaps, setLoadingBestLaps] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const circuits: CircuitRow[] = await api.getAnalyticsCircuits();
      const results = await Promise.all(
        circuits.map(async (circuit) => {
          try {
            const [stats, logs] = await Promise.all([
              api.getKartStats(circuit.id, dateFrom, dateTo, filterOutliers),
              api.getRaceLogs(circuit.id, dateFrom, dateTo),
            ]);
            return {
              circuit,
              races: logs.length,
              karts: stats.length,
              validLaps: stats.reduce((a: number, s: KartStat) => a + s.valid_laps, 0),
              stats,
            } as CircuitSummary;
          } catch {
            return { circuit, races: 0, karts: 0, validLaps: 0, stats: [] } as CircuitSummary;
          }
        })
      );
      setSummaries(results);
    } catch {}
    setLoading(false);
  }, [dateFrom, dateTo, filterOutliers]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const toggleCircuit = (id: number) => {
    setSelectedCircuitId((prev) => (prev === id ? null : id));
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  const selected = summaries.find((s) => s.circuit.id === selectedCircuitId);
  const panelOpen = selected !== undefined && selected.stats.length > 0;

  // Sorted stats
  const sortedStats = useMemo(() => {
    if (!selected) return [];
    const copy = [...selected.stats];
    copy.sort((a, b) => {
      const diff = a[sortBy] - b[sortBy];
      return sortDir === "asc" ? diff : -diff;
    });
    return copy;
  }, [selected, sortBy, sortDir]);

  // Color scale for kart performance
  const bestBest5 = sortedStats.length > 0 ? Math.min(...sortedStats.map((s) => s.best5_avg_ms)) : 0;
  const worstBest5 = sortedStats.length > 0 ? Math.max(...sortedStats.map((s) => s.best5_avg_ms)) : 0;
  const range = worstBest5 - bestBest5;

  const getSpeedColor = (ms: number): string => {
    if (range === 0) return "text-white";
    const pct = (ms - bestBest5) / range;
    if (pct < 0.15) return "text-green-400";
    if (pct < 0.35) return "text-accent";
    if (pct < 0.65) return "text-white";
    if (pct < 0.85) return "text-orange-400";
    return "text-red-400";
  };

  const openBestLapsModal = async (kartNumber: number) => {
    if (!selectedCircuitId) return;
    setModalKart(kartNumber);
    setLoadingBestLaps(true);
    setBestLaps([]);
    try {
      const laps = await api.getKartBestLaps(selectedCircuitId, kartNumber, dateFrom, dateTo, filterOutliers);
      setBestLaps(laps);
    } catch {}
    setLoadingBestLaps(false);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <span className="ml-1 text-neutral-600">↕</span>;
    return <span className="ml-1 text-accent">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const totalRaces = summaries.reduce((a, s) => a + s.races, 0);
  const totalKarts = summaries.reduce((a, s) => a + s.karts, 0);
  const totalLaps = summaries.reduce((a, s) => a + s.validLaps, 0);

  return (
    <div className="space-y-4">
      {/* Date filters */}
      <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="w-[160px]">
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("analytics.from")}</label>
            <CalendarPicker value={dateFrom} onChange={setDateFrom} placeholder={t("analytics.from")} />
          </div>
          <div className="w-[160px]">
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("analytics.to")}</label>
            <CalendarPicker value={dateTo} onChange={setDateTo} placeholder={t("analytics.to")} />
          </div>
          {/* Filter outliers checkbox */}
          <label className="flex items-center gap-2 pb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterOutliers}
              onChange={(e) => setFilterOutliers(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-neutral-600 bg-transparent accent-accent"
            />
            <span className="text-[11px] text-neutral-400">{t("analytics.filterOutliers")}</span>
          </label>
          {loading && (
            <span className="text-neutral-500 text-xs animate-pulse pb-2">{t("analytics.loading")}</span>
          )}
          {!loading && summaries.length > 0 && (
            <div className="flex items-center gap-3 text-[10px] text-neutral-400 pb-2">
              <span><span className="text-accent font-semibold">{summaries.length}</span> {t("analytics.circuitsCol")}</span>
              <span className="text-neutral-600">|</span>
              <span><span className="text-accent font-semibold">{totalRaces}</span> {t("analytics.racesFound")}</span>
              <span className="text-neutral-600">|</span>
              <span><span className="text-accent font-semibold">{totalKarts}</span> {t("analytics.karts")}</span>
              <span className="text-neutral-600">|</span>
              <span><span className="text-accent font-semibold">{totalLaps.toLocaleString()}</span> {t("analytics.validLaps")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Circuits cards + detail panel */}
      <div className="flex gap-4">
        {/* Left: circuit cards */}
        <div className={`bg-white/[0.03] rounded-xl p-4 border border-border transition-all ${panelOpen ? "w-64 flex-shrink-0" : "w-full"}`}>
          <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">{t("analytics.circuitsCol")}</h3>

          <div className={`space-y-2 ${panelOpen ? "" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 space-y-0"}`}>
            {summaries.map((s) => (
              <div
                key={s.circuit.id}
                onClick={() => toggleCircuit(s.circuit.id)}
                className={`px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                  selectedCircuitId === s.circuit.id
                    ? "bg-accent/10 border border-accent/40 shadow-[0_0_8px_rgba(var(--accent-rgb),0.15)]"
                    : "bg-white/[0.05] hover:bg-white/[0.08] border border-neutral-600/50 hover:border-accent/40"
                }`}
              >
                <div className={`text-sm font-medium truncate ${selectedCircuitId === s.circuit.id ? "text-accent" : "text-white"}`}>
                  {s.circuit.name}
                </div>
                <div className="flex gap-3 text-[10px] text-neutral-400 mt-0.5">
                  <span><span className={`font-semibold ${s.races > 0 ? "text-accent" : "text-neutral-600"}`}>{s.races}</span> {t("analytics.racesShort")}</span>
                  <span><span className={`font-semibold ${s.karts > 0 ? "text-accent" : "text-neutral-600"}`}>{s.karts}</span> karts</span>
                  <span><span className={`font-semibold ${s.validLaps > 0 ? "text-accent" : "text-neutral-600"}`}>{s.validLaps.toLocaleString()}</span> {t("analytics.lapsShort")}</span>
                </div>
              </div>
            ))}
            {!loading && summaries.length === 0 && (
              <p className="text-neutral-500 text-sm py-4 text-center">{t("analytics.noData")}</p>
            )}
          </div>
        </div>

        {/* Right: kart detail panel */}
        {panelOpen && selected && (
          <div className="flex-1 min-w-0 bg-white/[0.03] rounded-xl border border-border p-5 animate-in slide-in-from-right-4 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-sm text-neutral-200 font-medium uppercase tracking-wider">{selected.circuit.name}</h4>
                <div className="flex items-center gap-3 text-[10px] text-neutral-400 mt-1">
                  <span className="text-accent font-semibold">{selected.races}</span> {t("analytics.racesFound")}
                  <span className="text-neutral-600">|</span>
                  <span className="text-accent font-semibold">{selected.stats.length}</span> {t("analytics.karts")}
                  <span className="text-neutral-600">|</span>
                  <span className="text-accent font-semibold">{selected.validLaps.toLocaleString()}</span> {t("analytics.validLaps")}
                </div>
              </div>
              <button onClick={() => setSelectedCircuitId(null)} className="text-neutral-500 hover:text-white text-lg leading-none transition-colors">&times;</button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] text-neutral-400 uppercase tracking-wider">
                  <tr>
                    <th className="text-center px-2 py-1.5 w-8">#</th>
                    <th className="text-center px-2 py-1.5">{t("race.kart")}</th>
                    <th
                      className="text-right px-2 py-1.5 cursor-pointer hover:text-accent transition-colors select-none"
                      onClick={() => handleSort("best5_avg_ms")}
                    >
                      {t("analytics.top5Avg")}<SortIcon field="best5_avg_ms" />
                    </th>
                    <th
                      className="text-right px-2 py-1.5 cursor-pointer hover:text-accent transition-colors select-none"
                      onClick={() => handleSort("avg_lap_ms")}
                    >
                      {t("analytics.generalAvg")}<SortIcon field="avg_lap_ms" />
                    </th>
                    <th
                      className="text-right px-2 py-1.5 cursor-pointer hover:text-accent transition-colors select-none"
                      onClick={() => handleSort("best_lap_ms")}
                    >
                      {t("analytics.bestLap")}<SortIcon field="best_lap_ms" />
                    </th>
                    <th className="text-right px-2 py-1.5">{t("analytics.races")}</th>
                    <th className="text-right px-2 py-1.5">{t("analytics.lapsCol")}</th>
                    <th className="text-left px-2 py-1.5">{t("analytics.teams")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map((s, idx) => (
                    <tr key={s.kart_number} className="border-t border-border hover:bg-black/30 transition-colors">
                      <td className="px-2 py-1.5 text-center text-neutral-500 text-xs">{idx + 1}</td>
                      <td className="px-2 py-1.5 text-center font-bold text-white text-base">{s.kart_number}</td>
                      <td
                        className={`px-2 py-1.5 text-right font-mono font-semibold cursor-pointer hover:underline ${getSpeedColor(s.best5_avg_ms)}`}
                        onClick={() => openBestLapsModal(s.kart_number)}
                        title={t("analytics.best5Laps")}
                      >
                        {msToLapTime(s.best5_avg_ms)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-neutral-300">
                        {msToLapTime(s.avg_lap_ms)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-purple-400">
                        {msToLapTime(s.best_lap_ms)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-neutral-400">{s.races}</td>
                      <td className="px-2 py-1.5 text-right text-neutral-400">{s.valid_laps}</td>
                      <td className="px-2 py-1.5 text-left text-[11px] text-neutral-500 truncate max-w-[200px]">
                        {s.teams.join(", ") || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sortedStats.length > 0 && (
              <div className="mt-3 flex items-center gap-4 text-[10px]">
                <span className="text-green-400">{t("analytics.fast")}</span>
                <span className="text-accent">{t("analytics.goodPace")}</span>
                <span className="text-white">{t("analytics.normal")}</span>
                <span className="text-orange-400">{t("analytics.slow")}</span>
                <span className="text-red-400">{t("analytics.verySlow")}</span>
              </div>
            )}
          </div>
        )}

        {/* Empty state when circuit selected but no data */}
        {selectedCircuitId && selected && selected.stats.length === 0 && (
          <div className="flex-1 min-w-0 bg-white/[0.03] rounded-xl border border-border p-8 text-center animate-in fade-in duration-200">
            <div className="flex justify-end mb-2">
              <button onClick={() => setSelectedCircuitId(null)} className="text-neutral-500 hover:text-white text-lg leading-none transition-colors">&times;</button>
            </div>
            <p className="text-neutral-500 text-sm">{t("analytics.noData")}</p>
            <p className="text-neutral-600 text-xs mt-2">{t("analytics.autoSaveHint")}</p>
          </div>
        )}
      </div>

      {/* Best 5 Laps Modal */}
      {modalKart !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModalKart(null)}>
          <div className="bg-[#1a1a2e] border border-border rounded-xl shadow-xl p-6 w-[480px] max-w-[90vw] animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                {t("analytics.best5Laps")} — Kart {modalKart}
              </h3>
              <button onClick={() => setModalKart(null)} className="text-neutral-500 hover:text-white text-lg leading-none transition-colors">&times;</button>
            </div>

            {loadingBestLaps ? (
              <p className="text-neutral-500 text-xs animate-pulse py-4 text-center">{t("analytics.loading")}</p>
            ) : bestLaps.length === 0 ? (
              <p className="text-neutral-500 text-xs py-4 text-center">{t("analytics.noData")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[10px] text-neutral-400 uppercase tracking-wider">
                  <tr>
                    <th className="text-center px-2 py-1.5 w-8">#</th>
                    <th className="text-right px-2 py-1.5">{t("analytics.time")}</th>
                    <th className="text-right px-2 py-1.5">{t("analytics.lapNum")}</th>
                    <th className="text-left px-2 py-1.5">{t("analytics.team")}</th>
                    <th className="text-left px-2 py-1.5">{t("analytics.driver")}</th>
                    <th className="text-left px-2 py-1.5">{t("analytics.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {bestLaps.map((lap, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="px-2 py-1.5 text-center text-neutral-500 text-xs">{idx + 1}</td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold text-green-400">
                        {msToLapTime(lap.lap_time_ms)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-neutral-400">{lap.lap_number}</td>
                      <td className="px-2 py-1.5 text-left text-neutral-300 text-xs truncate max-w-[120px]">{lap.team_name || "-"}</td>
                      <td className="px-2 py-1.5 text-left text-neutral-300 text-xs truncate max-w-[120px]">{lap.driver_name || "-"}</td>
                      <td className="px-2 py-1.5 text-left text-neutral-500 text-xs">
                        {lap.race_date ? new Date(lap.race_date).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
