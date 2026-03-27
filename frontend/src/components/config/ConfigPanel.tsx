"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { TeamEditor } from "@/components/config/TeamEditor";

export function ConfigPanel() {
  const [logs, setLogs] = useState<string[]>([]);
  const [replayStatus, setReplayStatus] = useState<any>(null);
  const [selectedLog, setSelectedLog] = useState("");
  const [speed, setSpeed] = useState(10);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getReplayLogs().then((data) => setLogs(data.logs)).catch(() => {});
    api.getReplayStatus().then(setReplayStatus).catch(() => {});
  }, []);

  const startReplay = async () => {
    if (!selectedLog) return;
    setLoading(true);
    try {
      await api.startReplay(selectedLog, speed);
      const status = await api.getReplayStatus();
      setReplayStatus(status);
    } catch (e) {
      console.error("Error starting replay:", e);
    }
    setLoading(false);
  };

  const stopReplay = async () => {
    await api.stopReplay();
    const status = await api.getReplayStatus();
    setReplayStatus(status);
  };

  const togglePause = async () => {
    const status = await api.pauseReplay();
    setReplayStatus(status);
  };

  const changeSpeed = async (newSpeed: number) => {
    setSpeed(newSpeed);
    if (replayStatus?.active) {
      await api.setReplaySpeed(newSpeed);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Replay Controls */}
      <div className="bg-surface rounded-xl p-6 border border-border">
        <h2 className="text-[11px] text-neutral-500 mb-4 uppercase tracking-wider">Replay de Carrera</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] text-neutral-600 mb-1.5 uppercase tracking-wider">Archivo de log</label>
            <select
              value={selectedLog}
              onChange={(e) => setSelectedLog(e.target.value)}
              className="w-full bg-black border border-border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Seleccionar archivo...</option>
              {logs.map((log) => (
                <option key={log} value={log}>{log}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-neutral-600 mb-1.5 uppercase tracking-wider">
              Velocidad: {speed}x
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={speed}
              onChange={(e) => changeSpeed(Number(e.target.value))}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-[10px] text-neutral-700">
              <span>1x</span><span>25x</span><span>50x</span><span>100x</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={startReplay}
              disabled={!selectedLog || loading}
              className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold py-2 px-4 rounded-lg"
            >
              {loading ? "Iniciando..." : "Iniciar"}
            </button>
            <button
              onClick={togglePause}
              disabled={!replayStatus?.active}
              className="flex-1 bg-black hover:bg-surface disabled:opacity-40 text-neutral-300 font-medium py-2 px-4 rounded-lg border border-border"
            >
              {replayStatus?.paused ? "Reanudar" : "Pausar"}
            </button>
            <button
              onClick={stopReplay}
              disabled={!replayStatus?.active}
              className="flex-1 bg-red-900/50 hover:bg-red-800 disabled:opacity-40 text-red-300 font-medium py-2 px-4 rounded-lg"
            >
              Parar
            </button>
          </div>

          {replayStatus?.active && (
            <div className="mt-2">
              <div className="flex justify-between text-[11px] text-neutral-500 mb-1">
                <span>{replayStatus.filename}</span>
                <span>{(replayStatus.progress * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-black rounded-full h-1.5">
                <div
                  className="bg-accent rounded-full h-1.5 transition-all"
                  style={{ width: `${replayStatus.progress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Apex Connection */}
      <div className="bg-surface rounded-xl p-6 border border-border">
        <h2 className="text-[11px] text-neutral-500 mb-4 uppercase tracking-wider">Conexion Apex Timing</h2>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                const res = await api.connectApex();
                alert(`Conectado a ${res.circuit} (${res.teamsLoaded} equipos, ${res.driversWithDifferential} pilotos con diferencial)`);
              } catch (e: any) {
                alert(e.message);
              }
            }}
            className="flex-1 bg-accent hover:bg-accent-hover text-black font-semibold py-2.5 px-4 rounded-lg"
          >
            Conectar
          </button>
          <button
            onClick={async () => {
              try { await api.disconnectApex(); } catch {}
            }}
            className="flex-1 bg-red-900/50 hover:bg-red-800 text-red-300 font-medium py-2.5 px-4 rounded-lg"
          >
            Desconectar
          </button>
        </div>
      </div>

      {/* Team Editor - full width */}
      <div className="lg:col-span-2">
        <TeamEditor />
      </div>
    </div>
  );
}
