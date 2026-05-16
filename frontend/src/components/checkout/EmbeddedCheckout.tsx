"use client";

import { useCallback, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout as StripeEmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
);

export function EmbeddedCheckout({
  plan,
  circuitIds,
  eventDates,
  onCancel,
}: {
  plan: string;
  /** Full list of circuits the buyer picked. Empty array means the plan
   *  is cross-circuit (per_circuit=false) and grants every circuit at
   *  once. Single-circuit purchases pass a one-element array — the
   *  backend still accepts the legacy `circuit_id` field too. */
  circuitIds: number[];
  eventDates?: string[];
  onCancel: () => void;
}) {
  const user = useAuth((s) => s.user);
  // Set when create-checkout-session is rejected with 403
  // email_not_verified — the backend gates purchase until the email is
  // verified. We surface a clear message + resend instead of letting
  // Stripe's provider fail opaquely.
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const fetchClientSecret = useCallback(async () => {
    try {
      const data = await api.createCheckoutSession("", circuitIds, plan, eventDates);
      return data.client_secret;
    } catch (err: any) {
      // fetchApi surfaces FastAPI's `detail` as the Error message, so a
      // 403 {"detail":"email_not_verified"} arrives as exactly that string.
      if (typeof err?.message === "string" && err.message.includes("email_not_verified")) {
        setEmailNotVerified(true);
      }
      throw err;
    }
  }, [plan, circuitIds, eventDates]);

  const handleResend = async () => {
    if (!user?.email) return;
    setResending(true);
    try {
      await api.resendVerification(user.email);
    } catch {
      // resend-verification is generic-success by contract.
    }
    setResent(true);
    setResending(false);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-0">
            <span className="text-2xl font-bold text-white">BB</span>
            <span className="text-2xl font-bold text-accent">N</span>
          </div>
          <button
            onClick={onCancel}
            className="text-neutral-400 hover:text-white text-sm transition-colors"
          >
            Cancelar
          </button>
        </div>

        {emailNotVerified ? (
          /* Purchase gate: account not yet verified. */
          <div className="rounded-2xl border border-border bg-surface p-6 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-white text-sm font-medium mb-4">
              Verifica tu correo para poder comprar.
            </p>
            {resent ? (
              <p className="text-accent text-sm">
                Si el correo existe, te hemos enviado un nuevo enlace.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || !user?.email}
                className="w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
              >
                {resending ? "Enviando..." : "Reenviar correo de verificación"}
              </button>
            )}
          </div>
        ) : (
          /* Stripe Embedded Checkout. The "¿factura?" dropdown + the
              collapsible fiscal data section live inside Stripe's own
              form (configured server-side via custom_fields +
              tax_id_collection). */
          <div className="rounded-2xl overflow-hidden border border-border">
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ fetchClientSecret }}
            >
              <StripeEmbeddedCheckout className="stripe-checkout" />
            </EmbeddedCheckoutProvider>
          </div>
        )}
      </div>
    </div>
  );
}
