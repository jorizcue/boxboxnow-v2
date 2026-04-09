"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import Link from "next/link";

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

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deviceLimit, setDeviceLimit] = useState<DeviceLimitError | null>(null);
  const { token, _hydrated, setAuth } = useAuth();
  const router = useRouter();

  // Handle Google OAuth callback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "google") {
      const accessToken = params.get("token");
      const sessionTk = params.get("session_token");
      const userJson = params.get("user");
      if (accessToken && sessionTk && userJson) {
        try {
          const userData = JSON.parse(userJson);
          setAuth(accessToken, sessionTk, userData);
          // Clean URL and redirect
          window.history.replaceState({}, "", "/login");
          router.push("/dashboard");
          return;
        } catch {}
      }
    }
  }, []);

  useEffect(() => {
    if (_hydrated && token) {
      router.push("/dashboard");
    }
  }, [_hydrated, token, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDeviceLimit(null);
    setLoading(true);

    try {
      const data = await api.login(username, password, mfaRequired ? mfaCode : undefined);
      setAuth(data.access_token, data.session_token, data.user);
      router.push("/dashboard");
    } catch (err: any) {
      const msg = err.message || "";
      if (err.status === 403 || msg.includes("API error 403:")) {
        if (err.mfaRequired) {
          setMfaRequired(true);
          setLoading(false);
          return;
        }
        try {
          const body = JSON.parse(msg.replace("API error 403: ", ""));
          if (body.detail === "MFA code required") {
            setMfaRequired(true);
            setLoading(false);
            return;
          }
          if (body.detail === "Invalid MFA code") {
            setError("Codigo MFA invalido");
            setMfaCode("");
            setLoading(false);
            return;
          }
          setError(body.detail || "Sin acceso a circuito");
        } catch {
          setError("Sin acceso a circuito");
        }
        setLoading(false);
        return;
      }
      try {
        const body = JSON.parse(msg.replace("API error 409: ", ""));
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

  if (!_hydrated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="text-lg font-bold animate-pulse">
          <span className="text-white">BOXBOX</span>
          <span className="text-accent">NOW</span>
        </span>
      </div>
    );
  }

  if (token) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="text-lg font-bold animate-pulse">
          <span className="text-white">BOXBOX</span>
          <span className="text-accent">NOW</span>
        </span>
      </div>
    );
  }

  // Device limit screen
  if (deviceLimit) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-surface rounded-2xl p-5 sm:p-8 w-full max-w-lg border border-border">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-white">Limite de dispositivos</h1>
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

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-0 mb-2">
            <span className="text-4xl font-bold text-white">BB</span>
            <span className="text-4xl font-bold text-accent">N</span>
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-white">
            BOXBOX<span className="text-accent">NOW</span>
          </h1>
          <p className="text-neutral-400 text-xs tracking-widest mt-1 uppercase">
            Estrategia de Karting en Tiempo Real
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border">
          <form onSubmit={handleLogin} className="space-y-5">
            {!mfaRequired ? (
              <>
                <div>
                  <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">
                    Usuario
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 focus:outline-none focus:border-accent/50 transition-colors"
                    placeholder="usuario"
                    autoFocus
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">
                    Contrasena
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 focus:outline-none focus:border-accent/50 transition-colors"
                    placeholder="contrasena"
                    autoComplete="current-password"
                  />
                </div>
              </>
            ) : (
              <div>
                <div className="text-center mb-4">
                  <div className="inline-flex items-center justify-center w-10 h-10 bg-accent/10 rounded-full mb-2">
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </div>
                  <p className="text-sm text-neutral-300">Introduce el codigo de tu app de autenticacion</p>
                </div>
                <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">
                  Codigo MFA
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 text-center font-mono text-lg tracking-[0.5em] focus:outline-none focus:border-accent/50 transition-colors"
                  placeholder="000000"
                  autoFocus
                />
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !username || !password || (mfaRequired && mfaCode.length !== 6)}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
            >
              {loading ? "Entrando..." : mfaRequired ? "Verificar" : "Entrar"}
            </button>

            {mfaRequired && (
              <button
                type="button"
                onClick={() => { setMfaRequired(false); setMfaCode(""); setError(""); }}
                className="w-full text-neutral-400 hover:text-white text-sm py-2 transition-colors"
              >
                Volver al login
              </button>
            )}
          </form>

          {!mfaRequired && (
            <>
              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-neutral-500">o continua con</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Google login */}
              <a
                href="/api/auth/google"
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-neutral-100 text-neutral-800 font-medium py-3 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Iniciar sesion con Google
              </a>
            </>
          )}
        </div>

        {/* Links */}
        <div className="mt-6 text-center space-y-3">
          <p className="text-sm text-neutral-400">
            No tienes cuenta?{" "}
            <Link href="/register" className="text-accent hover:text-accent-hover transition-colors font-medium">
              Registrate
            </Link>
          </p>
          <Link href="/forgot-password" className="inline-block text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
            Has olvidado tu contrasena?
          </Link>
          <br />
          <Link href="/" className="inline-block text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
            &larr; Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
