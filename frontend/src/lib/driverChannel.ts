/**
 * Shared BroadcastChannel for main app <-> driver view communication.
 * Used by BOX call button (sender) and DriverView (receiver).
 */

let channel: BroadcastChannel | null = null;

/** Stored WebSocket ref so sendBoxCall can also relay through the server. */
let _wsRef: { current: WebSocket | null } | null = null;

export function getDriverChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel("bbn-driver");
    } catch {
      // BroadcastChannel not supported
    }
  }
  return channel;
}

/** Register the WebSocket ref so box calls also go through the server (for iOS app). */
export function setDriverWsRef(ref: { current: WebSocket | null } | null) {
  _wsRef = ref;
}

/** Send a BOX alert to the driver view (BroadcastChannel + WebSocket). */
export function sendBoxCall() {
  // Local: same-browser tabs via BroadcastChannel
  const ch = getDriverChannel();
  ch?.postMessage({ type: "boxCall" });

  // Remote: iOS app and other devices via WebSocket relay
  try {
    const ws = _wsRef?.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "box_call" }));
      console.log("[BoxCall] Sent via WebSocket");
    } else {
      console.warn("[BoxCall] WebSocket not available", {
        hasRef: !!_wsRef,
        hasCurrent: !!_wsRef?.current,
        readyState: _wsRef?.current?.readyState,
      });
    }
  } catch (e) {
    console.error("[BoxCall] Failed to send:", e);
  }
}

/** Send a free-text alert to the driver view (BroadcastChannel + WebSocket).
 *  Same transport as sendBoxCall: same-browser tabs via BroadcastChannel,
 *  iOS app / other devices via the server WS relay. Capped at 280 chars. */
export function sendDriverMessage(text: string) {
  const msg = (text || "").trim().slice(0, 280);
  if (!msg) return;

  const ch = getDriverChannel();
  ch?.postMessage({ type: "driverMessage", text: msg });

  try {
    const ws = _wsRef?.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "driver_message", text: msg }));
      console.log("[DriverMessage] Sent via WebSocket");
    } else {
      console.warn("[DriverMessage] WebSocket not available");
    }
  } catch (e) {
    console.error("[DriverMessage] Failed to send:", e);
  }
}

/** Broadcast driver config changes to other windows (driver view, live). */
export function broadcastDriverConfig(config: {
  visibleCards: Record<string, boolean>;
  cardOrder: string[];
}) {
  const ch = getDriverChannel();
  ch?.postMessage({ type: "configSync", config });
}
