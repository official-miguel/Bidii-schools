"use client";

/**
 * ShellContentWrapper
 *
 * Thin client component used by DashboardShell to apply the correct
 * left-padding offset depending on which module the user is in.
 *
 * - Default (icon rail present):    md:pl-16  (HubSidebar = w-16)
 * - Finance module (/staff/finance): md:pl-64  (FinanceSidebarNav = w-64)
 * - Library module (/staff/library): md:pl-64
 *
 * When showBottomNav is true (teacher / principal), a nested div adds bottom
 * padding on mobile so content isn't hidden behind the fixed MobileBottomNav.
 * A second md: override resets the padding back to 0 on desktop.
 */

import { usePathname } from "next/navigation";

const MODULE_PADDING: Array<{ prefix: string; cls: string }> = [
  { prefix: "/staff/finance", cls: "md:pl-64" },
  { prefix: "/staff/library", cls: "md:pl-64" },
];

const DEFAULT_PADDING = "md:pl-16";

interface Props {
  children:       React.ReactNode;
  /** When true, adds bottom padding on mobile to clear the bottom tab bar. */
  showBottomNav?: boolean;
}

export default function ShellContentWrapper({ children, showBottomNav = false }: Props) {
  const pathname = usePathname();

  const match   = MODULE_PADDING.find((m) => pathname.startsWith(m.prefix));
  const leftPad = match ? match.cls : DEFAULT_PADDING;

  return (
    <div
      className={`${leftPad} min-h-screen`}
      style={{ paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))" }}
    >
      {/*
       * Bottom-padding shim for mobile bottom nav.
       * pb-[76px] on mobile (60px bar + ~16px breathing room) → md:pb-0
       * Uses env(safe-area-inset-bottom) via an additional inline style only
       * when the bottom nav is present, so notched phones get extra clearance.
       */}
      {showBottomNav ? (
        <div
          className="md:pb-0"
          style={{ paddingBottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
