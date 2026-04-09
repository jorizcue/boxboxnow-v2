import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BoxBoxNow - Estrategia de Karting en Tiempo Real",
  description:
    "Monitoriza posiciones, optimiza paradas en boxes y toma decisiones estrategicas con datos en vivo. La herramienta de los equipos profesionales de karting endurance.",
  keywords:
    "karting, estrategia, tiempo real, endurance, boxes, pit stop, clasificacion, telemetria",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-bg">{children}</body>
    </html>
  );
}
