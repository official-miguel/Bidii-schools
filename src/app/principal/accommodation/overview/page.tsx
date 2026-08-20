"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Building2, Users, BedDouble, CheckCircle2,
  TrendingUp, Wrench, Lock, ArrowRight, Plus, RefreshCw,
  Home, UserCheck, BarChart2, ClipboardList, Settings, Shuffle, FileText,
} from "lucide-react";
import { PageHeader } from "@/components/ui";
import ContextNavigation from "@/components/ContextNavigation";
import WorkspaceToolbar from "@/components/workspace/WorkspaceToolbar";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DormSummary {
  id: string;
  name: string;
  genderPolicy: "BOYS_ONLY" | "GIRLS_ONLY" | "MIXED";
  status: "ACTIVE" | "UNDER_MAINTENANCE" | "CLOSED";
  structure: "OPEN_HALL" | "CUBICLE_BASED";
  allocationPolicy: "RESTRICTED_BY_FORM" | "MIXED_FORMS";
  capacity: number;
  occupied: number;
  available: number;
  occupancyPct: number;
  isAlmostFull: boolean;
  boardingMasterName: string | null;
}

interface Summary {
  totalDormitories: number;
  activeDormitories: number;
  maintenanceDormitories: number;
  closedDormitories: number;
  boardingStudents: number;
  totalSleepingPositions: number;
  occupiedPositions: number;
  availablePositions: number;
  occupancyPct: number;
  dormSummaries: DormSummary[];
  settings: { boardingType: string; schoolGenderPolicy: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GENDER_LABEL: Record<string, string> = {
  BOYS_ONLY: "Boys",
  GIRLS_ONLY: "Girls",
  MIXED: "Mixed",
};

const GENDER_COLOR: Record<string, string> = {
  BOYS_ONLY: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  GIRLS_ONLY: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-800",
  MIXED: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800",
};

const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  ACTIVE:             { label: "Active",       icon: CheckCircle2,  color: "text-success" },
  UNDER_MAINTENANCE:  { label: "Maintenance",  icon: Wrench,        color: "text-warn" },
  CLOSED:             { label: "Closed",       icon: Lock,          color: "text-slate" },
};

function OccupancyBar({ pct, isAlmostFull }: { pct: number; isAlmostFull: boolean }) {
  const color = isAlmostFull ? "bg-warn" : pct >= 100 ? "bg-danger" : "bg-teal";
  return (
    <div className="w-full h-1.5 rounded-full bg-line dark:bg-dark-border overflow-hidden mt-2">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
        aria-label={`${pct}% occupied`}
      />
    </div>
  );
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: "/principal/accommodation/overview",     label: "Overview",    exact: true },
  { href: "/principal/accommodation/dormitories",  label: "Dormitories" },
  { href: "/principal/accommodation/allocations",  label: "Allocations" },
  { href: "/principal/accommodation/management",   label: "Management" },
  { href: "/principal/accommodation/analytics",    label: "Analytics" },
  { href: "/principal/accommodation/inspections",  label: "Inspections" },
  { href: "/principal/accommodation/reports",      label: "Reports" },
  { href: "/principal/accommodation/settings",     label: "Settings" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AccommodationOverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/accommodation/summary", { cache: "no-store" });
      if (res.ok) setSummary(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredDorms = (summary?.dormSummaries ?? []).filter(
    (d) =>
      !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      GENDER_LABEL[d.genderPolicy]?.toLowerCase().includes(search.toLowerCase())
  );

  const isDayOnly = summary?.settings?.boardingType === "DAY_ONLY";

  return (
    <div>
      <ContextNavigation items={NAV_ITEMS} />

      <PageHeader
        title="Accommodation"
        description="Dormitories, boarding allocations, and occupancy at a glance."
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-line bg-white text-slate hover:text-ink hover:bg-paper disabled:opacity-50 transition-all dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted dark:hover:text-dark-text"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <Link
              href="/principal/accommodation/dormitories"
              className="inline-flex items-center gap-2 rounded-lg bg-teal text-white text-sm font-medium px-4 py-2.5 hover:bg-teal-dark active:scale-[0.98] transition-all shadow-xs"
            >
              <Plus className="h-4 w-4" />
              Add Dormitory
            </Link>
          </div>
        }
      />

      {/* ── Day-only state ────────────────────────────────────────────── */}
      {!loading && isDayOnly && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="rounded-full bg-slate-100 dark:bg-dark-surface p-5">
            <Home className="h-10 w-10 text-slate" />
          </div>
          <p className="text-ink font-medium dark:text-dark-text">Boarding is not enabled</p>
          <p className="text-slate text-sm max-w-sm dark:text-dark-muted">
            Go to Accommodation Settings and change the boarding type to start using this module.
          </p>
          <Link
            href="/principal/accommodation/settings"
            className="inline-flex items-center gap-2 rounded-lg bg-teal text-white text-sm font-medium px-4 py-2.5 hover:bg-teal-dark transition-all"
          >
            <Plus className="h-4 w-4" /> Configure
          </Link>
        </div>
      )}

      {/* ── Skeleton ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-line/40 dark:bg-dark-border/40 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-line/40 dark:bg-dark-border/40 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {summary && !isDayOnly && (
        <>
          {/* ── Stat cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {summary.settings?.boardingType === "DAY_AND_BOARDING" && (
              <div className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-2xl font-semibold text-ink dark:text-dark-text tabular-nums">
                      {summary.boardingStudents}
                    </p>
                    <p className="text-slate text-sm mt-1 dark:text-dark-muted">Boarding students</p>
                  </div>
                  <div className="rounded-lg bg-teal/10 p-2">
                    <Users className="h-5 w-5 text-teal" />
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-line bg-card p-5 dark:bg-dark-surface dark:border-dark-border">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-semibold text-ink dark:text-dark-text tabular-nums">
                    {summary.totalDormitories}
                  </p>
                  <p className="text-slate text-sm mt-1 dark:text-dark-muted">Dormitories</p>
                  <p className="text-slate/60 text-xs dark:text-dark-muted/60">
                    {summary.activeDormitories} active
                    {summary.maintenanceDormitories > 0 ? `, ${summary.maintenanceDormitories} maintenance` : ""}
                  </p>
                </div>
                <div className="rounded-lg bg-teal/10 p-2">
                  <Building2 className="h-5 w-5 text-teal" />
                </div>
              </div>
            </div>

            <div className={`rounded-xl border p-5 ${summary.availablePositions === 0 && summary.totalSleepingPositions > 0 ? "border-danger/30 bg-danger-bg/40 dark:bg-danger/10" : "border-line bg-card dark:bg-dark-surface dark:border-dark-border"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-2xl font-semibold tabular-nums ${summary.availablePositions === 0 && summary.totalSleepingPositions > 0 ? "text-danger" : "text-ink dark:text-dark-text"}`}>
                    {summary.availablePositions}
                  </p>
                  <p className="text-slate text-sm mt-1 dark:text-dark-muted">Available spaces</p>
                  <p className="text-slate/60 text-xs dark:text-dark-muted/60">
                    of {summary.totalSleepingPositions} total
                  </p>
                </div>
                <div className={`rounded-lg p-2 ${summary.availablePositions === 0 && summary.totalSleepingPositions > 0 ? "bg-danger/10" : "bg-teal/10"}`}>
                  <BedDouble className={`h-5 w-5 ${summary.availablePositions === 0 && summary.totalSleepingPositions > 0 ? "text-danger" : "text-teal"}`} />
                </div>
              </div>
            </div>

            <div className={`rounded-xl border p-5 ${summary.occupancyPct >= 90 ? "border-warn/30 bg-warn-bg/40 dark:bg-warn/10" : "border-line bg-card dark:bg-dark-surface dark:border-dark-border"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-2xl font-semibold tabular-nums ${summary.occupancyPct >= 90 ? "text-warn" : "text-ink dark:text-dark-text"}`}>
                    {summary.occupancyPct}%
                  </p>
                  <p className="text-slate text-sm mt-1 dark:text-dark-muted">Occupancy rate</p>
                  <p className="text-slate/60 text-xs dark:text-dark-muted/60">
                    {summary.occupiedPositions} occupied
                  </p>
                </div>
                <div className={`rounded-lg p-2 ${summary.occupancyPct >= 90 ? "bg-warn/10" : "bg-teal/10"}`}>
                  <TrendingUp className={`h-5 w-5 ${summary.occupancyPct >= 90 ? "text-warn" : "text-teal"}`} />
                </div>
              </div>
              <OccupancyBar pct={summary.occupancyPct} isAlmostFull={summary.occupancyPct >= 90} />
            </div>
          </div>

          {/* ── Dorm cards ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">All Dormitories</h2>
          </div>

          <WorkspaceToolbar>
            <WorkspaceToolbar.Search
              value={search}
              onChange={setSearch}
              placeholder="Search dormitories…"
            />
            <WorkspaceToolbar.Actions>
              <Link
                href="/principal/accommodation/dormitories"
                className="inline-flex items-center gap-1.5 text-sm text-teal font-medium hover:underline"
              >
                Manage all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </WorkspaceToolbar.Actions>
          </WorkspaceToolbar>

          {filteredDorms.length === 0 && !search && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="rounded-full bg-slate-100 dark:bg-dark-surface p-5">
                <Building2 className="h-9 w-9 text-slate" />
              </div>
              <p className="text-ink font-medium dark:text-dark-text">No dormitories yet</p>
              <p className="text-slate text-sm max-w-sm dark:text-dark-muted">
                Register your first dormitory to start managing boarding accommodation.
              </p>
              <Link
                href="/principal/accommodation/dormitories"
                className="inline-flex items-center gap-2 rounded-lg bg-teal text-white text-sm font-medium px-4 py-2.5 hover:bg-teal-dark transition-all"
              >
                <Plus className="h-4 w-4" /> Register Dormitory
              </Link>
            </div>
          )}

          {filteredDorms.length === 0 && search && (
            <p className="text-slate text-sm py-8 text-center dark:text-dark-muted">
              No dormitories match &ldquo;{search}&rdquo;
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDorms.map((dorm) => {
              const statusMeta = STATUS_META[dorm.status];
              const StatusIcon = statusMeta.icon;
              return (
                <Link
                  key={dorm.id}
                  href={`/principal/accommodation/dormitories/${dorm.id}`}
                  className="group rounded-xl border border-line bg-card p-5 hover:border-teal/40 hover:shadow-md transition-all dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/30"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-ink group-hover:text-teal transition-colors dark:text-dark-text dark:group-hover:text-teal truncate">
                          {dorm.name}
                        </p>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${GENDER_COLOR[dorm.genderPolicy]}`}>
                          {GENDER_LABEL[dorm.genderPolicy]}
                        </span>
                      </div>
                      {dorm.boardingMasterName && (
                        <p className="text-xs text-slate mt-0.5 dark:text-dark-muted truncate">
                          {dorm.boardingMasterName}
                        </p>
                      )}
                    </div>
                    <div className={`flex items-center gap-1 shrink-0 text-xs font-medium ${statusMeta.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {statusMeta.label}
                    </div>
                  </div>

                  <div className="flex items-end justify-between gap-2 mb-1">
                    <p className="text-xs text-slate dark:text-dark-muted">
                      {dorm.occupied} / {dorm.capacity} spaces
                    </p>
                    <p className={`text-xs font-semibold tabular-nums ${dorm.isAlmostFull ? "text-warn" : dorm.occupancyPct >= 100 ? "text-danger" : "text-teal"}`}>
                      {dorm.occupancyPct}%
                    </p>
                  </div>
                  <OccupancyBar pct={dorm.occupancyPct} isAlmostFull={dorm.isAlmostFull} />

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-line/60 dark:border-dark-border/60">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate dark:text-dark-muted">
                        {dorm.structure === "CUBICLE_BASED" ? "Cubicle-based" : "Open hall"}
                      </span>
                      <span className="text-xs text-slate dark:text-dark-muted">
                        {dorm.available > 0
                          ? `${dorm.available} free`
                          : dorm.capacity > 0 && dorm.occupancyPct >= 100
                            ? <span className="text-danger font-medium">Full</span>
                            : <span className="text-slate dark:text-dark-muted">—</span>}
                      </span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate group-hover:text-teal group-hover:translate-x-0.5 transition-all dark:text-dark-muted" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* ── Quick actions ───────────────────────────────────────────── */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { href: "/principal/accommodation/dormitories",  icon: Building2,      label: "Manage Dormitories",  desc: "Add, edit, or configure dorm structures and policies" },
              { href: "/principal/accommodation/allocations",  icon: UserCheck,      label: "Student Allocations", desc: "Allocate students, transfer, bulk operations" },
              { href: "/principal/accommodation/management",   icon: Shuffle,        label: "Dorm Operations",     desc: "Transfers, maintenance, emergency relocations" },
              { href: "/principal/accommodation/analytics",    icon: BarChart2,      label: "Analytics Dashboard", desc: "Cross-module performance and risk indicators" },
              { href: "/principal/accommodation/inspections",  icon: ClipboardList,  label: "Inspections",         desc: "Schedule cleanliness and safety inspections" },
              { href: "/principal/accommodation/reports",      icon: FileText,       label: "Reports",             desc: "Generate and export occupancy reports" },
              { href: "/principal/accommodation/settings",     icon: Settings,       label: "Settings",            desc: "Module preferences and default policies" },
            ].map(({ href, icon: Icon, label, desc }) => (
              <Link key={href} href={href}
                className="group rounded-xl border border-line bg-card dark:bg-dark-surface dark:border-dark-border p-4 hover:border-teal/40 hover:shadow-md transition-all">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-teal/10 p-2.5 shrink-0 group-hover:bg-teal/15 transition-colors">
                    <Icon className="h-4 w-4 text-teal" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink dark:text-dark-text group-hover:text-teal transition-colors mb-0.5">
                      {label}
                    </p>
                    <p className="text-xs text-slate dark:text-dark-muted leading-relaxed">
                      {desc}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
