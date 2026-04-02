"use client";

import clsx from "clsx";
import { useT } from "@/lib/i18n";

type Tab = "race" | "pit" | "live" | "classification" | "adjusted" | "config" | "replay" | "analytics" | "admin";

interface NavbarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isAdmin: boolean;
  userTabs: string[];
}

export function Navbar({ activeTab, onTabChange, isAdmin, userTabs }: NavbarProps) {
  const t = useT();
  const tabs: { id: Tab; labelKey: string; shortLabelKey: string; adminOnly?: boolean; tabAccess?: string }[] = [
    { id: "race", labelKey: "nav.race", shortLabelKey: "nav.race" },
    { id: "pit", labelKey: "nav.box", shortLabelKey: "nav.box" },
    { id: "live", labelKey: "nav.live", shortLabelKey: "nav.live" },
    // { id: "classification", labelKey: "nav.classification", shortLabelKey: "nav.classification" },
    { id: "adjusted", labelKey: "nav.adjusted", shortLabelKey: "nav.adjustedShort" },
    { id: "config", labelKey: "nav.config", shortLabelKey: "nav.config" },
    { id: "replay", labelKey: "nav.replay", shortLabelKey: "nav.replay", tabAccess: "replay" },
    { id: "analytics", labelKey: "nav.analytics", shortLabelKey: "nav.analyticsShort", tabAccess: "analytics" },
    { id: "admin", labelKey: "nav.admin", shortLabelKey: "nav.admin", adminOnly: true },
  ];

  return (
    <nav className="flex overflow-x-auto scrollbar-none gap-0.5 px-2 sm:px-4 bg-black border-b border-border">
      {tabs
        .filter((tab) => {
          if (tab.adminOnly) return isAdmin;
          if (tab.tabAccess) return userTabs.includes(tab.tabAccess);
          return true;
        })
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
            <span className="sm:hidden">{t(tab.shortLabelKey)}</span>
            <span className="hidden sm:inline">{t(tab.labelKey)}</span>
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
            )}
          </button>
        ))}
    </nav>
  );
}
