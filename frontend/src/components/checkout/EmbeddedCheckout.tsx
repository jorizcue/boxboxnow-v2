"use client";

import { useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout as StripeEmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { api } from "@/lib/api";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
);

export function EmbeddedCheckout({
  plan,
  circuitId,
  onCancel,
}: {
  plan: string;
  circuitId: number;
  onCancel: () => void;
}) {
  const fetchClientSecret = useCallback(async () => {
    const data = await api.createCheckoutSession("", circuitId, plan);
    return data.client_secret;
  }, [plan, circuitId]);

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
            <StripeEmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    </div>
  );
}
