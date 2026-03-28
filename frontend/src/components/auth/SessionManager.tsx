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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-lg border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Dispositivos conectados</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-300 text-xl transition-colors">
            &times;
          </button>
        </div>

        <p className="text-[11px] text-neutral-200 mb-4 uppercase tracking-wider">
          Maximo {user?.max_devices} dispositivo(s) &middot; {sessions.length} activo(s)
        </p>

        {loading ? (
          <p className="text-neutral-400 text-sm py-4 text-center">Cargando...</p>
        ) : (
          <div className="space-y-2 mb-4">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-xl p-3 border ${
                  s.is_current
                    ? "bg-accent/5 border-accent/20"
                    : "bg-black border-border"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{s.device_name}</p>
                    {s.is_current && (
                      <span className="text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded uppercase tracking-wider font-medium">
                        Este dispositivo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400">
                    IP: {s.ip_address} &middot; Activo: {new Date(s.last_active).toLocaleString()}
                  </p>
                </div>
                {!s.is_current && (
                  <button
                    onClick={() => killSession(s.id)}
                    className="ml-3 bg-red-900/50 hover:bg-red-800 text-red-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
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
            className="w-full bg-red-900/50 hover:bg-red-800 text-red-300 text-sm font-medium py-2 rounded-lg mb-2 transition-colors"
          >
            Cerrar todas las demas sesiones
          </button>
        )}

        <button
          onClick={onClose}
          className="w-full text-neutral-200 hover:text-white text-sm py-2 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
