"use client";

import { useState, useEffect, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { api } from "@/lib/api";
import { useConfirm } from "@/components/shared/ConfirmDialog";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
);

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

const BRAND_ICONS: Record<string, string> = {
  visa: "VISA",
  mastercard: "MC",
  amex: "AMEX",
  discover: "DISC",
};

function CardIcon({ brand }: { brand: string }) {
  return (
    <span className="inline-flex items-center justify-center w-12 h-7 rounded bg-white/10 text-[10px] font-bold tracking-wider text-neutral-300 uppercase">
      {BRAND_ICONS[brand] || brand}
    </span>
  );
}

/** Inner form that uses Stripe hooks (must be inside <Elements>) */
function AddCardForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    const { error: submitError } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (submitError) {
      setError(submitError.message || "Error al guardar la tarjeta");
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-border text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!stripe || loading}
          className="flex-1 py-2.5 text-sm font-semibold rounded-lg bg-accent hover:bg-accent-hover text-black transition-colors disabled:opacity-50"
        >
          {loading ? "Guardando..." : "Guardar tarjeta"}
        </button>
      </div>
    </form>
  );
}

export function PaymentMethodsPanel() {
  const confirm = useConfirm();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const loadMethods = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPaymentMethods();
      setMethods(data.methods);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMethods(); }, [loadMethods]);

  const handleAddCard = async () => {
    try {
      const data = await api.createSetupIntent();
      setClientSecret(data.client_secret);
      setShowAddForm(true);
    } catch {
      alert("Error al iniciar el formulario de pago");
    }
  };

  const handleAddSuccess = () => {
    setShowAddForm(false);
    setClientSecret(null);
    loadMethods();
  };

  const handleSetDefault = async (pmId: string) => {
    setActionLoading(pmId);
    try {
      await api.setDefaultPaymentMethod(pmId);
      await loadMethods();
    } catch {
      alert("Error al establecer como predeterminado");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (pm: PaymentMethod) => {
    const ok = await confirm({
      title: "Eliminar tarjeta",
      message: `Eliminar la tarjeta ${pm.brand.toUpperCase()} terminada en ${pm.last4}?`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      danger: true,
    });
    if (!ok) return;
    setActionLoading(pm.id);
    try {
      await api.deletePaymentMethod(pm.id);
      await loadMethods();
    } catch {
      alert("Error al eliminar la tarjeta");
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Card list */}
      {methods.length === 0 && !showAddForm ? (
        <div className="bg-surface border border-border rounded-xl p-6 text-center">
          <svg className="w-8 h-8 mx-auto text-neutral-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
          </svg>
          <p className="text-neutral-400 text-sm">No tienes métodos de pago guardados</p>
        </div>
      ) : (
        <div className="space-y-2">
          {methods.map((pm) => (
            <div
              key={pm.id}
              className={`bg-surface border rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${
                pm.is_default ? "border-accent/40" : "border-border"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <CardIcon brand={pm.brand} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-mono">
                      ····  {pm.last4}
                    </span>
                    {pm.is_default && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-accent/15 text-accent border border-accent/30">
                        Principal
                      </span>
                    )}
                  </div>
                  <span className="text-neutral-500 text-xs">
                    {String(pm.exp_month).padStart(2, "0")}/{pm.exp_year}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!pm.is_default && (
                  <button
                    onClick={() => handleSetDefault(pm.id)}
                    disabled={actionLoading === pm.id}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-border text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-50"
                    title="Usar como predeterminada"
                  >
                    {actionLoading === pm.id ? "..." : "Principal"}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(pm)}
                  disabled={actionLoading === pm.id}
                  className="p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  title="Eliminar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add card form (Stripe Elements) */}
      {showAddForm && clientSecret ? (
        <div className="bg-surface border border-border rounded-xl p-5">
          <h4 className="text-white text-sm font-semibold mb-4">Añadir tarjeta</h4>
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "night",
                variables: {
                  colorPrimary: "#9fe556",
                  colorBackground: "#1a1a1a",
                  colorText: "#e5e5e5",
                  colorTextSecondary: "#737373",
                  colorDanger: "#ef4444",
                  fontFamily: "Outfit, sans-serif",
                  borderRadius: "8px",
                },
                rules: {
                  ".Input": {
                    border: "1px solid #2a2a2a",
                    boxShadow: "none",
                  },
                  ".Input:focus": {
                    border: "1px solid #9fe556",
                    boxShadow: "0 0 0 1px rgba(159, 229, 86, 0.3)",
                  },
                  ".Label": {
                    color: "#a3a3a3",
                    fontSize: "12px",
                    fontWeight: "500",
                  },
                  ".Tab": {
                    border: "1px solid #2a2a2a",
                    backgroundColor: "#0a0a0a",
                  },
                  ".Tab:hover": {
                    backgroundColor: "#1a1a1a",
                  },
                  ".Tab--selected": {
                    border: "1px solid #9fe556",
                    backgroundColor: "rgba(159, 229, 86, 0.1)",
                  },
                },
              },
            }}
          >
            <AddCardForm
              onSuccess={handleAddSuccess}
              onCancel={() => { setShowAddForm(false); setClientSecret(null); }}
            />
          </Elements>
        </div>
      ) : (
        <button
          onClick={handleAddCard}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-xl border border-dashed border-border text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Añadir método de pago
        </button>
      )}
    </div>
  );
}
