/**
 * Shared BroadcastChannel for main app <-> driver view communication.
 * Used by BOX call button (sender) and DriverView (receiver).
 */

let channel: BroadcastChannel | null = null;

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

/** Send a BOX alert to the driver view. */
export function sendBoxCall() {
  const ch = getDriverChannel();
  ch?.postMessage({ type: "boxCall" });
}

/** Broadcast driver config changes to other windows (driver view, live). */
export function broadcastDriverConfig(config: {
  visibleCards: Record<string, boolean>;
  cardOrder: string[];
}) {
  const ch = getDriverChannel();
  ch?.postMessage({ type: "configSync", config });
}
