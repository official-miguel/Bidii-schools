"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  DollarSign, ChevronDown, ChevronRight, Search, X,
  SlidersHorizontal, RefreshCw, ChevronLeft, ChevronRight as ChevronRightIcon,
} from "lucide-react";
import {
  PageHeader, Badge, EmptyState, Spinner, ErrorBanner,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id:             string;
  entryType:      string;
  amount:         string;
  runningBalance: string;
  description:    string;
  postedAt:       string;
  isVoided:       boolean;
  referenceId:    string | null;
  referenceType:  string | null;
  paymentMethod:  string | null;
  student:        { id: string; fullName: string; admissionNumber: string } | null;
  term:           { name: string } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-KE", {
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(iso: string) {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function entryTypeLabel(type: string): { label: string; variant: "success" | "info" | "warn" | "default" } {
  switch (type) {
    case "PAYMENT":           return { label: "Payment",      variant: "success" };
    case "INVOICE":           return { label: "Invoice",      variant: "info"    };
    case "CREDIT_ADJUSTMENT": return { label: "Credit Adj.",  variant: "success" };
    case "DEBIT_ADJUSTMENT":  return { label: "Debit Adj.",   variant: "warn"    };
    case "OPENING_BALANCE":   return { label: "Opening Bal.", variant: "default" };
    default:                  return { label: type,           variant: "default" };
  }
}

// Is this entry a cash-in (positive for the school)?
function isCashIn(type: string) {
  return type === "PAYMENT" || type === "CREDIT_ADJUSTMENT";
}

const inputCls =
  "rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

const PAGE_SIZE = 50;

// ── Expandable row ─────────────────────────────────────────────────────────

function EntryRow({ e }: { e: LedgerEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { label, variant } = entryTypeLabel(e.entryType);
  const rb     = parseFloat(e.runningBalance);
  const cashIn = isCashIn(e.entryType);

  return (
    <>
      {/* Main row */}
      <tr
        className={`${premiumTrClass} ${e.isVoided ? "opacity-50" : ""} cursor-pointer hover:bg-teal/5 transition-colors`}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Expand chevron + date */}
        <td className={`${premiumTdClass} whitespace-nowrap`}>
          <div className="flex items-center gap-1.5">
            {expanded
              ? <ChevronDown  className="h-3.5 w-3.5 text-teal shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-slate/40 shrink-0" />
            }
            <div>
              <p className="text-xs text-ink dark:text-dark-text font-medium">{formatDate(e.postedAt)}</p>
              <p className="text-[10px] text-slate dark:text-dark-muted">{timeAgo(e.postedAt)}</p>
            </div>
          </div>
        </td>

        {/* Type */}
        <td className={premiumTdClass}>
          <Badge variant={variant}>{label}</Badge>
          {e.isVoided && <span className="ml-1 text-xs text-slate">(voided)</span>}
        </td>

        {/* From / To */}
        <td className={premiumTdClass}>
          {e.student ? (
            <div>
              <p className="text-sm font-medium text-ink dark:text-dark-text">
                {cashIn ? "From: " : "For: "}
                <span className="font-semibold">{e.student.fullName}</span>
              </p>
              <p className="text-xs font-mono text-slate dark:text-dark-muted">{e.student.admissionNumber}</p>
            </div>
          ) : (
            <span className="text-slate dark:text-dark-muted text-xs">—</span>
          )}
        </td>

        {/* Amount — green for cash-in, red for obligations */}
        <td className={`${premiumTdClass} text-right tabular-nums font-semibold ${cashIn ? "text-success" : "text-danger"}`}>
          <span className="text-xs mr-0.5">{cashIn ? "+" : "−"}</span>
          {formatKES(e.amount)}
        </td>

        {/* Running school total */}
        <td className={`${premiumTdClass} text-right tabular-nums font-bold ${rb >= 0 ? "text-success" : "text-danger"}`}>
          {rb < 0 ? "(" : ""}{formatKES(e.runningBalance)}{rb < 0 ? ")" : ""}
        </td>
      </tr>

      {/* Expanded detail panel */}
      {expanded && (
        <tr className="bg-paper/60 dark:bg-dark-border/10">
          <td colSpan={5} className="px-8 py-3 border-b border-line/60 dark:border-dark-border/60">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="font-medium text-slate dark:text-dark-muted uppercase tracking-wide mb-0.5">Description</p>
                <p className="text-ink dark:text-dark-text">{e.description || "—"}</p>
              </div>
              {e.term && (
                <div>
                  <p className="font-medium text-slate dark:text-dark-muted uppercase tracking-wide mb-0.5">Term</p>
                  <p className="text-ink dark:text-dark-text">{e.term.name}</p>
                </div>
              )}
              {e.referenceId && (
                <div>
                  <p className="font-medium text-slate dark:text-dark-muted uppercase tracking-wide mb-0.5">Reference</p>
                  <p className="font-mono text-ink dark:text-dark-text">{e.referenceId}</p>
                </div>
              )}
              {e.paymentMethod && (
                <div>
                  <p className="font-medium text-slate dark:text-dark-muted uppercase tracking-wide mb-0.5">Method</p>
                  <p className="text-ink dark:text-dark-text capitalize">{e.paymentMethod.replace(/_/g, " ")}</p>
                </div>
              )}
              <div>
                <p className="font-medium text-slate dark:text-dark-muted uppercase tracking-wide mb-0.5">Time</p>
                <p className="text-ink dark:text-dark-text">{formatDate(e.postedAt)} at {formatTime(e.postedAt)}</p>
              </div>
              {e.referenceType && e.referenceType !== "INVOICE" && e.referenceType !== "CARRY_FORWARD" && (
                <div>
                  <p className="font-medium text-slate dark:text-dark-muted uppercase tracking-wide mb-0.5">Type</p>
                  <p className="text-ink dark:text-dark-text capitalize">{e.referenceType.replace(/_/g, " ")}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LedgerPage() {
  const [entries,  setEntries]  = useState<LedgerEntry[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // Filters
  const [search,    setSearch]    = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showPanel, setShowPanel]  = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p: number, q: string, type: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page:     String(p),
        pageSize: String(PAGE_SIZE),
      });
      if (q.trim())   params.set("q",         q.trim());
      if (type)       params.set("entryType",  type);

      const res  = await fetch(`/api/finance/ledger?${params}`);
      if (!res.ok) throw new Error("Failed to load ledger");
      const data = await res.json();
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Could not load ledger. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(1, search, typeFilter);
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter]);

  useEffect(() => {
    load(page, search, typeFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="School Ledger"
        description="Complete financial history — all transactions treated as the school's single ledger."
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student name or admission no…"
            className={inputCls + " pl-9 w-full"}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Type filter toggle */}
        <button
          type="button"
          onClick={() => setShowPanel(v => !v)}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            showPanel || typeFilter
              ? "border-teal bg-teal/5 text-teal dark:border-teal/60"
              : "border-line bg-white text-slate hover:text-ink hover:border-teal/40 dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filter
          {typeFilter && <span className="ml-1 bg-teal text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">1</span>}
        </button>

        {/* Refresh */}
        <button
          type="button"
          onClick={() => load(page, search, typeFilter)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate hover:text-ink dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>

        {(search || typeFilter) && (
          <button
            type="button"
            onClick={() => { setSearch(""); setTypeFilter(""); }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate hover:text-danger transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Filter panel */}
      {showPanel && (
        <div className="mb-5 rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border p-4 flex flex-wrap items-end gap-3 shadow-sm">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate dark:text-dark-muted">Transaction type</label>
            <div className="flex flex-wrap gap-1.5">
              {["", "PAYMENT", "INVOICE", "CREDIT_ADJUSTMENT", "DEBIT_ADJUSTMENT", "OPENING_BALANCE"].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    typeFilter === t
                      ? "bg-teal text-white border-teal"
                      : "bg-white border-line text-slate hover:text-ink dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted"
                  }`}
                >
                  {t === "" ? "All" : t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : entries.length === 0 ? (
        <EmptyState
          message="No transactions recorded yet."
          icon={<DollarSign className="h-6 w-6" />}
        />
      ) : (
        <>
          <div className={premiumTableContainerClass}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className={premiumTheadClass}>
                  <tr>
                    <th className={premiumThClass}>Date</th>
                    <th className={premiumThClass}>Type</th>
                    <th className={premiumThClass}>From / For</th>
                    <th className={`${premiumThClass} text-right`}>Amount</th>
                    <th className={`${premiumThClass} text-right`}>School Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <EntryRow key={e.id} e={e} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-1">
              <p className="text-xs text-slate dark:text-dark-muted">
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()} entries
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line text-sm text-slate hover:text-ink disabled:opacity-40 dark:border-dark-border dark:text-dark-muted"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                <span className="px-3 py-1.5 text-sm text-ink dark:text-dark-text font-medium">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-line text-sm text-slate hover:text-ink disabled:opacity-40 dark:border-dark-border dark:text-dark-muted"
                >
                  Next
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
