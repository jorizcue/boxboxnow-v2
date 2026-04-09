"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";

export function MfaSetup() {
  const t = useT();
  const { user, setAuth, token, sessionToken } = useAuth();
  const mfaEnabled = user?.mfa_enabled ?? false;

  const [step, setStep] = useState<"idle" | "setup" | "disable">("idle");
  const [qrBase64, setQrBase64] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      setError(t("mfa.setupError"));
    }
    setLoading(false);
  };

  const verifyAndEnable = async () => {
    setLoading(true);
    setError("");
    try {
      await api.mfaVerify(code);
      setSuccess(t("mfa.successEnabled"));
      setStep("idle");
      setCode("");
      setQrBase64("");
      setSecret("");
      // Update user state
      if (user && token && sessionToken) {
        setAuth(token, sessionToken, { ...user, mfa_enabled: true });
      }
    } catch {
      setError(t("mfa.verifyError"));
      setCode("");
    }
    setLoading(false);
  };

  const disableMfa = async () => {
    setLoading(true);
    setError("");
    try {
      await api.mfaDisable(code);
      setSuccess(t("mfa.successDisabled"));
      setStep("idle");
      setCode("");
      if (user && token && sessionToken) {
        setAuth(token, sessionToken, { ...user, mfa_enabled: false });
      }
    } catch {
      setError(t("mfa.disableError"));
      setCode("");
    }
    setLoading(false);
  };

  const cancel = () => {
    setStep("idle");
    setCode("");
    setError("");
    setQrBase64("");
    setSecret("");
  };

  return (
    <div className="bg-white/[0.03] rounded-xl border border-border p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <h3 className="text-[11px] text-neutral-200 uppercase tracking-wider font-bold">{t("mfa.title")}</h3>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-medium ${
            mfaEnabled
              ? "bg-green-500/15 text-green-400"
              : "bg-neutral-500/15 text-neutral-400"
          }`}
        >
          {mfaEnabled ? t("mfa.enabled") : t("mfa.disabled")}
        </span>
      </div>

      <p className="text-xs text-neutral-400 mb-4">{t("mfa.description")}</p>

      {/* Success message */}
      {success && (
        <div className="mb-3 p-2 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400">
          {success}
        </div>
      )}

      {/* Idle state */}
      {step === "idle" && (
        <button
          onClick={mfaEnabled ? () => { setStep("disable"); setSuccess(""); } : () => { startSetup(); setSuccess(""); }}
          disabled={loading}
          className={`w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
            mfaEnabled
              ? "bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-500/20"
              : "bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20"
          }`}
        >
          {loading ? "..." : mfaEnabled ? t("mfa.disable") : t("mfa.enable")}
        </button>
      )}

      {/* Setup flow: show QR + verify */}
      {step === "setup" && (
        <div className="space-y-4">
          <p className="text-xs text-neutral-300">{t("mfa.step1")}</p>

          {qrBase64 && (
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-lg">
                <img src={qrBase64} alt="MFA QR Code" className="w-40 h-40" />
              </div>
            </div>
          )}

          {secret && (
            <div className="bg-black/50 rounded-lg p-2.5 border border-border">
              <p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">{t("mfa.manualKey")}</p>
              <p className="text-xs font-mono text-white break-all select-all">{secret}</p>
            </div>
          )}

          <p className="text-xs text-neutral-300">{t("mfa.step2")}</p>

          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 text-center font-mono text-lg tracking-[0.5em]"
            placeholder="000000"
            autoFocus
          />

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={cancel}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              {t("mfa.cancel")}
            </button>
            <button
              onClick={verifyAndEnable}
              disabled={loading || code.length !== 6}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-accent hover:bg-accent-hover disabled:opacity-40 text-black transition-colors"
            >
              {loading ? "..." : t("mfa.verifyAndEnable")}
            </button>
          </div>
        </div>
      )}

      {/* Disable flow: ask for code */}
      {step === "disable" && (
        <div className="space-y-4">
          <p className="text-xs text-neutral-300">{t("mfa.enterCodeToDisable")}</p>

          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 text-center font-mono text-lg tracking-[0.5em]"
            placeholder="000000"
            autoFocus
          />

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={cancel}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              {t("mfa.cancel")}
            </button>
            <button
              onClick={disableMfa}
              disabled={loading || code.length !== 6}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-red-900/50 hover:bg-red-800 disabled:opacity-40 text-red-300 transition-colors"
            >
              {loading ? "..." : t("mfa.confirmDisable")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
