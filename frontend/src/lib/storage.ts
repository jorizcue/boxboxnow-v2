/**
 * Single source of truth for the localStorage keys this app reads/writes.
 *
 * Centralised so that:
 *   1. Logout can wipe all session-bound state without grepping the codebase.
 *   2. Naming is consistent across components.
 *   3. Future audits can spot at a glance what we persist on the device.
 *
 * Keys are split into two groups:
 *   - SESSION-BOUND: tied to the logged-in user's session. Cleared on logout.
 *   - DEVICE-LEVEL: user preferences we want to survive logout (language).
 *     Driver-config keys are per-user (`boxboxnow-driver-config-{userId}`)
 *     so they're naturally scoped already; we leave them alone on logout.
 */

export const STORAGE_KEYS = {
  // Auth: managed by the zustand persist middleware (see useAuth.ts).
  AUTH: "boxboxnow-auth",

  // Plan parameter that survives the OAuth round-trip from the landing
  // page through Google back to /dashboard.
  PENDING_PLAN: "bbn_pending_plan",

  // Chatbot session id so the conversation survives a page reload.
  // Tied to a logged-in user — clear on logout.
  CHAT_SESSION: "boxboxnow-chat-session",

  // "1" when the user dismissed the floating assistant launcher.
  // Session-bound so it survives reloads but the assistant comes back
  // on next login (the discreet re-activation path).
  CHAT_HIDDEN: "bbn_chat_hidden",

  // RaceBox finish-line GPS coords cached by the lap tracker.
  RACEBOX_FINISH_LINE: "bbn-racebox-finishline",

  // Device-level UX preference; intentionally NOT cleared on logout.
  LANGUAGE: "boxboxnow-lang",

  // Usage analytics (F1). Both are DEVICE-LEVEL — they survive logout
  // so the same browser keeps a stable visitor_id across login sessions
  // (essential for the acquisition funnel: anonymous → registered →
  // paying customer all need to share an identifier).
  //
  // - VISITOR_ID: UUID v4 generated on first ever landing. First-party,
  //   never shared with third parties.
  // - FIRST_TOUCH: JSON blob with the first UTM / referrer captured for
  //   this visitor. Snapshot-only — once set, never overwritten by
  //   later visits, so attribution stays loyal to whatever brought the
  //   user in originally.
  // - ANALYTICS_OPT_OUT: "1" when the user has flipped the "Permitir
  //   analítica interna" toggle in Cuenta → Privacidad. When set the
  //   useTracker hook short-circuits and emits nothing.
  VISITOR_ID: "bbn_vid",
  FIRST_TOUCH: "bbn_ft",
  ANALYTICS_OPT_OUT: "bbn_ao",
} as const;

// Keys to wipe when the user logs out. Anything tied to "this session" or
// "this user's last actions" — but not language preference (which is a
// device-level UX choice, not session state).
const SESSION_BOUND_KEYS: readonly string[] = [
  STORAGE_KEYS.AUTH,
  STORAGE_KEYS.PENDING_PLAN,
  STORAGE_KEYS.CHAT_SESSION,
  STORAGE_KEYS.CHAT_HIDDEN,
  STORAGE_KEYS.RACEBOX_FINISH_LINE,
];

/**
 * Wipe every session-bound localStorage key. Called from logout flows.
 * Idempotent and exception-safe — a missing key is a no-op.
 */
export function clearSessionStorage() {
  if (typeof window === "undefined") return;
  for (const key of SESSION_BOUND_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Quota / privacy mode: ignore, the user is logging out anyway.
    }
  }
}
