"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { useT } from "@/lib/i18n";
import { useRaceStore } from "@/hooks/useRaceState";

export type Tab = "race" | "pit" | "live" | "classification" | "adjusted" | "adjusted-beta" | "driver" | "driver-config" | "config" | "replay" | "analytics" | "insights" | "account" | "admin-users" | "admin-circuits" | "admin-hub" | "admin-platform";

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  isAdmin: boolean;
  userTabs: string[];
}

const TAB_ICONS: Record<string, JSX.Element> = {
  race: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      {/* Checkered flag */}
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4c2 0 3 1 5 1s3.5-1 5.5-1 3.5 1 5.5 1v10c-2 0-3.5-1-5.5-1s-3.5 1-5.5 1-3-1-5-1" />
      {/* Checker pattern */}
      <rect x="4" y="4" width="4" height="3.3" fill="currentColor" opacity="0.5" stroke="none" />
      <rect x="12" y="4" width="4" height="3.3" fill="currentColor" opacity="0.5" stroke="none" />
      <rect x="8" y="7.3" width="4" height="3.3" fill="currentColor" opacity="0.5" stroke="none" />
      <rect x="16" y="7.3" width="4" height="3.3" fill="currentColor" opacity="0.5" stroke="none" />
      <rect x="4" y="10.6" width="4" height="3.4" fill="currentColor" opacity="0.5" stroke="none" />
      <rect x="12" y="10.6" width="4" height="3.4" fill="currentColor" opacity="0.5" stroke="none" />
    </svg>
  ),
  pit: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
      {/* Screen/sign */}
      <rect x="3" y="3" width="18" height="13" rx="2" />
      {/* PIT text */}
      <text x="12" y="12.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="bold" fontFamily="sans-serif">PIT</text>
      {/* Pin/stand below */}
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21c1.5-1 2.5-2 4-2s2.5 1 4 2" />
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
  driver: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M5.5 16.5c2-1.5 4.5-2 6.5-2s4.5.5 6.5 2" />
      <path strokeLinecap="round" d="M7 8.5h2M15 8.5h2" />
      <path strokeLinecap="round" d="M12 7v4" />
    </svg>
  ),
  "driver-config": (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
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
  insights: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  ),
  analysis: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  admin: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  "admin-users": (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  "admin-circuits": (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  ),
  "admin-hub": (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0h.375a2.625 2.625 0 010 5.25H17.25m-13.5-5.25H3.375a2.625 2.625 0 000 5.25H5.25" />
    </svg>
  ),
  "admin-platform": (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  account: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  clasificacion: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
    </svg>
  ),
  "adjusted-beta": (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  ),
};

// Persist sidebar state
let _sidebarCollapsed = false;
let _adminExpanded = true;
let _analysisExpanded = true;
let _driverExpanded = true;
let _clasificacionExpanded = true;

export function Sidebar({ activeTab, onTabChange, isAdmin, userTabs }: SidebarProps) {
  const t = useT();
  const raceStarted = useRaceStore((s) => s.raceStarted);
  const raceFinished = useRaceStore((s) => s.raceFinished);
  const replayActive = useRaceStore((s) => s.replayActive);
  const raceActive = (raceStarted && !raceFinished) || replayActive;
  const [collapsed, setCollapsed] = useState(_sidebarCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(_adminExpanded);
  const [analysisExpanded, setAnalysisExpanded] = useState(_analysisExpanded);
  const [driverExpanded, setDriverExpanded] = useState(_driverExpanded);
  const [clasificacionExpanded, setClasificacionExpanded] = useState(_clasificacionExpanded);

  useEffect(() => { _sidebarCollapsed = collapsed; }, [collapsed]);
  useEffect(() => { _adminExpanded = adminExpanded; }, [adminExpanded]);
  useEffect(() => { _analysisExpanded = analysisExpanded; }, [analysisExpanded]);
  useEffect(() => { _driverExpanded = driverExpanded; }, [driverExpanded]);
  useEffect(() => { _clasificacionExpanded = clasificacionExpanded; }, [clasificacionExpanded]);

  // Auto-expand sections when a sub-tab is active
  useEffect(() => {
    if (activeTab.startsWith("admin-")) setAdminExpanded(true);
    if (activeTab === "replay" || activeTab === "analytics" || activeTab === "insights") setAnalysisExpanded(true);
    if (activeTab === "driver" || activeTab === "driver-config") setDriverExpanded(true);
    if (activeTab === "adjusted" || activeTab === "adjusted-beta") setClasificacionExpanded(true);
  }, [activeTab]);

  const mainTabs: { id: Tab; labelKey: string; tabAccess?: string }[] = [
    { id: "race", labelKey: "nav.race", tabAccess: "race" },
    { id: "pit", labelKey: "nav.box", tabAccess: "pit" },
    { id: "live", labelKey: "nav.live", tabAccess: "live" },
    { id: "config", labelKey: "nav.config", tabAccess: "config" },
  ];

  const clasificacionSubTabs: { id: Tab; labelKey: string; tabAccess: string }[] = [
    { id: "adjusted", labelKey: "nav.adjusted", tabAccess: "adjusted" },
    { id: "adjusted-beta", labelKey: "nav.adjustedBeta", tabAccess: "adjusted-beta" },
  ];

  const driverSubTabs: { id: Tab; labelKey: string; tabAccess: string }[] = [
    { id: "driver", labelKey: "nav.driverView", tabAccess: "driver" },
    { id: "driver-config", labelKey: "nav.driverConfig", tabAccess: "driver-config" },
  ];

  const analysisSubTabs: { id: Tab; labelKey: string; tabAccess: string }[] = [
    { id: "replay", labelKey: "nav.replay", tabAccess: "replay" },
    { id: "analytics", labelKey: "nav.analyticsShort", tabAccess: "analytics" },
    { id: "insights", labelKey: "nav.insights", tabAccess: "insights" },
  ];

  const adminSubTabs: { id: Tab; labelKey: string; tabAccess: string }[] = [
    { id: "admin-users", labelKey: "admin.users", tabAccess: "admin-users" },
    { id: "admin-circuits", labelKey: "admin.circuits", tabAccess: "admin-circuits" },
    { id: "admin-hub", labelKey: "admin.hub", tabAccess: "admin-hub" },
    { id: "admin-platform", labelKey: "Plataforma", tabAccess: "admin-hub" },
  ];

  const visibleMainTabs = mainTabs.filter((tab) => {
    if (tab.tabAccess) return userTabs.includes(tab.tabAccess);
    return true;
  });

  const visibleClasificacionTabs = clasificacionSubTabs.filter((tab) => userTabs.includes(tab.tabAccess));
  const hasClasificacion = visibleClasificacionTabs.length > 0;
  const isClasificacionTabActive = activeTab === "adjusted" || activeTab === "adjusted-beta";

  const visibleDriverTabs = driverSubTabs.filter((tab) => userTabs.includes(tab.tabAccess));
  const hasDriver = visibleDriverTabs.length > 0;
  const isDriverTabActive = activeTab === "driver" || activeTab === "driver-config";

  const visibleAnalysisTabs = analysisSubTabs.filter((tab) => userTabs.includes(tab.tabAccess));
  const hasAnalysis = visibleAnalysisTabs.length > 0;
  const isAnalysisTabActive = activeTab === "replay" || activeTab === "analytics" || activeTab === "insights";

  const visibleAdminTabs = adminSubTabs.filter((tab) => userTabs.includes(tab.tabAccess));
  const hasAdminTabs = isAdmin && visibleAdminTabs.length > 0;

  const handleTabClick = (tab: Tab) => {
    onTabChange(tab);
    setMobileOpen(false);
  };

  const isAdminTabActive = activeTab.startsWith("admin-");

  const openDriverPopup = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(
      "/driver",
      "bbn-driver",
      "width=800,height=400,menubar=no,toolbar=no,location=no,status=no"
    );
  };

  const renderTabButton = (tab: { id: Tab; labelKey: string }, isSub = false) => (
    <button
      key={tab.id}
      onClick={() => handleTabClick(tab.id)}
      className={clsx(
        "w-full flex items-center gap-3 transition-colors relative group",
        collapsed && !isSub ? "justify-center px-2 py-2.5" : isSub ? "pl-9 pr-4 py-2" : "px-4 py-2.5",
        activeTab === tab.id
          ? "text-accent bg-accent/10"
          : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
      )}
    >
      {/* Active indicator */}
      {activeTab === tab.id && (
        <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-accent rounded-r" />
      )}
      <span className="shrink-0 relative">
        {TAB_ICONS[tab.id]}
        {tab.id === "race" && raceActive && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        )}
      </span>
      {(!collapsed || isSub) && (
        <span className={clsx("font-medium truncate flex-1 text-left", isSub ? "text-xs" : "text-sm")}>
          {t(tab.labelKey)}
          {tab.id === "race" && raceActive && (
            <span className="ml-1.5 inline-block w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse align-middle" />
          )}
        </span>
      )}
      {/* Tooltip on collapsed (only for non-sub items) */}
      {collapsed && !isSub && (
        <span className="absolute left-full ml-2 px-2 py-1 bg-surface border border-border rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          {t(tab.labelKey)}
        </span>
      )}
    </button>
  );

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
        {visibleMainTabs.map((tab) => renderTabButton(tab))}

        {/* Clasificacion section with sub-menu */}
        {hasClasificacion && (
          <>
            <div className="my-2 mx-3 border-t border-border" />

            <button
              onClick={() => {
                if (collapsed) {
                  setCollapsed(false);
                  setClasificacionExpanded(true);
                  if (!isClasificacionTabActive) handleTabClick("adjusted");
                } else {
                  setClasificacionExpanded(!clasificacionExpanded);
                }
              }}
              className={clsx(
                "w-full flex items-center gap-3 transition-colors relative group",
                collapsed ? "justify-center px-2 py-2.5" : "px-4 py-2.5",
                isClasificacionTabActive
                  ? "text-accent"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
              )}
            >
              <span className="shrink-0">{TAB_ICONS.clasificacion}</span>
              {!collapsed && (
                <>
                  <span className="text-sm font-medium truncate flex-1 text-left">{t("nav.clasificacion")}</span>
                  <svg
                    className={clsx(
                      "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
                      clasificacionExpanded ? "rotate-180" : ""
                    )}
                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </>
              )}
              {collapsed && (
                <span className="absolute left-full ml-2 px-2 py-1 bg-surface border border-border rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {t("nav.clasificacion")}
                </span>
              )}
            </button>

            {!collapsed && clasificacionExpanded && (
              <div className="space-y-0.5">
                {visibleClasificacionTabs.map((sub) => renderTabButton(sub, true))}
              </div>
            )}
          </>
        )}

        {/* Driver section with sub-menu */}
        {hasDriver && (
          <>
            <div className="my-2 mx-3 border-t border-border" />

            <button
              onClick={() => {
                if (collapsed) {
                  setCollapsed(false);
                  setDriverExpanded(true);
                  if (!isDriverTabActive) handleTabClick("driver");
                } else {
                  setDriverExpanded(!driverExpanded);
                }
              }}
              className={clsx(
                "w-full flex items-center gap-3 transition-colors relative group",
                collapsed ? "justify-center px-2 py-2.5" : "px-4 py-2.5",
                isDriverTabActive
                  ? "text-accent"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
              )}
            >
              <span className="shrink-0">{TAB_ICONS.driver}</span>
              {!collapsed && (
                <>
                  <span className="text-sm font-medium truncate flex-1 text-left">{t("nav.driver")}</span>
                  {/* Popup button */}
                  <span
                    role="button"
                    onClick={openDriverPopup}
                    className="shrink-0 p-0.5 rounded hover:bg-white/10 text-neutral-500 hover:text-accent transition-colors"
                    title={t("driver.open")}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </span>
                  <svg
                    className={clsx(
                      "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
                      driverExpanded ? "rotate-180" : ""
                    )}
                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </>
              )}
              {collapsed && (
                <span className="absolute left-full ml-2 px-2 py-1 bg-surface border border-border rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {t("nav.driver")}
                </span>
              )}
            </button>

            {!collapsed && driverExpanded && (
              <div className="space-y-0.5">
                {visibleDriverTabs.map((sub) => renderTabButton(sub, true))}
              </div>
            )}
          </>
        )}

        {/* Analysis section with sub-menu */}
        {hasAnalysis && (
          <>
            {/* Separator */}
            <div className="my-2 mx-3 border-t border-border" />

            {/* Analysis parent button */}
            <button
              onClick={() => {
                if (collapsed) {
                  setCollapsed(false);
                  setAnalysisExpanded(true);
                  if (!isAnalysisTabActive) handleTabClick(visibleAnalysisTabs[0].id);
                } else {
                  setAnalysisExpanded(!analysisExpanded);
                }
              }}
              className={clsx(
                "w-full flex items-center gap-3 transition-colors relative group",
                collapsed ? "justify-center px-2 py-2.5" : "px-4 py-2.5",
                isAnalysisTabActive
                  ? "text-accent"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
              )}
            >
              <span className="shrink-0">{TAB_ICONS.analysis}</span>
              {!collapsed && (
                <>
                  <span className="text-sm font-medium truncate flex-1 text-left">{t("nav.analysis")}</span>
                  <svg
                    className={clsx(
                      "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
                      analysisExpanded ? "rotate-180" : ""
                    )}
                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </>
              )}
              {/* Tooltip on collapsed */}
              {collapsed && (
                <span className="absolute left-full ml-2 px-2 py-1 bg-surface border border-border rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {t("nav.analysis")}
                </span>
              )}
            </button>

            {/* Analysis sub-tabs */}
            {!collapsed && analysisExpanded && (
              <div className="space-y-0.5">
                {visibleAnalysisTabs.map((sub) => renderTabButton(sub, true))}
              </div>
            )}
          </>
        )}

        {/* Account */}
        <div className="my-2 mx-3 border-t border-border" />
        {renderTabButton({ id: "account", labelKey: "Mi cuenta" })}

        {/* Admin section with sub-menu */}
        {hasAdminTabs && (
          <>
            {/* Separator */}
            <div className="my-2 mx-3 border-t border-border" />

            {/* Admin parent button */}
            <button
              onClick={() => {
                if (collapsed) {
                  // When collapsed, clicking admin goes to first sub-tab
                  setCollapsed(false);
                  setAdminExpanded(true);
                  if (!activeTab.startsWith("admin-") && visibleAdminTabs.length > 0) handleTabClick(visibleAdminTabs[0].id);
                } else {
                  setAdminExpanded(!adminExpanded);
                }
              }}
              className={clsx(
                "w-full flex items-center gap-3 transition-colors relative group",
                collapsed ? "justify-center px-2 py-2.5" : "px-4 py-2.5",
                isAdminTabActive
                  ? "text-accent"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.03]"
              )}
            >
              <span className="shrink-0">{TAB_ICONS.admin}</span>
              {!collapsed && (
                <>
                  <span className="text-sm font-medium truncate flex-1 text-left">{t("nav.admin")}</span>
                  <svg
                    className={clsx(
                      "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
                      adminExpanded ? "rotate-180" : ""
                    )}
                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </>
              )}
              {/* Tooltip on collapsed */}
              {collapsed && (
                <span className="absolute left-full ml-2 px-2 py-1 bg-surface border border-border rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  {t("nav.admin")}
                </span>
              )}
            </button>

            {/* Admin sub-tabs */}
            {!collapsed && adminExpanded && (
              <div className="space-y-0.5">
                {visibleAdminTabs.map((sub) => renderTabButton(sub, true))}
              </div>
            )}
          </>
        )}
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
