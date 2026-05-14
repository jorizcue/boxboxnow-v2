"use client";

import { useCallback, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout as StripeEmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { api } from "@/lib/api";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
);

/**
 * Embedded Stripe checkout with an interstitial "¿factura o recibo?"
 * step. Stripe's native `custom_fields` dropdown can ASK the question
 * inside the checkout but can't conditionally REQUIRE the billing
 * address + tax-id fields based on the answer — they always stay as
 * an optional collapsible. So a user who answered "Sí, necesito
 * factura" could still pay without entering NIF/dirección and end
 * up with a recibo simplificado, which is exactly the bug the user
 * reported. Asking first lets us pass different parameters to Stripe
 * (billing_address_collection=required when factura is requested).
 */
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
  // null = haven't asked yet, true = needs factura (with NIF +
  // dirección obligatorios), false = solo recibo simplificado.
  const [wantsInvoice, setWantsInvoice] = useState<boolean | null>(null);

  const fetchClientSecret = useCallback(async () => {
    const data = await api.createCheckoutSession(
      "",
      circuitIds,
      plan,
      eventDates,
      // wantsInvoice is guaranteed non-null at this point because the
      // <EmbeddedCheckoutProvider> only renders once the user has
      // picked an option in the interstitial below.
      wantsInvoice ?? false,
    );
    return data.client_secret;
  }, [plan, circuitIds, eventDates, wantsInvoice]);

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

        {wantsInvoice === null ? (
          <InvoiceChoice
            onChoice={(yes) => setWantsInvoice(yes)}
            onCancel={onCancel}
          />
        ) : (
          // Stripe Embedded Checkout — the wantsInvoice flag is sent in
          // the body of the createCheckoutSession call, which configures
          // Stripe's billing_address_collection + tax_id_collection
          // accordingly.
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

/**
 * Interstitial card that asks the buyer whether they need a tax
 * invoice. Two big buttons — no dropdown — because each choice is a
 * one-click decision and the consequences are different (filling
 * fiscal data vs. paying with just card). Copy explains the
 * difference legally (recibo no sirve para deducir IVA).
 */
function InvoiceChoice({
  onChoice,
  onCancel,
}: {
  onChoice: (wantsInvoice: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">
          ¿Necesitas factura con datos fiscales?
        </h2>
        <p className="text-sm text-neutral-400 leading-relaxed">
          Por defecto generamos un recibo simplificado del cobro.
          Si necesitas factura legal (para deducir IVA o gastos de
          empresa), tendrás que rellenar nombre fiscal, dirección y
          NIF en el siguiente paso.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        <button
          onClick={() => onChoice(false)}
          className="text-left rounded-xl border border-border bg-black/40 hover:border-accent/50 hover:bg-black/60 transition-colors p-4 group"
        >
          <div className="flex items-start gap-3">
            <span className="text-accent text-lg">●</span>
            <div className="flex-1">
              <div className="text-white font-semibold text-sm">
                No, solo recibo
              </div>
              <div className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                Pago rápido. Recibirás un recibo simplificado del cobro
                por email. No sirve para deducir IVA.
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => onChoice(true)}
          className="text-left rounded-xl border border-border bg-black/40 hover:border-accent/50 hover:bg-black/60 transition-colors p-4 group"
        >
          <div className="flex items-start gap-3">
            <span className="text-accent text-lg">●</span>
            <div className="flex-1">
              <div className="text-white font-semibold text-sm">
                Sí, necesito factura
              </div>
              <div className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                En el siguiente paso te pediremos nombre fiscal,
                dirección y NIF / CIF / VAT-UE de manera obligatoria.
              </div>
            </div>
          </div>
        </button>
      </div>

      <button
        onClick={onCancel}
        className="w-full text-xs text-neutral-500 hover:text-white pt-1 transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}
