"use client";

import { Navbar } from "@/components/landing/Navbar";
import { PricingToggle } from "@/components/landing/PricingToggle";
import { FeatureComparisonTable } from "@/components/landing/FeatureComparisonTable";
import { LiveTicker } from "@/components/landing/LiveTicker";
import { MiniRaceTable } from "@/components/landing/MiniRaceTable";
import { TrialCTA, TrialSubtitle } from "@/components/landing/TrialCTA";

const features = [
  {
    title: "Posiciones en tiempo real",
    desc: "Sigue cada kart en pista con actualizaciones al instante. Posición, vueltas, gaps e intervalos.",
    stat: "LIVE",
    statLabel: "tiempo real",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: "Gestión de boxes",
    desc: "Cola inteligente, mapa de calor del box y análisis de tiempos de pit para clavar cada parada.",
    stat: "BOX",
    statLabel: "estrategia de paradas",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
      </svg>
    ),
  },
  {
    title: "Clasificación ajustada",
    desc: "Algoritmo propio que calcula posiciones reales considerando paradas y bonificaciones.",
    stat: "PRO",
    statLabel: "precisión",
    soon: true,
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    title: "App móvil nativa",
    desc: "Apps nativas iOS y Android para el piloto: siguiente stint, tiempos objetivo y estado del equipo.",
    stat: "APP",
    statLabel: "iOS y Android",
    soon: true,
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
  },
  {
    title: "Análisis de karts",
    desc: "Historial de rendimiento por kart, rankings de velocidad y detección de outliers.",
    stat: "+200",
    statLabel: "métricas",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: "GPS Insights",
    desc: "Telemetría GPS con comparativa de vueltas, velocidad en curva y fuerzas G.",
    stat: "50 Hz",
    statLabel: "RaceBox",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
  },
  {
    title: "Replay de carreras",
    desc: "Revive cualquier carrera con todos los datos en vivo para estudiar y afinar tu estrategia.",
    stat: "REPLAY",
    statLabel: "estudio de estrategia",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
  },
  {
    title: "Compatible con tu circuito",
    desc: "Compatible con el cronometraje en vivo (live timing) de más de 30 circuitos.",
    stat: "30+",
    statLabel: "circuitos",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
  },
];

// The pains a karting endurance team has to answer on the wall, in
// seconds (source: marketing brief §2). Replaces the old generic
// "listo en 3 pasos" — leading with the real problem converts better.
const problems = [
  "¿Cuánto lleva mi piloto en pista?",
  "¿Cuándo abre mi ventana de pit?",
  "¿Cuántas vueltas quedan antes del stint máximo?",
  "¿Qué karts entran a box en los próximos 2 minutos?",
  "¿Estamos cumpliendo el tiempo mínimo de piloto?",
  "¿Qué tiempo hace mi piloto frente a la media del campo?",
  "¿Cuál es el kart más rápido hoy?",
];

const circuits = [
  "Karting Los Santos",
  "Ariza Racing Circuit",
  "Karting Cabanillas",
  "RKC Paris",
  "Campillos Kart",
];

const demoHighlights = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    text: "Actualización en tiempo real",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
    text: "Más de 30 métricas calculadas en tiempo real",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
    text: "Detección automática de pit stops",
  },
];

export function MarketingHome() {
  return (
    <div className="noise-bg min-h-screen bg-black text-white overflow-clip">
      <Navbar />

      {/* ===== HERO ===== */}
      <section className="relative flex min-h-screen items-center justify-center px-6 overflow-hidden">
        {/* Speed lines background — reduced to 5 */}
        <div className="pointer-events-none absolute inset-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="speed-line absolute"
              style={{
                top: `${15 + i * 16}%`,
                width: `${220 + i * 100}px`,
                animationDuration: `${4.5 + i * 1.5}s`,
                animationDelay: `${i * 0.9}s`,
              }}
            />
          ))}
          {/* Radial fade */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#000_75%)]" />
          {/* Bottom gradient for section transition */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-5xl text-center">
          <div className="animate-fade-in-up mb-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5 text-xs font-medium text-accent tracking-wide">
              <span className="led-dot" />
              Usado por equipos en circuitos de España y Europa
            </span>
          </div>

          <h1 className="animate-fade-in-up text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl" style={{ animationDelay: "0.08s" }}>
            Estrategia de karting{" "}
            <span className="block text-4xl font-black sm:text-7xl lg:text-[5.5rem] mt-1 bg-gradient-to-r from-accent via-accent-hover to-accent bg-clip-text text-transparent">
              en tiempo real
            </span>
          </h1>

          <p
            className="animate-fade-in-up mx-auto mt-8 max-w-xl text-sm text-neutral-400 sm:text-lg sm:max-w-2xl leading-relaxed"
            style={{ animationDelay: "0.25s" }}
          >
            Monitoriza posiciones, optimiza paradas en boxes y toma decisiones
            estratégicas con datos en vivo. La herramienta que usan los equipos
            profesionales de endurance.
          </p>

          {/* Live ticker */}
          <div className="animate-fade-in-up mt-8" style={{ animationDelay: "0.35s" }}>
            <LiveTicker />
          </div>

          <div
            className="animate-fade-in-up mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
            style={{ animationDelay: "0.45s" }}
          >
            <TrialCTA
              className="glow-pulse rounded-xl bg-accent px-10 py-4 text-base font-bold text-black hover:bg-accent-hover transition-all duration-300 hover:scale-[1.03]"
              variant="hero"
            />
            <a
              href="#demo"
              className="group rounded-xl border border-border/60 px-8 py-4 text-base font-medium text-neutral-400 hover:border-accent/40 hover:text-white transition-all duration-300"
            >
              Ver en acción
              <span className="inline-block ml-2 transition-transform group-hover:translate-x-1">&rarr;</span>
            </a>
          </div>
        </div>
      </section>

      {/* ===== TRUST / MARQUEE ===== */}
      <section className="relative border-y border-border/50 bg-surface/20 py-5 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#000_0%,transparent_10%,transparent_90%,#000_100%)] z-10 pointer-events-none" />
        <div className="flex items-center overflow-hidden">
          <div className="marquee-track flex shrink-0 items-center gap-12">
            {[...circuits, ...circuits].map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="flex items-center gap-3 text-sm font-medium text-neutral-500 whitespace-nowrap uppercase tracking-widest"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent/50" />
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES — 8-card grid ===== */}
      <section id="funcionalidades" className="py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
              Funcionalidades
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl leading-tight">
              Todo lo que necesitas{" "}
              <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
                para ganar
              </span>
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="group gradient-border p-6 transition-all duration-300 hover:-translate-y-1 relative"
              >
                {f.soon && (
                  <span className="absolute top-4 right-4 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[9px] font-bold text-amber-300 uppercase tracking-wider">
                    Próximamente
                  </span>
                )}
                {/* Icon + Stat row */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      {f.icon}
                    </div>
                    <div>
                      <span className="stat-number text-2xl font-bold text-accent leading-none">
                        {f.stat}
                      </span>
                      <p className="text-[10px] uppercase tracking-widest text-neutral-500 mt-0.5">
                        {f.statLabel}
                      </p>
                    </div>
                  </div>
                </div>

                <h3 className="text-base font-semibold text-white mb-2">
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed text-neutral-500">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== THE PROBLEM WE SOLVE ===== */}
      <section className="relative py-14 sm:py-20 overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(159,229,86,0.03)_0%,transparent_50%)]" />

        <div className="relative mx-auto max-w-5xl px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
              El problema
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl leading-tight">
              Lo que tu equipo necesita saber{" "}
              <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
                en segundos
              </span>
            </h2>
            <p className="mt-4 text-neutral-500 max-w-2xl mx-auto">
              El karting de resistencia se decide en el muro. Hoy se resuelve con
              cronómetro de pulsera, hojas de Excel, walkie-talkies y pizarras.
              BoxBoxNow te lo responde en tiempo real.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {problems.map((q) => (
              <div
                key={q}
                className="flex items-start gap-3 rounded-xl border border-border/50 bg-surface/40 px-5 py-4 transition-colors hover:border-accent/30"
              >
                <svg
                  className="mt-0.5 h-5 w-5 shrink-0 text-accent"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-neutral-300">{q}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== LIVE DEMO (Mini Race Table) ===== */}
      <section id="demo" className="py-14 sm:py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
              Demo en vivo
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl">
              Míralo en{" "}
              <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
                acción
              </span>
            </h2>
            <p className="mt-4 text-neutral-500 max-w-lg mx-auto">
              Datos actualizándose en tiempo real, como en una carrera de verdad.
            </p>
          </div>

          {/* Browser mockup */}
          <div className="gradient-border overflow-hidden shadow-[0_0_80px_rgba(159,229,86,0.05)]">
            {/* Title bar */}
            <div className="flex items-center gap-2 bg-black/60 px-4 py-3 border-b border-border/50">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-4 font-mono text-[11px] text-neutral-600">app.boxboxnow.com/race</span>
            </div>
            {/* Content: animated mini race table */}
            <div className="bg-black/40 p-0">
              <MiniRaceTable />
            </div>
          </div>

          {/* Demo highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            {demoHighlights.map((h) => (
              <div key={h.text} className="flex items-center gap-3 rounded-xl bg-surface/50 border border-border/50 px-4 py-3">
                <div className="text-accent/70">{h.icon}</div>
                <span className="text-sm text-neutral-400">{h.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section
        id="precios"
        className="relative py-14 sm:py-20 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(159,229,86,0.03)_0%,transparent_50%)]" />

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
              Precios
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl">
              Planes simples, sin sorpresas
            </h2>
            <p className="mt-4 text-neutral-500">
              Elige el plan que mejor se adapte a tu equipo. Sin permanencia.
            </p>
          </div>
          <PricingToggle />
          <FeatureComparisonTable />
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        {/* Mesh gradient background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(159,229,86,0.06)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(159,229,86,0.04)_0%,transparent_50%)]" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl leading-tight">
            ¿Listo para llevar tu estrategia al{" "}
            <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
              siguiente nivel
            </span>
            ?
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg text-neutral-500">
            Descubre cómo BoxBoxNow puede transformar tu estrategia de carrera.
          </p>
          <TrialCTA
            className="glow-pulse mt-10 inline-block rounded-xl bg-accent px-12 py-4 text-base font-bold text-black hover:bg-accent-hover transition-all duration-300 hover:scale-[1.03]"
            variant="bottom"
          />
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-border/50 bg-black py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col gap-10 lg:flex-row lg:justify-between lg:items-start">
            {/* Logo + desc */}
            <div className="max-w-xs">
              <a href="/" className="text-xl font-bold text-white tracking-tight">
                BOXBOX<span className="text-accent">NOW</span>
              </a>
              <p className="mt-3 text-sm text-neutral-500 leading-relaxed">
                Estrategia de karting en tiempo real para equipos de endurance.
              </p>
              <p className="mt-2 text-xs text-neutral-600">
                Hecho en España
              </p>
            </div>

            {/* Links */}
            <div className="flex gap-16 text-sm">
              <div>
                <h4 className="font-semibold text-neutral-400 mb-3">Producto</h4>
                <ul className="space-y-2">
                  <li><a href="#funcionalidades" className="text-neutral-500 hover:text-accent transition-colors">Funcionalidades</a></li>
                  <li><a href="#precios" className="text-neutral-500 hover:text-accent transition-colors">Precios</a></li>
                  <li><a href="#demo" className="text-neutral-500 hover:text-accent transition-colors">Demo</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-neutral-400 mb-3">Legal</h4>
                <ul className="space-y-2">
                  <li><a href="/terminos" className="text-neutral-500 hover:text-accent transition-colors">Términos</a></li>
                  <li><a href="/privacidad" className="text-neutral-500 hover:text-accent transition-colors">Privacidad</a></li>
                  <li><a href="/cookies" className="text-neutral-500 hover:text-accent transition-colors">Cookies</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-neutral-400 mb-3">Contacto</h4>
                <ul className="space-y-2">
                  <li><a href="mailto:info@kartingnow.com" className="text-neutral-500 hover:text-accent transition-colors">info@kartingnow.com</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-border/30 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-neutral-600">
              &copy; 2026 BoxBoxNow. Todos los derechos reservados.
            </p>
            <p className="font-mono text-[10px] text-neutral-700 tracking-wider">
              BUILT FOR SPEED
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
