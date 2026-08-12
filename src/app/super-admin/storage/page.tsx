"use client";

/**
 * /super-admin/storage — Storage & Usage
 *
 * System-wide totals card + progress bar
 * Per-school sortable table: School | Used | % of quota | Plan | Trend indicator
 * Breakdown by type (documents / media / database / backups) via stacked bar chart (CSS)
 * Top-5 schools by usage highlighted
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter }                         from "next/navigation";
import {
  HardDrive, ChevronUp, ChevronDown, ChevronsUpDown,
  RefreshCw, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import {
  PageHeader, Card, Spinner, ErrorBanner, ProgressBar, Badge,
  secondaryButtonClass,
} from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StorageRow {
  schoolId:   string;
  schoolName: string;
  planTier:   string;
  quotaGb:    number;
  usedGb:     number;
  pct:        number;
  byType:     Record<string, string>; // bytes as string (BigInt serialized)
}

interface StorageData {
  rows:         StorageRow[];
  totalUsedGb:  number;
  totalQuotaGb: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtGb(gb: number) {
  if (gb < 0.1) return `${(gb * 1024).toFixed(0)} MB`;
  return `${gb.toFixed(2)} GB`;
}

function bytesToGb(bytes: string | undefined) {
  return Number(bytes ?? "0") / (1024 ** 3);
}

const TYPE_COLORS: Record<string, string> = {
  documents: "bg-teal",
  media:     "bg-info",
  database:  "bg-warn",
  backups:   "bg-slate-400",
};
const TYPE_ORDER = ["documents", "media", "database", "backups"];

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />;
  return dir === "asc"
    ? <ChevronUp   className="h-3 w-3 text-teal" aria-hidden />
    : <ChevronDown className="h-3 w-3 text-teal" aria-hidden />;
}

// ── Stacked type bar ──────────────────────────────────────────────────────────

function StackedTypeBar({ byType, usedGb }: { byType: Record<string, string>; usedGb: number }) {
  if (usedGb === 0) return <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-dark-border" />;
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-dark-border">
      {TYPE_ORDER.map(type => {
        const gb  = bytesToGb(byType[type]);
        const pct = (gb / usedGb) * 100;
        if (pct < 0.5) return null;
        return (
          <div
            key={type}
            className={`h-full ${TYPE_COLORS[type] ?? "bg-slate-300"} transition-all`}
            style={{ width: `${pct}%` }}
            title={`${type}: ${fmtGb(gb)}`}
          />
        );
      })}
    </div>
  );
}

// ── Trend indicator ───────────────────────────────────────────────────────────

function TrendIndicator({ pct }: { pct: number }) {
  if (pct > 80)  return <TrendingUp   className="h-4 w-4 text-danger"  aria-hidden="true" />;
  if (pct > 50)  return <TrendingUp   className="h-4 w-4 text-warn"    aria-hidden="true" />;
  return              <Minus         className="h-4 w-4 text-slate"    aria-hidden="true" />;
}

// ── Plan badge ────────────────────────────────────────────────────────────────

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
      {tier.slice(0, 3)}
    </span>
  );
}

// ── System-wide summary card ──────────────────────────────────────────────────

function SystemSummary({ totalUsedGb, totalQuotaGb }: { totalUsedGb: number; totalQuotaGb: number }) {
  const pct     = totalQuotaGb > 0 ? (totalUsedGb / totalQuotaGb) * 100 : 0;
  const variant = pct > 90 ? "danger" : pct > 70 ? "warn" : "teal";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Total used */}
      <Card className="dark:bg-dark-surface dark:border-dark-border">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-teal-50 shrink-0">
            <HardDrive className="h-5 w-5 text-teal" strokeWidth={1.8} aria-hidden />
          </div>
          <div>
            <p className="text-2xl font-semibold text-ink dark:text-dark-text tabular-nums">{fmtGb(totalUsedGb)}</p>
            <p className="text-xs text-slate dark:text-dark-muted">Total used</p>
          </div>
        </div>
        <ProgressBar value={pct} max={100} size="md" variant={variant} animated showLabel />
        <p className="text-xs text-slate dark:text-dark-muted mt-1.5">{fmtGb(totalQuotaGb)} total quota across all schools</p>
      </Card>

      {/* Breakdown by type — system-wide */}
      <Card className="sm:col-span-2 dark:bg-dark-surface dark:border-dark-border">
        <h3 className="text-sm font-semibold text-ink dark:text-dark-text mb-3">System-wide Breakdown by Type</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TYPE_ORDER.map(type => (
            <div key={type}
              className="rounded-lg bg-paper dark:bg-dark-bg border border-line dark:border-dark-border p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${TYPE_COLORS[type]}`} aria-hidden />
                <span className="text-xs text-slate dark:text-dark-muted capitalize font-medium">{type}</span>
              </div>
              <p className="text-sm font-semibold text-ink dark:text-dark-text">—</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate dark:text-dark-muted mt-3">
          Per-school breakdown visible in each school's detail row below.
        </p>
      </Card>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type SortKey = "usedGb" | "pct" | "schoolName" | "quotaGb";

export default function StoragePage() {
  const router = useRouter();

  const [data, setData]       = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [sortKey,  setSortKey]  = useState<SortKey>("pct");
  const [sortDir,  setSortDir]  = useState<"asc" | "desc">("desc");
  const [q, setQ]               = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setApiError(null);
    try {
      const res = await fetch(`/api/super-admin/storage?sortBy=${sortKey}&sortDir=${sortDir}`);
      if (!res.ok) throw new Error("Failed to load storage data");
      setData(await res.json());
    } catch (e: any) {
      setApiError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sortKey, sortDir]);

  useEffect(() => { load(); }, [load]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const rows    = data?.rows ?? [];
  const filtered = q.trim()
    ? rows.filter(r => r.schoolName.toLowerCase().includes(q.toLowerCase()))
    : rows;

  const th = "px-5 py-3.5 text-left text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide select-none";
  const thS = `${th} cursor-pointer hover:text-ink dark:hover:text-dark-text`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Storage & Usage"
          description="Per-school storage consumption against quota."
        />
        <button onClick={load}
          className="shrink-0 flex items-center gap-1.5 text-xs text-slate hover:text-ink transition-colors mt-1">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* System summary */}
          {data && (
            <SystemSummary
              totalUsedGb={data.totalUsedGb}
              totalQuotaGb={data.totalQuotaGb}
            />
          )}

          {/* Type legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate dark:text-dark-muted">
            {TYPE_ORDER.map(type => (
              <div key={type} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${TYPE_COLORS[type]}`} aria-hidden />
                <span className="capitalize">{type}</span>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <input type="search" value={q} onChange={e => setQ(e.target.value)}
              placeholder="Filter schools…"
              className="w-full rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                         pl-4 pr-4 py-2.5 text-sm text-ink dark:text-dark-text placeholder:text-slate-light
                         focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 shadow-xs" />
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-line
                            dark:border-dark-border py-16 text-sm text-slate dark:text-dark-muted">
              No schools match your filter
            </div>
          ) : (
            <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-line dark:divide-dark-border">
                  <thead className="bg-slate-50/80 dark:bg-dark-surface">
                    <tr>
                      <th className={thS} onClick={() => toggleSort("schoolName")}>
                        <span className="inline-flex items-center gap-1">
                          School <SortIcon active={sortKey === "schoolName"} dir={sortDir} />
                        </span>
                      </th>
                      <th className={`${th} hidden sm:table-cell`}>Plan</th>
                      <th className={thS} onClick={() => toggleSort("usedGb")}>
                        <span className="inline-flex items-center gap-1">
                          Used <SortIcon active={sortKey === "usedGb"} dir={sortDir} />
                        </span>
                      </th>
                      <th className={thS} onClick={() => toggleSort("quotaGb")}>
                        <span className="inline-flex items-center gap-1">
                          Quota <SortIcon active={sortKey === "quotaGb"} dir={sortDir} />
                        </span>
                      </th>
                      <th className={`${thS} min-w-[180px]`} onClick={() => toggleSort("pct")}>
                        <span className="inline-flex items-center gap-1">
                          % of Quota <SortIcon active={sortKey === "pct"} dir={sortDir} />
                        </span>
                      </th>
                      <th className={`${th} hidden md:table-cell`}>Type Breakdown</th>
                      <th className={th}>Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
                    {filtered.map((row, idx) => {
                      const isTop5    = idx < 5;
                      const isExpanded = expanded === row.schoolId;
                      const pctVariant = row.pct > 90 ? "danger" : row.pct > 70 ? "warn" : "teal";

                      return (
                        <>
                          <tr
                            key={row.schoolId}
                            onClick={() => {
                              setExpanded(isExpanded ? null : row.schoolId);
                            }}
                            className={`cursor-pointer transition-colors
                              ${isExpanded
                                ? "bg-teal-50/40 dark:bg-teal/5"
                                : "hover:bg-slate-50/50 dark:hover:bg-dark-border/30"
                              }
                              ${isTop5 ? "border-l-2 border-l-teal" : ""}`}
                          >
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-ink dark:text-dark-text">
                                  {row.schoolName}
                                </p>
                                {isTop5 && (
                                  <span className="hidden sm:inline text-[9px] font-bold bg-teal-50 text-teal
                                                   border border-teal/20 rounded-full px-1.5 py-0.5 uppercase tracking-wide">
                                    Top 5
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 hidden sm:table-cell">
                              <PlanBadge tier={row.planTier} />
                            </td>
                            <td className="px-5 py-3.5 text-sm font-semibold text-ink dark:text-dark-text tabular-nums whitespace-nowrap">
                              {fmtGb(row.usedGb)}
                            </td>
                            <td className="px-5 py-3.5 text-sm text-slate dark:text-dark-muted tabular-nums whitespace-nowrap">
                              {fmtGb(row.quotaGb)}
                            </td>
                            <td className="px-5 py-3.5 min-w-[180px]">
                              <div className="flex items-center gap-2">
                                <ProgressBar
                                  value={row.pct}
                                  max={100}
                                  size="sm"
                                  variant={pctVariant}
                                  className="flex-1"
                                />
                                <span className={`text-xs font-semibold tabular-nums w-10 text-right
                                  ${pctVariant === "danger" ? "text-danger" : pctVariant === "warn" ? "text-warn" : "text-slate dark:text-dark-muted"}`}>
                                  {row.pct.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 hidden md:table-cell min-w-[140px]">
                              <StackedTypeBar byType={row.byType} usedGb={row.usedGb} />
                            </td>
                            <td className="px-5 py-3.5">
                              <TrendIndicator pct={row.pct} />
                            </td>
                          </tr>

                          {/* Expanded breakdown row */}
                          {isExpanded && (
                            <tr key={`${row.schoolId}-expanded`}
                              className="bg-teal-50/20 dark:bg-teal/5">
                              <td colSpan={7} className="px-5 py-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {TYPE_ORDER.map(type => {
                                    const gb  = bytesToGb(row.byType[type]);
                                    const pct = row.usedGb > 0 ? (gb / row.usedGb) * 100 : 0;
                                    return (
                                      <div key={type}
                                        className="rounded-lg bg-white dark:bg-dark-surface border border-line
                                                   dark:border-dark-border p-3 shadow-xs">
                                        <div className="flex items-center gap-1.5 mb-2">
                                          <span className={`h-2 w-2 rounded-full ${TYPE_COLORS[type]}`} aria-hidden />
                                          <span className="text-xs text-slate dark:text-dark-muted capitalize font-medium">{type}</span>
                                        </div>
                                        <p className="text-base font-semibold text-ink dark:text-dark-text">{fmtGb(gb)}</p>
                                        <p className="text-[10px] text-slate dark:text-dark-muted mt-0.5">{pct.toFixed(1)}% of used</p>
                                        <ProgressBar value={pct} max={100} size="sm" variant="teal" className="mt-2" />
                                      </div>
                                    );
                                  })}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => router.push(`/super-admin/schools/${row.schoolId}?tab=storage`)}
                                  className="mt-3 text-xs text-teal font-medium hover:underline"
                                >
                                  View in school detail →
                                </button>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footer note */}
          <p className="text-xs text-slate dark:text-dark-muted">
            Click a row to expand per-type breakdown. Top 5 schools by usage are highlighted with a teal left border.
          </p>
        </>
      )}
    </div>
  );
}
