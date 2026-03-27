"use client";

import { useState } from "react";
import { useRaceWebSocket } from "@/hooks/useRaceWebSocket";
import { useRaceStore } from "@/hooks/useRaceState";
import { StatusBar } from "@/components/layout/StatusBar";
import { Navbar } from "@/components/layout/Navbar";
import { RaceTable } from "@/components/race/RaceTable";
import { FifoQueue } from "@/components/pit/FifoQueue";
import { ClassificationTable } from "@/components/classification/ClassificationTable";
import { ConfigPanel } from "@/components/config/ConfigPanel";

type Tab = "race" | "pit" | "classification" | "config";

export default function Home() {
  useRaceWebSocket();
  const [activeTab, setActiveTab] = useState<Tab>("race");
  const { connected, trackName, countdownMs } = useRaceStore();

  return (
    <div className="flex flex-col h-screen">
      <StatusBar
        connected={connected}
        trackName={trackName}
        countdownMs={countdownMs}
      />
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-auto p-3">
        {activeTab === "race" && <RaceTable />}
        {activeTab === "pit" && <FifoQueue />}
        {activeTab === "classification" && <ClassificationTable />}
        {activeTab === "config" && <ConfigPanel />}
      </main>
    </div>
  );
}
