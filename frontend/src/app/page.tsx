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

import { useAuth } from "@/hooks/useAuth";
import { useSiteStatus } from "@/hooks/useSiteStatus";
import { Countdown } from "@/components/landing/Countdown";
import { MaintenancePage } from "@/components/landing/MaintenancePage";
import { MarketingHome } from "@/components/landing/MarketingHome";

export default function HomePage() {
  const _hydrated = useAuth((s) => s._hydrated);
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const { loading, maintenance, launchAt, isPreLaunch } = useSiteStatus();

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
  return <MarketingHome />;
}
