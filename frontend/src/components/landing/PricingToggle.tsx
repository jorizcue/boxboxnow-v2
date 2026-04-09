"use client";

import { useState } from "react";

const plans = [
  {
    name: "Basico",
    monthlyPrice: 49,
    annualPrice: 490,
    period: "/mes",
    annualPeriod: "/ano",
    features: [
      "1 circuito incluido",
      "Posiciones en tiempo real",
      "Gestion de boxes",
      "Clasificacion real",
      "Vista de piloto",
      "Hasta 2 dispositivos",
    ],
    cta: "Empezar ahora",
    href: "/register",
    popular: false,
  },
  {
    name: "Pro",
    monthlyPrice: 79,
    annualPrice: 790,
    period: "/mes",
    annualPeriod: "/ano",
    features: [
      "1 circuito incluido",
      "Todo en Basico +",
      "Analitica de karts",
      "GPS Insights",
      "Replay de carreras",
      "Hasta 5 dispositivos",
      "Soporte prioritario",
    ],
    cta: "Empezar ahora",
    href: "/register",
    popular: true,
  },
  {
    name: "Evento",
    monthlyPrice: 50,
    annualPrice: 50,
    period: "/evento",
    annualPeriod: "/evento",
    isEvent: true,
    features: [
      "Acceso completo 48h",
      "1 circuito",
      "Todas las funcionalidades",
      "Hasta 3 dispositivos",
      "Sin compromiso",
    ],
    cta: "Comprar evento",
    href: "/register",
    popular: false,
  },
];

export function PricingToggle() {
  const [annual, setAnnual] = useState(false);

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
      <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-2xl border p-8 transition-all duration-300 hover:-translate-y-1 ${
              plan.popular
                ? "border-accent bg-surface shadow-[0_0_40px_rgba(159,229,86,0.1)]"
                : "border-border bg-surface hover:border-border/80"
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1 text-xs font-bold text-black">
                Popular
              </div>
            )}
            <h3 className="text-lg font-semibold text-white mb-2">{plan.name}</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">
                {plan.isEvent
                  ? `${plan.monthlyPrice}\u20AC`
                  : annual
                  ? `${plan.annualPrice}\u20AC`
                  : `${plan.monthlyPrice}\u20AC`}
              </span>
              <span className="text-muted/50 ml-1">
                {plan.isEvent
                  ? plan.period
                  : annual
                  ? plan.annualPeriod
                  : plan.period}
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
              href={plan.href}
              className={`block w-full rounded-lg py-3 text-center text-sm font-semibold transition-colors ${
                plan.popular
                  ? "bg-accent text-black hover:bg-accent-hover"
                  : "border border-border text-white hover:border-accent hover:text-accent"
              }`}
            >
              {plan.cta}
            </a>
          </div>
        ))}
      </div>

      {/* Extra notes */}
      <div className="mt-12 text-center space-y-2">
        <p className="text-sm text-muted/50">
          Circuitos adicionales desde 15\u20AC/mes
        </p>
        <p className="text-sm text-muted/50">
          \u00BFEres un circuito?{" "}
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
