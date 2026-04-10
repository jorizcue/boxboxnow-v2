"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface PlanData {
  plan_type: string;
  display_name: string;
  description: string | null;
  features: string[];
  price_monthly: number | null;
  price_annual: number | null;
  is_popular: boolean;
  sort_order: number;
}

// Hardcoded fallback if API is unavailable
const FALLBACK_PLANS: PlanData[] = [
  {
    plan_type: "basic_monthly",
    display_name: "Basico",
    description: null,
    features: [
      "1 circuito incluido",
      "Posiciones en tiempo real",
      "Gestion de boxes",
      "Clasificacion real",
      "Vista de piloto",
      "Hasta 2 dispositivos",
    ],
    price_monthly: 49,
    price_annual: 490,
    is_popular: false,
    sort_order: 1,
  },
  {
    plan_type: "pro_monthly",
    display_name: "Pro",
    description: null,
    features: [
      "1 circuito incluido",
      "Todo en Basico +",
      "Analitica de karts",
      "GPS Insights",
      "Replay de carreras",
      "Hasta 5 dispositivos",
      "Soporte prioritario",
    ],
    price_monthly: 79,
    price_annual: 790,
    is_popular: true,
    sort_order: 2,
  },
  {
    plan_type: "event",
    display_name: "Evento",
    description: null,
    features: [
      "Acceso completo 48h",
      "1 circuito",
      "Todas las funcionalidades",
      "Hasta 3 dispositivos",
      "Sin compromiso",
    ],
    price_monthly: 50,
    price_annual: 50,
    is_popular: false,
    sort_order: 3,
  },
];

/**
 * Group plans by base type for the pricing toggle.
 * Monthly/annual variants of the same base plan show as one card.
 * Event plans have no annual variant.
 */
function groupPlans(raw: PlanData[]): PlanData[] {
  const map = new Map<string, PlanData>();

  for (const p of raw) {
    const base = p.plan_type.replace(/_monthly$/, "").replace(/_annual$/, "");

    if (!map.has(base)) {
      map.set(base, { ...p });
    } else {
      const existing = map.get(base)!;
      if (p.price_monthly != null && existing.price_monthly == null)
        existing.price_monthly = p.price_monthly;
      if (p.price_annual != null && existing.price_annual == null)
        existing.price_annual = p.price_annual;
      if (p.is_popular) existing.is_popular = true;
      if (p.features.length > existing.features.length) existing.features = p.features;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
}

export function PricingToggle() {
  const [annual, setAnnual] = useState(false);
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPlans()
      .then((data) => {
        if (data && data.length > 0) {
          setPlans(groupPlans(data));
        } else {
          setPlans(groupPlans(FALLBACK_PLANS));
        }
      })
      .catch(() => {
        setPlans(groupPlans(FALLBACK_PLANS));
      })
      .finally(() => setLoading(false));
  }, []);

  const isEvent = (p: PlanData) => p.plan_type === "event";

  const planLink = (p: PlanData) => {
    const base = p.plan_type.replace(/_monthly$/, "").replace(/_annual$/, "");
    if (isEvent(p)) return `/register?plan=event`;
    return `/register?plan=${base}${annual ? "_annual" : "_monthly"}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center justify-center gap-4 mb-16">
        <span
          className={`text-sm font-medium transition-colors ${
            !annual ? "text-white" : "text-muted/50"
          }`}
        >
          Mensual
        </span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative h-7 w-14 rounded-full transition-colors ${
            annual ? "bg-accent" : "bg-border"
          }`}
          aria-label="Cambiar entre mensual y anual"
        >
          <span
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform shadow-md ${
              annual ? "translate-x-7" : ""
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium transition-colors ${
            annual ? "text-white" : "text-muted/50"
          }`}
        >
          Anual
        </span>
        {annual && (
          <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent">
            -17%
          </span>
        )}
      </div>

      {/* Cards */}
      <div className={`grid gap-6 max-w-5xl mx-auto ${
        plans.length === 1 ? "md:grid-cols-1 max-w-sm" :
        plans.length === 2 ? "md:grid-cols-2 max-w-3xl" :
        "md:grid-cols-3"
      }`}>
        {plans.map((plan) => (
          <div
            key={plan.plan_type}
            className={`relative rounded-2xl border p-8 transition-all duration-300 hover:-translate-y-1 ${
              plan.is_popular
                ? "border-accent bg-surface shadow-[0_0_40px_rgba(159,229,86,0.1)]"
                : "border-border bg-surface hover:border-border/80"
            }`}
          >
            {plan.is_popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-bold text-black">
                Popular
              </div>
            )}
            <h3 className="text-lg font-semibold text-white mb-2">
              {plan.display_name}
            </h3>
            {plan.description && (
              <p className="text-sm text-muted/50 mb-2">{plan.description}</p>
            )}
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">
                {isEvent(plan)
                  ? `${plan.price_monthly ?? 0}\u20AC`
                  : annual
                  ? `${plan.price_annual ?? 0}\u20AC`
                  : `${plan.price_monthly ?? 0}\u20AC`}
              </span>
              <span className="text-muted/50 ml-1">
                {isEvent(plan) ? "/evento" : annual ? "/ano" : "/mes"}
              </span>
            </div>
            <ul className="mb-8 space-y-3">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-muted/70">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-accent"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={planLink(plan)}
              className={`block w-full rounded-lg py-3 text-center text-sm font-semibold transition-colors ${
                plan.is_popular
                  ? "bg-accent text-black hover:bg-accent-hover"
                  : "border border-border text-white hover:border-accent hover:text-accent"
              }`}
            >
              {isEvent(plan) ? "Comprar evento" : "Empezar ahora"}
            </a>
          </div>
        ))}
      </div>

      {/* Extra notes */}
      <div className="mt-12 text-center space-y-2">
        <p className="text-sm text-muted/50">
          Circuitos adicionales desde 15{"\u20AC"}/mes
        </p>
        <p className="text-sm text-muted/50">
          {"\u00BF"}Eres un circuito?{" "}
          <a
            href="mailto:contacto@boxboxnow.com"
            className="text-accent hover:underline"
          >
            Contacta para planes Enterprise
          </a>
          .
        </p>
      </div>
    </div>
  );
}
