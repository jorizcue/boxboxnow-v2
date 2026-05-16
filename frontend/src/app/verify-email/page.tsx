"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

type Status = "loading" | "success" | "already" | "error";

function VerifyEmailForm() {
  const t = useT();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<Status>("loading");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.verifyEmail(token);
        if (cancelled) return;
        setStatus(res.alreadyVerified ? "already" : "success");
      } catch {
        // Backend returns 400 "Enlace inválido o expirado" for a bad or
        // expired token — surface the invalid/expired state with a resend.
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;
    setResending(true);
    try {
      // Anti-enumeration: always 200; we show the generic message.
      await api.resendVerification(resendEmail);
    } catch {
      // Endpoint is generic-success by contract; ignore transport errors
      // and still show the neutral confirmation.
    }
    setResent(true);
    setResending(false);
  };

  return (
    <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border">
      {status === "loading" && (
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-accent animate-spin" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </div>
          <p className="text-neutral-400 text-sm">{t("verify.loading")}</p>
        </div>
      )}

      {(status === "success" || status === "already") && (
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            {status === "already" ? t("verify.alreadyTitle") : t("verify.successTitle")}
          </h2>
          <p className="text-neutral-400 text-sm mb-6">
            {status === "already" ? t("verify.alreadyText") : t("verify.successText")}
          </p>
          <Link
            href="/login"
            className="block w-full bg-accent hover:bg-accent-hover text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
          >
            {t("verify.goToLogin")}
          </Link>
        </div>
      )}

      {status === "error" && (
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">{t("verify.errorTitle")}</h2>
          <p className="text-neutral-400 text-sm mb-6">
            {token ? t("verify.errorText") : t("verify.missingToken")}
          </p>

          {resent ? (
            <p className="text-accent text-sm">{t("verify.resentText")}</p>
          ) : (
            <form onSubmit={handleResend} className="space-y-4 text-left">
              <div>
                <label className="block text-[11px] text-neutral-200 mb-1.5 uppercase tracking-wider">
                  Email
                </label>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  className="w-full bg-black border border-border rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-700 focus:outline-none focus:border-accent/50 transition-colors"
                  placeholder={t("verify.emailPlaceholder")}
                  required
                  autoFocus
                  autoComplete="email"
                />
              </div>
              <button
                type="submit"
                disabled={resending || !resendEmail}
                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
              >
                {resending ? t("verify.resending") : t("verify.resendLink")}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  const t = useT();
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
        </div>

        <Suspense fallback={
          <div className="bg-surface rounded-2xl p-5 sm:p-8 border border-border text-center">
            <span className="text-neutral-400 text-sm">{t("verify.loading")}</span>
          </div>
        }>
          <VerifyEmailForm />
        </Suspense>

        <div className="mt-6 text-center">
          <Link href="/login" className="inline-block text-sm text-neutral-500 hover:text-neutral-300 transition-colors">
            &larr; {t("verify.backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
