"use client";

/**
 * /super-admin/schools — Schools Management
 *
 * Sortable, searchable table of all schools with:
 *  - Plan tier badge, status badge, student/staff counts, storage used
 *  - Row click → detail page
 *  - Row actions: Suspend / Reactivate, Edit plan tier
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter }                         from "next/navigation";
import Link                                  from "next/link";
import {
  Search, Plus, ChevronUp, ChevronDown, ChevronsUpDown,
  Building2, MoreVertical, PauseCircle, PlayCircle, RefreshCw,
} from "lucide-react";
import {
  PageHeader, Badge, Spinner, ErrorBanner, ProgressBar,
  primaryButtonClass, secondaryButtonClass,
} from "@/components/ui";

// ── Types ────────────────────────────────────────────────────────────────────

interface SchoolRow {
  id:        string;
  name:      string;
  createdAt: string;
  email:     string | null;
  schoolMeta: {
    planTier:      string;
    status:        string;
    storageQuotaGb: number;
    studentCount:  number;
    staffCount:    number;
    contactPerson: string | null;
    contactEmail:  string | null;
  } | null;
  _count:     { students: number; teachers: number };
  storageUsages: { sizeBytes: string }[];
}

type SortKey = "name" | "createdAt";

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE:      "bg-success-bg text-success border-success/20",
    ONBOARDING:  "bg-info-bg text-info border-info/20",
    SUSPENDED:   "bg-danger-bg text-danger border-danger/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status] ?? "bg-slate-100 text-slate border-line"}`}>
      {status}
    </span>
  );
}

function PlanBadge({ tier }: { tier: string }) {
  const map: Record<string, string> = {
    FREE:         "bg-slate-100 text-slate border-line",
    STARTER:      "bg-teal-50 text-teal border-teal/20",
    GROWTH:       "bg-info-bg text-info border-info/20",
    PROFESSIONAL: "bg-warn-bg text-warn border-warn/20",
    ENTERPRISE:   "bg-danger-bg text-danger border-danger/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[tier] ?? "bg-slate-100 text-slate border-line"}`}>
      {tier}
    </span>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />;
  return dir === "asc"
    ? <ChevronUp   className="h-3 w-3 text-teal" aria-hidden />
    : <ChevronDown className="h-3 w-3 text-teal" aria-hidden />;
}

// ── Row actions dropdown ──────────────────────────────────────────────────────

function RowActions({
  school,
  onAction,
}: {
  school: SchoolRow;
  onAction: (id: string, action: "suspend" | "reactivate") => void;
}) {
  const [open, setOpen] = useState(false);
  const status = school.schoolMeta?.status ?? "ACTIVE";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center justify-center h-8 w-8 rounded-lg text-slate
                   hover:bg-slate-100 dark:hover:bg-dark-border transition-colors"
        aria-label="Row actions"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-line
                          bg-white dark:bg-dark-surface dark:border-dark-border shadow-md overflow-hidden">
            {status === "SUSPENDED" ? (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setOpen(false); onAction(school.id, "reactivate"); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-success
                           hover:bg-success-bg/60 transition-colors"
              >
                <PlayCircle className="h-4 w-4 shrink-0" aria-hidden /> Reactivate
              </button>
            ) : (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setOpen(false); onAction(school.id, "suspend"); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-danger
                           hover:bg-danger-bg/60 transition-colors"
              >
                <PauseCircle className="h-4 w-4 shrink-0" aria-hidden /> Suspend
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SchoolsPage() {
  const router = useRouter();

  const [schools, setSchools]       = useState<SchoolRow[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [apiError, setApiError]     = useState<string | null>(null);
  const [q, setQ]                   = useState("");
  const [statusFilter, setStatus]   = useState("");
  const [sortKey, setSortKey]       = useState<SortKey>("name");
  const [sortDir, setSortDir]       = useState<"asc" | "desc">("asc");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const load = useCallback(async (pg = 1) => {
    setLoading(true); setApiError(null);
    try {
      const params = new URLSearchParams({
        q, sortBy: sortKey, sortDir, page: String(pg),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      const res = await fetch(`/api/super-admin/schools?${params}`);
      if (!res.ok) throw new Error("Failed to load schools");
      const j = await res.json();
      setSchools(j.schools ?? []);
      setTotal(j.total ?? 0);
      setPage(pg);
    } catch (e: any) {
      setApiError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, sortKey, sortDir, statusFilter]);

  useEffect(() => { load(1); }, [load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  async function handleAction(id: string, action: "suspend" | "reactivate") {
    setActionBusy(id);
    try {
      const res = await fetch(`/api/super-admin/schools/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: action === "suspend" ? "SUSPENDED" : "ACTIVE" }),
      });
      if (!res.ok) throw new Error("Action failed");
      await load(page);
    } catch (e: any) {
      setApiError(e.message);
    } finally {
      setActionBusy(null);
    }
  }

  const totalPages = Math.ceil(total / 50);
  const th = "px-5 py-3.5 text-left text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide select-none";

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Schools"
        description={`${total.toLocaleString()} school${total !== 1 ? "s" : ""} registered`}
        action={
          <Link href="/super-admin/schools/new" className={primaryButtonClass}>
            <Plus className="h-4 w-4" aria-hidden /> Onboard School
          </Link>
        }
      />

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search schools…"
            className="w-full rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                       pl-10 pr-4 py-2.5 text-sm text-ink dark:text-dark-text placeholder:text-slate-light
                       focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 shadow-xs"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
          className="rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                     px-3.5 py-2.5 text-sm text-ink dark:text-dark-text
                     focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 shadow-xs"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ONBOARDING">Onboarding</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <button
          type="button"
          onClick={() => load(1)}
          className={`${secondaryButtonClass} shrink-0`}
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : schools.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line
                        dark:border-dark-border py-16 text-slate dark:text-dark-muted gap-3">
          <Building2 className="h-8 w-8 opacity-40" aria-hidden />
          <p className="text-sm">No schools found</p>
          <Link href="/super-admin/schools/new" className={primaryButtonClass}>
            <Plus className="h-4 w-4" /> Onboard first school
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line dark:divide-dark-border">
              <thead className="bg-slate-50/80 dark:bg-dark-surface">
                <tr>
                  <th
                    className={`${th} cursor-pointer hover:text-ink dark:hover:text-dark-text`}
                    onClick={() => toggleSort("name")}
                  >
                    <span className="inline-flex items-center gap-1">
                      School <SortIcon active={sortKey === "name"} dir={sortDir} />
                    </span>
                  </th>
                  <th className={th}>Plan</th>
                  <th className={th}>Status</th>
                  <th
                    className={`${th} cursor-pointer hover:text-ink dark:hover:text-dark-text`}
                    onClick={() => toggleSort("createdAt")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Onboarded <SortIcon active={sortKey === "createdAt"} dir={sortDir} />
                    </span>
                  </th>
                  <th className={`${th} hidden md:table-cell`}>Students</th>
                  <th className={`${th} hidden md:table-cell`}>Staff</th>
                  <th className={`${th} hidden lg:table-cell`}>Storage</th>
                  <th className={`${th} w-12`}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
                {schools.map(school => {
                  const meta = school.schoolMeta;
                  const usedBytes = school.storageUsages.reduce((a, u) => a + Number(u.sizeBytes), 0);
                  const usedGb    = usedBytes / (1024 ** 3);
                  const quotaGb   = meta?.storageQuotaGb ?? 5;
                  const pct       = Math.min((usedGb / quotaGb) * 100, 100);
                  const busy      = actionBusy === school.id;

                  return (
                    <tr
                      key={school.id}
                      onClick={() => router.push(`/super-admin/schools/${school.id}`)}
                      className={`cursor-pointer hover:bg-slate-50/50 dark:hover:bg-dark-border/30
                                  transition-colors ${busy ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-ink dark:text-dark-text">{school.name}</p>
                        {meta?.contactEmail && (
                          <p className="text-xs text-slate dark:text-dark-muted mt-0.5">{meta.contactEmail}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <PlanBadge tier={meta?.planTier ?? "FREE"} />
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={meta?.status ?? "ONBOARDING"} />
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate dark:text-dark-muted whitespace-nowrap">
                        {new Date(school.createdAt).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell text-sm text-slate dark:text-dark-muted tabular-nums">
                        {school._count.students.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell text-sm text-slate dark:text-dark-muted tabular-nums">
                        {school._count.teachers.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell min-w-[120px]">
                        <div className="space-y-1">
                          <ProgressBar
                            value={pct}
                            max={100}
                            size="sm"
                            variant={pct > 90 ? "danger" : pct > 70 ? "warn" : "teal"}
                          />
                          <p className="text-[10px] text-slate dark:text-dark-muted tabular-nums">
                            {usedGb.toFixed(1)} / {quotaGb} GB
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                        <RowActions school={school} onAction={handleAction} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate dark:text-dark-muted">
            Page {page} of {totalPages} · {total} schools
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(page - 1)}
              disabled={page <= 1 || loading}
              className={secondaryButtonClass}
            >
              Previous
            </button>
            <button
              onClick={() => load(page + 1)}
              disabled={page >= totalPages || loading}
              className={secondaryButtonClass}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
