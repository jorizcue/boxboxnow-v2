"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { StyledSelect } from "@/components/shared/StyledSelect";

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
  const [circuits, setCircuits] = useState<CircuitRow[]>([]);
  const [selectedCircuit, setSelectedCircuit] = useState<number>(0);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [stats, setStats] = useState<KartStat[]>([]);
  const [raceLogs, setRaceLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getAnalyticsCircuits().then((data: CircuitRow[]) => setCircuits(data)).catch(() => {});
  }, []);

  const loadStats = async () => {
    if (!selectedCircuit) return;
    setLoading(true);
    try {
      const [statsData, logsData] = await Promise.all([
        api.getKartStats(selectedCircuit, dateFrom, dateTo),
        api.getRaceLogs(selectedCircuit, dateFrom, dateTo),
      ]);
      setStats(statsData);
      setRaceLogs(logsData);
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedCircuit) loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCircuit, dateFrom, dateTo]);

  const bestBest5 = stats.length > 0 ? Math.min(...stats.map((s) => s.best5_avg_ms)) : 0;
  const worstBest5 = stats.length > 0 ? Math.max(...stats.map((s) => s.best5_avg_ms)) : 0;
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

  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
        <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">{t("analytics.title")}</h3>

        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("analytics.circuit")}</label>
            <StyledSelect
              value={selectedCircuit}
              onChange={(v) => setSelectedCircuit(Number(v))}
              options={circuits.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t("analytics.select")}
            />
          </div>
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("analytics.from")}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-black border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("analytics.to")}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-black border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={loadStats}
            disabled={!selectedCircuit || loading}
            className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold px-4 py-2 rounded-lg text-sm"
          >
            {loading ? t("analytics.loading") : t("analytics.search")}
          </button>
        </div>

        {raceLogs.length > 0 && (
          <div className="mt-3 flex items-center gap-3 text-[10px] text-neutral-400">
            <span className="text-accent font-semibold">{raceLogs.length}</span> {t("analytics.racesFound")}
            <span className="text-neutral-600">|</span>
            <span className="text-accent font-semibold">{stats.length}</span> {t("analytics.karts")}
            <span className="text-neutral-600">|</span>
            <span className="text-accent font-semibold">{stats.reduce((a, s) => a + s.valid_laps, 0).toLocaleString()}</span> {t("analytics.validLaps")}
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <div className="bg-white/[0.03] rounded-xl p-4 border border-border">
          <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">
            {t("analytics.performance")}
            <span className="text-neutral-500 ml-2 normal-case">{t("analytics.sortedByTop5")}</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] text-neutral-400 uppercase tracking-wider">
                <tr>
                  <th className="text-center px-2 py-1.5 w-8">#</th>
                  <th className="text-center px-2 py-1.5">{t("race.kart")}</th>
                  <th className="text-right px-2 py-1.5">{t("analytics.top5Avg")}</th>
                  <th className="text-right px-2 py-1.5">{t("analytics.generalAvg")}</th>
                  <th className="text-right px-2 py-1.5">{t("analytics.bestLap")}</th>
                  <th className="text-right px-2 py-1.5">{t("analytics.races")}</th>
                  <th className="text-right px-2 py-1.5">{t("analytics.lapsCol")}</th>
                  <th className="text-left px-2 py-1.5">{t("analytics.teams")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, idx) => (
                  <tr key={s.kart_number} className="border-t border-border hover:bg-black/30 transition-colors">
                    <td className="px-2 py-1.5 text-center text-neutral-500 text-xs">{idx + 1}</td>
                    <td className="px-2 py-1.5 text-center font-bold text-white text-base">{s.kart_number}</td>
                    <td className={`px-2 py-1.5 text-right font-mono font-semibold ${getSpeedColor(s.best5_avg_ms)}`}>
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

          {stats.length > 0 && (
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

      {!loading && selectedCircuit > 0 && stats.length === 0 && raceLogs.length === 0 && (
        <div className="bg-white/[0.03] rounded-xl p-8 border border-border text-center">
          <p className="text-neutral-500 text-sm">{t("analytics.noData")}</p>
          <p className="text-neutral-600 text-xs mt-2">{t("analytics.autoSaveHint")}</p>
        </div>
      )}
    </div>
  );
}
