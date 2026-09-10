"use client";

/**
 * MobileBottomNav
 *
 * Persistent bottom tab bar for teacher and principal roles on mobile.
 * Hidden on md+ (desktop uses the icon rail sidebar instead).
 *
 * Tabs are built dynamically from the same HUB_DEFS used by the sidebar,
 * filtered by the same visibleHubs set the user actually has access to.
 *
 * Rules:
 *   - Dashboard is always tab 1 (labelled "Home").
 *   - Remaining visible hubs fill tabs 2–4 in HUB_DEFS order.
 *   - If the total visible hubs > 4, the 4th slot becomes "More" which
 *     opens the MobileDrawer slide-in (all overflow hubs stay accessible).
 *   - If total visible hubs ≤ 4, all are shown; no "More" tab needed.
 *
 * visibleHubs is passed as NavHub[] (serialisable across the server→client
 * boundary from DashboardShell). undefined / empty = show all hubs.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useMobileDrawer } from "@/components/MobileDrawerContext";
import { HUB_DEFS, HUB_SEG_MAP } from "@/components/HubSidebar";
import type { NavHub } from "@/lib/permissions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getActiveHub(pathname: string): NavHub {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length < 2) return "dashboard";
  return (HUB_SEG_MAP[segs[1]] ?? "dashboard") as NavHub;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  role:         string;
  /**
   * Serialised list of hub IDs the user may see.
   * undefined = show all (principal with no restrictions).
   */
  visibleHubs?: NavHub[];
}

const MAX_DIRECT_TABS = 4; // slots before "More" takes over the last slot

export default function MobileBottomNav({ role, visibleHubs }: Props) {
  const pathname = usePathname();
  const { open } = useMobileDrawer();
  const activeHub = getActiveHub(pathname);
  const isDashboard = pathname === `/${role}` || pathname === `/${role}/`;

  // Build the ordered list of hubs this user can see, using HUB_DEFS order
  const visibleSet = visibleHubs ? new Set(visibleHubs) : null;
  const filteredHubs = HUB_DEFS.filter(
    ({ id }) => !visibleSet || id === "dashboard" || visibleSet.has(id)
  );

  // Decide what goes in the bar
  // If all hubs fit in MAX_DIRECT_TABS, show them all — no More needed.
  // If there are more, show the first (MAX_DIRECT_TABS - 1) then "More".
  const needsMore = filteredHubs.length > MAX_DIRECT_TABS;
  const directHubs = needsMore
    ? filteredHubs.slice(0, MAX_DIRECT_TABS - 1)
    : filteredHubs;

  function isActive(hubId: NavHub): boolean {
    if (hubId === "dashboard") return isDashboard;
    return activeHub === hubId;
  }

  // Is the current page in a hub that's hidden behind "More"?
  const overflowHubIds = needsMore
    ? new Set(filteredHubs.slice(MAX_DIRECT_TABS - 1).map((h) => h.id))
    : new Set<NavHub>();
  const moreIsActive = overflowHubIds.has(activeHub as NavHub);

  return (
    <nav
      aria-label="Primary navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40
                 bg-card
                 border-t border-border
                 flex items-stretch"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        minHeight: "60px",
      }}
    >
      {/* Direct hub tabs */}
      {directHubs.map(({ id, label, Icon, seg }) => {
        const href   = seg ? `/${role}/${seg}` : `/${role}`;
        const active = isActive(id);
        // Relabel "Dashboard" → "Home" in the bottom bar
        const displayLabel = id === "dashboard" ? "Home" : label;

        return (
          <Link
            key={id}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1
                        transition-colors duration-100 min-w-0 select-none
                        ${active
                          ? "text-teal dark:text-teal"
                          : "text-slate hover:text-teal dark:hover:text-teal"
                        }`}
          >
            {/* Active dot */}
            <span
              aria-hidden="true"
              className={`w-1 h-1 rounded-full transition-all duration-150
                          ${active ? "bg-teal scale-100 mb-0.5" : "bg-transparent scale-0 mb-0.5"}`}
            />
            <Icon
              className="h-[22px] w-[22px] shrink-0"
              strokeWidth={active ? 2.2 : 1.8}
              aria-hidden="true"
            />
            <span className={`text-[10px] leading-none mt-0.5 ${active ? "font-semibold" : "font-medium"}`}>
              {displayLabel}
            </span>
          </Link>
        );
      })}

      {/* More button — only when hubs overflow */}
      {needsMore && (
        <button
          type="button"
          onClick={open}
          aria-label="More navigation options"
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 pt-2 pb-1
                      transition-colors duration-100 min-w-0 select-none
                      ${moreIsActive
                        ? "text-teal dark:text-teal"
                        : "text-slate hover:text-teal dark:hover:text-teal"
                      }`}
        >
          {/* Active dot (when user is on an overflow hub page) */}
          <span
            aria-hidden="true"
            className={`w-1 h-1 rounded-full transition-all duration-150
                        ${moreIsActive ? "bg-teal scale-100 mb-0.5" : "bg-transparent scale-0 mb-0.5"}`}
          />
          <MoreHorizontal
            className="h-[22px] w-[22px] shrink-0"
            strokeWidth={moreIsActive ? 2.2 : 1.8}
            aria-hidden="true"
          />
          <span className={`text-[10px] leading-none mt-0.5 ${moreIsActive ? "font-semibold" : "font-medium"}`}>
            More
          </span>
        </button>
      )}
    </nav>
  );
}
