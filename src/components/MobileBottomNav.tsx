"use client";

/**
 * MobileBottomNav
 *
 * Persistent bottom tab bar for teacher and principal roles on mobile.
 * Hidden on md+ (desktop uses the icon rail sidebar instead).
 *
 * Teacher  tabs: Home | Students | Classes | Calendar | More
 * Principal tabs: Home | Students | Staff   | Calendar | More
 *
 * "More" opens the existing MobileDrawer (hamburger slide-in) so all
 * secondary hubs remain accessible without duplicating nav items.
 *
 * Safe-area aware: uses env(safe-area-inset-bottom) so the bar sits
 * correctly on notched/home-indicator phones.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Home,
  Users,
  GraduationCap,
  CalendarDays,
  MoreHorizontal,
  UserCog,
} from "lucide-react";
import { useMobileDrawer } from "@/components/MobileDrawerContext";
import { HUB_SEG_MAP } from "@/components/HubSidebar";
import type { NavHub } from "@/lib/permissions";

// ── Tab definitions ───────────────────────────────────────────────────────────

interface TabDef {
  label: string;
  href:  string;
  /** Which NavHub this tab maps to for active-state matching */
  hub:   NavHub | "more";
  Icon:  LucideIcon;
}

const TEACHER_TABS: TabDef[] = [
  { label: "Home",     href: "/teacher",           hub: "dashboard", Icon: Home          },
  { label: "Students", href: "/teacher/students",  hub: "people",    Icon: Users         },
  { label: "Classes",  href: "/teacher/academics", hub: "academic",  Icon: GraduationCap },
  { label: "Calendar", href: "/teacher/calendar",  hub: "calendar",  Icon: CalendarDays  },
  { label: "More",     href: "#",                  hub: "more",      Icon: MoreHorizontal},
];

const PRINCIPAL_TABS: TabDef[] = [
  { label: "Home",     href: "/principal",           hub: "dashboard", Icon: Home          },
  { label: "Students", href: "/principal/students",  hub: "people",    Icon: Users         },
  { label: "Staff",    href: "/principal/staff",     hub: "people",    Icon: UserCog       },
  { label: "Calendar", href: "/principal/calendar",  hub: "calendar",  Icon: CalendarDays  },
  { label: "More",     href: "#",                    hub: "more",      Icon: MoreHorizontal},
];

const TABS_BY_ROLE: Record<string, TabDef[]> = {
  teacher:   TEACHER_TABS,
  principal: PRINCIPAL_TABS,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getActiveHub(pathname: string): NavHub | "home" {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length < 2) return "dashboard";
  return (HUB_SEG_MAP[segs[1]] ?? "dashboard") as NavHub;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  role: string;
}

export default function MobileBottomNav({ role }: Props) {
  const tabs     = TABS_BY_ROLE[role];
  const pathname = usePathname();
  const { open } = useMobileDrawer();

  // Not a role that gets a bottom bar
  if (!tabs) return null;

  const activeHub = getActiveHub(pathname);

  // Is the current path exactly the dashboard root?
  const isDashboard = pathname === `/${role}` || pathname === `/${role}/`;

  function isTabActive(tab: TabDef): boolean {
    if (tab.hub === "more") return false;
    if (tab.hub === "dashboard") return isDashboard;
    return activeHub === tab.hub;
  }

  return (
    <nav
      aria-label="Primary navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40
                 bg-white dark:bg-dark-sidebar
                 border-t border-line dark:border-dark-border
                 flex items-stretch"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        minHeight: "60px",
      }}
    >
      {tabs.map((tab) => {
        const active = isTabActive(tab);

        // "More" button — opens the drawer instead of navigating
        if (tab.hub === "more") {
          return (
            <button
              key="more"
              type="button"
              onClick={open}
              aria-label="More navigation options"
              className="flex-1 flex flex-col items-center justify-center gap-1 pt-2 pb-1
                         text-slate dark:text-dark-muted
                         hover:text-teal dark:hover:text-teal
                         transition-colors duration-100 min-w-0"
            >
              <tab.Icon
                className="h-[22px] w-[22px] shrink-0"
                strokeWidth={1.8}
              />
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </button>
          );
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-1 pt-2 pb-1
                        transition-colors duration-100 min-w-0
                        ${active
                          ? "text-teal dark:text-teal"
                          : "text-slate dark:text-dark-muted hover:text-teal dark:hover:text-teal"
                        }`}
          >
            {/* Active indicator dot above icon */}
            <span
              aria-hidden="true"
              className={`w-1 h-1 rounded-full mb-0.5 transition-all duration-150
                          ${active ? "bg-teal scale-100" : "bg-transparent scale-0"}`}
            />
            <tab.Icon
              className="h-[22px] w-[22px] shrink-0"
              strokeWidth={active ? 2.2 : 1.8}
            />
            <span className={`text-[10px] leading-none font-medium ${active ? "font-semibold" : ""}`}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
