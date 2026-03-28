"use client";

import clsx from "clsx";

type Tab = "race" | "pit" | "classification" | "config" | "admin";

interface NavbarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isAdmin: boolean;
}

export function Navbar({ activeTab, onTabChange, isAdmin }: NavbarProps) {
  const tabs: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: "race", label: "Carrera" },
    { id: "pit", label: "Box" },
    { id: "classification", label: "Clasificacion" },
    { id: "config", label: "Config" },
    { id: "admin", label: "Admin", adminOnly: true },
  ];

  return (
    <nav className="flex gap-0.5 px-4 bg-black border-b border-border">
      {tabs
        .filter((tab) => !tab.adminOnly || isAdmin)
        .map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={clsx(
              "px-5 py-2.5 text-sm font-medium tracking-wide transition-colors relative",
              activeTab === tab.id
                ? "text-accent"
                : "text-neutral-200 hover:text-neutral-300"
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
            )}
          </button>
        ))}
    </nav>
  );
}
