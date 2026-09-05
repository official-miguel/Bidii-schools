"use client";

/**
 * /super-admin — Overview dashboard
 *
 * Metrics: school counts, students, staff, storage progress bar.
 * System status banner (Operational / Degraded / Outage).
 * Top-5 critical errors with "View all" link.
 * School search bar → jumps to school detail page.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter }                         from "next/navigation";
import Link                                  from "next/link";
import {
  Building2, Users, GraduationCap, AlertTriangle,
  CheckCircle2, AlertCircle, XCircle, Search,
  HardDrive, RefreshCw, ArrowRight,
} from "lucide-react";
import {
  Card, Badge, Spinner, ProgressBar, ErrorBanner, PageHeader,
} from "@/components/ui";

// ── Types ────────────────────────────────────────────────────────────────────

interface OverviewData {
  schools: { total: number; active: number; onboarding: number; suspended: number };
  totalStudents: number;
  totalStaff: number;
  recentErrors: Array<{
    id: string; message: string; severity: string; module: string | null;
    status: string; createdAt: string; occurrences: number;
    school: { name: string } | null;
  }>;
  systemStatus: { status: string; message: string | null };
  storage: { usedGb: number; quotaGb: number };
}

// ── Severity badge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    CRITICAL: { label: "Critical", cls: "bg-danger-bg text-danger border-danger/20" },
    HIGH:     { label: "High",     cls: "bg-orange-50 text-orange-600 border-orange-200" },
    MEDIUM:   { label: "Medium",   cls: "bg-warn-bg text-warn border-warn/20" },
    LOW:      { label: "Low",      cls: "bg-slate-100 text-slate border-line" },
  };
  const { label, cls } = map[severity] ?? map.LOW;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ── System status banner ──────────────────────────────────────────────────────

function SystemStatusBanner({ status, message }: { status: string; message: string | null }) {
  const map: Record<string, { bg: string; border: string; text: string; Icon: typeof CheckCircle2 }> = {
    OPERATIONAL: { bg: "bg-success-bg", border: "border-success/20", text: "text-success", Icon: CheckCircle2 },
    DEGRADED:    { bg: "bg-warn-bg",    border: "border-warn/20",    text: "text-warn",    Icon: AlertCircle  },
    OUTAGE:      { bg: "bg-danger-bg",  border: "border-danger/20",  text: "text-danger",  Icon: XCircle      },
  };
  const { bg, border, text, Icon } = map[status] ?? map.OPERATIONAL;
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-5 py-3.5 ${bg} ${border}`}>
      <Icon className={`h-5 w-5 shrink-0 ${text}`} strokeWidth={2} aria-hidden />
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${text}`}>
          System {status.charAt(0) + status.slice(1).toLowerCase()}
        </p>
        {message && (
          <p className={`text-xs mt-0.5 ${text} opacity-80`}>{message}</p>
        )}
      </div>
      <span className={`ml-auto text-xs font-medium uppercase tracking-wide ${text} shrink-0`}>
        {status}
      </span>
    </div>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, Icon, iconBg, href,
}: {
  label: string; value: number; sub?: string;
  Icon: typeof Building2; iconBg: string; href?: string;
}) {
  const inner = (
    <div className="flex items-start gap-4">
      <div className={`flex items-center justify-center h-11 w-11 rounded-xl shrink-0 ${iconBg}`}>
        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-semibold text-ink dark:text-dark-text tabular-nums leading-none">
          {value.toLocaleString()}
        </p>
        <p className="text-sm text-slate dark:text-dark-muted mt-1">{label}</p>
        {sub && <p className="text-xs text-slate/70 dark:text-dark-muted/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  const cls = "bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border";
  if (href) {
    return (
      <Link href={href} className={`block ${cls} hover:border-teal/40 hover:-translate-y-0.5 transition-all duration-150`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

// ── School sub-breakdown ──────────────────────────────────────────────────────

function SchoolBreakdown({ active, onboarding, suspended }: {
  active: number; onboarding: number; suspended: number;
}) {
  const items = [
    { label: "Active",      count: active,      dot: "bg-success" },
    { label: "Onboarding",  count: onboarding,  dot: "bg-info" },
    { label: "Suspended",   count: suspended,   dot: "bg-danger" },
  ];
  return (
    <div className="flex items-center gap-4 flex-wrap mt-3">
      {items.map(({ label, count, dot }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${dot}`} aria-hidden />
          <span className="text-xs text-slate dark:text-dark-muted">
            {count} <span className="font-medium">{label}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SuperAdminOverviewPage() {
  const router                        = useRouter();
  const [data, setData]               = useState<OverviewData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [schoolSearch, setSchoolSearch] = useState("");
  const [schoolResults, setSchoolResults] = useState<Array<{ id: string; name: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/super-admin/overview");
      if (!res.ok) throw new Error("Failed to load overview data");
      setData(await res.json());
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((e as any).message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // School search with debounce
  useEffect(() => {
    if (!schoolSearch.trim()) { setSchoolResults([]); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/super-admin/schools?q=${encodeURIComponent(schoolSearch)}&limit=6`);
        const j   = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSchoolResults((j.schools ?? []).map((s: any) => ({ id: s.id, name: s.name })));
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [schoolSearch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error ?? "Failed to load data"} />
        <button onClick={load} className="inline-flex items-center gap-2 text-sm text-teal font-medium hover:underline">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  const storageVariant = (data.storage.usedGb / Math.max(data.storage.quotaGb, 1)) > 0.9
    ? "danger"
    : (data.storage.usedGb / Math.max(data.storage.quotaGb, 1)) > 0.7
    ? "warn"
    : "teal";

  return (
    <div className="space-y-5 sm:space-y-7 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Overview"
          description="System-wide metrics and health at a glance."
        />
        <button
          onClick={load}
          className="shrink-0 flex items-center gap-1.5 text-xs text-slate hover:text-ink transition-colors mt-1"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden xs:inline">Refresh</span>
        </button>
      </div>

      {/* System status */}
      <SystemStatusBanner
        status={data.systemStatus.status}
        message={data.systemStatus.message}
      />

      {/* School search */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none" aria-hidden />
          <input
            type="search"
            value={schoolSearch}
            onChange={e => setSchoolSearch(e.target.value)}
            placeholder="Jump to a school…"
            className="w-full rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                       pl-10 pr-4 py-3 text-sm text-ink dark:text-dark-text placeholder:text-slate-light
                       focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 transition-colors shadow-xs"
          />
          {searchLoading && (
            <Spinner size="sm" className="absolute right-3.5 top-1/2 -translate-y-1/2" />
          )}
        </div>
        {schoolResults.length > 0 && schoolSearch.trim() && (
          <ul className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-dark-surface
                         border border-line dark:border-dark-border rounded-xl shadow-md z-20 overflow-hidden">
            {schoolResults.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => { router.push(`/super-admin/schools/${s.id}`); setSchoolSearch(""); }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-ink dark:text-dark-text
                             hover:bg-teal-50/60 dark:hover:bg-dark-border/40 transition-colors"
                >
                  <Building2 className="h-4 w-4 text-slate shrink-0" aria-hidden />
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border
                        sm:col-span-2 xl:col-span-1">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-teal-50 shrink-0">
              <Building2 className="h-5 w-5 text-teal" strokeWidth={1.8} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-semibold text-ink dark:text-dark-text tabular-nums leading-none">
                {data.schools.total.toLocaleString()}
              </p>
              <p className="text-sm text-slate dark:text-dark-muted mt-1">Schools</p>
              <SchoolBreakdown
                active={data.schools.active}
                onboarding={data.schools.onboarding}
                suspended={data.schools.suspended}
              />
            </div>
          </div>
        </div>

        <MetricCard
          label="Students"
          value={data.totalStudents}
          sub="Active, non-archived"
          Icon={GraduationCap}
          iconBg="bg-info-bg"
          href="/super-admin/schools"
        />
        <MetricCard
          label="Staff & Admins"
          value={data.totalStaff}
          sub="Active, non-archived"
          Icon={Users}
          iconBg="bg-success-bg"
        />
        <MetricCard
          label="Open Critical Errors"
          value={data.recentErrors.filter(e => !["RESOLVED","IGNORED"].includes(e.status)).length}
          sub="Critical + High severity"
          Icon={AlertTriangle}
          iconBg="bg-danger-bg"
          href="/super-admin/errors"
        />
      </div>

      {/* Storage usage */}
      <Card className="dark:bg-dark-surface dark:border-dark-border">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <HardDrive className="h-4.5 w-4.5 text-slate" strokeWidth={1.8} aria-hidden />
            <h2 className="text-sm font-semibold text-ink dark:text-dark-text">Total Storage</h2>
          </div>
          <Link
            href="/super-admin/storage"
            className="text-xs text-teal font-medium hover:underline flex items-center gap-1"
          >
            View breakdown <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <ProgressBar
          value={data.storage.usedGb}
          max={Math.max(data.storage.quotaGb, 1)}
          size="md"
          variant={storageVariant}
          animated
          showLabel
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-slate dark:text-dark-muted">
            {data.storage.usedGb.toFixed(1)} GB used
          </p>
          <p className="text-xs text-slate dark:text-dark-muted">
            {data.storage.quotaGb.toFixed(0)} GB total quota
          </p>
        </div>
      </Card>

      {/* Recent critical errors */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink dark:text-dark-text">
            Recent Critical Errors
          </h2>
          <Link
            href="/super-admin/errors"
            className="text-xs text-teal font-medium hover:underline flex items-center gap-1"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {data.recentErrors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line dark:border-dark-border
                          flex items-center justify-center py-12 text-sm text-slate dark:text-dark-muted">
            <CheckCircle2 className="h-5 w-5 mr-2 text-success" aria-hidden />
            No critical errors right now
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="sm:hidden space-y-3">
              {data.recentErrors.map(err => (
                <button
                  key={err.id}
                  type="button"
                  onClick={() => router.push(`/super-admin/errors?id=${err.id}`)}
                  className="w-full text-left bg-white dark:bg-dark-surface border border-line
                             dark:border-dark-border rounded-xl p-4 shadow-xs
                             hover:border-teal/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-sm text-ink dark:text-dark-text font-medium leading-snug flex-1 min-w-0">
                      {err.message}
                    </p>
                    <SeverityBadge severity={err.severity} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate dark:text-dark-muted">
                    {err.school?.name && <span>{err.school.name}</span>}
                    {err.module && <span className="font-mono">{err.module}</span>}
                    <span>{new Date(err.createdAt).toLocaleDateString()}</span>
                    <Badge variant={err.status === "RESOLVED" ? "success" : err.status === "INVESTIGATING" ? "warn" : "danger"}>
                      {err.status}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden sm:block rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs">
              <table className="min-w-full divide-y divide-line dark:divide-dark-border">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-dark-surface text-left text-xs font-semibold
                                 text-slate dark:text-dark-muted uppercase tracking-wide">
                    <th className="px-5 py-3.5">Error</th>
                    <th className="px-5 py-3.5 hidden sm:table-cell">School</th>
                    <th className="px-5 py-3.5 hidden md:table-cell">Module</th>
                    <th className="px-5 py-3.5">Severity</th>
                    <th className="px-5 py-3.5 hidden lg:table-cell">Occurrences</th>
                    <th className="px-5 py-3.5 hidden lg:table-cell">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
                  {data.recentErrors.map(err => (
                    <tr
                      key={err.id}
                      onClick={() => router.push(`/super-admin/errors?id=${err.id}`)}
                      className="cursor-pointer hover:bg-slate-50/50 dark:hover:bg-dark-border/30 transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <p className="text-sm text-ink dark:text-dark-text truncate max-w-[260px]">
                          {err.message}
                        </p>
                        <p className="text-xs text-slate dark:text-dark-muted mt-0.5">
                          {new Date(err.createdAt).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell text-sm text-slate dark:text-dark-muted">
                        {err.school?.name ?? "—"}
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate dark:text-dark-muted font-mono">
                        {err.module ?? "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <SeverityBadge severity={err.severity} />
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell text-sm text-slate dark:text-dark-muted tabular-nums">
                        {err.occurrences}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <Badge variant={err.status === "RESOLVED" ? "success" : err.status === "INVESTIGATING" ? "warn" : "danger"}>
                          {err.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
