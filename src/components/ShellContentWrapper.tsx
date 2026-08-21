"use client";

/**
 * ShellContentWrapper
 *
 * Thin client component used by DashboardShell to apply the correct
 * left-padding offset depending on which module the user is in.
 *
 * - Default (icon rail present):    md:pl-16  (HubSidebar = w-16)
 * - Finance module (/staff/finance): md:pl-64  (FinanceSidebarNav = w-64)
 *
 * Add more entries to MODULE_PADDING when new modules get their own sidebar.
 */

import { usePathname } from "next/navigation";

/** Map of path prefix → Tailwind left-padding class for the content area. */
const MODULE_PADDING: Array<{ prefix: string; cls: string }> = [
  { prefix: "/staff/finance", cls: "md:pl-64" },
  { prefix: "/staff/library", cls: "md:pl-64" },
];

const DEFAULT_PADDING = "md:pl-16";

interface Props {
  children: React.ReactNode;
}

export default function ShellContentWrapper({ children }: Props) {
  const pathname = usePathname();

  const match   = MODULE_PADDING.find((m) => pathname.startsWith(m.prefix));
  const leftPad = match ? match.cls : DEFAULT_PADDING;

  return (
    <div className={`${leftPad} pt-16 min-h-screen`}>
      {children}
    </div>
  );
}
