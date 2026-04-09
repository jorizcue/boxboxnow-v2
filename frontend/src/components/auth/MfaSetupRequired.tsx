"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/**
 * Full-screen mandatory MFA setup page.
 * Shown when admin has set mfa_required=true but user hasn't configured MFA yet.
 */
export function MfaSetupRequired() {
  const { user, setAuth, token, sessionToken, logout } = useAuth();

  const [step, setStep] = useState<"intro" | "setup" | "verify">("intro");
  const [qrBase64, setQrBase64] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const startSetup = async () => {
    setLoading(true);
    setError("");
    try {
      const setupData = await api.mfaSetup();
      setSecret(setupData.secret);
      const qrData = await api.mfaGetQr();
      setQrBase64(qrData.qr_base64);
      setStep("setup");
    } catch {
      setError("Error al iniciar la configuración MFA");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      await api.mfaVerify(code);
      // Update user in auth store
      if (user && token && sessionToken) {
        setAuth(token, sessionToken, { ...user, mfa_enabled: true });
      }
    } catch {
      setError("Código incorrecto. Inténtalo de nuevo.");
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <span className="text-2xl font-black">
            <span className="text-white">BOXBOX</span>
            <span className="text-accent">NOW</span>
          </span>
        </div>

        <div className="bg-neutral-900 border border-border rounded-xl p-6 space-y-5">
          {step === "intro" && (
            <>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-500/15 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-white font-bold text-lg">Configuración MFA obligatoria</h2>
                  <p className="text-neutral-400 text-sm">Tu administrador requiere autenticación de dos factores</p>
                </div>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-300/90 space-y-2">
                <p>Para acceder a la aplicación necesitas configurar MFA usando una app de autenticación como:</p>
                <ul className="list-disc list-inside space-y-1 text-yellow-300/70 text-xs">
                  <li>Google Authenticator</li>
                  <li>Microsoft Authenticator</li>
                  <li>Authy</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={startSetup}
                  disabled={loading}
                  className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-black font-bold py-2.5 rounded-lg transition-colors"
                >
                  {loading ? "Preparando..." : "Configurar MFA"}
                </button>
                <button
                  onClick={logout}
                  className="px-4 py-2.5 rounded-lg border border-border text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors text-sm"
                >
                  Cerrar sesión
                </button>
              </div>
            </>
          )}

          {step === "setup" && (
            <>
              <h2 className="text-white font-bold text-lg">Escanea el código QR</h2>
              <p className="text-neutral-400 text-sm">Abre tu app de autenticación y escanea este código:</p>

              {qrBase64 && (
                <div className="flex justify-center py-2">
                  <img src={qrBase64} alt="QR Code" className="w-48 h-48 rounded-lg bg-white p-2" />
                </div>
              )}

              <details className="text-xs">
                <summary className="text-neutral-500 cursor-pointer hover:text-neutral-300 transition-colors">
                  Entrada manual
                </summary>
                <code className="block mt-2 bg-black p-2 rounded text-cyan-400 break-all select-all">
                  {secret}
                </code>
              </details>

              <button
                onClick={() => setStep("verify")}
                className="w-full bg-accent hover:bg-accent-hover text-black font-bold py-2.5 rounded-lg transition-colors"
              >
                Ya lo escaneé
              </button>
            </>
          )}

          {step === "verify" && (
            <>
              <h2 className="text-white font-bold text-lg">Verifica el código</h2>
              <p className="text-neutral-400 text-sm">
                Introduce el código de 6 dígitos que muestra tu app de autenticación:
              </p>

              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full text-center text-3xl font-mono font-bold tracking-[0.5em] bg-black border border-border rounded-lg p-4 text-white placeholder-neutral-700 focus:border-accent focus:outline-none"
                autoFocus
              />

              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}

              <button
                onClick={verifyCode}
                disabled={code.length !== 6 || loading}
                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-black font-bold py-2.5 rounded-lg transition-colors"
              >
                {loading ? "Verificando..." : "Verificar y activar"}
              </button>

              <button
                onClick={() => { setStep("setup"); setCode(""); setError(""); }}
                className="w-full text-neutral-500 hover:text-neutral-300 text-sm py-1 transition-colors"
              >
                Volver al QR
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
