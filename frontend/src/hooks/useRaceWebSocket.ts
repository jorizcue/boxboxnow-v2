"use client";

import { useEffect, useRef } from "react";
import { useRaceStore } from "./useRaceState";
import { useAuth } from "./useAuth";
import type { WsMessage } from "@/types/race";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/race";

/**
 * BroadcastChannel for sharing WS data with the driver view window.
 * Only created once (singleton). The driver page listens on the same channel.
 */
let driverChannel: BroadcastChannel | null = null;

function getDriverChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!driverChannel) {
    try {
      driverChannel = new BroadcastChannel("bbn-driver");
    } catch {
      // BroadcastChannel not supported
    }
  }
  return driverChannel;
}

interface WsOptions {
  /** Pass "driver" to append &view=driver to the WS URL (extra slot). */
  view?: "driver";
}

export function useRaceWebSocket(options?: WsOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();
  const reconnectDelay = useRef(1000);
  const viewParam = options?.view;

  const { token } = useAuth();
  const { setConnected, applySnapshot, applyUpdates, applyFifoUpdate, applyAnalytics, notifyTeamsUpdated, setReplayStatus } =
    useRaceStore();
  const wsReconnectTrigger = useRaceStore((s) => s.wsReconnectTrigger);

  // Listen for snapshot requests from driver window — send current store state
  useEffect(() => {
    const ch = getDriverChannel();
    if (!ch) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "requestSnapshot") {
        const state = useRaceStore.getState();
        ch.postMessage({
          type: "snapshot",
          data: {
            raceStarted: state.raceStarted,
            countdownMs: state.countdownMs,
            trackName: state.trackName,
            durationMs: state.durationMs,
            karts: state.karts,
            fifo: state.fifo,
            classification: state.classification,
            config: state.config,
          },
        });
      }
    };
    ch.addEventListener("message", handler);
    return () => ch.removeEventListener("message", handler);
  }, []);

  // Main WS connection effect
  useEffect(() => {
    if (!token) return;

    const ch = getDriverChannel();

    function connect() {
      const viewSuffix = viewParam ? `&view=${viewParam}` : "";
      const ws = new WebSocket(`${WS_BASE}?token=${token}${viewSuffix}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectDelay.current = 1000;
      };

      ws.onclose = (event) => {
        setConnected(false);
        // If server closed with 4001, session was terminated — logout
        if (event.code === 4001) {
          useAuth.getState().logout();
          return;
        }
        scheduleReconnect();
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);

          if (msg.type === "snapshot" && msg.data) {
            applySnapshot(msg.data);
            ch?.postMessage({ type: "snapshot", data: msg.data });
          } else if (msg.type === "update" && msg.events) {
            applyUpdates(msg.events);
            ch?.postMessage({ type: "update", events: msg.events });
          } else if (msg.type === "fifo_update" && msg.data) {
            applyFifoUpdate(msg.data);
            ch?.postMessage({ type: "fifo_update", data: msg.data });
          } else if (msg.type === "analytics" && msg.data) {
            applyAnalytics(msg.data);
            // Forward analytics as a full snapshot so driver gets complete kart data
            ch?.postMessage({ type: "analytics", data: msg.data });
          } else if (msg.type === "replay_status" && msg.data) {
            const rs = msg.data as any;
            setReplayStatus(rs.active, rs.paused, undefined, rs.progress, rs.currentTime, rs.speed, rs.totalBlocks);
          } else if (msg.type === "teams_updated") {
            notifyTeamsUpdated();
          }
        } catch {
          // ignore parse errors
        }
      };
    }

    function scheduleReconnect() {
      reconnectTimeout.current = setTimeout(() => {
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 2,
          30000
        );
        connect();
      }, reconnectDelay.current);
    }

    connect();

    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
    // wsReconnectTrigger in deps => entire effect re-runs (close old WS, open new)
  }, [token, wsReconnectTrigger, setConnected, applySnapshot, applyUpdates, applyFifoUpdate, applyAnalytics, setReplayStatus, notifyTeamsUpdated]);

  return wsRef;
}
