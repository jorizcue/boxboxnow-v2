"use client";

/**
 * Homepage router.
 *
 * Branches on auth + admin-controlled site status to decide what `/`
 * renders. Three modes, evaluated in priority order:
 *
 *   1. Maintenance ON → MaintenancePage (everyone except admins).
 *   2. Pre-launch (launch_at in the future) AND not logged in → Countdown.
 *   3. Otherwise → MarketingHome (with CTAs and pricing).
 *
 * Admin bypass: maintenance never blocks admins so they can keep
 * monitoring / reverting things while non-admin traffic sees the
 * maintenance page.
 */

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSiteStatus } from "@/hooks/useSiteStatus";
import { Countdown } from "@/components/landing/Countdown";
import { MaintenancePage } from "@/components/landing/MaintenancePage";
import { MarketingHome } from "@/components/landing/MarketingHome";
import { AnalyticsConsentBanner } from "@/components/landing/AnalyticsConsentBanner";
import { useTracker, useTrackerInit } from "@/hooks/useTracker";

export default function HomePage() {
  const _hydrated = useAuth((s) => s._hydrated);
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const { loading, maintenance, launchAt, isPreLaunch } = useSiteStatus();
  // Init the analytics tracker (visitor_id + first-touch UTM capture +
  // session_start event). Calling it here on the landing means
  // attribution is captured on the FIRST hit of an anonymous visitor —
  // critical for the acquisition funnel to work at all.
  useTrackerInit();

  // First funnel stage. We fire AFTER the auth/site-status hydration
  // gate so we don't accidentally double-count the brief null render
  // that happens before _hydrated flips.
  const { trackFunnel } = useTracker();
  useEffect(() => {
    if (!_hydrated || loading) return;
    trackFunnel("landing.view");
  }, [_hydrated, loading, trackFunnel]);

  // Avoid render flash before zustand hydration AND before site-status arrives.
  // Both happen in the first hundreds of ms; rendering null is invisible.
  if (!_hydrated || loading) return null;

  // Maintenance: everyone except admins gets the maintenance screen.
  if (maintenance && !user?.is_admin) {
    return <MaintenancePage />;
  }

  // Pre-launch: countdown for the public, marketing for logged-in users so
  // they can see pricing / log into the dashboard.
  if (isPreLaunch && !token) {
    return <Countdown launchDate={launchAt ? new Date(launchAt) : null} />;
  }

  // Site is open (or admin bypassing pre-launch / maintenance).
  // Banner only rendered for anonymous traffic — logged-in users
  // already know how the platform works and the banner becomes noise.
  return (
    <>
      <MarketingHome />
      {!token && <AnalyticsConsentBanner />}
    </>
  );
}
