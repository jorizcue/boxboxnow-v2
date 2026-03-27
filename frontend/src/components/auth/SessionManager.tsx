"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface DeviceSession {
  id: number;
  session_token: string;
  device_name: string;
  ip_address: string;
  created_at: string;
  last_active: string;
  is_current: boolean;
}

export function SessionManager({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await api.getMySessions();
      setSessions(data);
    } catch {}
    setLoading(false);
  };

  const killSession = async (sessionId: number) => {
    try {
      await api.killSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {}
  };

  const killAllOthers = async () => {
    try {
      await api.killAllOtherSessions();
      setSessions((prev) => prev.filter((s) => s.is_current));
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl p-6 w-full max-w-lg border border-gray-800 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Dispositivos conectados</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">
            &times;
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Maximo {user?.max_devices} dispositivo(s) &middot;{" "}
          {sessions.length} activo(s)
        </p>

        {loading ? (
          <p className="text-gray-500 text-sm py-4 text-center">Cargando...</p>
        ) : (
          <div className="space-y-2 mb-4">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-lg p-3 border ${
                  s.is_current
                    ? "bg-accent/10 border-accent/30"
                    : "bg-surface border-gray-700"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{s.device_name}</p>
                    {s.is_current && (
                      <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded">
                        ESTE DISPOSITIVO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    IP: {s.ip_address} &middot; Activo:{" "}
                    {new Date(s.last_active).toLocaleString()}
                  </p>
                </div>
                {!s.is_current && (
                  <button
                    onClick={() => killSession(s.id)}
                    className="ml-3 bg-red-900 hover:bg-red-800 text-white text-xs px-3 py-1.5 rounded"
                  >
                    Cerrar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {sessions.length > 1 && (
          <button
            onClick={killAllOthers}
            className="w-full bg-red-900 hover:bg-red-800 text-white text-sm font-medium py-2 rounded mb-2"
          >
            Cerrar todas las demas sesiones
          </button>
        )}

        <button
          onClick={onClose}
          className="w-full bg-surface text-gray-300 text-sm py-2 rounded border border-gray-700"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
