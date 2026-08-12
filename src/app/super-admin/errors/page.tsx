"use client";

/**
 * /super-admin/errors — Error Monitoring
 *
 * Filterable table: School | Message | Severity | Module | Timestamp | Status | Occurrences
 * Row click → right-side detail drawer:
 *   stack trace, context JSON, notes field, status change buttons
 * Trend chart: errors per day for the last 14 days (CSS bar chart — no recharts dep)
 * URL param ?id= opens the drawer directly (linked from Overview)
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams }                           from "next/navigation";
import {
  Search, RefreshCw, X, ChevronDown, ChevronUp, ChevronsUpDown,
  AlertTriangle, CheckCircle2, Clock, Eye,
} from "lucide-react";
import {
  PageHeader, Spinner, ErrorBanner, Badge,
  secondaryButtonClass, primaryButtonClass, dangerButtonClass,
} from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ErrorRow {
  id:          string;
  message:     string;
  severity:    string;
  module:      string | null;
  status:      string;
  occurrences: number;
  createdAt:   string;
  stackTrace?: string | null;
  context?:    any;
  notes?:      string | null;
  school:      { name: string } | null;
}

interface TrendBucket { severity: string; _count: { id: number } }

// ── Severity badge ────────────────────────────────────────────────────────────

function SeverityBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    CRITICAL: "bg-danger-bg text-danger border-danger/20",
    HIGH:     "bg-orange-50 text-orange-600 border-orange-200",
    MEDIUM:   "bg-warn-bg text-warn border-warn/20",
    LOW:      "bg-slate-100 text-slate border-line",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[s] ?? map.LOW}`}>
      {s}
    </span>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, "success" | "warn" | "danger" | "default"> = {
    RESOLVED:     "success",
    INVESTIGATING:"warn",
    NEW:          "danger",
    IGNORED:      "default",
  };
  return <Badge variant={map[s] ?? "default"}>{s}</Badge>;
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />;
  return dir === "asc"
    ? <ChevronUp   className="h-3 w-3 text-teal" aria-hidden />
    : <ChevronDown className="h-3 w-3 text-teal" aria-hidden />;
}

// ── Trend mini-chart (pure CSS) ───────────────────────────────────────────────

function TrendChart({ trend }: { trend: TrendBucket[] }) {
  const SEV_COLORS: Record<string, string> = {
    CRITICAL: "bg-danger",
    HIGH:     "bg-orange-400",
    MEDIUM:   "bg-warn",
    LOW:      "bg-slate-300",
  };
  const totalMax = Math.max(1, ...trend.map(t => t._count.id));

  return (
    <div className="bg-card border border-line dark:bg-dark-surface dark:border-dark-border rounded-xl p-5 shadow-xs">
      <h2 className="text-sm font-semibold text-ink dark:text-dark-text mb-4">Errors by Severity (last 14 days)</h2>
      <div className="flex items-end gap-3 h-24">
        {trend.length === 0 ? (
          <p className="text-xs text-slate dark:text-dark-muted self-center w-full text-center">No data</p>
        ) : (
          trend.map((t, i) => {
            const pct = (t._count.id / totalMax) * 100;
            return (
              <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <span className="text-[10px] text-slate dark:text-dark-muted tabular-nums">{t._count.id}</span>
                <div
                  className={`w-full rounded-t-sm transition-all ${SEV_COLORS[t.severity] ?? "bg-slate-300"}`}
                  style={{ height: `${Math.max(pct, 4)}%` }}
                  title={`${t.severity}: ${t._count.id}`}
                />
                <span className="text-[9px] text-slate dark:text-dark-muted truncate w-full text-center">
                  {t.severity.slice(0, 4)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function ErrorDrawer({
  error,
  onClose,
  onStatusChange,
}: {
  error: ErrorRow;
  onClose: () => void;
  onStatusChange: (id: string, status: string, notes: string) => void;
}) {
  const [notes, setNotes]   = useState(error.notes ?? "");
  const [status, setStatus] = useState(error.status);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/errors?id=${error.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error("Save failed");
      onStatusChange(error.id, status, notes);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const STATUS_BTNS: { value: string; label: string; cls: string }[] = [
    { value: "NEW",          label: "New",          cls: "bg-danger-bg text-danger border-danger/20 hover:bg-danger/10"    },
    { value: "INVESTIGATING",label: "Investigating", cls: "bg-warn-bg text-warn border-warn/20 hover:bg-warn/10"           },
    { value: "RESOLVED",     label: "Resolved",     cls: "bg-success-bg text-success border-success/20 hover:bg-success/10"},
    { value: "IGNORED",      label: "Ignored",      cls: "bg-slate-100 text-slate border-line hover:bg-slate-200"          },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/30 dark:bg-black/50 z-30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Drawer */}
      <aside
        aria-label="Error detail"
        className="fixed right-0 top-0 h-full w-full max-w-xl z-40 bg-white dark:bg-dark-surface
                   border-l border-line dark:border-dark-border shadow-xl overflow-y-auto flex flex-col
                   animate-soma-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-line dark:border-dark-border">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <SeverityBadge s={error.severity} />
              <span className="text-xs text-slate dark:text-dark-muted">
                {error.school?.name ?? "—"}
              </span>
              {error.module && (
                <span className="font-mono text-[10px] text-slate dark:text-dark-muted bg-slate-100 dark:bg-dark-border px-1.5 py-0.5 rounded">
                  {error.module}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-ink dark:text-dark-text leading-snug">{error.message}</p>
          </div>
          <button type="button" onClick={onClose}
            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg text-slate hover:bg-slate-100
                       dark:text-dark-muted dark:hover:bg-dark-border transition-colors">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Meta */}
          <dl className="grid grid-cols-2 gap-3 text-xs">
            {[
              { label: "Occurrences", value: error.occurrences.toString() },
              { label: "First seen",  value: new Date(error.createdAt).toLocaleString("en-GB") },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-paper dark:bg-dark-bg border border-line dark:border-dark-border px-3 py-2.5">
                <p className="text-slate dark:text-dark-muted font-medium uppercase tracking-wide text-[10px] mb-1">{label}</p>
                <p className="text-ink dark:text-dark-text font-semibold">{value}</p>
              </div>
            ))}
          </dl>

          {/* Status change */}
          <div>
            <p className="text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide mb-2">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUS_BTNS.map(({ value, label, cls }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold
                               transition-colors ${cls} ${status === value ? "ring-2 ring-offset-1 ring-teal" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Stack trace */}
          {error.stackTrace && (
            <div>
              <p className="text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide mb-2">Stack Trace</p>
              <pre className="text-[10px] leading-relaxed text-ink dark:text-dark-text bg-paper dark:bg-dark-bg
                              border border-line dark:border-dark-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {error.stackTrace}
              </pre>
            </div>
          )}

          {/* Request context */}
          {error.context && (
            <div>
              <p className="text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide mb-2">Request Context</p>
              <pre className="text-[10px] leading-relaxed text-ink dark:text-dark-text bg-paper dark:bg-dark-bg
                              border border-line dark:border-dark-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(error.context, null, 2)}
              </pre>
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide mb-2">Notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Add investigation notes…"
              className="w-full rounded-lg border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                         px-3 py-2.5 text-sm text-ink dark:text-dark-text placeholder:text-slate-light
                         focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line dark:border-dark-border flex items-center justify-end gap-3">
          {saved && (
            <div className="flex items-center gap-1.5 text-success text-xs font-medium mr-auto">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </div>
          )}
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className={primaryButtonClass}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </aside>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type SortKey = "createdAt" | "severity" | "occurrences";

export default function ErrorsPage() {
  const searchParams = useSearchParams();
  const initialId    = searchParams.get("id");

  const [rows, setRows]           = useState<ErrorRow[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [trend, setTrend]         = useState<TrendBucket[]>([]);
  const [loading, setLoading]     = useState(true);
  const [apiError, setApiError]   = useState<string | null>(null);
  const [selected, setSelected]   = useState<ErrorRow | null>(null);
  const [sortKey, setSortKey]     = useState<SortKey>("createdAt");
  const [sortDir, setSortDir]     = useState<"asc"|"desc">("desc");

  // Filters
  const [fSchool,   setFSchool]   = useState("");
  const [fSeverity, setFSeverity] = useState("");
  const [fStatus,   setFStatus]   = useState("");
  const [fModule,   setFModule]   = useState("");
  const [fFrom,     setFFrom]     = useState("");
  const [fTo,       setFTo]       = useState("");

  const load = useCallback(async (pg = 1) => {
    setLoading(true); setApiError(null);
    try {
      const p = new URLSearchParams({ page: String(pg) });
      if (fSchool)   p.set("schoolId", fSchool);
      if (fSeverity) p.set("severity", fSeverity);
      if (fStatus)   p.set("status",   fStatus);
      if (fModule)   p.set("module",   fModule);
      if (fFrom)     p.set("from",     fFrom);
      if (fTo)       p.set("to",       fTo);

      const res = await fetch(`/api/super-admin/errors?${p}`);
      if (!res.ok) throw new Error("Failed to load errors");
      const j = await res.json();
      setRows(j.errors ?? []);
      setTotal(j.total ?? 0);
      setPage(pg);
      setTrend(j.trend ?? []);
    } catch (e) {
      setApiError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fSchool, fSeverity, fStatus, fModule, fFrom, fTo]);

  useEffect(() => { load(1); }, [load]);

  // Open drawer if ?id= param is present after data loads
  useEffect(() => {
    if (initialId && rows.length > 0) {
      const found = rows.find(r => r.id === initialId);
      if (found) setSelected(found);
    }
  }, [initialId, rows]);

  // Sort rows client-side (server already returns page-limited data)
  const sorted = [...rows].sort((a, b) => {
    let av: number, bv: number;
    if (sortKey === "occurrences") {
      av = a.occurrences; bv = b.occurrences;
    } else if (sortKey === "severity") {
      const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      av = (order as any)[a.severity] ?? 0;
      bv = (order as any)[b.severity] ?? 0;
    } else {
      av = new Date(a.createdAt).getTime();
      bv = new Date(b.createdAt).getTime();
    }
    return sortDir === "asc" ? av - bv : bv - av;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function handleStatusChange(id: string, status: string, notes: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, status, notes } : r));
    setSelected(prev => prev?.id === id ? { ...prev, status, notes } : prev);
  }

  const totalPages = Math.ceil(total / 50);
  const th = "px-5 py-3.5 text-left text-xs font-semibold text-slate dark:text-dark-muted uppercase tracking-wide";
  const thSortable = `${th} cursor-pointer hover:text-ink dark:hover:text-dark-text select-none`;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Error Monitoring"
        description={`${total.toLocaleString()} error${total !== 1 ? "s" : ""} across all schools`}
      />

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Trend chart */}
      <TrendChart trend={trend} />

      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label:"Severity", value:fSeverity, set:setFSeverity,
            opts:[["","All severities"],["CRITICAL","Critical"],["HIGH","High"],["MEDIUM","Medium"],["LOW","Low"]] },
          { label:"Status",   value:fStatus,   set:setFStatus,
            opts:[["","All statuses"],["NEW","New"],["INVESTIGATING","Investigating"],["RESOLVED","Resolved"],["IGNORED","Ignored"]] },
        ].map(({ label, value, set, opts }) => (
          <select key={label} value={value} onChange={e => set(e.target.value)} aria-label={label}
            className="rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                       px-3 py-2.5 text-sm text-ink dark:text-dark-text
                       focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 shadow-xs">
            {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}

        <input type="text" value={fModule} onChange={e => setFModule(e.target.value)}
          placeholder="Module…" aria-label="Filter by module"
          className="rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                     px-3.5 py-2.5 text-sm text-ink dark:text-dark-text placeholder:text-slate-light
                     focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 shadow-xs" />

        <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} aria-label="From date"
          className="rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                     px-3.5 py-2.5 text-sm text-ink dark:text-dark-text
                     focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 shadow-xs" />

        <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} aria-label="To date"
          className="rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border
                     px-3.5 py-2.5 text-sm text-ink dark:text-dark-text
                     focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 shadow-xs" />

        <button type="button" onClick={() => load(1)} className={`${secondaryButtonClass} justify-center`}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Apply
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 rounded-xl border border-dashed
                        border-line dark:border-dark-border text-slate dark:text-dark-muted">
          <CheckCircle2 className="h-8 w-8 text-success opacity-60" aria-hidden />
          <p className="text-sm">No errors match your filters</p>
        </div>
      ) : (
        <div className="rounded-xl border border-line dark:border-dark-border overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line dark:divide-dark-border">
              <thead className="bg-slate-50/80 dark:bg-dark-surface">
                <tr>
                  <th className={th}>Message</th>
                  <th className={`${th} hidden sm:table-cell`}>School</th>
                  <th className={thSortable} onClick={() => toggleSort("severity")}>
                    <span className="inline-flex items-center gap-1">
                      Severity <SortIcon active={sortKey==="severity"} dir={sortDir} />
                    </span>
                  </th>
                  <th className={`${th} hidden md:table-cell`}>Module</th>
                  <th className={thSortable} onClick={() => toggleSort("createdAt")}>
                    <span className="inline-flex items-center gap-1">
                      Time <SortIcon active={sortKey==="createdAt"} dir={sortDir} />
                    </span>
                  </th>
                  <th className={`${th} hidden lg:table-cell`}>Status</th>
                  <th className={thSortable + " hidden lg:table-cell"} onClick={() => toggleSort("occurrences")}>
                    <span className="inline-flex items-center gap-1">
                      Count <SortIcon active={sortKey==="occurrences"} dir={sortDir} />
                    </span>
                  </th>
                  <th className={`${th} w-10`}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-dark-border bg-white dark:bg-dark-surface">
                {sorted.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className="cursor-pointer hover:bg-slate-50/50 dark:hover:bg-dark-border/30 transition-colors"
                  >
                    <td className="px-5 py-3.5 max-w-[260px]">
                      <p className="text-sm text-ink dark:text-dark-text truncate">{row.message}</p>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell text-xs text-slate dark:text-dark-muted whitespace-nowrap">
                      {row.school?.name ?? "—"}
                    </td>
                    <td className="px-5 py-3.5"><SeverityBadge s={row.severity} /></td>
                    <td className="px-5 py-3.5 hidden md:table-cell text-xs font-mono text-slate dark:text-dark-muted">
                      {row.module ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate dark:text-dark-muted whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString("en-GB",{
                        day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <StatusBadge s={row.status} />
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell text-sm tabular-nums text-slate dark:text-dark-muted">
                      {row.occurrences}
                    </td>
                    <td className="px-5 py-3.5">
                      <Eye className="h-4 w-4 text-slate dark:text-dark-muted" aria-hidden />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-slate dark:text-dark-muted">
            Page {page} of {totalPages} · {total} errors
          </p>
          <div className="flex gap-2">
            <button onClick={() => load(page-1)} disabled={page<=1||loading} className={secondaryButtonClass}>Previous</button>
            <button onClick={() => load(page+1)} disabled={page>=totalPages||loading} className={secondaryButtonClass}>Next</button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <ErrorDrawer
          error={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
