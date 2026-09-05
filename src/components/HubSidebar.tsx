"use client";

/**
 * HubSidebar — permission-aware icon rail (desktop) + MobileDrawer (mobile).
 *
 * v2 changes:
 *  - Accepts `visibleHubs` prop (Set<NavHub>) computed server-side from
 *    getVisibleHubs(). Hubs the user has no permission to see are hidden
 *    completely — no disabled states, no empty gaps.
 *  - Dashboard hub is always visible.
 *  - All other behaviour (tooltips, active pill, logout) unchanged.
 *
 * v3 changes:
 *  - Accepts optional `avatarUrl` prop — shows photo when available, falls
 *    back to initials circle. Avatar links to /<role>/profile.
 *
 * v4 changes:
 *  - Adds parent-specific nav items rendered when role === "parent".
 *  - Accepts optional `unreadCount` prop for the Notifications badge.
 */

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  GraduationCap,
  Star,
  CalendarDays,
  MessageSquare,
  Settings,
  LogOut,
  LayoutDashboard,
  BookOpen,
  CalendarCheck,
  CreditCard,
  ShieldAlert,
  Award,
  Calendar,
  Bell,
} from "lucide-react";
import MobileDrawer from "@/components/MobileDrawer";
import type { NavHub } from "@/lib/permissions";

// ── Hub definitions ───────────────────────────────────────────────────────────

const HUB_DEFS = [
  { id: "dashboard"      as NavHub, label: "Dashboard",     Icon: Home,          seg: null },
  { id: "academic"       as NavHub, label: "Academic",       Icon: GraduationCap, seg: "academics" },
  { id: "people"         as NavHub, label: "People",         Icon: Users,         seg: "people" },
  { id: "student-life"   as NavHub, label: "Student Life",   Icon: Star,          seg: "accommodation" },
  { id: "calendar"       as NavHub, label: "Calendar",       Icon: CalendarDays,  seg: "calendar" },
  { id: "communication"  as NavHub, label: "Communication",  Icon: MessageSquare, seg: "communication" },
  { id: "administration" as NavHub, label: "Administration", Icon: Settings,      seg: "administration" },
] as const;

/** Nav items rendered exclusively when role === "parent". */
export const PARENT_HUB_DEFS = [
  { label: "Home",             href: "/parent",               Icon: LayoutDashboard, seg: null          },
  { label: "Diary",            href: "/parent/diary",         Icon: BookOpen,        seg: "diary"       },
  { label: "Academic Results", href: "/parent/results",       Icon: GraduationCap,   seg: "results"     },
  { label: "Attendance",       href: "/parent/attendance",    Icon: CalendarCheck,   seg: "attendance"  },
  { label: "Fees",             href: "/parent/fees",          Icon: CreditCard,      seg: "fees"        },
  { label: "Behaviour",        href: "/parent/behaviour",     Icon: ShieldAlert,     seg: "behaviour"   },
  { label: "Achievements",     href: "/parent/achievements",  Icon: Award,           seg: "achievements"},
  { label: "School Calendar",  href: "/parent/calendar",      Icon: Calendar,        seg: "calendar"    },
  { label: "Messages",         href: "/parent/messages",      Icon: MessageSquare,   seg: "messages"    },
  { label: "Notifications",    href: "/parent/notifications", Icon: Bell,            seg: "notifications", badge: true },
] as const;

export const HUB_SEG_MAP: Record<string, NavHub> = {
  // Academic
  academics: "academic", classes: "academic", subjects: "academic",
  timetable: "academic", attendance: "academic", assessments: "academic",
  "exam-periods": "academic", results: "academic", library: "academic", exams: "academic",
  departments: "academic",
  // People
  people: "people", students: "people", staff: "people",
  parents: "people", history: "people",
  // Student Life
  accommodation: "student-life", conduct: "student-life",
  behaviour: "student-life", discipline: "student-life",
  rewards: "student-life", achievements: "student-life",
  recognition: "student-life", records: "student-life",
  // Calendar
  calendar: "calendar",
  // Communication
  communication: "communication",
  // Diary (Academic tab for teachers; separate hub for parents)
  diary: "academic",
  // Administration
  administration: "administration", reports: "administration",
  settings: "administration", "staff-roles": "administration",
  permissions: "administration",
};

export function getActiveHub(pathname: string): NavHub {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length < 2) return "dashboard";

  // Parent portal: first segment is "parent", second is the page slug
  if (segs[0] === "parent") return "parent";

  return HUB_SEG_MAP[segs[1]] ?? "dashboard";
}

function getInitials(email: string, label: string): string {
  const parts = label.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface HubSidebarProps {
  userEmail:    string;
  roleLabel:    string;
  role:         string;
  schoolName?:  string;
  avatarUrl?:   string | null;
  /** Hubs the user is permitted to see. Undefined = show all (PRINCIPAL). */
  visibleHubs?: Set<NavHub>;
  /** Unread notification count for the parent portal bell badge. */
  unreadCount?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HubSidebar({
  userEmail,
  roleLabel,
  role,
  schoolName,
  avatarUrl,
  visibleHubs,
  unreadCount = 0,
}: HubSidebarProps) {
  const pathname     = usePathname();
  const router       = useRouter();
  const activeHub    = getActiveHub(pathname);
  const userInitials = getInitials(userEmail, roleLabel);
  const profileHref  = `/${role}/profile`;
  const isOnProfile  = pathname === profileHref;
  const isParent     = role === "parent";

  // If visibleHubs is not provided, show everything (PRINCIPAL / TEACHER path).
  const shouldShow = (hubId: NavHub) =>
    !visibleHubs || hubId === "dashboard" || visibleHubs.has(hubId);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // Determine the active parent nav item by matching the current pathname
  function getActiveParentSeg(): string | null {
    const segs = pathname.split("/").filter(Boolean);
    // /parent → segs[0]="parent", segs[1]=undefined → "home"
    if (segs[0] === "parent" && segs.length === 1) return null; // matches href="/parent"
    return segs[1] ?? null;
  }
  const activeParentSeg = getActiveParentSeg();

  return (
    <>
      {/* Mobile slide-in drawer (hidden md+) */}
      <MobileDrawer
        role={role}
        roleLabel={roleLabel}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
        schoolName={schoolName}
        visibleHubs={visibleHubs}
      />

      {/* Desktop icon rail (hidden below md) */}
      <aside
        aria-label="Main navigation"
        className="fixed top-0 left-0 h-screen w-16 hidden md:flex flex-col z-40
                   bg-white border-r border-line
                   dark:bg-dark-sidebar dark:border-dark-border"
      >
        {/* Logo */}
        <div
          className="flex items-center justify-center shrink-0
                      border-b border-line dark:border-dark-border"
          style={{
            height: "calc(4rem + env(safe-area-inset-top, 0px))",
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          <Link
            href={`/${role}`}
            aria-label={`${schoolName ?? "Bidii"} home`}
            title={schoolName ?? "Bidii"}
            className="flex items-center justify-center h-10 w-10 rounded-lg
                       overflow-hidden hover:opacity-80 transition-opacity"
          >
            <Image src="/logo.png" alt="Bidii KE" width={40} height={40} className="object-contain" />
          </Link>
        </div>

        {/* Hub links */}
        <nav className="flex-1 flex flex-col items-center gap-1 py-3 overflow-y-auto">
          {isParent ? (
            // ── Parent-specific nav items ─────────────────────────────────
            PARENT_HUB_DEFS.map(({ label, href, Icon, seg, ...rest }) => {
              const hasBadge = "badge" in rest && rest.badge;
              // Active when pathname exactly matches href (home) or seg matches second path segment
              const active =
                seg === null
                  ? pathname === href
                  : activeParentSeg === seg;

              return (
                <div key={href} className="relative w-full flex justify-center group">
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-teal rounded-r-full"
                    />
                  )}
                  <Link
                    href={href}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center justify-center w-11 h-11 rounded-lg transition-colors duration-100
                      ${active
                        ? "bg-teal/10 text-teal"
                        : "text-slate hover:bg-teal-50 hover:text-teal dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text"
                      }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                    {/* Unread badge on Notifications bell */}
                    {hasBadge && unreadCount > 0 && (
                      <span
                        aria-label={`${unreadCount} unread notifications`}
                        className="absolute top-1.5 right-1.5 flex items-center justify-center
                                   min-w-[14px] h-[14px] px-0.5 rounded-full
                                   bg-danger text-white text-[9px] font-bold leading-none"
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>
                  {/* Tooltip */}
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2
                               whitespace-nowrap rounded-md shadow-md bg-ink text-white text-xs font-medium
                               px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100
                               z-50 dark:bg-dark-text dark:text-ink"
                  >
                    {label}
                    {hasBadge && unreadCount > 0 && (
                      <span className="ml-1.5 text-danger font-semibold">({unreadCount})</span>
                    )}
                  </span>
                </div>
              );
            })
          ) : (
            // ── Standard staff hub items ──────────────────────────────────
            HUB_DEFS.filter(({ id }) => shouldShow(id)).map(({ id, label, Icon, seg }) => {
              const href   = seg ? `/${role}/${seg}` : `/${role}`;
              const active = activeHub === id;

              return (
                <div key={id} className="relative w-full flex justify-center group">
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-teal rounded-r-full"
                    />
                  )}
                  <Link
                    href={href}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-center w-11 h-11 rounded-lg transition-colors duration-100
                      ${active
                        ? "bg-teal/10 text-teal"
                        : "text-slate hover:bg-teal-50 hover:text-teal dark:text-dark-muted dark:hover:bg-dark-border dark:hover:text-dark-text"
                      }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                  </Link>
                  {/* Tooltip */}
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2
                               whitespace-nowrap rounded-md shadow-md bg-ink text-white text-xs font-medium
                               px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100
                               z-50 dark:bg-dark-text dark:text-ink"
                  >
                    {label}
                  </span>
                </div>
              );
            })
          )}
        </nav>

        {/* Bottom: avatar (links to profile) + logout */}
        <div className="flex flex-col items-center gap-1 py-3 border-t border-line dark:border-dark-border">
          {/* Avatar — photo or initials, links to My Profile */}
          <div className="relative w-full flex justify-center group">
            <Link
              href={profileHref}
              aria-label="My Profile"
              title="My Profile"
              className={`w-9 h-9 rounded-full overflow-hidden flex items-center justify-center
                          text-xs font-semibold select-none transition-opacity hover:opacity-80
                          ring-2 ring-offset-1 ring-transparent
                          ${isOnProfile ? "ring-teal" : ""}
                          ${avatarUrl ? "" : "bg-teal/10 text-teal"}`}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={roleLabel}
                  className="w-full h-full object-cover"
                />
              ) : (
                userInitials
              )}
            </Link>
            {/* Tooltip */}
            <span
              role="tooltip"
              className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2
                         whitespace-nowrap rounded-md shadow-md bg-ink text-white text-xs font-medium
                         px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100
                         z-50 dark:bg-dark-text dark:text-ink"
            >
              My Profile
            </span>
          </div>

          {/* Sign out */}
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
            className="flex items-center justify-center w-11 h-11 rounded-lg text-slate
                       hover:bg-danger/10 hover:text-danger transition-colors duration-100
                       dark:text-dark-muted dark:hover:bg-danger/10 dark:hover:text-danger"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </aside>
    </>
  );
}
