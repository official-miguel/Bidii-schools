"use client";

/**
 * SuperAdminShell
 *
 * Client wrapper that composes the sidebar + topbar for every
 * super-admin page. Mirrors DashboardShell's structure but uses the
 * ink-dark sidebar to distinguish the control plane from school dashboards.
 */

import SuperAdminSidebar from "./SuperAdminSidebar";
import SuperAdminTopBar  from "./SuperAdminTopBar";

interface Props {
  children:  React.ReactNode;
  userEmail: string;
}

export default function SuperAdminShell({ children, userEmail }: Props) {
  return (
    <div className="min-h-screen bg-paper dark:bg-dark-bg">
      <SuperAdminSidebar />
      <SuperAdminTopBar userEmail={userEmail} />
      {/* md:pl-16 offsets the fixed 64px sidebar; pt-16 offsets the fixed 64px topbar */}
      <main className="md:pl-16 pt-16 min-h-screen">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
