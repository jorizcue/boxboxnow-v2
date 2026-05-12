"use client";

import { useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout as StripeEmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { api } from "@/lib/api";

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
  const fetchClientSecret = useCallback(async () => {
    const data = await api.createCheckoutSession("", circuitIds, plan, eventDates);
    return data.client_secret;
  }, [plan, circuitIds, eventDates]);

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

        {/* Stripe Embedded Checkout */}
        <div className="rounded-2xl overflow-hidden border border-border">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ fetchClientSecret }}
          >
            <StripeEmbeddedCheckout className="stripe-checkout" />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    </div>
  );
}
