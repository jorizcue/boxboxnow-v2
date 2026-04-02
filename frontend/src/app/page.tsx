"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRaceWebSocket } from "@/hooks/useRaceWebSocket";
import { useRaceStore } from "@/hooks/useRaceState";
import { LoginPage } from "@/components/auth/LoginPage";
import { StatusBar } from "@/components/layout/StatusBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { RaceTable } from "@/components/race/RaceTable";
import { FifoQueue } from "@/components/pit/FifoQueue";
import { ClassificationTable } from "@/components/classification/ClassificationTable";
import { ConfigPanel } from "@/components/config/ConfigPanel";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { LiveTiming } from "@/components/live/LiveTiming";
import { AdjustedClassification } from "@/components/classification/AdjustedClassification";
import { ReplayTab } from "@/components/replay/ReplayTab";
import { KartAnalyticsTab } from "@/components/analytics/KartAnalyticsTab";

type Tab = "race" | "pit" | "live" | "classification" | "adjusted" | "config" | "replay" | "analytics" | "admin";

export default function Home() {
  const { token, user, _hydrated } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("race");

  if (!_hydrated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="text-lg font-bold animate-pulse"><span className="text-white">BOXBOX</span><span className="text-accent">NOW</span></span>
      </div>
    );
  }

  if (!token) {
    return <LoginPage />;
  }

  return <Dashboard activeTab={activeTab} setActiveTab={setActiveTab} />;
}

function Dashboard({
  activeTab,
  setActiveTab,
}: {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}) {
  useRaceWebSocket();
  const { connected, trackName, countdownMs } = useRaceStore();
  const { user } = useAuth();

  const userTabs = user?.tab_access ?? [];

  return (
    <div className="flex flex-col h-screen">
      <StatusBar
        connected={connected}
        trackName={trackName}
        countdownMs={countdownMs}
        username={user?.username || ""}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAdmin={user?.is_admin ?? false}
          userTabs={userTabs}
        />
        <main className="flex-1 overflow-auto p-2 sm:p-3">
          {activeTab === "race" && userTabs.includes("race") && <RaceTable />}
          {activeTab === "pit" && userTabs.includes("pit") && <FifoQueue />}
          {activeTab === "live" && userTabs.includes("live") && <LiveTiming />}
          {activeTab === "classification" && <ClassificationTable />}
          {activeTab === "adjusted" && userTabs.includes("adjusted") && <AdjustedClassification />}
          {activeTab === "config" && userTabs.includes("config") && <ConfigPanel />}
          {activeTab === "replay" && userTabs.includes("replay") && <ReplayTab />}
          {activeTab === "analytics" && userTabs.includes("analytics") && <KartAnalyticsTab />}
          {activeTab === "admin" && user?.is_admin && <AdminPanel />}
        </main>
      </div>
    </div>
  );
}
