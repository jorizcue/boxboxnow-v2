"use client";

import { useEffect, useRef } from "react";
import { useRaceStore } from "./useRaceState";
import { useAuth } from "./useAuth";
import { api } from "@/lib/api";
import { setDriverWsRef } from "@/lib/driverChannel";
import type { WsMessage } from "@/types/race";

/** Derive WS base from the browser's current host so it always matches the domain/port in use. */
function getWsBase(): string {
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}/ws/race`;
  }
  // SSR fallback (never actually used for WS connections)
  return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/race";
}
const WS_BASE = getWsBase();

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
  // Consecutive closes that happened WITHOUT the socket ever opening.
  // A dead device session can surface as an opaque 1006 (not the app's
  // 4001) so we can't logout on code alone — after a few of these we
  // probe the session via REST to tell "ended" from "network blip".
  const handshakeFailures = useRef(0);
  const viewParam = options?.view;

  const { token } = useAuth();
  const { setConnected, applySnapshot, applyUpdates, applyFifoUpdate, applyAnalytics, applyClassificationUpdate, applySectorMetaUpdate, notifyTeamsUpdated, setReplayStatus } =
    useRaceStore();
  const wsReconnectTrigger = useRaceStore((s) => s.wsReconnectTrigger);

  // Listen for snapshot requests from driver window — send current store state
  // Also listen for "reconnect" message (sent when dashboard switches session)
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
      // Driver window receives this and reconnects its own WS
      if (event.data?.type === "reconnect" && viewParam === "driver") {
        useRaceStore.getState().requestWsReconnect();
      }
    };
    ch.addEventListener("message", handler);
    return () => ch.removeEventListener("message", handler);
  }, [viewParam]);

  // Notify driver window to reconnect when dashboard switches session
  const prevTrigger = useRef(wsReconnectTrigger);
  useEffect(() => {
    if (!viewParam && wsReconnectTrigger !== prevTrigger.current) {
      prevTrigger.current = wsReconnectTrigger;
      const ch = getDriverChannel();
      ch?.postMessage({ type: "reconnect" });
    }
  }, [wsReconnectTrigger, viewParam]);

  // Main WS connection effect
  useEffect(() => {
    if (!token) return;

    const ch = getDriverChannel();

    function connect() {
      const viewSuffix = viewParam ? `&view=${viewParam}` : "";
      const ws = new WebSocket(`${WS_BASE}?token=${token}&device=web${viewSuffix}`);
      wsRef.current = ws;
      let opened = false;

      ws.onopen = () => {
        opened = true;
        handshakeFailures.current = 0;
        setConnected(true);
        reconnectDelay.current = 1000;
      };

      ws.onclose = (event) => {
        setConnected(false);
        // Server closed with 4001 → device session terminated. Logout.
        if (event.code === 4001) {
          useAuth.getState().logout();
          return;
        }
        // Closed during the handshake (never opened) — e.g. an opaque
        // 1006. This is what a killed/superseded device session looks
        // like once the backend is reachable but rejects pre-accept on
        // older builds, OR a genuine transient blip. Don't loop "Off"
        // forever silently: after a few consecutive handshake failures,
        // probe the session via REST. 401/failure ⇒ session ended ⇒
        // logout (send the user to login); success ⇒ it was transient,
        // keep reconnecting.
        if (!opened) {
          handshakeFailures.current += 1;
          if (handshakeFailures.current >= 3) {
            api
              .getMe()
              .then(() => {
                handshakeFailures.current = 0;
                scheduleReconnect();
              })
              .catch(() => {
                useAuth.getState().logout();
              });
            return;
          }
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
            // The backend bundles a fresh sectorMeta + hasSectors at
            // the top level of update messages whose batch contained a
            // sector event (skipped otherwise to save bandwidth). When
            // present, refresh the field-best leaders so the sector
            // cards re-render with the new state.
            const anyMsg = msg as any;
            if (anyMsg.sectorMeta !== undefined || anyMsg.hasSectors !== undefined || anyMsg.sectorMetaCurrent !== undefined) {
              applySectorMetaUpdate(
                !!anyMsg.hasSectors,
                anyMsg.sectorMeta ?? null,
                anyMsg.sectorMetaCurrent ?? null,
              );
            }
            ch?.postMessage({ type: "update", events: msg.events, sectorMeta: anyMsg.sectorMeta, hasSectors: anyMsg.hasSectors, sectorMetaCurrent: anyMsg.sectorMetaCurrent });
          } else if (msg.type === "fifo_update" && msg.data) {
            applyFifoUpdate(msg.data);
            ch?.postMessage({ type: "fifo_update", data: msg.data });
          } else if (msg.type === "analytics" && msg.data) {
            applyAnalytics(msg.data);
            // Forward analytics as a full snapshot so driver gets complete kart data
            ch?.postMessage({ type: "analytics", data: msg.data });
          } else if (msg.type === "classification_update" && msg.data) {
            applyClassificationUpdate(msg.data);
            ch?.postMessage({ type: "classification_update", data: msg.data });
          } else if (msg.type === "replay_status" && msg.data) {
            const rs = msg.data as any;
            setReplayStatus(rs.active, rs.paused, undefined, rs.progress, rs.currentTime, rs.speed, rs.totalBlocks);
          } else if (msg.type === "teams_updated") {
            notifyTeamsUpdated();
          } else if (msg.type === "box_call") {
            // Relay box call from WS to BroadcastChannel (for driver view in same browser)
            ch?.postMessage({ type: "boxCall" });
          } else if (msg.type === "driver_message") {
            // Relay free-text driver alert from WS to BroadcastChannel
            ch?.postMessage({ type: "driverMessage", text: msg.text || "" });
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
  }, [token, wsReconnectTrigger, setConnected, applySnapshot, applyUpdates, applyFifoUpdate, applyAnalytics, applyClassificationUpdate, applySectorMetaUpdate, setReplayStatus, notifyTeamsUpdated]);

  // Expose WS ref so sendBoxCall can relay through server (for iOS app)
  useEffect(() => {
    if (!viewParam) {
      // Only from the main dashboard (not driver view), register the WS
      setDriverWsRef(wsRef);
      return () => setDriverWsRef(null);
    }
  }, [viewParam]);

  return wsRef;
}
