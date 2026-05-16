"use client";

import { useState } from "react";
import { useLangStore, LANGUAGES } from "@/lib/i18n";

const navLinks = [
  { label: "Funcionalidades", href: "#funcionalidades" },
  { label: "Precios", href: "#precios" },
  { label: "Demo", href: "#demo" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { lang, setLang } = useLangStore();

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="relative z-50 flex h-10 w-10 items-center justify-center"
        aria-label="Menú"
      >
        <div className="flex flex-col gap-1.5">
          <span
            className={`block h-0.5 w-6 bg-white transition-all duration-300 ${
              open ? "translate-y-2 rotate-45" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-6 bg-white transition-all duration-300 ${
              open ? "opacity-0" : ""
            }`}
          />
          <span
            className={`block h-0.5 w-6 bg-white transition-all duration-300 ${
              open ? "-translate-y-2 -rotate-45" : ""
            }`}
          />
        </div>
      </button>

      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/80 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-40 h-full w-72 bg-surface border-l border-border p-8 pt-24 transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <nav className="flex flex-col gap-6">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-lg text-muted hover:text-accent transition-colors"
            >
              {link.label}
            </a>
          ))}
          <hr className="border-border" />
          <div className="bbn-lang-switcher">
            {LANGUAGES.map((l) => (
              <button key={l.code} className={`bbn-lang-btn${lang === l.code ? " active" : ""}`} onClick={() => setLang(l.code)} title={l.label}>
                {l.flag}
              </button>
            ))}
          </div>
          <a
            href="/login"
            onClick={() => setOpen(false)}
            className="text-lg text-muted hover:text-white transition-colors"
          >
            Iniciar sesion
          </a>
          <a
            href="/register"
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-base font-semibold text-black hover:bg-accent-hover transition-colors"
          >
            Empezar
          </a>
        </nav>
      </div>
    </div>
  );
}
