"use client";

import { useEffect, useRef } from "react";
import { useRaceStore } from "./useRaceState";
import { useAuth } from "./useAuth";
import type { WsMessage } from "@/types/race";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/race";

export function useRaceWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();
  const reconnectDelay = useRef(1000);

  const { token } = useAuth();
  const { setConnected, applySnapshot, applyUpdates, applyAnalytics } =
    useRaceStore();

  useEffect(() => {
    if (!token) return;

    function connect() {
      // Pass JWT as query parameter for WS auth
      const ws = new WebSocket(`${WS_BASE}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectDelay.current = 1000;
      };

      ws.onclose = () => {
        setConnected(false);
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
          } else if (msg.type === "update" && msg.events) {
            applyUpdates(msg.events);
          } else if (msg.type === "analytics" && msg.data) {
            applyAnalytics(msg.data);
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
  }, [token, setConnected, applySnapshot, applyUpdates, applyAnalytics]);

  return wsRef;
}
