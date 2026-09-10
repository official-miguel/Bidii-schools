"use client";

/**
 * History Module — /principal/history
 *
 * Stores archived institutional records: graduated students, transferred
 * students, expelled students, and transferred staff.
 *
 * Three tabs:
 *   1. Graduants          — students archived with type GRADUATION
 *   2. Transferred Students — students archived with type TRANSFER or EXPULSION
 *   3. Transferred Staff  — staff members archived via the Transfer workflow
 *
 * Universal search bar filters across the active tab simultaneously.
 * Tab switching is instant (no page reload) using client-side state.
 * Follows the exact same visual language, spacing, typography, and component
 * patterns established throughout the rest of Bidii.
 */

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, ArrowLeftRight, Users } from "lucide-react";
import { PageHeader } from "@/components/ui";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";
import HistoryStudentsTab  from "@/components/history/HistoryStudentsTab";
import HistoryStaffTab     from "@/components/history/HistoryStaffTab";
import HistoryGraduantsTab from "@/components/history/HistoryGraduantsTab";

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = "graduants" | "students" | "staff";

const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: "graduants", label: "Graduants",            Icon: GraduationCap },
  { id: "students",  label: "Transferred Students",  Icon: ArrowLeftRight },
  { id: "staff",     label: "Transferred Staff",     Icon: Users },
];

// ── Segmented tab navigation ──────────────────────────────────────────────────

function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="History sections"
      className="flex gap-0 overflow-x-auto scrollbar-none border-b border-border -mb-px"
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(id)}
            className={`
              relative flex items-center gap-1.5 px-4 py-3
              text-sm font-medium whitespace-nowrap transition-colors duration-100
              border-b-2 focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-teal/20 focus-visible:ring-offset-0
              ${isActive
                ? "border-teal text-teal"
                : "border-transparent text-slate hover:text-foreground hover:border-border"
              }
            `}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Inner page (uses useSearchParams — must be inside Suspense) ───────────────

function HistoryPageInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const rawTab = searchParams.get("tab") as TabId | null;
  const initialTab: TabId =
    rawTab && TABS.some((t) => t.id === rawTab) ? rawTab : "graduants";

  const [activeTab, setActiveTab]             = useState<TabId>(initialTab);
  const [search, setSearch]                   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  return (
    <div>
      <ContextNavigation
        items={[
          { href: "/principal/students", label: "Students" },
          { href: "/principal/staff",    label: "Staff" },
          { href: "/principal/history",  label: "History", exact: true },
        ]}
      />

      <PageHeader
        title="History"
        description="Archived institutional records — every transferred, expelled, and graduated student, and every staff member who has left the institution. All associated records are permanently preserved."
      />

      <WorkspaceToolbar>
        <WorkspaceToolbar.Search
          value={search}
          onChange={setSearch}
          placeholder={
            activeTab === "staff"
              ? "Search by name, staff ID, department, or reason…"
              : "Search by name, admission number, class, or reason…"
          }
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="text-sm text-teal hover:text-teal/80 transition-colors"
          >
            Clear
          </button>
        )}
      </WorkspaceToolbar>

      <div className="mb-6">
        <TabBar active={activeTab} onChange={handleTabChange} />
      </div>

      {activeTab === "graduants" && (
        <HistoryGraduantsTab globalSearch={debouncedSearch} />
      )}
      {activeTab === "students" && (
        <HistoryStudentsTab
          globalSearch={debouncedSearch}
          typeFilter=""   /* show TRANSFER + EXPULSION together */
        />
      )}
      {activeTab === "staff" && (
        <HistoryStaffTab globalSearch={debouncedSearch} />
      )}
    </div>
  );
}

// ── Page export (Suspense boundary for useSearchParams) ───────────────────────

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-background rounded-lg w-32 border border-border" />
          <div className="h-4 bg-background rounded w-96 border border-border" />
          <div className="h-48 bg-background rounded-xl border border-border" />
        </div>
      }
    >
      <HistoryPageInner />
    </Suspense>
  );
}
