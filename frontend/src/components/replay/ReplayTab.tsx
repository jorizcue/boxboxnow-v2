"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useRaceStore } from "@/hooks/useRaceState";
import { useT } from "@/lib/i18n";
import { CalendarPicker } from "@/components/shared/CalendarPicker";

// Module-level state for replay — survives tab changes
let _replaySpeed = 10;

interface RaceStartMarker {
  block: number;
  progress: number;
  timestamp: string;
  title: string;
}

interface LogAnalysis {
  totalBlocks: number;
  raceStarts: RaceStartMarker[];
  startTime: string | null;
  endTime: string | null;
}

interface RecordingCircuit {
  circuit_dir: string;
  circuit_name: string;
  circuit_id: number | null;
  dates: string[];
}

interface DayAnalysis {
  date: string;
  filename: string;
  analysis: LogAnalysis | null;
  loading: boolean;
}

export function ReplayTab() {
  const t = useT();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [recordingCircuits, setRecordingCircuits] = useState<RecordingCircuit[]>([]);
  const [selectedCircuitDir, setSelectedCircuitDir] = useState<string | null>(null);
  const [speed, setSpeedState] = useState(_replaySpeed);
  const [dayAnalyses, setDayAnalyses] = useState<DayAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const {
    requestWsReconnect,
    replayActive, replayPaused, replayProgress, replayTime, setReplayStatus,
  } = useRaceStore();

  const setSpeed = (v: number) => { _replaySpeed = v; setSpeedState(v); };

  const syncStatus = async () => {
    try {
      const st = await api.getReplayStatus();
      setReplayStatus(st.active, st.paused, st.filename || "", st.progress || 0, st.currentTime || "");
    } catch {}
  };

  // Load recordings
  useEffect(() => {
    setLoading(true);
    api.getRecordings()
      .then((data) => setRecordingCircuits(data.circuits || []))
      .catch(() => {})
      .finally(() => setLoading(false));
    syncStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter dates within range for each circuit
  const getFilteredDates = useCallback((circuit: RecordingCircuit) => {
    return circuit.dates.filter((d) => d >= dateFrom && d <= dateTo);
  }, [dateFrom, dateTo]);

  // When selecting a circuit, analyze all dates within range
  const selectCircuit = useCallback(async (circuitDir: string | null) => {
    if (selectedCircuitDir === circuitDir || !circuitDir) {
      setSelectedCircuitDir(null);
      setDayAnalyses([]);
      return;
    }
    setSelectedCircuitDir(circuitDir);
    const circuit = recordingCircuits.find((c) => c.circuit_dir === circuitDir);
    if (!circuit) return;

    const filteredDates = getFilteredDates(circuit);
    // Initialize day analyses with loading state
    const initial: DayAnalysis[] = filteredDates.map((d) => ({
      date: d,
      filename: `${d}.log`,
      analysis: null,
      loading: true,
    }));
    setDayAnalyses(initial);

    // Load analyses in parallel
    const results = await Promise.all(
      filteredDates.map(async (d) => {
        try {
          const analysis = await api.analyzeLog(`${d}.log`, null, circuitDir);
          return { date: d, filename: `${d}.log`, analysis, loading: false };
        } catch {
          return { date: d, filename: `${d}.log`, analysis: null, loading: false };
        }
      })
    );
    setDayAnalyses(results);
  }, [selectedCircuitDir, recordingCircuits, getFilteredDates]);

  // Sync replay status periodically when active
  useEffect(() => {
    if (!replayActive) return;
    const interval = setInterval(syncStatus, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayActive]);

  const startFromBlock = async (filename: string, circuitDir: string, block: number = 0) => {
    setActionLoading(true);
    try {
      await api.startReplay(filename, speed, block, null, circuitDir);
      requestWsReconnect();
      await syncStatus();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setActionLoading(false);
  };

  const handleSeek = async (block: number) => {
    if (!replayActive) return;
    try {
      await api.seekReplay(block);
      await syncStatus();
    } catch {}
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>, day: DayAnalysis) => {
    if (!day.analysis || day.analysis.totalBlocks === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const block = Math.round(pct * day.analysis.totalBlocks);
    if (replayActive) {
      handleSeek(block);
    } else if (selectedCircuitDir) {
      startFromBlock(day.filename, selectedCircuitDir, block);
    }
  };

  const selectedCircuit = recordingCircuits.find((c) => c.circuit_dir === selectedCircuitDir);
  const panelOpen = selectedCircuitDir !== null;

  // Totals
  const totalDays = recordingCircuits.reduce((a, c) => a + getFilteredDates(c).length, 0);

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
          {!loading && recordingCircuits.length > 0 && (
            <div className="flex items-center gap-3 text-[10px] text-neutral-400 pb-2">
              <span><span className="text-accent font-semibold">{recordingCircuits.length}</span> {t("analytics.circuitsCol")}</span>
              <span className="text-neutral-600">|</span>
              <span><span className="text-accent font-semibold">{totalDays}</span> {t("replay.daysRecorded")}</span>
            </div>
          )}
          {loading && (
            <span className="text-neutral-500 text-xs animate-pulse pb-2">{t("analytics.loading")}</span>
          )}
        </div>
      </div>

      {/* Circuit cards + detail panel */}
      <div className="flex gap-4">
        {/* Left: circuit cards */}
        <div className={`bg-white/[0.03] rounded-xl p-4 border border-border transition-all ${panelOpen ? "w-64 flex-shrink-0" : "w-full"}`}>
          <h3 className="text-[11px] text-neutral-200 mb-3 uppercase tracking-wider">{t("analytics.circuitsCol")}</h3>

          <div className={`space-y-2 ${panelOpen ? "" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 space-y-0"}`}>
            {recordingCircuits.map((c) => {
              const filteredDates = getFilteredDates(c);
              return (
                <div
                  key={c.circuit_dir}
                  onClick={() => selectCircuit(c.circuit_dir)}
                  className={`px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                    selectedCircuitDir === c.circuit_dir
                      ? "bg-accent/10 border border-accent/40 shadow-[0_0_8px_rgba(var(--accent-rgb),0.15)]"
                      : "bg-white/[0.05] hover:bg-white/[0.08] border border-neutral-600/50 hover:border-accent/40"
                  }`}
                >
                  <div className={`text-sm font-medium truncate ${selectedCircuitDir === c.circuit_dir ? "text-accent" : "text-white"}`}>
                    {c.circuit_name}
                  </div>
                  <div className="flex gap-3 text-[10px] text-neutral-400 mt-0.5">
                    <span><span className={`font-semibold ${filteredDates.length > 0 ? "text-accent" : "text-neutral-600"}`}>{filteredDates.length}</span> {t("replay.daysShort")}</span>
                    <span className="text-neutral-600">({c.dates.length} total)</span>
                  </div>
                </div>
              );
            })}
            {!loading && recordingCircuits.length === 0 && (
              <p className="text-neutral-500 text-sm py-4 text-center">{t("replay.noRecordings")}</p>
            )}
          </div>
        </div>

        {/* Right: day timelines panel */}
        {panelOpen && selectedCircuit && (
          <div className="flex-1 min-w-0 bg-white/[0.03] rounded-xl border border-border p-5 animate-in slide-in-from-right-4 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-sm text-neutral-200 font-medium uppercase tracking-wider">{selectedCircuit.circuit_name}</h4>
                <div className="text-[10px] text-neutral-400 mt-1">
                  <span className="text-accent font-semibold">{dayAnalyses.length}</span> {t("replay.daysRecorded")}
                </div>
              </div>
              <button onClick={() => { setSelectedCircuitDir(null); setDayAnalyses([]); }} className="text-neutral-500 hover:text-white text-lg leading-none transition-colors">&times;</button>
            </div>

            {/* Speed slider */}
            <div className="mb-5 flex items-center gap-3">
              <label className="text-[10px] text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                {t("replay.speed")}: <span className="text-accent font-semibold">{speed}x</span>
              </label>
              <input
                type="range" min="1" max="100" value={speed}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSpeed(v);
                  if (replayActive) api.setReplaySpeed(v);
                }}
                className="flex-1 accent-accent"
              />
              {replayActive && (
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  {replayTime && <span className="text-accent font-semibold">{replayTime}</span>}
                  <span className="text-neutral-400">{(replayProgress * 100).toFixed(1)}%</span>
                  <button
                    onClick={async () => {
                      await api.stopReplay();
                      await syncStatus();
                      requestWsReconnect();
                    }}
                    className="ml-1 text-red-400/70 hover:text-red-400 text-[10px] font-medium transition-colors"
                  >
                    {t("replay.stopBtn")}
                  </button>
                </div>
              )}
            </div>

            {/* Day timelines */}
            <div className="space-y-4">
              {dayAnalyses.map((day) => (
                <div key={day.date} className="space-y-1.5">
                  {day.loading ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-neutral-300 font-medium">{formatDateLabel(day.date)}</span>
                      <span className="text-[10px] text-neutral-500 animate-pulse">{t("replay.analyzing")}</span>
                    </div>
                  ) : day.analysis && day.analysis.totalBlocks > 0 ? (
                    <>
                      <div className="flex justify-between text-[10px] text-neutral-500">
                        <span className="text-neutral-300 font-medium">{formatDateLabel(day.date)}</span>
                        <span>{day.analysis.totalBlocks} {t("replay.blocks")}</span>
                        <span>{day.analysis.endTime}</span>
                      </div>
                      <div
                        className="relative w-full h-6 bg-black rounded-lg cursor-pointer border border-border group hover:border-neutral-600 transition-colors"
                        onClick={(e) => handleTimelineClick(e, day)}
                        title={t("replay.clickToSeek")}
                      >
                        {day.analysis.raceStarts.map((rs, idx) => (
                          <div
                            key={idx}
                            className="absolute top-0 h-full flex flex-col items-center group/marker"
                            style={{ left: `${rs.progress * 100}%` }}
                          >
                            <div className="w-0.5 h-full bg-green-500" />
                          </div>
                        ))}
                      </div>
                      {day.analysis.raceStarts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {day.analysis.raceStarts.map((rs, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                if (replayActive) {
                                  handleSeek(rs.block);
                                } else if (selectedCircuitDir) {
                                  startFromBlock(day.filename, selectedCircuitDir, rs.block);
                                }
                              }}
                              disabled={actionLoading}
                              className="flex items-center gap-1.5 bg-green-900/30 hover:bg-green-900/50 disabled:opacity-40 text-green-400 text-[10px] font-medium px-2 py-1 rounded border border-green-900/30 transition-colors"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                              <span className="truncate">{rs.title || `${t("replay.raceN")} ${idx + 1}`}</span>
                              <span className="text-green-600 flex-shrink-0">{rs.timestamp}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-neutral-300 font-medium">{formatDateLabel(day.date)}</span>
                      <span className="text-[10px] text-neutral-600">{t("replay.noData")}</span>
                    </div>
                  )}
                </div>
              ))}
              {dayAnalyses.length === 0 && (
                <p className="text-neutral-500 text-sm py-4 text-center">{t("replay.noDaysInRange")}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const weekday = d.toLocaleDateString("es", { weekday: "short" });
  const day = d.getDate();
  const month = d.toLocaleDateString("es", { month: "short" });
  return `${weekday} ${day} ${month}`;
}
