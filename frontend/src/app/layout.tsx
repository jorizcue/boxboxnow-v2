import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BoxboxNow - Race Strategy",
  description: "Real-time karting race strategy dashboard",
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
