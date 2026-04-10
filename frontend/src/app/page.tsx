import { Navbar } from "@/components/landing/Navbar";
import { PricingToggle } from "@/components/landing/PricingToggle";
import { LiveTicker } from "@/components/landing/LiveTicker";
import { MiniRaceTable } from "@/components/landing/MiniRaceTable";

const features = [
  {
    title: "Posiciones en tiempo real",
    desc: "Sigue cada kart en pista con actualizaciones al segundo. Posicion, vueltas, gaps e intervalos.",
    stat: "0.3s",
    statLabel: "latencia",
  },
  {
    title: "Gestion de boxes",
    desc: "Cola FIFO inteligente, prediccion de ventana de parada y analisis de tiempos de pit.",
    stat: "FIFO",
    statLabel: "cola inteligente",
  },
  {
    title: "Clasificacion ajustada",
    desc: "Algoritmo propio que calcula posiciones reales considerando paradas y bonificaciones.",
    stat: "100%",
    statLabel: "precision",
  },
  {
    title: "Vista de piloto",
    desc: "Interfaz optimizada para el piloto: siguiente stint, tiempos objetivo y estado del equipo.",
    stat: "1-TAP",
    statLabel: "acceso rapido",
  },
  {
    title: "Analitica de karts",
    desc: "Historial de rendimiento por kart, rankings de velocidad y deteccion de outliers.",
    stat: "200+",
    statLabel: "metricas",
  },
  {
    title: "GPS Insights",
    desc: "Telemetria GPS con comparativa de vueltas, velocidad en curva y fuerzas G.",
    stat: "10Hz",
    statLabel: "frecuencia GPS",
  },
];

const steps = [
  {
    num: "01",
    title: "Configura tu carrera",
    desc: "Selecciona circuito, duracion, equipos y parametros de stint.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Conecta en tiempo real",
    desc: "Nuestro sistema se conecta al cronometraje del circuito automaticamente.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Toma decisiones",
    desc: "Visualiza datos en vivo y optimiza tu estrategia de paradas.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
];

const circuits = [
  "Karting Los Santos",
  "Ariza Racing Circuit",
  "Karting Cabanillas",
  "RKC Paris",
  "Campillos Kart",
];

export default function LandingPage() {
  return (
    <div className="noise-bg min-h-screen bg-black text-white overflow-clip">
      <Navbar />

      {/* ===== HERO ===== */}
      <section className="relative flex min-h-screen items-center justify-center px-6 overflow-hidden">
        {/* Speed lines background */}
        <div className="pointer-events-none absolute inset-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="speed-line absolute"
              style={{
                top: `${12 + i * 11}%`,
                width: `${200 + i * 80}px`,
                animationDuration: `${4 + i * 1.3}s`,
                animationDelay: `${i * 0.7}s`,
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
              EN VIVO — Equipos compitiendo ahora
            </span>
          </div>

          <h1 className="animate-fade-in-up text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl" style={{ animationDelay: "0.08s" }}>
            Estrategia de karting
          </h1>
          <h1 className="animate-fade-in-up text-4xl font-black leading-[1.1] tracking-tight sm:text-7xl lg:text-[5.5rem]" style={{ animationDelay: "0.15s" }}>
            <span className="bg-gradient-to-r from-accent via-accent-hover to-accent bg-clip-text text-transparent">
              en tiempo real
            </span>
          </h1>

          <p
            className="animate-fade-in-up mx-auto mt-8 max-w-xl text-sm text-muted/50 sm:text-lg sm:max-w-2xl leading-relaxed"
            style={{ animationDelay: "0.25s" }}
          >
            Monitoriza posiciones, optimiza paradas en boxes y toma decisiones
            estrategicas con datos en vivo. La herramienta que usan los equipos
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
            <a
              href="/register"
              className="glow-pulse rounded-xl bg-accent px-10 py-4 text-base font-bold text-black hover:bg-accent-hover transition-all duration-300 hover:scale-[1.03]"
            >
              Empieza gratis — 14 dias
            </a>
            <a
              href="#demo"
              className="group rounded-xl border border-border/60 px-8 py-4 text-base font-medium text-muted/70 hover:border-accent/40 hover:text-white transition-all duration-300"
            >
              Ver en accion
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
                className="flex items-center gap-3 text-sm font-medium text-muted/25 whitespace-nowrap uppercase tracking-widest"
              >
                <span className="h-1 w-1 rounded-full bg-accent/40" />
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="funcionalidades" className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center mb-20">
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="group gradient-border p-6 transition-all duration-300 hover:-translate-y-1"
              >
                {/* Stat */}
                <div className="flex items-end justify-between mb-5">
                  <div>
                    <span className="stat-number text-3xl font-bold text-accent leading-none">
                      {f.stat}
                    </span>
                    <p className="text-[10px] uppercase tracking-widest text-muted/30 mt-1">
                      {f.statLabel}
                    </p>
                  </div>
                  <div className="led-dot opacity-40 group-hover:opacity-100 transition-opacity" />
                </div>

                <h3 className="text-base font-semibold text-white mb-2">
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted/40">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(159,229,86,0.03)_0%,transparent_50%)]" />

        <div className="relative mx-auto max-w-5xl px-6">
          <div className="text-center mb-20">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
              Proceso
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl">
              Listo en 3 pasos
            </h2>
          </div>

          <div className="relative">
            {/* Timeline line */}
            <div className="hidden md:block absolute top-10 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />

            <div className="grid gap-12 md:grid-cols-3 md:gap-8">
              {steps.map((s, i) => (
                <div key={s.num} className="relative text-center group">
                  {/* Step circle */}
                  <div className="relative z-10 mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-accent/20 bg-black/80 backdrop-blur text-accent transition-all duration-300 group-hover:border-accent/50 group-hover:shadow-[0_0_30px_rgba(159,229,86,0.1)]">
                    {s.icon}
                  </div>
                  <span className="stat-number absolute -top-2 -right-2 md:relative md:top-auto md:right-auto inline-block mt-3 text-[11px] font-bold text-accent/40 tracking-wider">
                    {s.num}
                  </span>
                  <h3 className="mt-2 text-lg font-semibold text-white">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted/40 max-w-[280px] mx-auto">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== LIVE DEMO (Mini Race Table) ===== */}
      <section id="demo" className="py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4">
              Demo en vivo
            </p>
            <h2 className="text-3xl font-bold sm:text-4xl">
              Miralo en{" "}
              <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
                accion
              </span>
            </h2>
            <p className="mt-4 text-muted/40 max-w-lg mx-auto">
              Datos actualizandose en tiempo real, como en una carrera de verdad.
            </p>
          </div>

          {/* Browser mockup */}
          <div className="gradient-border overflow-hidden shadow-[0_0_80px_rgba(159,229,86,0.05)]">
            {/* Title bar */}
            <div className="flex items-center gap-2 bg-black/60 px-4 py-3 border-b border-border/50">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-4 font-mono text-[11px] text-muted/20">app.boxboxnow.com/race</span>
            </div>
            {/* Content: animated mini race table */}
            <div className="bg-black/40 p-4 sm:p-8">
              <MiniRaceTable />
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section
        id="precios"
        className="relative py-20 sm:py-28 overflow-hidden"
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
            <p className="mt-4 text-muted/40">
              Elige el plan que mejor se adapte a tu equipo. Sin permanencia.
            </p>
          </div>
          <PricingToggle />
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="relative py-28 sm:py-36 overflow-hidden">
        {/* Mesh gradient background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(159,229,86,0.06)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(159,229,86,0.04)_0%,transparent_50%)]" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl leading-tight">
            &iquest;Listo para llevar tu estrategia al{" "}
            <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
              siguiente nivel
            </span>
            ?
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg text-muted/40">
            Registrate gratis y prueba BoxBoxNow durante 14 dias.
          </p>
          <a
            href="/register"
            className="glow-pulse mt-10 inline-block rounded-xl bg-accent px-12 py-4 text-base font-bold text-black hover:bg-accent-hover transition-all duration-300 hover:scale-[1.03]"
          >
            Crear cuenta gratis
          </a>
          <p className="mt-4 text-xs text-muted/25">Sin tarjeta de credito &middot; Cancela cuando quieras</p>
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
              <p className="mt-3 text-sm text-muted/30 leading-relaxed">
                Estrategia de karting en tiempo real para equipos de endurance.
              </p>
            </div>

            {/* Links */}
            <div className="flex gap-16 text-sm">
              <div>
                <h4 className="font-semibold text-muted/40 mb-3">Producto</h4>
                <ul className="space-y-2">
                  <li><a href="#funcionalidades" className="text-muted/30 hover:text-accent transition-colors">Funcionalidades</a></li>
                  <li><a href="#precios" className="text-muted/30 hover:text-accent transition-colors">Precios</a></li>
                  <li><a href="#demo" className="text-muted/30 hover:text-accent transition-colors">Demo</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-muted/40 mb-3">Legal</h4>
                <ul className="space-y-2">
                  <li><a href="/terminos" className="text-muted/30 hover:text-accent transition-colors">Terminos</a></li>
                  <li><a href="/privacidad" className="text-muted/30 hover:text-accent transition-colors">Privacidad</a></li>
                  <li><a href="/cookies" className="text-muted/30 hover:text-accent transition-colors">Cookies</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-muted/40 mb-3">Contacto</h4>
                <ul className="space-y-2">
                  <li><a href="mailto:contacto@boxboxnow.com" className="text-muted/30 hover:text-accent transition-colors">contacto@boxboxnow.com</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-border/30 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-xs text-muted/20">
              &copy; 2026 BoxBoxNow. Todos los derechos reservados.
            </p>
            <p className="font-mono text-[10px] text-muted/15 tracking-wider">
              BUILT FOR SPEED
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
