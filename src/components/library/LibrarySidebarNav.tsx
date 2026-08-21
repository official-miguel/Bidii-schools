"use client";

/**
 * LibrarySidebarNav
 *
 * Accordion-style sidebar for the Library Management module.
 * Mirrors the dark teal gradient aesthetic of FinanceSidebarNav.
 *
 * Groups (one open at a time):
 *   Overview     → Dashboard, Analytics
 *   Lending      → Circulate, Reservations, Scan Mode
 *   Library Setup → Inventory, Student Cards, Policies
 *
 * Desktop: fixed w-64 left panel with deep teal gradient background.
 * Mobile:  collapsible top-bar showing the current section.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BarChart2,
  ArrowLeftRight,
  CalendarClock,
  QrCode,
  Package,
  CreditCard,
  BookMarked,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { useState, useEffect } from "react";

// ── Nav definition ─────────────────────────────────────────────────────────

interface NavItem {
  id:    string;
  href:  string;
  label: string;
  icon:  React.ReactNode;
  exact?: boolean;
}

interface NavGroup {
  id:    string;
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    id:    "overview",
    label: "Overview",
    items: [
      {
        id:    "dashboard",
        href:  "/staff/library",
        label: "Dashboard",
        icon:  <LayoutDashboard className="h-4 w-4" />,
        exact: true,
      },
      {
        id:    "analytics",
        href:  "/staff/library/analytics",
        label: "Analytics",
        icon:  <BarChart2 className="h-4 w-4" />,
      },
    ],
  },
  {
    id:    "lending",
    label: "Lending",
    items: [
      {
        id:    "circulate",
        href:  "/staff/library/circulate",
        label: "Circulate",
        icon:  <ArrowLeftRight className="h-4 w-4" />,
      },
      {
        id:    "reservations",
        href:  "/staff/library/reservations",
        label: "Reservations",
        icon:  <CalendarClock className="h-4 w-4" />,
      },
      {
        id:    "scan",
        href:  "/staff/library/scan",
        label: "Scan Mode",
        icon:  <QrCode className="h-4 w-4" />,
      },
    ],
  },
  {
    id:    "setup",
    label: "Library Setup",
    items: [
      {
        id:    "inventory",
        href:  "/staff/library/inventory",
        label: "Inventory",
        icon:  <Package className="h-4 w-4" />,
      },
      {
        id:    "cards",
        href:  "/staff/library/cards",
        label: "Student Cards",
        icon:  <CreditCard className="h-4 w-4" />,
      },
      {
        id:    "policies",
        href:  "/staff/library/policies",
        label: "Policies",
        icon:  <BookMarked className="h-4 w-4" />,
      },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function activeGroup(pathname: string): string | undefined {
  for (const group of GROUPS) {
    if (group.items.some((item) => isItemActive(item, pathname))) {
      return group.id;
    }
  }
  return undefined;
}

function currentItem(pathname: string): NavItem | undefined {
  for (const group of GROUPS) {
    const found = group.items.find((item) => isItemActive(item, pathname));
    if (found) return found;
  }
  return undefined;
}

// ── Item tile (inside accordion) ───────────────────────────────────────────

function ItemTile({ item, pathname }: { item: NavItem; pathname: string | null }) {
  const active = pathname ? isItemActive(item, pathname) : false;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`
        group flex items-center gap-3 px-3 py-2.5 rounded-xl
        text-sm font-medium transition-all duration-150
        ${active
          ? "bg-white/15 text-white shadow-sm"
          : "text-white/70 hover:text-white hover:bg-white/10"
        }
      `}
    >
      <span className={`shrink-0 ${active ? "text-white" : "text-white/60 group-hover:text-white"}`}>
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}

// ── Accordion group ────────────────────────────────────────────────────────

function AccordionGroup({
  group,
  isOpen,
  onToggle,
  pathname,
}: {
  group:    NavGroup;
  isOpen:   boolean;
  onToggle: () => void;
  pathname: string | null;
}) {
  const hasActive = pathname
    ? group.items.some((item) => isItemActive(item, pathname))
    : false;

  return (
    <div>
      {/* Group header button */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`
          w-full flex items-center justify-between px-3 py-2 rounded-xl
          text-xs font-semibold uppercase tracking-wider transition-colors duration-150
          ${hasActive
            ? "text-white/90"
            : "text-white/50 hover:text-white/80"
          }
          hover:bg-white/5
        `}
      >
        <span>{group.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 shrink-0
            ${isOpen ? "rotate-180" : ""}
          `}
          aria-hidden="true"
        />
      </button>

      {/* Tiles — slide in/out with CSS max-height transition */}
      <div
        style={{
          maxHeight: isOpen ? `${group.items.length * 52}px` : "0px",
          overflow: "hidden",
          transition: "max-height 200ms ease-in-out",
        }}
      >
        <div className="mt-0.5 flex flex-col gap-0.5 pb-1">
          {group.items.map((item) => (
            <ItemTile key={item.id} item={item} pathname={pathname} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Desktop sidebar ────────────────────────────────────────────────────────

function DesktopSidebar({ schoolName }: { schoolName?: string }) {
  const pathnameRaw = usePathname();
  const router      = useRouter();

  const [mounted, setMounted]     = useState(false);
  const [openGroup, setOpenGroup] = useState<string | undefined>(undefined);

  useEffect(() => { setMounted(true); }, []);

  const pathname = mounted ? pathnameRaw : null;

  // On mount (and on pathname change), auto-open the group that contains
  // the active route.
  useEffect(() => {
    if (!pathname) return;
    const active = activeGroup(pathname);
    if (active) setOpenGroup(active);
  }, [pathname]);

  function handleGroupToggle(groupId: string) {
    setOpenGroup((prev) => (prev === groupId ? undefined : groupId));
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      aria-label="Library navigation"
      className="hidden md:flex flex-col fixed top-0 left-0 z-40 w-64 h-screen overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0e6b5e 0%, #084d43 60%, #063b33 100%)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 h-16 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div
          className="flex items-center justify-center h-10 w-10 rounded-xl shrink-0"
          style={{ background: "rgba(255,255,255,0.15)" }}
          aria-hidden="true"
        >
          {/* Book icon */}
          <svg
            className="h-5 w-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">
            {schoolName ?? "Library"}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
            >
              LIB
            </span>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>
              Library Management
            </span>
          </div>
        </div>
      </div>

      {/* Accordion nav */}
      <nav
        className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-1"
        aria-label="Library sections"
      >
        {GROUPS.map((group) => (
          <AccordionGroup
            key={group.id}
            group={group}
            isOpen={openGroup === group.id}
            onToggle={() => handleGroupToggle(group.id)}
            pathname={pathname}
          />
        ))}
      </nav>

      {/* Decorative bottom image area */}
      <div
        className="mx-3 mb-3 rounded-xl overflow-hidden h-20 shrink-0 flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.06)" }}
        aria-hidden="true"
      >
        <svg
          className="h-12 w-12 opacity-20"
          fill="none"
          viewBox="0 0 24 24"
          stroke="white"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
      </div>

      {/* Footer — sign out */}
      <div
        className="px-2 pb-3 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
      >
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors mt-2"
          style={{ color: "rgba(255,255,255,0.7)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)";
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Mobile top bar ─────────────────────────────────────────────────────────

function MobileTopBar() {
  const [open, setOpen]       = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathnameRaw           = usePathname();

  useEffect(() => { setMounted(true); }, []);
  const pathname = mounted ? pathnameRaw : null;
  const current  = pathname ? currentItem(pathname) : undefined;

  // Close on navigation
  useEffect(() => { setOpen(false); }, [pathnameRaw]);

  return (
    <div className="md:hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Open library navigation"
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white"
        style={{ background: "linear-gradient(135deg, #0e6b5e 0%, #084d43 100%)" }}
      >
        <span className="flex items-center gap-2">
          {current?.icon ?? <LayoutDashboard className="h-4 w-4" />}
          {current?.label ?? "Library"}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          className="mt-1 rounded-xl overflow-hidden shadow-lg"
          style={{ background: "linear-gradient(160deg, #0e6b5e 0%, #084d43 100%)" }}
        >
          <div className="p-2 flex flex-col gap-2">
            {GROUPS.map((group) => (
              <div key={group.id}>
                <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const active = pathname ? isItemActive(item, pathname) : false;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        active
                          ? "bg-white/15 text-white"
                          : "text-white/70 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <span className={active ? "text-white" : "text-white/60"}>{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────

interface LibrarySidebarNavProps {
  schoolName?: string;
}

export default function LibrarySidebarNav({ schoolName }: LibrarySidebarNavProps) {
  return (
    <>
      <MobileTopBar />
      <DesktopSidebar schoolName={schoolName} />
    </>
  );
}
