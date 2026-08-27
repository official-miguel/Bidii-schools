"use client";

/**
 * FinanceSidebarNav
 *
 * Desktop: fixed w-64 left panel (hidden on mobile).
 * Mobile:  full-screen slide-over drawer opened by a hamburger button
 *          that lives inside the fixed top bar (injected via the exported
 *          FinanceMobileMenuButton component which the layout passes as
 *          mobileMenuButton to FinanceTopBar).
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Banknote, Layers, BarChart2, Settings,
  LogOut, Menu, X,
} from "lucide-react";
import { useState, useEffect } from "react";

// ── Nav definition ─────────────────────────────────────────────────────────

interface NavTab {
  id:             string;
  href:           string;
  label:          string;
  icon:           React.ReactNode;
  childPrefixes?: string[];
}

const TABS: NavTab[] = [
  {
    id:    "dashboard",
    href:  "/staff/finance",
    label: "Dashboard",
    icon:  <LayoutDashboard className="h-4 w-4" />,
  },
  {
    id:            "transactions",
    href:          "/staff/finance/transactions",
    label:         "Transactions",
    icon:          <Banknote className="h-4 w-4" />,
    childPrefixes: [
      "/staff/finance/students",
      "/staff/finance/ledger",
      "/staff/finance/payments",
      "/staff/finance/debtors",
      "/staff/finance/reconciliation",
    ],
  },
  {
    id:            "setup",
    href:          "/staff/finance/setup",
    label:         "Setup",
    icon:          <Layers className="h-4 w-4" />,
    childPrefixes: [
      "/staff/finance/fee-structures",
      "/staff/finance/terms",
      "/staff/finance/expenses",
    ],
  },
  {
    id:            "analysis",
    href:          "/staff/finance/analysis",
    label:         "Analysis",
    icon:          <BarChart2 className="h-4 w-4" />,
    childPrefixes: ["/staff/finance/reports"],
  },
  {
    id:    "settings",
    href:  "/staff/finance/settings",
    label: "Settings",
    icon:  <Settings className="h-4 w-4" />,
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function isTabActive(tab: NavTab, pathname: string): boolean {
  if (tab.id === "dashboard") return pathname === tab.href;
  if (pathname === tab.href || pathname.startsWith(tab.href + "/")) return true;
  return (tab.childPrefixes ?? []).some(
    p => pathname === p || pathname.startsWith(p + "/")
  );
}

// ── Shared sidebar body (used by both desktop aside and mobile drawer) ─────

function SidebarBody({
  schoolName,
  pathname,
  onNavigate,
}: {
  schoolName?: string;
  pathname: string | null;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
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
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">
            {schoolName ?? "Finance"}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
            >
              FEES
            </span>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.6)" }}>
              Fees Management
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav
        className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5"
        aria-label="Finance sections"
      >
        {TABS.map(tab => {
          const active = pathname ? isTabActive(tab, pathname) : false;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`
                group flex items-center gap-3 px-3 py-2.5 rounded-xl
                text-sm font-medium transition-all duration-150
                ${active
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-white/70 hover:text-white hover:bg-white/10"}
              `}
            >
              <span className={`shrink-0 ${active ? "text-white" : "text-white/60 group-hover:text-white"}`}>
                {tab.icon}
              </span>
              {tab.label}
              {active && (
                <span
                  className="ml-auto h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ background: "rgba(163,230,53,0.85)" }}
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Decorative watermark */}
      <div
        className="mx-3 mb-3 rounded-xl overflow-hidden h-20 shrink-0 flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.06)" }}
        aria-hidden="true"
      >
        <svg className="h-12 w-12 opacity-20" fill="currentColor" color="white" viewBox="0 0 24 24">
          <path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"
            stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      </div>

      {/* Sign out */}
      <div className="px-2 pb-3 shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors mt-2"
          style={{ color: "rgba(255,255,255,0.7)" }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.color = "#fff";
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)";
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </>
  );
}

// ── Desktop sidebar ────────────────────────────────────────────────────────

function DesktopSidebar({ schoolName }: { schoolName?: string }) {
  const pathnameRaw           = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const pathname = mounted ? pathnameRaw : null;

  return (
    <aside
      aria-label="Finance navigation"
      className="hidden md:flex flex-col fixed top-0 left-0 z-40 w-64 h-screen overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0e6b5e 0%, #084d43 60%, #063b33 100%)" }}
    >
      <SidebarBody schoolName={schoolName} pathname={pathname} />
    </aside>
  );
}

// ── Mobile drawer (slide-over) ─────────────────────────────────────────────

function MobileDrawer({
  open,
  onClose,
  schoolName,
}: {
  open: boolean;
  onClose: () => void;
  schoolName?: string;
}) {
  const pathnameRaw           = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const pathname = mounted ? pathnameRaw : null;

  // Close on navigation
  useEffect(() => { if (open) onClose(); }, [pathnameRaw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trap scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="relative flex flex-col w-72 max-w-[85vw] h-full overflow-hidden shadow-2xl"
        style={{ background: "linear-gradient(160deg, #0e6b5e 0%, #084d43 60%, #063b33 100%)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Finance navigation"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>

        <SidebarBody schoolName={schoolName} pathname={pathname} onNavigate={onClose} />
      </div>
    </div>
  );
}

// ── Exported hamburger button (injected into FinanceTopBar) ────────────────

export function FinanceMobileMenuButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label="Open finance navigation"
      className="flex items-center justify-center h-9 w-9 rounded-xl border border-line bg-paper text-ink hover:bg-teal/10 hover:text-teal hover:border-teal/30 transition-colors dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

export default function FinanceSidebarNav({
  schoolName,
  drawerOpen = false,
  onDrawerClose,
}: {
  schoolName?: string;
  drawerOpen?: boolean;
  onDrawerClose?: () => void;
}) {
  return (
    <>
      <DesktopSidebar schoolName={schoolName} />
      <MobileDrawer
        open={drawerOpen}
        onClose={onDrawerClose ?? (() => {})}
        schoolName={schoolName}
      />
    </>
  );
}
