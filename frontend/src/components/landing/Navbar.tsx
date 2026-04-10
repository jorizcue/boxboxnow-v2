"use client";

import { useEffect, useState } from "react";
import { MobileNav } from "./MobileNav";

const navLinks = [
  { label: "Funcionalidades", href: "#funcionalidades" },
  { label: "Precios", href: "#precios" },
  { label: "Demo", href: "#demo" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-black/70 backdrop-blur-xl border-b border-border/30"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <a href="/" className="text-xl font-bold tracking-tight text-white">
          BOXBOX<span className="text-accent">NOW</span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted/40 hover:text-white transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted/50 hover:text-white transition-colors"
          >
            Iniciar sesion
          </a>
          <a
            href="/register"
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-black hover:bg-accent-hover transition-all duration-200"
          >
            Empezar
          </a>
        </div>

        {/* Mobile nav */}
        <MobileNav />
      </div>
    </header>
  );
}
