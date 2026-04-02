"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { useT } from "@/lib/i18n";

type Tab = "race" | "pit" | "live" | "classification" | "adjusted" | "config" | "replay" | "analytics" | "admin";

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isAdmin: boolean;
  userTabs: string[];
}

const TAB_ICONS: Record<string, JSX.Element> = {
  race: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
    </svg>
  ),
  pit: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  live: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  ),
  adjusted: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
    </svg>
  ),
  config: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  replay: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
    </svg>
  ),
  analytics: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  admin: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
};

// Persist sidebar collapsed state
let _sidebarCollapsed = false;

export function Sidebar({ activeTab, onTabChange, isAdmin, userTabs }: SidebarProps) {
  const t = useT();
  const [collapsed, setCollapsed] = useState(_sidebarCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { _sidebarCollapsed = collapsed; }, [collapsed]);

  const tabs: { id: Tab; labelKey: string; adminOnly?: boolean; tabAccess?: string }[] = [
    { id: "race", labelKey: "nav.race", tabAccess: "race" },
    { id: "pit", labelKey: "nav.box", tabAccess: "pit" },
    { id: "live", labelKey: "nav.live", tabAccess: "live" },
    { id: "adjusted", labelKey: "nav.adjusted", tabAccess: "adjusted" },
    { id: "config", labelKey: "nav.config", tabAccess: "config" },
    { id: "replay", labelKey: "nav.replay", tabAccess: "replay" },
    { id: "analytics", labelKey: "nav.analytics", tabAccess: "analytics" },
    { id: "admin", labelKey: "nav.admin", adminOnly: true },
  ];

  const visibleTabs = tabs.filter((tab) => {
    if (tab.adminOnly) return isAdmin;
    if (tab.tabAccess) return userTabs.includes(tab.tabAccess);
    return true;
  });

  const handleTabClick = (tab: Tab) => {
    onTabChange(tab);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Collapse toggle (desktop only) */}
      <div className="hidden md:flex items-center justify-between px-3 py-3 border-b border-border">
        {!collapsed && (
          <span className="text-xs font-bold tracking-wider text-white">
            BB<span className="text-accent">N</span>
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-neutral-400 hover:text-white transition-colors p-1"
        >
          {collapsed ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-bold tracking-wider text-white">
          BB<span className="text-accent">N</span>
        </span>
        <button
          onClick={() => setMobileOpen(false)}
          className="text-neutral-400 hover:text-white transition-colors p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tab list */}
      <nav className="flex-1 py-2 space-y-0.5 overflow-y-auto scrollbar-none">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={clsx(
              "w-full flex items-center gap-3 transition-colors relative group",
              collapsed ? "justify-center px-2 py-2.5" : "px-4 py-2.5",
              activeTab === tab.id
                ? "text-accent bg-accent/10"
                : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
            )}
          >
            {/* Active indicator */}
            {activeTab === tab.id && (
              <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-accent rounded-r" />
            )}
            <span className="shrink-0">{TAB_ICONS[tab.id]}</span>
            {!collapsed && (
              <span className="text-sm font-medium truncate">{t(tab.labelKey)}</span>
            )}
            {/* Tooltip on collapsed */}
            {collapsed && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-surface border border-border rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                {t(tab.labelKey)}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile: hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-2 left-2 z-40 bg-surface border border-border rounded-lg p-1.5 text-neutral-300 hover:text-white transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {/* Mobile: overlay + drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-56 bg-surface border-r border-border h-full animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop: persistent sidebar */}
      <div
        className={clsx(
          "hidden md:flex flex-col bg-surface border-r border-border h-full shrink-0 transition-all duration-200",
          collapsed ? "w-12" : "w-48"
        )}
      >
        {sidebarContent}
      </div>
    </>
  );
}
