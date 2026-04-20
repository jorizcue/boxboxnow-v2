"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

interface ActiveSession {
  id: number;
  device_name: string;
  ip_address: string;
  /** "ios" / "android" / "ipad" / "" — populated from `X-App-Platform`
   * header the mobile clients attach. Blank for web sessions. */
  app_platform?: string;
  /** Semver string, e.g. "1.4.2". Blank for web sessions. */
  app_version?: string;
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
  const [showPassword, setShowPassword] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deviceLimit, setDeviceLimit] = useState<DeviceLimitError | null>(null);
  const { setAuth } = useAuth();
  const t = useT();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDeviceLimit(null);
    setLoading(true);

    try {
      const data = await api.login(username, password, mfaRequired ? mfaCode : undefined);
      setAuth(data.access_token, data.session_token, data.user);
    } catch (err: any) {
      const msg = err.message || "";
      // 403: MFA required or invalid MFA code
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
            setError(t("login.invalidMfaCode"));
            setMfaCode("");
            setLoading(false);
            return;
          }
          setError(body.detail || t("login.noCircuitAccess"));
        } catch {
          setError(t("login.noCircuitAccess"));
        }
        setLoading(false);
        return;
      }
      // 409: device limit
      try {
        const body = JSON.parse(msg.replace("API error 409: ", ""));
        if (body.detail?.active_sessions) {
          setDeviceLimit(body.detail);
        } else {
          setError(t("login.wrongCredentials"));
        }
      } catch {
        setError(t("login.wrongCredentials"));
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
      setError(t("login.errorClosingSession"));
    }
  };

  // Device limit screen
  if (deviceLimit) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-surface rounded-2xl p-5 sm:p-8 w-full max-w-lg border border-border">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-white">{t("login.deviceLimit")}</h1>
            <p className="text-neutral-400 text-sm mt-2">{deviceLimit.message}</p>
          </div>

          <div className="space-y-2 mb-6">
            <p className="text-[11px] text-neutral-200 uppercase tracking-wider">
              {t("login.activeSessions")} ({deviceLimit.active_sessions.length}/{deviceLimit.max_devices})
            </p>
            {deviceLimit.active_sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between bg-black rounded-lg p-3 border border-border"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">
                    {session.device_name}
                    {session.app_version && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-mono align-middle">
                        {session.app_platform || "app"} v{session.app_version}
                      </span>
                    )}
                  </p>
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
                  {t("login.close")}
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => setDeviceLimit(null)}
            className="w-full text-neutral-400 hover:text-white text-sm py-2 transition-colors"
          >
            {t("login.backToLogin")}
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
          <div className="inline-flex items-center gap-0 mb-2">
            <span className="text-4xl font-bold text-white">BB</span>
            <span className="text-4xl font-bold text-accent">N</span>
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-white">
            BOXBOX<span className="text-accent">NOW</span>
          </h1>
          <p className="text-neutral-400 text-xs tracking-widest mt-1 uppercase">Race Strategy</p>
        </div>

        <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border">
          <form onSubmit={handleLogin} className="space-y-5">
            {!mfaRequired ? (
              <>
                <div>
                  <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">{t("login.username")}</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700"
                    placeholder={t("login.username").toLowerCase()}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">{t("login.password")}</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-black border border-border rounded-lg px-4 py-3 pr-11 text-sm text-white placeholder-neutral-700"
                      placeholder={t("login.password").toLowerCase()}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      tabIndex={-1}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      {showPassword ? (
                        // eye-slash
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                        </svg>
                      ) : (
                        // eye
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
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
                  <p className="text-sm text-neutral-300">{t("login.mfaPrompt")}</p>
                </div>
                <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">{t("login.mfaCode")}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 text-center font-mono text-lg tracking-[0.5em]"
                  placeholder="000000"
                  autoFocus
                />
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !username || !password || (mfaRequired && mfaCode.length !== 6)}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
            >
              {loading ? t("login.entering") : mfaRequired ? t("login.verify") : t("login.enter")}
            </button>

            {mfaRequired && (
              <button
                type="button"
                onClick={() => { setMfaRequired(false); setMfaCode(""); setError(""); }}
                className="w-full text-neutral-400 hover:text-white text-sm py-2 transition-colors"
              >
                {t("login.backToLogin")}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
