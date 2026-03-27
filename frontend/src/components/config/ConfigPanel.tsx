"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

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
      <div className="bg-card rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 text-accent">Replay de Carrera</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Archivo de log</label>
            <select
              value={selectedLog}
              onChange={(e) => setSelectedLog(e.target.value)}
              className="w-full bg-surface border border-gray-700 rounded px-3 py-2 text-sm"
            >
              <option value="">Seleccionar archivo...</option>
              {logs.map((log) => (
                <option key={log} value={log}>
                  {log}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
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
            <div className="flex justify-between text-xs text-gray-600">
              <span>1x</span>
              <span>25x</span>
              <span>50x</span>
              <span>100x</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={startReplay}
              disabled={!selectedLog || loading}
              className="flex-1 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              {loading ? "Iniciando..." : "Iniciar"}
            </button>
            <button
              onClick={togglePause}
              disabled={!replayStatus?.active}
              className="flex-1 bg-surface hover:bg-surface/80 disabled:opacity-50 text-gray-300 font-medium py-2 px-4 rounded border border-gray-700 transition-colors"
            >
              {replayStatus?.paused ? "Reanudar" : "Pausar"}
            </button>
            <button
              onClick={stopReplay}
              disabled={!replayStatus?.active}
              className="flex-1 bg-red-900 hover:bg-red-800 disabled:opacity-50 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Parar
            </button>
          </div>

          {replayStatus?.active && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{replayStatus.filename}</span>
                <span>{(replayStatus.progress * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-surface rounded-full h-2">
                <div
                  className="bg-accent rounded-full h-2 transition-all"
                  style={{ width: `${replayStatus.progress * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Race Configuration */}
      <div className="bg-card rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 text-accent">Configuracion de Carrera</h2>
        <p className="text-gray-500 text-sm">
          La configuracion de circuitos, parametros de carrera, equipos y box
          se gestiona desde la API REST.
        </p>
        <div className="mt-4 space-y-2 text-sm text-gray-400">
          <p>Endpoints disponibles:</p>
          <code className="block bg-surface p-2 rounded text-xs">
            GET /api/config/circuits<br />
            POST /api/config/race-params<br />
            PUT /api/config/teams/:id<br />
            GET /api/health
          </code>
        </div>
      </div>
    </div>
  );
}
