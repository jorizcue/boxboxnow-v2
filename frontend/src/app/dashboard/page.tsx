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
import { AdminUsersPanel, AdminCircuitsPanel, AdminHubPanel, AdminPlatformPanel } from "@/components/admin/AdminPanel";
import { LiveTiming } from "@/components/live/LiveTiming";
import { AdjustedClassification } from "@/components/classification/AdjustedClassification";
import { RealClassificationBeta } from "@/components/classification/RealClassificationBeta";
import { ReplayTab } from "@/components/replay/ReplayTab";
import { KartAnalyticsTab } from "@/components/analytics/KartAnalyticsTab";
import { GpsInsightsTab } from "@/components/insights/GpsInsightsTab";
import { DriverView } from "@/components/driver/DriverView";
import { DriverConfigTab } from "@/components/driver/DriverConfigTab";
import { MfaSetupRequired } from "@/components/auth/MfaSetupRequired";
import { ConfirmProvider } from "@/components/shared/ConfirmDialog";

export default function DashboardPage() {
  const { token, user, _hydrated } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("race");
  const [checkingOut, setCheckingOut] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (_hydrated && !token) {
      router.push("/login");
    }
  }, [_hydrated, token, router]);

  // Auto-checkout: if user just registered/logged in with a pending plan, redirect to Stripe
  useEffect(() => {
    if (!_hydrated || !token || checkingOut) return;
    const pendingPlan = localStorage.getItem("bbn_pending_plan");
    if (!pendingPlan) return;

    // Clear immediately to prevent loops
    localStorage.removeItem("bbn_pending_plan");
    setCheckingOut(true);

    import("@/lib/api").then(({ api }) =>
      api.createCheckoutSession("", undefined, pendingPlan)
        .then((data) => {
          window.location.href = data.checkout_url;
        })
        .catch(() => {
          setCheckingOut(false);
        })
    );
  }, [_hydrated, token, checkingOut]);

  if (!_hydrated || checkingOut) {
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
        username={user?.username || ""}
      />
      <TrialBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAdmin={user?.is_admin ?? false}
          userTabs={userTabs}
        />
        <main className="flex-1 overflow-auto p-2 sm:p-3">
          {activeTab === "race" && userTabs.includes("race") && <RaceTable />}
          {activeTab === "pit" && userTabs.includes("pit") && <FifoQueue />}
          {activeTab === "live" && userTabs.includes("live") && <LiveTiming />}
          {activeTab === "classification" && <ClassificationTable />}
          {activeTab === "adjusted" && userTabs.includes("adjusted") && <AdjustedClassification />}
          {activeTab === "adjusted-beta" && userTabs.includes("adjusted-beta") && <RealClassificationBeta />}
          {activeTab === "driver" && userTabs.includes("driver") && <DriverView />}
          {activeTab === "driver-config" && userTabs.includes("driver-config") && <DriverConfigTab />}
          {activeTab === "config" && userTabs.includes("config") && <ConfigPanel />}
          {activeTab === "replay" && userTabs.includes("replay") && <ReplayTab />}
          {activeTab === "analytics" && userTabs.includes("analytics") && <KartAnalyticsTab />}
          {activeTab === "insights" && userTabs.includes("insights") && <GpsInsightsTab />}
          {activeTab === "admin-users" && user?.is_admin && userTabs.includes("admin-users") && <AdminUsersPanel />}
          {activeTab === "admin-circuits" && user?.is_admin && userTabs.includes("admin-circuits") && <AdminCircuitsPanel />}
          {activeTab === "admin-hub" && user?.is_admin && userTabs.includes("admin-hub") && <AdminHubPanel />}
          {activeTab === "admin-platform" && user?.is_admin && <AdminPlatformPanel />}
        </main>
      </div>
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
