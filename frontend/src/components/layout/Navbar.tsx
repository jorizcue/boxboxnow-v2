"use client";

import clsx from "clsx";

type Tab = "race" | "pit" | "classification" | "config";

interface NavbarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string }[] = [
  { id: "race", label: "Carrera" },
  { id: "pit", label: "Box" },
  { id: "classification", label: "Clasificacion" },
  { id: "config", label: "Config" },
];

export function Navbar({ activeTab, onTabChange }: NavbarProps) {
  return (
    <nav className="flex gap-1 px-3 py-1 bg-card border-b border-gray-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={clsx(
            "px-4 py-2 text-sm font-medium rounded-t transition-colors min-w-[100px]",
            activeTab === tab.id
              ? "bg-surface text-accent border-b-2 border-accent"
              : "text-gray-400 hover:text-gray-200 hover:bg-surface/50"
          )}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
