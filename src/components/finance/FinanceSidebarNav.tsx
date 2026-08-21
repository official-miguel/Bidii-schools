"use client";

/**
 * FinanceSidebarNav
 *
 * Five flat navigation tabs matching the dark teal sidebar design.
 * Includes a live student search that navigates directly to the
 * student's individual ledger page on selection.
 *
 * Desktop: fixed w-64 left panel with deep teal gradient background.
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
  Search,
  X,
  Loader2,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

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

// ── Student search autocomplete ────────────────────────────────────────────

interface StudentResult {
  id:              string;
  fullName:        string;
  admissionNumber: string;
  schoolClass:     { name: string };
}

function StudentSearchBox({ onSelect }: { onSelect?: () => void }) {
  const router                          = useRouter();
  const [query,    setQuery]            = useState("");
  const [results,  setResults]          = useState<StudentResult[]>([]);
  const [loading,  setLoading]          = useState(false);
  const [open,     setOpen]             = useState(false);
  const [activeIdx, setActiveIdx]       = useState(-1);
  const debounceRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef                        = useRef<HTMLInputElement>(null);
  const listRef                         = useRef<HTMLUListElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/finance/students?search=${encodeURIComponent(q.trim())}&pageSize=8`);
      const data = res.ok ? await res.json() : { students: [] };
      setResults(data.students ?? []);
      setOpen(true);
      setActiveIdx(-1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  function navigate(student: StudentResult) {
    setQuery("");
    setResults([]);
    setOpen(false);
    onSelect?.();
    router.push(`/staff/finance/students/${student.id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      navigate(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div className="relative px-2 pt-2 pb-1">
      {/* Input */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
          style={{ color: "rgba(255,255,255,0.5)" }}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search student…"
          aria-label="Search students"
          aria-autocomplete="list"
          aria-expanded={open}
          className="w-full rounded-lg py-2 pl-8 pr-8 text-xs font-medium outline-none transition-all"
          style={{
            background:  "rgba(255,255,255,0.10)",
            border:      "1px solid rgba(255,255,255,0.15)",
            color:       "#fff",
            caretColor:  "#fff",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLInputElement).style.background = "rgba(255,255,255,0.14)";
          }}
          onMouseLeave={e => {
            if (document.activeElement !== e.currentTarget)
              (e.currentTarget as HTMLInputElement).style.background = "rgba(255,255,255,0.10)";
          }}
        />
        {/* Right icon: spinner or clear */}
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2
              className="h-3.5 w-3.5 animate-spin"
              style={{ color: "rgba(255,255,255,0.5)" }}
              aria-label="Searching"
            />
          ) : query ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => { setQuery(""); setResults([]); setOpen(false); inputRef.current?.focus(); }}
              aria-label="Clear search"
              style={{ color: "rgba(255,255,255,0.5)" }}
              className="hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </span>
      </div>

      {/* Dropdown results */}
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Student search results"
          className="absolute left-2 right-2 z-50 mt-1 rounded-xl overflow-hidden shadow-xl"
          style={{ background: "#fff", border: "1px solid #e2e8f0", maxHeight: "280px", overflowY: "auto" }}
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-xs text-slate text-center">No students found</li>
          ) : (
            results.map((s, idx) => (
              <li
                key={s.id}
                role="option"
                aria-selected={idx === activeIdx}
                onMouseDown={() => navigate(s)}
                onMouseEnter={() => setActiveIdx(idx)}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors"
                style={{
                  background: idx === activeIdx ? "#f0faf8" : "transparent",
                  borderBottom: idx < results.length - 1 ? "1px solid #f1f5f9" : "none",
                }}
              >
                {/* Initials avatar */}
                <div
                  className="flex items-center justify-center h-7 w-7 rounded-full shrink-0 text-[10px] font-bold"
                  style={{ background: "#0e6b5e", color: "#fff" }}
                  aria-hidden="true"
                >
                  {s.fullName.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink truncate leading-tight">{s.fullName}</p>
                  <p className="text-[10px] text-slate font-mono leading-tight">
                    {s.admissionNumber} · {s.schoolClass.name}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}



function isTabActive(tab: NavTab, pathname: string): boolean {
  if (tab.id === "dashboard") return pathname === tab.href;
  if (pathname === tab.href || pathname.startsWith(tab.href + "/")) return true;
  return (tab.childPrefixes ?? []).some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function activeTab(pathname: string): NavTab | undefined {
  return TABS.find((t) => isTabActive(t, pathname));
}

// ── Tab link (dark sidebar variant) ───────────────────────────────────────

function TabLink({ tab, pathname }: { tab: NavTab; pathname: string | null }) {
  const active = pathname ? isTabActive(tab, pathname) : false;
  return (
    <Link
      href={tab.href}
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
        {tab.icon}
      </span>
      {tab.label}
    </Link>
  );
}

// ── Desktop sidebar ────────────────────────────────────────────────────────

function DesktopSidebar({ schoolName }: { schoolName?: string }) {
  const pathnameRaw = usePathname();
  const router      = useRouter();

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
      className="hidden md:flex flex-col fixed top-0 left-0 z-40 w-64 h-screen overflow-hidden"
      style={{ background: "linear-gradient(160deg, #0e6b5e 0%, #084d43 60%, #063b33 100%)" }}
    >
      {/* School name header */}
      <div className="flex items-center gap-3 px-4 h-16 shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {/* Avatar / logo circle */}
        <div
          className="flex items-center justify-center h-10 w-10 rounded-xl shrink-0 text-lg font-bold"
          style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
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

      {/* Student search */}
      <StudentSearchBox />

      {/* Nav tabs */}
      <nav
        className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5"
        aria-label="Finance sections"
      >
        {TABS.map((tab) => (
          <TabLink key={tab.id} tab={tab} pathname={pathname} />
        ))}
      </nav>

      {/* Decorative bottom image area — matches the screenshot's subtle $ graphic */}
      <div
        className="mx-3 mb-3 rounded-xl overflow-hidden h-20 shrink-0 flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.06)" }}
        aria-hidden="true"
      >
        <svg className="h-12 w-12 opacity-20" fill="currentColor" color="white" viewBox="0 0 24 24">
          <path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      </div>

      {/* Footer — sign out */}
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
  const current  = pathname ? activeTab(pathname) : undefined;

  useEffect(() => { setOpen(false); }, [pathnameRaw]);

  return (
    <div className="md:hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Open finance navigation"
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white"
        style={{ background: "linear-gradient(135deg, #0e6b5e 0%, #084d43 100%)" }}
      >
        <span className="flex items-center gap-2">
          {current?.icon ?? <Banknote className="h-4 w-4" />}
          {current?.label ?? "Finance"}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          className="mt-1 rounded-xl overflow-hidden shadow-lg animate-scale-in"
          style={{ background: "linear-gradient(160deg, #0e6b5e 0%, #084d43 100%)" }}
        >
          <div className="p-2 flex flex-col gap-0.5">
            <StudentSearchBox onSelect={() => setOpen(false)} />
            {TABS.map((tab) => {
              const active = pathname ? isTabActive(tab, pathname) : false;
              return (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    active ? "bg-white/15 text-white" : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <span className={active ? "text-white" : "text-white/60"}>{tab.icon}</span>
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

interface FinanceSidebarNavProps {
  schoolName?: string;
}

export default function FinanceSidebarNav({ schoolName }: FinanceSidebarNavProps) {
  return (
    <>
      <MobileTopBar />
      <DesktopSidebar schoolName={schoolName} />
    </>
  );
}
