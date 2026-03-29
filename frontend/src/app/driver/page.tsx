"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRaceWebSocket } from "@/hooks/useRaceWebSocket";
import { DriverView } from "@/components/driver/DriverView";

export default function DriverPage() {
  const { token, _hydrated } = useAuth();

  if (!_hydrated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="text-accent text-lg font-bold animate-pulse">BBN</span>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="text-red-400 text-sm">No session — open from main app</span>
      </div>
    );
  }

  return <DriverDashboard />;
}

function DriverDashboard() {
  useRaceWebSocket();
  return <DriverView />;
}
