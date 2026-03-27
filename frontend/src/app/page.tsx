"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRaceWebSocket } from "@/hooks/useRaceWebSocket";
import { useRaceStore } from "@/hooks/useRaceState";
import { LoginPage } from "@/components/auth/LoginPage";
import { StatusBar } from "@/components/layout/StatusBar";
import { Navbar } from "@/components/layout/Navbar";
import { RaceTable } from "@/components/race/RaceTable";
import { FifoQueue } from "@/components/pit/FifoQueue";
import { ClassificationTable } from "@/components/classification/ClassificationTable";
import { ConfigPanel } from "@/components/config/ConfigPanel";
import { AdminPanel } from "@/components/admin/AdminPanel";

type Tab = "race" | "pit" | "classification" | "config" | "admin";

export default function Home() {
  const { token, user, isLoggedIn } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("race");

  if (!isLoggedIn()) {
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

  return (
    <div className="flex flex-col h-screen">
      <StatusBar
        connected={connected}
        trackName={trackName}
        countdownMs={countdownMs}
        username={user?.username || ""}
      />
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isAdmin={user?.is_admin ?? false}
      />
      <main className="flex-1 overflow-auto p-3">
        {activeTab === "race" && <RaceTable />}
        {activeTab === "pit" && <FifoQueue />}
        {activeTab === "classification" && <ClassificationTable />}
        {activeTab === "config" && <ConfigPanel />}
        {activeTab === "admin" && user?.is_admin && <AdminPanel />}
      </main>
    </div>
  );
}
