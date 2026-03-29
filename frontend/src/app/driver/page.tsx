"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRaceStore } from "@/hooks/useRaceState";
import { DriverView } from "@/components/driver/DriverView";
import type { RaceSnapshot } from "@/types/race";

/**
 * Driver page — receives race state via BroadcastChannel from the main tab.
 * Does NOT open its own WebSocket (avoids consuming a max_devices slot).
 */
export default function DriverPage() {
  const { _hydrated, token } = useAuth();
  const [receiving, setReceiving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const channel = new BroadcastChannel("bbn-driver");

    channel.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "snapshot") {
        useRaceStore.getState().applySnapshot(msg.data as RaceSnapshot);
        useRaceStore.getState().setConnected(true);
        setReceiving(true);
      } else if (msg.type === "update") {
        useRaceStore.getState().applyUpdates(msg.events);
      } else if (msg.type === "fifo_update") {
        useRaceStore.getState().applyFifoUpdate(msg.data);
      } else if (msg.type === "analytics") {
        useRaceStore.getState().applyAnalytics(msg.data);
      }
    };

    // Request a fresh snapshot from the main tab
    channel.postMessage({ type: "requestSnapshot" });

    return () => channel.close();
  }, []);

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

  return <DriverView />;
}
