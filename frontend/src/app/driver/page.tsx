"use client";

import { useAuth } from "@/hooks/useAuth";
import { useRaceWebSocket } from "@/hooks/useRaceWebSocket";
import { DriverView } from "@/components/driver/DriverView";

/**
 * Driver page — standalone page with its own WebSocket connection.
 * Works on any device (same browser tab, separate phone, etc).
 * Requires max_devices >= 2 if opened from same user account.
 */
export default function DriverPage() {
  const { _hydrated, token } = useAuth();

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
  useRaceWebSocket({ view: "driver" });
  return <DriverView />;
}
