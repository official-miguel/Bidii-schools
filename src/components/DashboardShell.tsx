/**
 * DashboardShell — server component.
 *
 * Wraps every role layout with the correct shell (sidebar + top bar) while
 * passing permission-filtered hub visibility down to HubSidebar/MobileDrawer.
 *
 * The HubSidebar icon rail is automatically hidden on routes that supply their
 * own fixed sidebar (e.g. /staff/finance — handled by ConditionalHubSidebar).
 * ShellContentWrapper applies the correct md:pl-* offset client-side so the
 * content area always clears whichever sidebar is active.
 *
 * Usage in any layout:
 *
 *   <DashboardShell role="staff" roleLabel="Librarian" user={user} school={school}>
 *     {children}
 *   </DashboardShell>
 */

import ConditionalHubSidebar from "@/components/ConditionalHubSidebar";
import TopAppBar  from "@/components/TopAppBar";
import { MobileDrawerProvider } from "@/components/MobileDrawerContext";
import SomaAIProvider from "@/components/SomaAIProvider";
import BackButton from "@/components/BackButton";
import ShellContentWrapper from "@/components/ShellContentWrapper";
import type { NavHub } from "@/lib/permissions";

function initials(email: string, label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

interface DashboardShellProps {
  children:      React.ReactNode;
  role:          string;
  roleLabel:     string;
  userEmail:     string;
  /** Optional profile photo URL for the current user. */
  avatarUrl?:    string | null;
  schoolName?:   string;
  motto?:        string | null;
  /** Hubs this user may see. undefined = all (PRINCIPAL/TEACHER). */
  visibleHubs?:  Set<NavHub>;
  warnUnlinked?: boolean;
}

export default function DashboardShell({
  children,
  role,
  roleLabel,
  userEmail,
  avatarUrl,
  schoolName,
  motto,
  visibleHubs,
  warnUnlinked,
}: DashboardShellProps) {
  const userInitials = initials(userEmail, roleLabel);

  return (
    <MobileDrawerProvider>
      <SomaAIProvider role={role} schoolName={schoolName}>
        <div className="min-h-screen bg-paper dark:bg-dark-bg">
          {/*
           * ConditionalHubSidebar is a client component that reads the current
           * pathname and hides itself on routes that use their own sidebar
           * (e.g. /staff/finance). This avoids prop-drilling the current path
           * down through server layouts.
           */}
          <ConditionalHubSidebar
            userEmail={userEmail}
            roleLabel={roleLabel}
            role={role}
            avatarUrl={avatarUrl}
            schoolName={schoolName}
            visibleHubs={visibleHubs}
          />
          <TopAppBar
            userEmail={userEmail}
            roleLabel={roleLabel}
            userInitials={userInitials}
            avatarUrl={avatarUrl}
            schoolName={schoolName}
            role={role}
          />
          {/*
           * ShellContentWrapper reads the pathname client-side and applies the
           * correct left-padding:
           *   /staff/finance/* → md:pl-64 (FinanceSidebarNav width)
           *   everywhere else  → md:pl-16 (HubSidebar icon rail width)
           */}
          <ShellContentWrapper>
            {/* School motto banner */}
            {motto && (
              <div className="bg-teal/5 border-b border-teal/10 dark:bg-teal/10 dark:border-teal/20">
                <p className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-1.5 text-xs text-center font-medium text-teal/80 dark:text-teal/70 italic tracking-wide">
                  {motto}
                </p>
              </div>
            )}
            <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 lg:px-10">
              {warnUnlinked && (
                <div className="rounded-lg bg-warn-bg border border-warn/20 text-warn text-sm px-4 py-3 mb-6">
                  Your login isn&apos;t linked to a staff record yet. Ask the principal to link your account
                  from the Staff panel.
                </div>
              )}
              <BackButton />
              {children}
            </div>
          </ShellContentWrapper>
        </div>
      </SomaAIProvider>
    </MobileDrawerProvider>
  );
}
