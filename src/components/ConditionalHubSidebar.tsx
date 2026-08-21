"use client";

/**
 * ConditionalHubSidebar
 *
 * Wraps HubSidebar and hides it on routes that supply their own fixed
 * sidebar (currently /staff/finance/*).  Keeping this as a thin client
 * component avoids adding path-awareness to the server DashboardShell.
 */

import { usePathname } from "next/navigation";
import HubSidebar from "@/components/HubSidebar";
import type { NavHub } from "@/lib/permissions";

interface Props {
  userEmail:    string;
  roleLabel:    string;
  role:         string;
  avatarUrl?:   string | null;
  schoolName?:  string;
  visibleHubs?: Set<NavHub>;
}

/** Path prefixes that render their own fixed sidebar. */
const MODULE_SIDEBAR_PATHS = ["/staff/finance", "/staff/library"];

export default function ConditionalHubSidebar(props: Props) {
  const pathname = usePathname();
  const hidden   = MODULE_SIDEBAR_PATHS.some((p) => pathname.startsWith(p));

  if (hidden) return null;
  return <HubSidebar {...props} />;
}
