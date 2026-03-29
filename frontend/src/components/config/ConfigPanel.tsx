"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useRaceStore } from "@/hooks/useRaceState";
import { TeamEditor } from "@/components/config/TeamEditor";

interface Circuit {
  id: number;
  name: string;
  length_m: number | null;
  pit_time_s: number | null;
  ws_port: number;
}

interface RaceSession {
  id: number;
  circuit_id: number;
  circuit_name: string | null;
  name: string;
  duration_min: number;
  min_stint_min: number;
  max_stint_min: number;
  min_pits: number;
  pit_time_s: number;
  min_driver_time_min: number;
  rain: boolean;
  box_lines: number;
  box_karts: number;
  our_kart_number: number;
  refresh_interval_s: number;
  is_active: boolean;
}

// Module-level state for replay — survives tab changes (component re-mounts)
let _replaySelectedLog = "";
let _replaySpeed = 10;

export function ConfigPanel() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RaceSessionEditor />
        <div className="space-y-6">
          <ApexConnection />
          <ReplayControls />
        </div>
      </div>
      <TeamEditor />
    </div>
  );
}

// --- Race Session (circuit + params) ---

function RaceSessionEditor() {
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [session, setSession] = useState<RaceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [circuitId, setCircuitId] = useState<number>(0);
  const [name, setName] = useState("");
  const [durationMin, setDurationMin] = useState(180);
  const [minStint, setMinStint] = useState(15);
  const [maxStint, setMaxStint] = useState(40);
  const [minPits, setMinPits] = useState(3);
  const [pitTime, setPitTime] = useState(120);
  const [minDriverTime, setMinDriverTime] = useState(30);
  const [rain, setRain] = useState(false);
  const [boxLines, setBoxLines] = useState(2);
  const [boxKarts, setBoxKarts] = useState(30);
  const [ourKart, setOurKart] = useState(0);
  const [refreshInterval, setRefreshInterval] = useState(30);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [circuitsData, sessionData] = await Promise.all([
        api.getMyCircuits(),
        api.getActiveSession(),
      ]);
      setCircuits(circuitsData);
      if (sessionData) {
        setSession(sessionData);
        applySession(sessionData);
      }
    } catch {}
    setLoading(false);
  };

  const applySession = (s: RaceSession) => {
    setCircuitId(s.circuit_id);
    setName(s.name);
    setDurationMin(s.duration_min);
    setMinStint(s.min_stint_min);
    setMaxStint(s.max_stint_min);
    setMinPits(s.min_pits);
    setPitTime(s.pit_time_s);
    setMinDriverTime(s.min_driver_time_min);
    setRain(s.rain);
    setBoxLines(s.box_lines);
    setBoxKarts(s.box_karts);
    setOurKart(s.our_kart_number);
    setRefreshInterval(s.refresh_interval_s);
  };

  const handleCircuitChange = (id: number) => {
    setCircuitId(id);
    const c = circuits.find((c) => c.id === id);
    if (c) {
      if (c.pit_time_s) setPitTime(c.pit_time_s);
      setName(c.name);
    }
  };

  const saveSession = async () => {
    if (!circuitId) return;
    setSaving(true);
    try {
      const data = {
        circuit_id: circuitId,
        name,
        duration_min: durationMin,
        min_stint_min: minStint,
        max_stint_min: maxStint,
        min_pits: minPits,
        pit_time_s: pitTime,
        min_driver_time_min: minDriverTime,
        rain,
        box_lines: boxLines,
        box_karts: boxKarts,
        our_kart_number: ourKart,
        refresh_interval_s: refreshInterval,
      };

      let result;
      if (session) {
        result = await api.updateSession(data);
      } else {
        result = await api.createSession(data);
      }
      setSession(result);

      // Update zustand store config immediately so UI reflects changes
      // (e.g. highlighted "our kart" row) without waiting for next WS broadcast
      useRaceStore.setState((state) => ({
        config: {
          ...state.config,
          circuitLengthM: selectedCircuit?.length_m ?? state.config.circuitLengthM,
          pitTimeS: pitTime,
          ourKartNumber: ourKart,
          minPits,
          maxStintMin: maxStint,
          minStintMin: minStint,
          durationMin: durationMin,
          boxLines: boxLines,
          boxKarts: boxKarts,
          minDriverTimeMin: minDriverTime,
        },
      }));
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="bg-surface rounded-xl p-6 border border-border">
        <p className="text-neutral-400 text-sm">Cargando...</p>
      </div>
    );
  }

  const selectedCircuit = circuits.find((c) => c.id === circuitId);

  return (
    <div className="bg-surface rounded-xl p-6 border border-border">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-[11px] text-neutral-200 uppercase tracking-wider">Sesion de Carrera</h2>
        {session && (
          <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded uppercase tracking-wider font-medium">
            Activa
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* Circuit selector */}
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1.5 uppercase tracking-wider">Circuito</label>
          <select
            value={circuitId}
            onChange={(e) => handleCircuitChange(Number(e.target.value))}
            className="w-full bg-black border border-border rounded-lg px-3 py-2.5 text-sm"
          >
            <option value={0}>Seleccionar circuito...</option>
            {circuits.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.length_m ? `(${c.length_m}m)` : ""}
              </option>
            ))}
          </select>
          {selectedCircuit && (
            <p className="text-[10px] text-neutral-400 mt-1">
              Puerto WS: {selectedCircuit.ws_port}
              {selectedCircuit.pit_time_s && ` · Pit: ${selectedCircuit.pit_time_s}s`}
              {selectedCircuit.length_m && ` · ${selectedCircuit.length_m}m`}
            </p>
          )}
        </div>

        {/* Two column grid for params */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Duracion (min)" value={durationMin} onChange={setDurationMin} />
          <Field label="Nuestro kart" value={ourKart} onChange={setOurKart} />
          <Field label="Stint min (min)" value={minStint} onChange={setMinStint} />
          <Field label="Stint max (min)" value={maxStint} onChange={setMaxStint} />
          <Field label="Pits minimos" value={minPits} onChange={setMinPits} />
          <Field label="Tiempo pit (s)" value={pitTime} onChange={setPitTime} />
          <Field label="Tiempo min piloto (min)" value={minDriverTime} onChange={setMinDriverTime} />
          <Field label="Refresh (s)" value={refreshInterval} onChange={setRefreshInterval} />
          <Field label="Lineas box" value={boxLines} onChange={setBoxLines} />
          <Field label="Karts en box" value={boxKarts} onChange={setBoxKarts} />
        </div>

        {/* Rain toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rain}
            onChange={(e) => setRain(e.target.checked)}
            className="accent-accent w-4 h-4"
          />
          <span className="text-sm text-neutral-300">Modo lluvia</span>
          <span className="text-[10px] text-neutral-400">(desactiva filtro de outliers)</span>
        </label>

        {/* Save button */}
        <button
          onClick={saveSession}
          disabled={!circuitId || saving}
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold py-2.5 rounded-lg"
        >
          {saving ? "Guardando..." : session ? "Actualizar sesion" : "Crear sesion"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm font-mono"
      />
    </div>
  );
}

// --- Apex Connection ---

function ApexConnection() {
  const { apexConnected, apexStatusMsg, setApexStatus, requestWsReconnect } = useRaceStore();
  const [recording, setRecording] = useState(false);
  const [recordingInfo, setRecordingInfo] = useState<string>("");

  // On mount, sync connection + recording status with backend
  useEffect(() => {
    api.getConnectionStatus()
      .then((res) => {
        if (res.apex_connected) {
          setApexStatus(true, `Conectado a ${res.circuit}`);
        } else if (apexConnected) {
          setApexStatus(false, "");
        }
      })
      .catch(() => {});
    api.getRecordingStatus()
      .then((res) => {
        setRecording(res.recording);
        if (res.recording) {
          setRecordingInfo(`${res.filename} (${res.messages} msgs)`);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll recording message count while recording
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => {
      api.getRecordingStatus()
        .then((res) => {
          if (res.recording) {
            setRecordingInfo(`${res.filename} (${res.messages} msgs)`);
          } else {
            setRecording(false);
            setRecordingInfo("");
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [recording]);

  return (
    <div className="bg-surface rounded-xl p-4 sm:p-6 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] text-neutral-200 uppercase tracking-wider">Conexion Apex Timing</h2>
        <div className="flex items-center gap-2">
          {recording && (
            <span className="flex items-center gap-1 text-[10px] text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
              REC
            </span>
          )}
          {apexConnected && (
            <span className="flex items-center gap-1.5 text-[10px] text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
              Conectado
            </span>
          )}
        </div>
      </div>
      {apexStatusMsg && (
        <p className={`text-xs mb-3 ${apexConnected ? "text-accent" : "text-neutral-400"}`}>
          {apexStatusMsg}
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={async () => {
            try {
              setApexStatus(false, "Conectando...");
              const res = await api.connectApex();
              setApexStatus(true, `Conectado a ${res.circuit} (${res.teamsLoaded} equipos)`);
              requestWsReconnect();
            } catch (e: any) {
              setApexStatus(false, "Error: " + e.message);
            }
          }}
          disabled={apexConnected}
          className="flex-1 min-w-[100px] bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold py-2.5 px-4 rounded-lg text-sm"
        >
          Conectar
        </button>
        <button
          onClick={async () => {
            try {
              await api.disconnectApex();
              setApexStatus(false, "Desconectado");
              setRecording(false);
              setRecordingInfo("");
              requestWsReconnect();
            } catch {}
          }}
          disabled={!apexConnected}
          className="flex-1 min-w-[100px] bg-red-900/50 hover:bg-red-800 disabled:opacity-40 text-red-300 font-medium py-2.5 px-4 rounded-lg text-sm"
        >
          Desconectar
        </button>
      </div>

      {/* Recording controls */}
      {apexConnected && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2 flex-wrap">
            {!recording ? (
              <button
                onClick={async () => {
                  try {
                    const res = await api.startRecording();
                    setRecording(true);
                    setRecordingInfo(res.filename);
                  } catch (e: any) {
                    alert("Error: " + e.message);
                  }
                }}
                className="flex items-center gap-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-300 text-xs font-medium px-3 py-2 rounded-lg border border-red-900/30 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Grabar carrera
              </button>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await api.stopRecording();
                    setRecording(false);
                    setRecordingInfo("");
                  } catch {}
                }}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              >
                <span className="w-2 h-2 rounded-sm bg-white" />
                Parar grabacion
              </button>
            )}
            {recordingInfo && (
              <span className="text-[10px] text-neutral-400">{recordingInfo}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Replay Controls ---

interface RaceStartMarker {
  block: number;
  progress: number;
  timestamp: string;
}

interface LogAnalysis {
  totalBlocks: number;
  raceStarts: RaceStartMarker[];
  startTime: string | null;
  endTime: string | null;
}

function ReplayControls() {
  const [logs, setLogs] = useState<string[]>([]);
  // Use module-level vars to survive tab changes
  const [selectedLog, setSelectedLogState] = useState(_replaySelectedLog);
  const [speed, setSpeedState] = useState(_replaySpeed);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<LogAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const {
    apexConnected, setApexStatus, requestWsReconnect,
    replayActive, replayPaused, replayFilename, replayProgress, setReplayStatus,
  } = useRaceStore();

  const setSelectedLog = (v: string) => {
    _replaySelectedLog = v;
    setSelectedLogState(v);
  };
  const setSpeed = (v: number) => {
    _replaySpeed = v;
    setSpeedState(v);
  };

  // Sync replay status from backend on mount and poll while active
  const syncStatus = async () => {
    try {
      const st = await api.getReplayStatus();
      setReplayStatus(st.active, st.paused, st.filename || "", st.progress || 0);
    } catch {}
  };

  useEffect(() => {
    api.getReplayLogs().then((data) => setLogs(data.logs)).catch(() => {});
    syncStatus();
  }, []);

  // Analyze log when selected
  useEffect(() => {
    if (!selectedLog) { setAnalysis(null); return; }
    setAnalyzing(true);
    api.analyzeLog(selectedLog)
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
      .finally(() => setAnalyzing(false));
  }, [selectedLog]);

  // Poll status while replay is active
  useEffect(() => {
    if (!replayActive) return;
    const interval = setInterval(syncStatus, 2000);
    return () => clearInterval(interval);
  }, [replayActive]);

  const startFromBlock = async (block: number = 0) => {
    if (!selectedLog) return;
    setLoading(true);
    try {
      if (apexConnected) {
        await api.disconnectApex();
        setApexStatus(false, "Desconectado (replay)");
        requestWsReconnect();
        await new Promise((r) => setTimeout(r, 500));
      }
      await api.startReplay(selectedLog, speed, block);
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

  return (
    <div className="bg-surface rounded-xl p-6 border border-border">
      <h2 className="text-[11px] text-neutral-200 mb-4 uppercase tracking-wider">Replay</h2>

      {apexConnected && (
        <p className="text-[11px] text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2 mb-3">
          Desconectate del Apex Timing para usar el replay
        </p>
      )}

      <div className="space-y-3">
        <select
          value={selectedLog}
          onChange={(e) => setSelectedLog(e.target.value)}
          disabled={replayActive}
          className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-40"
        >
          <option value="">Seleccionar log...</option>
          {logs.map((log) => (
            <option key={log} value={log}>{log}</option>
          ))}
        </select>

        {/* Timeline bar */}
        {analysis && analysis.totalBlocks > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-neutral-500">
              <span>{analysis.startTime}</span>
              <span>{analysis.totalBlocks} bloques</span>
              <span>{analysis.endTime}</span>
            </div>
            <div
              className="relative w-full h-6 bg-black rounded-lg cursor-pointer border border-border group"
              onClick={handleTimelineClick}
              title="Click para posicionarte"
            >
              {/* Progress fill */}
              {replayActive && (
                <div
                  className="absolute top-0 left-0 h-full bg-accent/20 rounded-lg transition-all"
                  style={{ width: `${replayProgress * 100}%` }}
                />
              )}
              {/* Progress head */}
              {replayActive && (
                <div
                  className="absolute top-0 h-full w-0.5 bg-accent transition-all"
                  style={{ left: `${replayProgress * 100}%` }}
                />
              )}
              {/* Race start markers */}
              {analysis.raceStarts.map((rs, idx) => (
                <div
                  key={idx}
                  className="absolute top-0 h-full flex flex-col items-center group/marker"
                  style={{ left: `${rs.progress * 100}%` }}
                >
                  <div className="w-0.5 h-full bg-green-500" />
                  <div className="absolute -top-5 text-[9px] text-green-400 font-mono whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none">
                    {rs.timestamp}
                  </div>
                </div>
              ))}
            </div>

            {/* Race start buttons */}
            {analysis.raceStarts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {analysis.raceStarts.map((rs, idx) => (
                  <button
                    key={idx}
                    onClick={() => replayActive ? handleSeek(rs.block) : startFromBlock(rs.block)}
                    disabled={loading}
                    className="flex items-center gap-1 bg-green-900/30 hover:bg-green-900/50 disabled:opacity-40 text-green-400 text-[10px] font-medium px-2 py-1 rounded border border-green-900/30 transition-colors"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Carrera {idx + 1} — {rs.timestamp}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {analyzing && (
          <p className="text-[10px] text-neutral-500">Analizando fichero...</p>
        )}

        <div>
          <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">
            Velocidad: {speed}x
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

        <div className="flex gap-2">
          <button
            onClick={() => startFromBlock(0)}
            disabled={!selectedLog || loading || replayActive}
            className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold py-2 rounded-lg text-sm"
          >
            {loading ? "..." : "Iniciar"}
          </button>
          <button
            onClick={async () => {
              await api.pauseReplay();
              await syncStatus();
            }}
            disabled={!replayActive}
            className="flex-1 bg-black hover:bg-surface disabled:opacity-40 text-neutral-300 py-2 rounded-lg border border-border text-sm"
          >
            {replayPaused ? "Reanudar" : "Pausar"}
          </button>
          <button
            onClick={async () => {
              await api.stopReplay();
              await syncStatus();
            }}
            disabled={!replayActive}
            className="flex-1 bg-red-900/50 hover:bg-red-800 disabled:opacity-40 text-red-300 py-2 rounded-lg text-sm"
          >
            Parar
          </button>
        </div>

        {replayActive && (
          <div className="flex justify-between text-[10px] text-neutral-200">
            <span>{replayFilename}</span>
            <span>{(replayProgress * 100).toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
