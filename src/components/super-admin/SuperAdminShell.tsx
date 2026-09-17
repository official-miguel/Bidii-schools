"use client";

/**
 * SuperAdminShell
 *
 * Client wrapper that composes the sidebar + topbar for every
 * super-admin page. Mirrors DashboardShell's structure but uses the
 * ink-dark sidebar to distinguish the control plane from school dashboards.
 */

import { useState } from "react";
import SuperAdminSidebar from "./SuperAdminSidebar";
import SuperAdminTopBar  from "./SuperAdminTopBar";
import ServerNotificationSync from "@/components/ServerNotificationSync";

interface Props {
  children:  React.ReactNode;
  userEmail: string;
  /** Platform owner — the only super admin who sees the Settings section. */
  isOwner?:  boolean;
}

export default function SuperAdminShell({ children, userEmail, isOwner = false }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <SuperAdminSidebar
        isOwner={isOwner}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <ServerNotificationSync userScope={userEmail} />
      <SuperAdminTopBar userEmail={userEmail} onMenuClick={() => setMobileNavOpen(true)} />
      {/* md:pl-44 offsets the fixed 176px sidebar; pt-16 offsets the fixed 64px topbar */}
      <main className="md:pl-44 pt-16 min-h-screen">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
