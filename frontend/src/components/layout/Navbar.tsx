"use client";

import clsx from "clsx";

type Tab = "race" | "pit" | "classification" | "config" | "admin";

interface NavbarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isAdmin: boolean;
}

export function Navbar({ activeTab, onTabChange, isAdmin }: NavbarProps) {
  const tabs: { id: Tab; label: string; shortLabel: string; adminOnly?: boolean }[] = [
    { id: "race", label: "Carrera", shortLabel: "Race" },
    { id: "pit", label: "Box", shortLabel: "Box" },
    { id: "classification", label: "Clasificacion", shortLabel: "Clasif." },
    { id: "config", label: "Config", shortLabel: "Config" },
    { id: "admin", label: "Admin", shortLabel: "Admin", adminOnly: true },
  ];

  return (
    <nav className="flex overflow-x-auto scrollbar-none gap-0.5 px-2 sm:px-4 bg-black border-b border-border">
      {tabs
        .filter((tab) => !tab.adminOnly || isAdmin)
        .map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={clsx(
              "px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-medium tracking-wide transition-colors relative whitespace-nowrap shrink-0",
              activeTab === tab.id
                ? "text-accent"
                : "text-neutral-200 hover:text-neutral-300"
            )}
          >
            <span className="sm:hidden">{tab.shortLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
            )}
          </button>
        ))}
    </nav>
  );
}
