import { Navbar } from "@/components/landing/Navbar";
import { PricingToggle } from "@/components/landing/PricingToggle";

const features = [
  {
    emoji: "\uD83C\uDFC1",
    title: "Posiciones en tiempo real",
    desc: "Sigue cada kart en pista con actualizaciones al segundo. Posicion, vueltas, gaps e intervalos.",
  },
  {
    emoji: "\uD83D\uDD27",
    title: "Gestion de boxes",
    desc: "Cola FIFO inteligente, prediccion de ventana de parada y analisis de tiempos de pit.",
  },
  {
    emoji: "\uD83D\uDCCA",
    title: "Clasificacion real",
    desc: "Algoritmo propio que calcula posiciones ajustadas considerando paradas y bonificaciones.",
  },
  {
    emoji: "\uD83D\uDCF1",
    title: "Vista de piloto",
    desc: "Interfaz optimizada para el piloto: siguiente stint, tiempos objetivo y estado del equipo.",
  },
  {
    emoji: "\uD83D\uDCC8",
    title: "Analitica de karts",
    desc: "Historial de rendimiento por kart, rankings de velocidad y deteccion de outliers.",
  },
  {
    emoji: "\uD83D\uDEF0\uFE0F",
    title: "GPS Insights",
    desc: "Telemetria GPS con comparativa de vueltas, velocidad en curva y fuerzas G.",
  },
];

const steps = [
  {
    num: "1",
    title: "Configura tu carrera",
    desc: "Selecciona circuito, duracion, equipos y parametros de stint.",
  },
  {
    num: "2",
    title: "Conecta en tiempo real",
    desc: "Nuestro sistema se conecta al cronometraje del circuito automaticamente.",
  },
  {
    num: "3",
    title: "Toma decisiones",
    desc: "Visualiza datos en vivo y optimiza tu estrategia de paradas.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      <Navbar />

      {/* ===== HERO ===== */}
      <section className="relative flex min-h-screen items-center justify-center px-6">
        {/* Animated grid background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="animate-grid absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(159,229,86,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(159,229,86,0.3) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
          {/* Radial fade */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#000_70%)]" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <h1 className="animate-fade-in-up text-5xl font-bold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            Estrategia de karting{" "}
            <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
              en tiempo real
            </span>
          </h1>
          <p
            className="animate-fade-in-up mx-auto mt-6 max-w-2xl text-lg text-muted/60 sm:text-xl"
            style={{ animationDelay: "0.15s" }}
          >
            Monitoriza posiciones, optimiza paradas en boxes y toma decisiones
            estrategicas con datos en vivo. La herramienta que usan los equipos
            profesionales de endurance.
          </p>
          <div
            className="animate-fade-in-up mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
            style={{ animationDelay: "0.3s" }}
          >
            <a
              href="/register"
              className="rounded-xl bg-accent px-8 py-3.5 text-base font-semibold text-black shadow-[0_0_30px_rgba(159,229,86,0.25)] hover:bg-accent-hover hover:shadow-[0_0_40px_rgba(159,229,86,0.35)] transition-all"
            >
              Empieza gratis
            </a>
            <a
              href="#demo"
              className="rounded-xl border border-border px-8 py-3.5 text-base font-semibold text-muted hover:border-accent hover:text-accent transition-all"
            >
              Ver demo
            </a>
          </div>
        </div>
      </section>

      {/* ===== TRUST / LOGOS ===== */}
      <section className="border-y border-border bg-surface/30 py-12">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="mb-8 text-xs font-medium uppercase tracking-widest text-muted/30">
            Circuitos que confian en nosotros
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
            {["Karting Los Santos", "Ariza Racing Circuit", "Karting Cabanillas"].map(
              (name) => (
                <span
                  key={name}
                  className="text-lg font-semibold text-muted/20 sm:text-xl"
                >
                  {name}
                </span>
              )
            )}
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="funcionalidades" className="py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl">
              Todo lo que necesitas para{" "}
              <span className="text-accent">ganar</span>
            </h2>
            <p className="mt-4 text-muted/50">
              Herramientas profesionales de estrategia de karting, accesibles para todos.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border bg-surface p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/30 hover:shadow-[0_0_30px_rgba(159,229,86,0.06)]"
              >
                <span className="text-3xl">{f.emoji}</span>
                <h3 className="mt-4 text-lg font-semibold text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted/50">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="border-y border-border bg-surface/20 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-16 text-center text-3xl font-bold sm:text-4xl">
            Como funciona
          </h2>
          <div className="relative grid gap-12 md:grid-cols-3 md:gap-8">
            {/* Dashed connector line (desktop) */}
            <div className="pointer-events-none absolute top-8 left-[16.66%] right-[16.66%] hidden h-px border-t-2 border-dashed border-accent/20 md:block" />
            {steps.map((s) => (
              <div key={s.num} className="relative text-center">
                <div className="relative z-10 mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent bg-black text-2xl font-bold text-accent">
                  {s.num}
                </div>
                <h3 className="mt-6 text-lg font-semibold text-white">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-muted/50">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== DEMO SCREENSHOT ===== */}
      <section id="demo" className="py-24 sm:py-32">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-12 text-center text-3xl font-bold sm:text-4xl">
            Miralo en{" "}
            <span className="text-accent">accion</span>
          </h2>
          {/* Browser mockup */}
          <div className="overflow-hidden rounded-2xl border border-accent/20 shadow-[0_0_60px_rgba(159,229,86,0.08)]">
            {/* Title bar */}
            <div className="flex items-center gap-2 bg-surface px-4 py-3 border-b border-border">
              <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
              <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
              <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
              <span className="ml-4 text-xs text-muted/30">app.boxboxnow.com</span>
            </div>
            {/* Content area */}
            <div className="flex min-h-[400px] items-center justify-center bg-black/50 p-12">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
                  <svg
                    className="h-8 w-8 text-accent"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                    />
                  </svg>
                </div>
                <p className="text-lg font-semibold text-muted/40">
                  Demo interactiva proximamente
                </p>
                <p className="mt-2 text-sm text-muted/25">
                  Estamos preparando una demo en vivo del dashboard
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section
        id="precios"
        className="border-t border-border bg-surface/20 py-24 sm:py-32"
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center mb-4">
            <h2 className="text-3xl font-bold sm:text-4xl">
              Planes y precios
            </h2>
            <p className="mt-4 text-muted/50">
              Elige el plan que mejor se adapte a tu equipo. Sin permanencia.
            </p>
          </div>
          <PricingToggle />
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl lg:text-5xl">
            \u00BFListo para llevar tu estrategia al{" "}
            <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
              siguiente nivel
            </span>
            ?
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg text-muted/50">
            Registrate gratis y prueba BoxBoxNow durante 14 dias.
          </p>
          <a
            href="/register"
            className="mt-10 inline-block rounded-xl bg-accent px-10 py-4 text-base font-semibold text-black shadow-[0_0_40px_rgba(159,229,86,0.3)] hover:bg-accent-hover hover:shadow-[0_0_50px_rgba(159,229,86,0.4)] transition-all"
          >
            Crear cuenta gratis
          </a>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-border bg-surface/30 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
            {/* Logo */}
            <div>
              <a href="/" className="text-xl font-bold text-white">
                BOXBOX<span className="text-accent">NOW</span>
              </a>
              <p className="mt-4 text-sm text-muted/40 leading-relaxed">
                Estrategia de karting en tiempo real para equipos de endurance.
              </p>
            </div>

            {/* Producto */}
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted/30">
                Producto
              </h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="#funcionalidades"
                    className="text-sm text-muted/50 hover:text-accent transition-colors"
                  >
                    Funcionalidades
                  </a>
                </li>
                <li>
                  <a
                    href="#precios"
                    className="text-sm text-muted/50 hover:text-accent transition-colors"
                  >
                    Precios
                  </a>
                </li>
                <li>
                  <a
                    href="#demo"
                    className="text-sm text-muted/50 hover:text-accent transition-colors"
                  >
                    Demo
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted/30">
                Legal
              </h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="/terminos"
                    className="text-sm text-muted/50 hover:text-accent transition-colors"
                  >
                    Terminos
                  </a>
                </li>
                <li>
                  <a
                    href="/privacidad"
                    className="text-sm text-muted/50 hover:text-accent transition-colors"
                  >
                    Privacidad
                  </a>
                </li>
                <li>
                  <a
                    href="/cookies"
                    className="text-sm text-muted/50 hover:text-accent transition-colors"
                  >
                    Cookies
                  </a>
                </li>
              </ul>
            </div>

            {/* Contacto */}
            <div>
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted/30">
                Contacto
              </h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="mailto:contacto@boxboxnow.com"
                    className="text-sm text-muted/50 hover:text-accent transition-colors"
                  >
                    contacto@boxboxnow.com
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-16 border-t border-border pt-8 text-center text-sm text-muted/30">
            \u00A9 2026 BoxBoxNow. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
