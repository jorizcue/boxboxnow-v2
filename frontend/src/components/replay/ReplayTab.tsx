"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useRaceStore } from "@/hooks/useRaceState";
import { useT } from "@/lib/i18n";
import { StyledSelect } from "@/components/shared/StyledSelect";
import { CalendarPicker } from "@/components/shared/CalendarPicker";

// Module-level state for replay — survives tab changes (component re-mounts)
let _replaySelectedLog = "";
let _replaySelectedOwnerId: number | null = null;
let _replaySelectedCircuitDir: string | null = null;
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

interface LogEntry {
  filename: string;
  owner_id?: number | null;
  owner?: string;
  circuit_dir?: string;
}

export function ReplayTab() {
  const t = useT();
  const [recordingCircuits, setRecordingCircuits] = useState<RecordingCircuit[]>([]);
  const [selectedRecCircuit, setSelectedRecCircuitState] = useState(_replaySelectedCircuitDir || "");
  const [selectedDate, setSelectedDateState] = useState("");

  const [legacyLogs, setLegacyLogs] = useState<LogEntry[]>([]);
  const [showLegacy, setShowLegacy] = useState(false);

  const [selectedLog, setSelectedLogState] = useState(_replaySelectedLog);
  const [selectedOwnerId, setSelectedOwnerIdState] = useState<number | null>(_replaySelectedOwnerId);
  const [selectedCircuitDir, setSelectedCircuitDirState] = useState<string | null>(_replaySelectedCircuitDir);
  const [speed, setSpeedState] = useState(_replaySpeed);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<LogAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const {
    requestWsReconnect,
    replayActive, replayPaused, replayProgress, replayTime, setReplayStatus,
  } = useRaceStore();

  const setSelectedLog = (v: string, ownerId: number | null = null, circuitDir: string | null = null) => {
    _replaySelectedLog = v;
    _replaySelectedOwnerId = ownerId;
    _replaySelectedCircuitDir = circuitDir;
    setSelectedLogState(v);
    setSelectedOwnerIdState(ownerId);
    setSelectedCircuitDirState(circuitDir);
  };
  const setSpeed = (v: number) => { _replaySpeed = v; setSpeedState(v); };
  const setSelectedRecCircuit = (v: string) => { _replaySelectedCircuitDir = v || null; setSelectedRecCircuitState(v); };

  const syncStatus = async () => {
    try {
      const st = await api.getReplayStatus();
      setReplayStatus(st.active, st.paused, st.filename || "", st.progress || 0, st.currentTime || "");
    } catch {}
  };

  useEffect(() => {
    api.getRecordings()
      .then((data) => setRecordingCircuits(data.circuits || []))
      .catch(() => {});
    api.getReplayLogs()
      .then((data) => setLegacyLogs((data.logs || []).filter((l: LogEntry) => !l.circuit_dir)))
      .catch(() => {});
    syncStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCircuitData = recordingCircuits.find((c) => c.circuit_dir === selectedRecCircuit);
  const availableDates = selectedCircuitData?.dates || [];

  useEffect(() => {
    if (selectedRecCircuit && selectedDate) {
      const filename = `${selectedDate}.log`;
      setSelectedLog(filename, null, selectedRecCircuit);
    } else if (!selectedRecCircuit) {
      if (selectedCircuitDir && !selectedOwnerId) {
        setSelectedLog("", null, null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecCircuit, selectedDate]);

  useEffect(() => {
    if (!selectedLog) { setAnalysis(null); return; }
    setAnalyzing(true);
    api.analyzeLog(selectedLog, selectedOwnerId, selectedCircuitDir)
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
      .finally(() => setAnalyzing(false));
  }, [selectedLog, selectedOwnerId, selectedCircuitDir]);

  useEffect(() => {
    if (!replayActive) return;
    const interval = setInterval(syncStatus, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayActive]);

  const startFromBlock = async (block: number = 0) => {
    if (!selectedLog) return;
    setLoading(true);
    try {
      await api.startReplay(selectedLog, speed, block, selectedOwnerId, selectedCircuitDir);
      requestWsReconnect();
      await syncStatus();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setLoading(false);
  };

  const handleSeek = async (block: number) => {
    if (!replayActive) return;
    try {
      await api.seekReplay(block);
      await syncStatus();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!analysis || analysis.totalBlocks === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const block = Math.round(pct * analysis.totalBlocks);
    if (replayActive) {
      handleSeek(block);
    } else {
      startFromBlock(block);
    }
  };

  const handleLegacySelect = (val: string) => {
    if (!val) { setSelectedLog(""); return; }
    const colonIdx = val.indexOf(":");
    if (colonIdx > 0) {
      const oid = parseInt(val.substring(0, colonIdx), 10);
      setSelectedLog(val.substring(colonIdx + 1), isNaN(oid) ? null : oid, null);
    } else {
      setSelectedLog(val, null, null);
    }
    setSelectedRecCircuit("");
    setSelectedDateState("");
  };

  return (
    <div className="bg-white/[0.03] rounded-xl p-6 border border-border">
      <h2 className="text-[11px] text-neutral-200 mb-4 uppercase tracking-wider">{t("replay.title")}</h2>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("replay.circuit")}</label>
            <StyledSelect
              value={selectedRecCircuit}
              onChange={(v) => {
                setSelectedRecCircuit(v);
                setSelectedDateState("");
                if (!v) setSelectedLog("", null, null);
              }}
              options={recordingCircuits.map((c) => ({
                value: c.circuit_dir,
                label: `${c.circuit_name} (${c.dates.length}d)`,
              }))}
              placeholder={t("replay.select")}
              disabled={replayActive}
            />
          </div>
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{t("replay.date")}</label>
            <CalendarPicker
              value={selectedDate}
              onChange={(d) => setSelectedDateState(d)}
              availableDates={availableDates}
              disabled={replayActive || !selectedRecCircuit}
              placeholder={t("replay.select")}
            />
          </div>
        </div>

        {legacyLogs.length > 0 && (
          <div>
            <button
              onClick={() => setShowLegacy(!showLegacy)}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              {showLegacy ? t("replay.hideLegacy") : t("replay.showLegacy")} {t("replay.oldRecordings")} ({legacyLogs.length})
            </button>
            {showLegacy && (
              <div className="mt-1">
                <StyledSelect
                  value={selectedOwnerId != null ? `${selectedOwnerId}:${selectedLog}` : selectedLog}
                  onChange={handleLegacySelect}
                  options={legacyLogs.map((log) => {
                    const val = log.owner_id != null ? `${log.owner_id}:${log.filename}` : log.filename;
                    const label = log.owner ? `[${log.owner}] ${log.filename}` : log.filename;
                    return { value: val, label };
                  })}
                  placeholder={t("replay.selectOldLog")}
                  disabled={replayActive}
                />
              </div>
            )}
          </div>
        )}

        {analysis && analysis.totalBlocks > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-neutral-500">
              <span>{analysis.startTime}</span>
              <span>{analysis.totalBlocks} {t("replay.blocks")}</span>
              <span>{analysis.endTime}</span>
            </div>
            <div
              className="relative w-full h-6 bg-black rounded-lg cursor-pointer border border-border group"
              onClick={handleTimelineClick}
              title={t("replay.clickToSeek")}
            >
              {replayActive && (
                <div
                  className="absolute top-0 left-0 h-full bg-accent/20 rounded-lg transition-all"
                  style={{ width: `${replayProgress * 100}%` }}
                />
              )}
              {replayActive && (
                <div
                  className="absolute top-0 h-full w-0.5 bg-accent transition-all"
                  style={{ left: `${replayProgress * 100}%` }}
                />
              )}
              {analysis.raceStarts.map((rs, idx) => (
                <div
                  key={idx}
                  className="absolute top-0 h-full flex flex-col items-center group/marker"
                  style={{ left: `${rs.progress * 100}%` }}
                >
                  <div className="w-0.5 h-full bg-green-500" />
                  <div className="absolute -top-5 text-[9px] text-green-400 font-mono whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none">
                    {rs.title ? `${rs.title} ${rs.timestamp}` : rs.timestamp}
                  </div>
                </div>
              ))}
            </div>

            {analysis.raceStarts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {analysis.raceStarts.map((rs, idx) => (
                  <button
                    key={idx}
                    onClick={() => replayActive ? handleSeek(rs.block) : startFromBlock(rs.block)}
                    disabled={loading}
                    className="flex items-center gap-1.5 bg-green-900/30 hover:bg-green-900/50 disabled:opacity-40 text-green-400 text-[10px] font-medium px-2 py-1 rounded border border-green-900/30 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="truncate">{rs.title || `${t("replay.raceN")} ${idx + 1}`}</span>
                    <span className="text-green-600 flex-shrink-0">{rs.timestamp}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {analyzing && (
          <p className="text-[10px] text-neutral-500">{t("replay.analyzing")}</p>
        )}

        <div>
          <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">
            {t("replay.speed")}: {speed}x
          </label>
          <input
            type="range" min="1" max="100" value={speed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSpeed(v);
              if (replayActive) api.setReplaySpeed(v);
            }}
            className="w-full accent-accent"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => startFromBlock(0)}
            disabled={!selectedLog || loading || replayActive}
            className="w-10 h-10 flex items-center justify-center bg-accent hover:bg-accent-hover disabled:opacity-40 text-black rounded-lg transition-colors"
            title={t("replay.start")}
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round"/></svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
          <button
            onClick={async () => {
              await api.pauseReplay();
              await syncStatus();
            }}
            disabled={!replayActive}
            className="w-10 h-10 flex items-center justify-center bg-black hover:bg-surface disabled:opacity-40 text-neutral-300 rounded-lg border border-border transition-colors"
            title={replayPaused ? t("replay.resume") : t("replay.pause")}
          >
            {replayPaused ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            )}
          </button>
          <button
            onClick={async () => {
              await api.stopReplay();
              await syncStatus();
              requestWsReconnect();
            }}
            disabled={!replayActive}
            className="w-10 h-10 flex items-center justify-center bg-red-900/50 hover:bg-red-800 disabled:opacity-40 text-red-300 rounded-lg transition-colors"
            title={t("replay.stopBtn")}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
          </button>

          {replayActive && (
            <div className="flex-1 flex items-center justify-end gap-3 text-[11px] font-mono">
              {replayTime && (
                <span className="text-accent font-semibold">{replayTime}</span>
              )}
              <span className="text-neutral-400">{(replayProgress * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
