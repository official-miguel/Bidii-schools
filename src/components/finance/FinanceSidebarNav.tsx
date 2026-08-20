"use client";

/**
 * FinanceSidebarNav
 *
 * Five flat navigation tabs — no dropdowns, no expand/collapse.
 * Each tab is a direct link. Clicking it opens a page.
 *
 *   Dashboard    → /staff/finance          (finance home)
 *   Transactions → /staff/finance/transactions  (tile grid: Students, Ledger, Payments, Debtors)
 *   Setup        → /staff/finance/setup         (tile grid: Fee Structures, Terms, Expenses)
 *   Analysis     → /staff/finance/analysis      (tile grid: Reconciliation, Reports)
 *   Settings     → /staff/finance/settings      (settings form, direct)
 *
 * Active state covers the tab and all its child pages so the tab stays
 * highlighted while you are inside a section (e.g. /staff/finance/ledger
 * keeps "Transactions" active).
 *
 * Desktop: fixed w-64 left panel.
 * Mobile:  collapsible top-bar showing the current section.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Banknote,
  Layers,
  BarChart2,
  Settings,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { useState, useEffect } from "react";

// ── Nav definition ─────────────────────────────────────────────────────────
// `childPrefixes` lists every route that belongs to this tab so the tab
// stays highlighted while you navigate into sub-pages.

interface NavTab {
  id:            string;
  href:          string;
  label:         string;
  icon:          React.ReactNode;
  /** Extra prefixes that belong to this tab (child pages). */
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
    childPrefixes: [
      "/staff/finance/reconciliation",
      "/staff/finance/reports",
    ],
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
  // Dashboard: exact match only so it doesn't swallow everything
  if (tab.id === "dashboard") return pathname === tab.href;
  // Own landing page
  if (pathname === tab.href || pathname.startsWith(tab.href + "/")) return true;
  // Any child page
  return (tab.childPrefixes ?? []).some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function activeTab(pathname: string): NavTab | undefined {
  return TABS.find((t) => isTabActive(t, pathname));
}

// ── Tab link ───────────────────────────────────────────────────────────────

function TabLink({ tab, pathname }: { tab: NavTab; pathname: string | null }) {
  // pathname is null on the server / before mount — render inactive to match SSR
  const active = pathname ? isTabActive(tab, pathname) : false;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={`
        group flex items-center gap-3 px-3 py-2.5 rounded-xl
        text-sm font-medium transition-all duration-150
        ${active
          ? "bg-teal text-white shadow-sm"
          : "text-slate hover:text-ink hover:bg-line/60 dark:text-dark-muted dark:hover:text-dark-text dark:hover:bg-dark-border/50"
        }
      `}
    >
      <span className={`shrink-0 ${active ? "text-white" : "text-slate/60 group-hover:text-slate"}`}>
        {tab.icon}
      </span>
      {tab.label}
    </Link>
  );
}

// ── Desktop sidebar ────────────────────────────────────────────────────────

function DesktopSidebar() {
  const pathnameRaw = usePathname();
  const router      = useRouter();

  // Only apply active styles after hydration — avoids server/client HTML mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const pathname = mounted ? pathnameRaw : null;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      aria-label="Finance navigation"
      className="
        hidden md:flex flex-col
        fixed top-0 left-0 z-40
        w-64 h-screen
        bg-white border-r border-line
        dark:bg-dark-sidebar dark:border-dark-border
        overflow-hidden
      "
    >
      {/* Tabs */}
      <nav
        className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5"
        aria-label="Finance sections"
      >
        {TABS.map((tab) => (
          <TabLink key={tab.id} tab={tab} pathname={pathname} />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-line dark:border-dark-border px-2 py-2 shrink-0">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium
                     text-slate hover:text-danger hover:bg-danger/5 transition-colors
                     dark:text-dark-muted dark:hover:text-danger dark:hover:bg-danger/10"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

// ── Mobile top bar ─────────────────────────────────────────────────────────

function MobileTopBar() {
  const [open, setOpen]   = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathnameRaw       = usePathname();

  useEffect(() => { setMounted(true); }, []);
  // Before mount use null so SSR and first client render produce identical HTML
  const pathname = mounted ? pathnameRaw : null;
  const current  = pathname ? activeTab(pathname) : undefined;

  // Close on navigation
  useEffect(() => { setOpen(false); }, [pathnameRaw]);

  return (
    <div className="md:hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Open finance navigation"
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl
                   border border-line bg-white text-sm font-medium text-ink
                   dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
      >
        <span className="flex items-center gap-2 text-teal font-semibold">
          {current?.icon ?? <Banknote className="h-4 w-4" />}
          {current?.label ?? "Finance"}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="mt-1 rounded-xl border border-line bg-white shadow-lg overflow-hidden
                        dark:bg-dark-surface dark:border-dark-border animate-scale-in">
          <div className="p-2 flex flex-col gap-0.5">
            {TABS.map((tab) => {
              const active = pathname ? isTabActive(tab, pathname) : false;
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                    ${active
                      ? "bg-teal text-white"
                      : "text-slate hover:text-ink hover:bg-line/60 dark:text-dark-muted dark:hover:text-dark-text"
                    }`}
                >
                  <span className={active ? "text-white" : "text-slate/60"}>{tab.icon}</span>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────

export default function FinanceSidebarNav() {
  return (
    <>
      <MobileTopBar />
      <DesktopSidebar />
    </>
  );
}
