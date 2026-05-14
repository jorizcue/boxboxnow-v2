"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useRaceWebSocket } from "@/hooks/useRaceWebSocket";
import { useRaceStore } from "@/hooks/useRaceState";
import { StatusBar } from "@/components/layout/StatusBar";
import { Sidebar } from "@/components/layout/Sidebar";
import type { Tab } from "@/components/layout/Sidebar";
import { RaceTable } from "@/components/race/RaceTable";
import { FifoQueue } from "@/components/pit/FifoQueue";
import { ClassificationTable } from "@/components/classification/ClassificationTable";
import { ConfigPanel } from "@/components/config/ConfigPanel";
import { AdminUsersPanel, AdminCircuitsPanel, AdminHubPanel, AdminPlatformPanel, AdminMarketingPanel } from "@/components/admin/AdminPanel";
import { AdminAnalyticsPanel } from "@/components/admin/AdminAnalyticsPanel";
import { LiveTiming } from "@/components/live/LiveTiming";
import { AdjustedClassification } from "@/components/classification/AdjustedClassification";
import { ReplayTab } from "@/components/replay/ReplayTab";
import { KartAnalyticsTab } from "@/components/analytics/KartAnalyticsTab";
import { GpsInsightsTab } from "@/components/insights/GpsInsightsTab";
import { TrackingTab } from "@/components/tracking/TrackingTab";
import { DriverView } from "@/components/driver/DriverView";
import { DriverConfigTab } from "@/components/driver/DriverConfigTab";
import { MfaSetupRequired } from "@/components/auth/MfaSetupRequired";
import { CircuitSelector } from "@/components/checkout/CircuitSelector";
import { EmbeddedCheckout } from "@/components/checkout/EmbeddedCheckout";
import { AccountPanel } from "@/components/account/AccountPanel";
import { ConfirmProvider } from "@/components/shared/ConfirmDialog";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { useSiteStatus } from "@/hooks/useSiteStatus";
import { MaintenancePage } from "@/components/landing/MaintenancePage";
import { useTracker, useTrackerInit } from "@/hooks/useTracker";

export default function DashboardPage() {
  const { token, user, _hydrated, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("race");

  // First-party usage analytics. Idempotent — only the first call per
  // app load does real work (generates visitor_id, snapshots first-
  // touch UTM, fires session_start). Lives at the very top so even
  // an unauthenticated user briefly hitting /dashboard before being
  // redirected to /login is counted.
  useTrackerInit();
  const { trackFunnel } = useTracker();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [pendingPlanPerCircuit, setPendingPlanPerCircuit] = useState<boolean>(true);
  // Number of circuits the pending plan requires the buyer to pick.
  // Mirrors ProductTabConfig.circuits_to_select from /api/plans. 1 is
  // the legacy single-circuit checkout; >1 unlocks the multi-circuit
  // checkbox grid in CircuitSelector and routes a full id list to the
  // checkout endpoint.
  const [pendingPlanCircuitCount, setPendingPlanCircuitCount] = useState<number>(1);
  const [checkoutCircuitIds, setCheckoutCircuitIds] = useState<number[] | null>(null);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [eventDates, setEventDates] = useState<string[] | undefined>(undefined);
  const router = useRouter();

  const { maintenance, loading: siteLoading } = useSiteStatus();

  useEffect(() => {
    if (_hydrated && !token) {
      router.push("/login");
    }
  }, [_hydrated, token, router]);

  // Maintenance gate: non-admin traffic gets the maintenance page even
  // when authenticated. Admins keep full access so they can monitor.
  if (!siteLoading && maintenance && user && !user.is_admin) {
    return <MaintenancePage />;
  }

  // Always refresh user state once per dashboard mount so admin-side
  // changes (subscription edits, circuit-access grants/revokes) reach
  // the SPA without forcing the user to log out and back in. Without
  // this, the cached `user` from the last login can keep
  // has_active_circuit_access=false even after an admin granted a new
  // circuit, leaving the user stranded on <NoCircuitAccess /> despite
  // the backend already reporting access. Single fetch — the Stripe
  // checkout-success retry loop below still handles the async webhook
  // case independently.
  useEffect(() => {
    if (!_hydrated || !token) return;
    import("@/lib/api").then(({ api }) =>
      api.getMe().then(updateUser).catch(() => {
        // 401 / network errors fall through; the existing token-watch
        // logic elsewhere will redirect to /login if the session is
        // genuinely dead.
      })
    );
  }, [_hydrated, token, updateUser]);

  // Refresh user data after Stripe checkout success.
  // Uses a retry loop because the Stripe webhook that activates the
  // subscription is asynchronous — a single immediate fetch often races
  // and returns has_active_subscription=false. We retry up to 6 times
  // (12 seconds total) until the subscription appears active.
  useEffect(() => {
    if (!_hydrated || !token) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      // Clean URL immediately so a refresh doesn't re-trigger this flow
      window.history.replaceState({}, "", "/dashboard");
      let attempts = 0;
      const maxAttempts = 6;
      const poll = () => {
        import("@/lib/api").then(({ api }) =>
          api.getMe().then((freshUser) => {
            updateUser(freshUser);
            attempts++;
            // Keep polling until subscription is active or we give up
            if (!freshUser.has_active_subscription && attempts < maxAttempts) {
              setTimeout(poll, 2000);
            }
          }).catch(() => {})
        );
      };
      poll();
    }
  }, [_hydrated, token, updateUser]);

  // Detect pending plan from localStorage (set during pricing → register flow)
  useEffect(() => {
    if (!_hydrated || !token) return;
    const plan = localStorage.getItem("bbn_pending_plan");
    if (plan) {
      localStorage.removeItem("bbn_pending_plan");
      setPendingPlan(plan);
    }
  }, [_hydrated, token]);

  // Look up per_circuit flag + circuits_to_select for the pending plan
  // to decide whether to show the circuit selector (and as single- or
  // multi-pick) or go straight to checkout with a null circuit.
  useEffect(() => {
    if (!pendingPlan) {
      setCheckoutReady(false);
      return;
    }
    setCheckoutReady(false);
    import("@/lib/api").then(({ api }) =>
      api
        .getPlans()
        .then((plans) => {
          const match = plans.find((p) => p.plan_type === pendingPlan);
          const perCircuit = match ? match.per_circuit : true;
          const count =
            match && typeof match.circuits_to_select === "number"
              ? Math.max(1, match.circuits_to_select)
              : 1;
          setPendingPlanPerCircuit(perCircuit);
          setPendingPlanCircuitCount(count);
          if (!perCircuit) {
            setCheckoutCircuitIds(null);
          }
          setCheckoutReady(true);
        })
        .catch(() => {
          setPendingPlanPerCircuit(true);
          setPendingPlanCircuitCount(1);
          setCheckoutReady(true);
        })
    );
  }, [pendingPlan]);

  // Handle circuit selection → show embedded checkout
  const handleCircuitSelected = (circuitIds: number[], dates?: string[]) => {
    setCheckoutCircuitIds(circuitIds);
    setEventDates(dates);
    trackFunnel("checkout.circuit_selected", {
      circuit_count: circuitIds.length,
      circuit_ids: circuitIds,
      plan: pendingPlan,
    });
  };

  // Funnel stages: fire when the user first lands on each checkout
  // surface. CircuitSelector shows for per-circuit plans; the
  // EmbeddedCheckout shows once the plan info is ready. Both gates by
  // `checkoutReady` so we don't fire while we're still resolving the
  // pending plan's metadata.
  const showCircuitSelector =
    !!pendingPlan && checkoutReady && pendingPlanPerCircuit &&
    !(checkoutCircuitIds && checkoutCircuitIds.length > 0);
  const showEmbeddedCheckout =
    !!pendingPlan && checkoutReady &&
    (!pendingPlanPerCircuit ||
      (checkoutCircuitIds !== null && checkoutCircuitIds.length > 0));
  useEffect(() => {
    if (showCircuitSelector) {
      trackFunnel("checkout.circuit_view", { plan: pendingPlan });
    }
  }, [showCircuitSelector, pendingPlan, trackFunnel]);
  useEffect(() => {
    if (showEmbeddedCheckout) {
      trackFunnel("checkout.embedded_open", {
        plan: pendingPlan,
        circuit_count: checkoutCircuitIds?.length ?? 0,
      });
    }
  }, [showEmbeddedCheckout, pendingPlan, checkoutCircuitIds, trackFunnel]);

  if (!_hydrated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="text-lg font-bold animate-pulse">
          <span className="text-white">BOXBOX</span>
          <span className="text-accent">NOW</span>
        </span>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <span className="text-lg font-bold animate-pulse">
          <span className="text-white">BOXBOX</span>
          <span className="text-accent">NOW</span>
        </span>
      </div>
    );
  }

  if (user?.mfa_required && !user?.mfa_enabled) {
    return (
      <ConfirmProvider>
        <MfaSetupRequired />
      </ConfirmProvider>
    );
  }

  // Checkout flow: circuit selection → embedded payment
  if (pendingPlan && checkoutReady) {
    // Cross-circuit plans skip the circuit selector entirely.
    if (!pendingPlanPerCircuit) {
      return (
        <EmbeddedCheckout
          plan={pendingPlan}
          circuitIds={[]}
          eventDates={eventDates}
          onCancel={() => { setCheckoutCircuitIds(null); setPendingPlan(null); setEventDates(undefined); }}
        />
      );
    }
    if (checkoutCircuitIds && checkoutCircuitIds.length > 0) {
      return (
        <EmbeddedCheckout
          plan={pendingPlan}
          circuitIds={checkoutCircuitIds}
          eventDates={eventDates}
          onCancel={() => { setCheckoutCircuitIds(null); setPendingPlan(null); setEventDates(undefined); }}
        />
      );
    }
    return (
      <CircuitSelector
        plan={pendingPlan}
        circuitsToSelect={pendingPlanCircuitCount}
        onSelect={handleCircuitSelected}
        onCancel={() => setPendingPlan(null)}
      />
    );
  }

  // Subscription gate: non-admin, non-internal users without active
  // subscription see the upgrade page. Internal staff/partner accounts
  // skip this gate (no payment) but still go through the circuit-access
  // gate below — same way the backend mirrors it in
  // `user_has_active_subscription` + the WS handshake gates.
  if (!user?.is_admin && !user?.is_internal && !user?.has_active_subscription) {
    return <NoSubscription username={user?.username || ""} />;
  }

  // Circuit-access gate: a paying or internal user with zero currently-valid
  // UserCircuitAccess rows lands on a "no circuits" page instead of an
  // empty dashboard. Backend mirrors this with router-level
  // `require_active_circuit_access` so even a hand-crafted API call
  // can't bypass.
  if (!user?.is_admin && !user?.has_active_circuit_access) {
    return <NoCircuitAccess username={user?.username || ""} />;
  }

  return (
    <ConfirmProvider>
      <Dashboard activeTab={activeTab} setActiveTab={setActiveTab} />
    </ConfirmProvider>
  );
}

function TrialBanner() {
  const { user } = useAuth();
  const [bannerDays, setBannerDays] = useState<number | null>(null);

  useEffect(() => {
    import("@/lib/api").then(({ api }) =>
      api.getTrialConfig().then((c) => setBannerDays(c.trial_banner_days)).catch(() => setBannerDays(7))
    );
  }, []);

  if (!user?.trial_ends_at || user?.is_admin || bannerDays === null) return null;

  const trialEnd = new Date(user.trial_ends_at);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  if (daysLeft > bannerDays) return null;

  const urgency = daysLeft <= 3;

  return (
    <div className={`px-3 py-1.5 text-xs flex items-center justify-between ${urgency ? "bg-yellow-900/50 border-b border-yellow-800/50" : "bg-accent/5 border-b border-accent/10"}`}>
      <span className={urgency ? "text-yellow-300" : "text-accent/80"}>
        {daysLeft === 0
          ? "Tu prueba gratuita termina hoy"
          : `Prueba gratuita: ${daysLeft} dia${daysLeft !== 1 ? "s" : ""} restante${daysLeft !== 1 ? "s" : ""}`}
      </span>
      <a
        href="/#pricing"
        className={`font-semibold px-3 py-1 rounded text-xs transition-colors ${urgency ? "bg-yellow-600 hover:bg-yellow-500 text-black" : "bg-accent hover:bg-accent-hover text-black"}`}
      >
        Elegir plan
      </a>
    </div>
  );
}

function Dashboard({
  activeTab,
  setActiveTab,
}: {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}) {
  useRaceWebSocket();
  const { connected, trackName, countdownMs } = useRaceStore();
  const { user } = useAuth();
  const userTabs = user?.tab_access ?? [];
  const { trackTab, trackFunnel } = useTracker();

  // Last funnel stage: the user passed every gate (subscription,
  // circuit access, MFA) and is looking at the real dashboard. Fires
  // once per app load via the useRef guard — we don't want a tab
  // change in the same session to re-trigger "first view".
  const firstViewFired = useRef(false);
  useEffect(() => {
    if (firstViewFired.current) return;
    firstViewFired.current = true;
    trackFunnel("dashboard.first_view");
  }, [trackFunnel]);

  // Every tab change fires a `tab_view` event. Captures the SPA's
  // navigation flow without instrumenting each tab component
  // separately — one central useEffect powers the entire "top tabs"
  // chart in the admin analytics panel.
  useEffect(() => {
    if (!activeTab) return;
    trackTab(activeTab);
  }, [activeTab, trackTab]);

  return (
    <div className="flex flex-col h-screen">
      <StatusBar
        connected={connected}
        trackName={trackName}
        countdownMs={countdownMs}
      />
      <TrialBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAdmin={user?.is_admin ?? false}
          userTabs={userTabs}
          username={user?.username || ""}
        />
        <main className="flex-1 overflow-auto p-2 sm:p-3">
          {activeTab === "race" && userTabs.includes("race") && <RaceTable />}
          {activeTab === "pit" && userTabs.includes("pit") && <FifoQueue />}
          {/* LiveTiming stays mounted (hidden) so iframe replay doesn't restart on tab switch */}
          {userTabs.includes("live") && (
            <div className={activeTab === "live" ? "" : "hidden"}>
              <LiveTiming />
            </div>
          )}
          {activeTab === "tracking" && userTabs.includes("tracking") && <TrackingTab />}
          {activeTab === "classification" && <ClassificationTable />}
          {activeTab === "adjusted" && userTabs.includes("adjusted") && <AdjustedClassification />}
          {activeTab === "driver" && userTabs.includes("driver") && <DriverView />}
          {activeTab === "driver-config" && userTabs.includes("driver-config") && <DriverConfigTab />}
          {activeTab === "config" && userTabs.includes("config") && <ConfigPanel />}
          {activeTab === "replay" && userTabs.includes("replay") && <ReplayTab />}
          {activeTab === "analytics" && userTabs.includes("analytics") && <KartAnalyticsTab />}
          {activeTab === "insights" && userTabs.includes("insights") && <GpsInsightsTab />}
          {activeTab === "account" && <AccountPanel />}
          {activeTab === "admin-users" && user?.is_admin && userTabs.includes("admin-users") && <AdminUsersPanel />}
          {activeTab === "admin-circuits" && user?.is_admin && userTabs.includes("admin-circuits") && <AdminCircuitsPanel />}
          {activeTab === "admin-hub" && user?.is_admin && userTabs.includes("admin-hub") && <AdminHubPanel />}
          {activeTab === "admin-platform" && user?.is_admin && <AdminPlatformPanel />}
          {activeTab === "admin-marketing" && user?.is_admin && <AdminMarketingPanel />}
          {activeTab === "admin-analytics" && user?.is_admin && <AdminAnalyticsPanel />}
        </main>
      </div>
      {/* Floating support chatbot — visible only when user has the `chat`
          permission (or is admin). Self-gated inside the component. */}
      <ChatWidget />
    </div>
  );
}

function NoSubscription({ username }: { username: string }) {
  const { logout, user } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    // Use the api wrapper so the Authorization header is attached. The
    // bare fetch we used here before went without auth and silently
    // failed server-side — leaving the device session alive even after
    // the user "logged out". We log loud now and only fall through to
    // local logout if the server call really did fail; the redirect
    // happens regardless so the user is never stranded.
    try {
      const { api } = await import("@/lib/api");
      await api.logout();
    } catch (e) {
      console.error("[logout] backend logout failed; clearing local state anyway", e);
    }
    logout();
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="inline-flex items-center gap-0 mb-2">
            <span className="text-4xl font-bold text-white">BB</span>
            <span className="text-4xl font-bold text-accent">N</span>
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-white">
            BOXBOX<span className="text-accent">NOW</span>
          </h1>
        </div>

        <div className="bg-surface rounded-2xl p-6 sm:p-8 border border-border mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
            {user?.subscription_plan === "trial" ? (
              <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            )}
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Hola, {username}
          </h2>
          <p className="text-neutral-400 text-sm mb-6">
            {user?.subscription_plan === "trial"
              ? "Tu prueba gratuita ha terminado. Elige un plan para seguir usando BoxBoxNow con todas sus funcionalidades."
              : "No tienes una suscripcion activa. Elige un plan para acceder a todas las funcionalidades de BoxBoxNow."}
          </p>

          <a
            href="/#pricing"
            className="block w-full bg-accent hover:bg-accent-hover text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
          >
            Ver planes y precios
          </a>
        </div>

        <button
          onClick={handleLogout}
          className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

/** Gate page for users whose UserCircuitAccess rows are all expired (or
 *  never granted). Distinct from <NoSubscription /> — billing is fine,
 *  the missing piece is per-circuit access which only an admin can
 *  grant. Copy reflects that by directing the user to contact support
 *  / their team admin instead of pricing pages. */
function NoCircuitAccess({ username }: { username: string }) {
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const { api } = await import("@/lib/api");
      await api.logout();
    } catch (e) {
      console.error("[logout] backend logout failed; clearing local state anyway", e);
    }
    logout();
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="inline-flex items-center gap-0 mb-2">
            <span className="text-4xl font-bold text-white">BB</span>
            <span className="text-4xl font-bold text-accent">N</span>
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-white">
            BOXBOX<span className="text-accent">NOW</span>
          </h1>
        </div>

        <div className="bg-surface rounded-2xl p-6 sm:p-8 border border-border mb-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-400/10 flex items-center justify-center">
            {/* clock-with-stop icon — your access window has elapsed */}
            <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">
            Hola, {username}
          </h2>
          <p className="text-neutral-400 text-sm mb-6">
            Tu suscripcion sigue activa, pero no tienes acceso a ningun
            circuito en este momento. Contacta con tu administrador o con
            soporte para que renueven tu acceso.
          </p>

          <a
            href="mailto:soporte@boxboxnow.com"
            className="block w-full bg-accent hover:bg-accent-hover text-black font-semibold py-3 rounded-lg transition-colors tracking-wide"
          >
            Contactar con soporte
          </a>
        </div>

        <button
          onClick={handleLogout}
          className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
