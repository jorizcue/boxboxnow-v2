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
      if (deviceLimit) {
        const updated = deviceLimit.active_sessions.filter((s) => s.id !== sessionId);
        if (updated.length < deviceLimit.max_devices) {
          setDeviceLimit(null);
          handleLogin(new Event("submit") as any);
        } else {
          setDeviceLimit({ ...deviceLimit, active_sessions: updated });
        }
      }
    } catch {
      setError("Error al cerrar la sesion");
    }
  };

  // Device limit screen
  if (deviceLimit) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-surface rounded-2xl p-5 sm:p-8 w-full max-w-lg border border-border">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-white">LIMITE DE DISPOSITIVOS</h1>
            <p className="text-neutral-400 text-sm mt-2">{deviceLimit.message}</p>
          </div>

          <div className="space-y-2 mb-6">
            <p className="text-[11px] text-neutral-200 uppercase tracking-wider">
              Sesiones activas ({deviceLimit.active_sessions.length}/{deviceLimit.max_devices})
            </p>
            {deviceLimit.active_sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between bg-black rounded-lg p-3 border border-border"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{session.device_name}</p>
                  <p className="text-xs text-neutral-200">
                    IP: {session.ip_address}
                    {session.last_active && (
                      <> &middot; {new Date(session.last_active).toLocaleString()}</>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => killSession(session.id)}
                  className="ml-3 bg-red-900/50 hover:bg-red-800 text-red-300 text-xs font-medium px-3 py-2 rounded min-h-[44px]"
                >
                  Cerrar
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => setDeviceLimit(null)}
            className="w-full text-neutral-400 hover:text-white text-sm py-2 transition-colors"
          >
            Volver al login
          </button>
        </div>
      </div>
    );
  }

  // Login screen
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-4xl font-bold text-accent">K</span>
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-white">
            KARTING<span className="text-accent">NOW</span>
          </h1>
          <p className="text-neutral-400 text-xs tracking-widest mt-1 uppercase">Race Strategy</p>
        </div>

        <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">Usuario</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700"
                placeholder="usuario"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">Contrasena</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700"
                placeholder="contrasena"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
            >
              {loading ? "ENTRANDO..." : "ENTRAR"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
