"use client";

import { useState, useEffect } from "react";
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
import { LiveTiming } from "@/components/live/LiveTiming";
import { AdjustedClassification } from "@/components/classification/AdjustedClassification";
import { RealClassificationBeta } from "@/components/classification/RealClassificationBeta";
import { ReplayTab } from "@/components/replay/ReplayTab";
import { KartAnalyticsTab } from "@/components/analytics/KartAnalyticsTab";
import { GpsInsightsTab } from "@/components/insights/GpsInsightsTab";
import { DriverView } from "@/components/driver/DriverView";
import { DriverConfigTab } from "@/components/driver/DriverConfigTab";
import { MfaSetupRequired } from "@/components/auth/MfaSetupRequired";
import { CircuitSelector } from "@/components/checkout/CircuitSelector";
import { EmbeddedCheckout } from "@/components/checkout/EmbeddedCheckout";
import { AccountPanel } from "@/components/account/AccountPanel";
import { ConfirmProvider } from "@/components/shared/ConfirmDialog";
import { ChatWidget } from "@/components/chat/ChatWidget";

export default function DashboardPage() {
  const { token, user, _hydrated, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("race");
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [pendingPlanPerCircuit, setPendingPlanPerCircuit] = useState<boolean>(true);
  const [checkoutCircuitId, setCheckoutCircuitId] = useState<number | null>(null);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [eventDates, setEventDates] = useState<string[] | undefined>(undefined);
  const router = useRouter();

  useEffect(() => {
    if (_hydrated && !token) {
      router.push("/login");
    }
  }, [_hydrated, token, router]);

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

  // Look up per_circuit flag for the pending plan to decide whether to show
  // the circuit selector or go straight to checkout with a null circuit.
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
          setPendingPlanPerCircuit(perCircuit);
          if (!perCircuit) {
            setCheckoutCircuitId(null);
          }
          setCheckoutReady(true);
        })
        .catch(() => {
          setPendingPlanPerCircuit(true);
          setCheckoutReady(true);
        })
    );
  }, [pendingPlan]);

  // Handle circuit selection → show embedded checkout
  const handleCircuitSelected = (circuitId: number, dates?: string[]) => {
    setCheckoutCircuitId(circuitId);
    setEventDates(dates);
  };

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
          circuitId={null}
          eventDates={eventDates}
          onCancel={() => { setCheckoutCircuitId(null); setPendingPlan(null); setEventDates(undefined); }}
        />
      );
    }
    if (checkoutCircuitId) {
      return (
        <EmbeddedCheckout
          plan={pendingPlan}
          circuitId={checkoutCircuitId}
          eventDates={eventDates}
          onCancel={() => { setCheckoutCircuitId(null); setPendingPlan(null); setEventDates(undefined); }}
        />
      );
    }
    return <CircuitSelector plan={pendingPlan} onSelect={handleCircuitSelected} onCancel={() => setPendingPlan(null)} />;
  }

  // Subscription gate: non-admin users without active subscription see upgrade page
  if (!user?.is_admin && !user?.has_active_subscription) {
    return <NoSubscription username={user?.username || ""} />;
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
          {activeTab === "classification" && <ClassificationTable />}
          {activeTab === "adjusted" && userTabs.includes("adjusted") && <AdjustedClassification />}
          {activeTab === "adjusted-beta" && userTabs.includes("adjusted-beta") && <RealClassificationBeta />}
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
    try { await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/auth/logout`, { method: "POST" }); } catch {}
    logout();
    router.push("/");
  };

  const handlePortal = async () => {
    try {
      const { api } = await import("@/lib/api");
      const data = await api.getCustomerPortal();
      window.location.href = data.url;
    } catch {
      // No Stripe customer yet, redirect to pricing
      router.push("/#pricing");
    }
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
            className="block w-full bg-accent hover:bg-accent-hover text-black font-semibold py-3 rounded-lg transition-colors tracking-wide mb-3"
          >
            Ver planes y precios
          </a>

          <button
            onClick={handlePortal}
            className="w-full text-accent hover:text-accent-hover text-sm py-2 transition-colors"
          >
            Gestionar suscripcion existente
          </button>
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
