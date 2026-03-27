"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

interface ActiveSession {
  id: number;
  device_name: string;
  ip_address: string;
  created_at: string | null;
  last_active: string | null;
}

interface DeviceLimitError {
  message: string;
  max_devices: number;
  active_sessions: ActiveSession[];
}

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deviceLimit, setDeviceLimit] = useState<DeviceLimitError | null>(null);
  const { setAuth } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDeviceLimit(null);
    setLoading(true);

    try {
      const data = await api.login(username, password);
      setAuth(data.access_token, data.session_token, data.user);
    } catch (err: any) {
      // Check for 409 (device limit)
      try {
        const body = JSON.parse(err.message.replace("API error 409: ", ""));
        if (body.detail?.active_sessions) {
          setDeviceLimit(body.detail);
        } else {
          setError("Usuario o contrasena incorrectos");
        }
      } catch {
        setError("Usuario o contrasena incorrectos");
      }
    }
    setLoading(false);
  };

  const killSession = async (sessionId: number) => {
    try {
      await api.killSessionUnauthenticated(username, password, sessionId);
      // Remove from local list
      if (deviceLimit) {
        const updated = deviceLimit.active_sessions.filter((s) => s.id !== sessionId);
        if (updated.length < deviceLimit.max_devices) {
          // Now there's room - retry login
          setDeviceLimit(null);
          handleLogin(new Event("submit") as any);
        } else {
          setDeviceLimit({ ...deviceLimit, active_sessions: updated });
        }
      }
    } catch (e: any) {
      setError("Error al cerrar la sesion");
    }
  };

  // Device limit reached screen
  if (deviceLimit) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-card rounded-xl p-8 w-full max-w-lg shadow-2xl border border-gray-800">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-accent">LIMITE DE DISPOSITIVOS</h1>
            <p className="text-gray-400 text-sm mt-2">{deviceLimit.message}</p>
          </div>

          <div className="space-y-3 mb-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Sesiones activas ({deviceLimit.active_sessions.length}/{deviceLimit.max_devices})
            </p>
            {deviceLimit.active_sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between bg-surface rounded-lg p-3 border border-gray-700"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{session.device_name}</p>
                  <p className="text-xs text-gray-500">
                    IP: {session.ip_address}
                    {session.last_active && (
                      <> &middot; Activo: {new Date(session.last_active).toLocaleString()}</>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => killSession(session.id)}
                  className="ml-3 bg-red-900 hover:bg-red-800 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
                >
                  Cerrar
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => setDeviceLimit(null)}
            className="w-full bg-surface hover:bg-surface/80 text-gray-300 font-medium py-2 rounded border border-gray-700 transition-colors"
          >
            Volver al login
          </button>
        </div>
      </div>
    );
  }

  // Normal login screen
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="bg-card rounded-xl p-8 w-full max-w-sm shadow-2xl border border-gray-800">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-accent">BOXBOXNOW</h1>
          <p className="text-gray-500 text-sm mt-1">Race Strategy Dashboard</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-surface border border-gray-700 rounded px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
              placeholder="usuario"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Contrasena</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface border border-gray-700 rounded px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
              placeholder="contrasena"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full bg-accent hover:bg-accent/80 disabled:opacity-50 text-white font-medium py-2.5 rounded transition-colors"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
