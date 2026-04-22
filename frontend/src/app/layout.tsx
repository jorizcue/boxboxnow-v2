import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

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
    <html lang="es" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-bg">{children}</body>
    </html>
  );
}
