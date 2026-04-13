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
    }
  } catch {
    // ignore
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
