"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useRaceStore } from "@/hooks/useRaceState";
import { useAuth } from "@/hooks/useAuth";
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
let _replaySelectedOwnerId: number | null = null;
let _replaySelectedCircuitDir: string | null = null;
let _replaySpeed = 10;

export function ConfigPanel() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RaceSessionEditor />
        <div className="space-y-6">
          <CircuitHubStatus />
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

      // Session saved -> monitoring auto-starts, reconnect WS to pick up new state
      useRaceStore.getState().requestWsReconnect();
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

// --- Circuit Hub Status ---

function CircuitHubStatus() {
  const { setApexStatus } = useRaceStore();
  const [status, setStatus] = useState<{
    monitoring: boolean;
    circuit_name: string | null;
    circuit_connected: boolean;
    circuit_messages: number;
  } | null>(null);
  const [myCircuits, setMyCircuits] = useState<{ id: number; name: string }[]>([]);
  const [hubStatus, setHubStatus] = useState<Record<number, { connected: boolean; messages: number }>>({});

  const refresh = async () => {
    try {
      const [connStatus, circuitsList, hubData] = await Promise.all([
        api.getConnectionStatus(),
        api.getMyCircuits(),
        api.getHubStatus().catch(() => ({ circuits: [] })),
      ]);
      setStatus(connStatus);
      setMyCircuits(circuitsList.map((c: any) => ({ id: c.id, name: c.name })));

      // Build lookup for hub connection status
      const lookup: Record<number, { connected: boolean; messages: number }> = {};
      for (const c of hubData.circuits || []) {
        lookup[c.circuit_id] = { connected: c.connected, messages: c.messages };
      }
      setHubStatus(lookup);

      // Sync apexConnected to zustand for other components
      if (connStatus.monitoring) {
        setApexStatus(true, `Monitorizando ${connStatus.circuit_name}`);
      } else {
        setApexStatus(false, "");
      }
    } catch {}
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-surface rounded-xl p-4 sm:p-6 border border-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] text-neutral-200 uppercase tracking-wider">CircuitHub</h2>
        {status?.monitoring && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] text-accent">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                status.circuit_connected ? "bg-accent" : "bg-yellow-500 animate-pulse"
              }`} />
              {status.circuit_connected ? "Conectado" : "Reconectando..."}
            </span>
          </div>
        )}
      </div>

      {status?.monitoring ? (
        <div className="space-y-2">
          <p className="text-xs text-accent">
            Monitorizando <span className="font-semibold">{status.circuit_name}</span>
          </p>
          <div className="flex items-center gap-4 text-[10px] text-neutral-400">
            <span>{status.circuit_messages.toLocaleString()} mensajes</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Grabando auto
            </span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-neutral-500">
          Guarda una sesion de carrera para empezar a monitorizar
        </p>
      )}

      {/* User's accessible circuits with connection status */}
      {myCircuits.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-[10px] text-neutral-400 mb-2 uppercase tracking-wider">Mis circuitos</p>
          <div className="space-y-1">
            {myCircuits.map((c) => {
              const hub = hubStatus[c.id];
              return (
                <div key={c.id} className="flex items-center gap-2 text-[10px]">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    hub?.connected ? "bg-accent" : "bg-neutral-700"
                  }`} />
                  <span className="text-neutral-300 truncate flex-1">{c.name}</span>
                  {hub && (
                    <span className="text-neutral-500 font-mono">{hub.messages.toLocaleString()} msgs</span>
                  )}
                </div>
              );
            })}
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

function ReplayControls() {
  // Recording circuits (circuit+date selector)
  const [recordingCircuits, setRecordingCircuits] = useState<RecordingCircuit[]>([]);
  const [selectedRecCircuit, setSelectedRecCircuitState] = useState(_replaySelectedCircuitDir || "");
  const [selectedDate, setSelectedDateState] = useState("");

  // Legacy logs (flat file list, admin only)
  const [legacyLogs, setLegacyLogs] = useState<LogEntry[]>([]);
  const [showLegacy, setShowLegacy] = useState(false);

  // Module-level state for replay params
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
  const { user } = useAuth();
  const isAdmin = user?.is_admin ?? false;

  // Setters that persist to module-level
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

  // Sync replay status
  const syncStatus = async () => {
    try {
      const st = await api.getReplayStatus();
      setReplayStatus(st.active, st.paused, st.filename || "", st.progress || 0, st.currentTime || "");
    } catch {}
  };

  // Load recording circuits + legacy logs on mount
  useEffect(() => {
    api.getRecordings()
      .then((data) => setRecordingCircuits(data.circuits || []))
      .catch(() => {});
    if (isAdmin) {
      api.getReplayLogs()
        .then((data) => setLegacyLogs((data.logs || []).filter((l: LogEntry) => !l.circuit_dir)))
        .catch(() => {});
    }
    syncStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get dates for selected circuit
  const selectedCircuitData = recordingCircuits.find((c) => c.circuit_dir === selectedRecCircuit);
  const availableDates = selectedCircuitData?.dates || [];

  // When circuit or date changes, update the replay selection
  useEffect(() => {
    if (selectedRecCircuit && selectedDate) {
      const filename = `${selectedDate}.log`;
      setSelectedLog(filename, null, selectedRecCircuit);
    } else if (!selectedRecCircuit) {
      // Only clear if it was a circuit selection
      if (selectedCircuitDir && !selectedOwnerId) {
        setSelectedLog("", null, null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecCircuit, selectedDate]);

  // Analyze log when selected
  useEffect(() => {
    if (!selectedLog) { setAnalysis(null); return; }
    setAnalyzing(true);
    api.analyzeLog(selectedLog, selectedOwnerId, selectedCircuitDir)
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
      .finally(() => setAnalyzing(false));
  }, [selectedLog, selectedOwnerId, selectedCircuitDir]);

  // Poll status while replay is active
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

  // Legacy log select handler (admin only)
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
    <div className="bg-surface rounded-xl p-6 border border-border">
      <h2 className="text-[11px] text-neutral-200 mb-4 uppercase tracking-wider">Replay</h2>

      <div className="space-y-3">
        {/* Circuit + Date selectors */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">Circuito</label>
            <select
              value={selectedRecCircuit}
              onChange={(e) => {
                setSelectedRecCircuit(e.target.value);
                setSelectedDateState("");
                if (!e.target.value) setSelectedLog("", null, null);
              }}
              disabled={replayActive}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-40"
            >
              <option value="">Seleccionar...</option>
              {recordingCircuits.map((c) => (
                <option key={c.circuit_dir} value={c.circuit_dir}>
                  {c.circuit_name} ({c.dates.length}d)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1 uppercase tracking-wider">Fecha</label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDateState(e.target.value)}
              disabled={replayActive || !selectedRecCircuit}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-40"
            >
              <option value="">Seleccionar...</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Legacy logs toggle (admin) */}
        {isAdmin && legacyLogs.length > 0 && (
          <div>
            <button
              onClick={() => setShowLegacy(!showLegacy)}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              {showLegacy ? "Ocultar" : "Mostrar"} grabaciones antiguas ({legacyLogs.length})
            </button>
            {showLegacy && (
              <select
                value={selectedOwnerId != null ? `${selectedOwnerId}:${selectedLog}` : selectedLog}
                onChange={(e) => handleLegacySelect(e.target.value)}
                disabled={replayActive}
                className="w-full mt-1 bg-black border border-border rounded-lg px-3 py-2 text-sm disabled:opacity-40"
              >
                <option value="">Seleccionar log antiguo...</option>
                {legacyLogs.map((log, idx) => {
                  const val = log.owner_id != null ? `${log.owner_id}:${log.filename}` : log.filename;
                  const label = log.owner ? `[${log.owner}] ${log.filename}` : log.filename;
                  return <option key={`${val}-${idx}`} value={val}>{label}</option>;
                })}
              </select>
            )}
          </div>
        )}

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
                    <span className="truncate">{rs.title || `Carrera ${idx + 1}`}</span>
                    <span className="text-green-600 flex-shrink-0">{rs.timestamp}</span>
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => startFromBlock(0)}
            disabled={!selectedLog || loading || replayActive}
            className="w-10 h-10 flex items-center justify-center bg-accent hover:bg-accent-hover disabled:opacity-40 text-black rounded-lg transition-colors"
            title="Iniciar"
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
            title={replayPaused ? "Reanudar" : "Pausar"}
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
            title="Parar"
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
