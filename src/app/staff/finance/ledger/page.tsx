"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  DollarSign, ChevronDown, ChevronRight, Search, X,
  SlidersHorizontal, RefreshCw, Loader2,
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

interface Term {
  id:           string;
  name:         string;
  academicYear: number;
  isActive:     boolean;
  termName:     { name: string } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatKES(s: string | number) {
  const n = typeof s === "number" ? s : parseFloat(s as string);
  return isNaN(n) ? String(s) : `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
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

function isCashIn(type: string) {
  return type === "PAYMENT" || type === "CREDIT_ADJUSTMENT";
}

const inputCls =
  "rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

const PAGE_SIZE = 50;

const TYPE_OPTIONS = [
  { value: "",                  label: "All transactions" },
  { value: "PAYMENT",           label: "Payments" },
  { value: "INVOICE",           label: "Invoices" },
  { value: "CREDIT_ADJUSTMENT", label: "Credit Adj." },
  { value: "DEBIT_ADJUSTMENT",  label: "Debit Adj." },
  { value: "OPENING_BALANCE",   label: "Opening Bal." },
];

// ── Expandable row ─────────────────────────────────────────────────────────

function EntryRow({ e }: { e: LedgerEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { label, variant } = entryTypeLabel(e.entryType);
  const rb     = parseFloat(e.runningBalance);
  const cashIn = isCashIn(e.entryType);

  return (
    <>
      <tr
        className={`${premiumTrClass} ${e.isVoided ? "opacity-50" : ""} cursor-pointer hover:bg-teal/5 transition-colors`}
        onClick={() => setExpanded(v => !v)}
      >
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

        <td className={premiumTdClass}>
          <Badge variant={variant}>{label}</Badge>
          {e.isVoided && <span className="ml-1 text-xs text-slate">(voided)</span>}
        </td>

        <td className={premiumTdClass}>
          {e.student ? (
            <div>
              <p className="text-sm font-medium text-ink dark:text-dark-text">
                <span className="text-slate dark:text-dark-muted font-normal text-xs">{cashIn ? "From " : "For "}</span>
                {e.student.fullName}
              </p>
              <p className="text-xs font-mono text-slate dark:text-dark-muted">{e.student.admissionNumber}</p>
            </div>
          ) : (
            <span className="text-slate dark:text-dark-muted text-xs">—</span>
          )}
        </td>

        <td className={`${premiumTdClass} text-right tabular-nums font-semibold ${cashIn ? "text-success" : "text-danger"}`}>
          <span className="text-xs mr-0.5">{cashIn ? "+" : "−"}</span>
          {formatKES(e.amount)}
        </td>

        <td className={`${premiumTdClass} text-right tabular-nums font-bold ${rb >= 0 ? "text-success" : "text-danger"}`}>
          {rb < 0 ? "(" : ""}{formatKES(e.runningBalance)}{rb < 0 ? ")" : ""}
        </td>
      </tr>

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

// ── Term summary banner ────────────────────────────────────────────────────

function TermSummaryBanner({ entries, termName }: { entries: LedgerEntry[]; termName: string }) {
  let totalInvoiced = 0;
  let totalPaid     = 0;
  for (const e of entries) {
    if (e.isVoided) continue;
    const amt = Math.abs(parseFloat(e.amount));
    if (e.entryType === "INVOICE") totalInvoiced += amt;
    if (e.entryType === "PAYMENT") totalPaid     += amt;
  }
  const outstanding = totalInvoiced - totalPaid;

  return (
    <div className="mb-5 grid grid-cols-3 gap-3">
      {[
        { label: "Total invoiced",  value: totalInvoiced,  color: "text-ink dark:text-dark-text",   bg: "bg-white dark:bg-dark-surface" },
        { label: "Total collected", value: totalPaid,      color: "text-success",                   bg: "bg-white dark:bg-dark-surface" },
        { label: "Outstanding",     value: outstanding,    color: outstanding > 0 ? "text-danger" : "text-success", bg: outstanding > 0 ? "bg-danger-bg/30 dark:bg-danger/10" : "bg-white dark:bg-dark-surface" },
      ].map(c => (
        <div key={c.label} className={`rounded-xl border border-line dark:border-dark-border p-4 ${c.bg}`}>
          <p className={`text-lg font-bold tabular-nums leading-tight ${c.color}`}>{formatKES(c.value)}</p>
          <p className="text-xs text-slate dark:text-dark-muted mt-1">{c.label} · {termName}</p>
        </div>
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LedgerPage() {
  // All loaded entries (accumulate across pages)
  const [entries,    setEntries]    = useState<LedgerEntry[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [showPanel,  setShowPanel]  = useState(false);
  const [terms,      setTerms]      = useState<Term[]>([]);

  // Infinite scroll sentinel
  const sentinelRef  = useRef<HTMLDivElement | null>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevent double-firing the observer during a fetch
  const fetchingRef  = useRef(false);
  // Track current filters so the observer closure always has fresh values
  const filtersRef   = useRef({ search: "", typeFilter: "", termFilter: "" });

  const hasMore = entries.length < total;

  // Fetch terms once for the dropdown
  useEffect(() => {
    fetch("/api/finance/terms")
      .then(r => r.ok ? r.json() : { terms: [] })
      .then(d => setTerms(d.terms ?? []));
  }, []);

  // Core fetch — appends to list when p > 1, replaces when p === 1
  const fetchPage = useCallback(async (p: number, q: string, type: string, term: string) => {
    if (p === 1) {
      setInitialLoading(true);
      setEntries([]);
      setTotal(0);
      setPage(1);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (q.trim()) params.set("q",         q.trim());
      if (type)     params.set("entryType", type);
      if (term)     params.set("termId",    term);
      const res  = await fetch(`/api/finance/ledger?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const newEntries: LedgerEntry[] = data.entries ?? [];
      setEntries(prev => p === 1 ? newEntries : [...prev, ...newEntries]);
      setTotal(data.total ?? 0);
      if (p > 1) setPage(p);
    } catch {
      setError("Could not load ledger. Please try again.");
    } finally {
      setInitialLoading(false);
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    fetchPage(1, "", "", "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-load from page 1 when filters change (debounced)
  useEffect(() => {
    const prev = filtersRef.current;
    if (prev.search === search && prev.typeFilter === typeFilter && prev.termFilter === termFilter) return;
    filtersRef.current = { search, typeFilter, termFilter };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPage(1, search, typeFilter, termFilter);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, termFilter]);

  // IntersectionObserver: load next page when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !fetchingRef.current) {
          // Read current state via ref to avoid stale closure
          setEntries(currentEntries => {
            setTotal(currentTotal => {
              if (currentEntries.length < currentTotal) {
                fetchingRef.current = true;
                const nextPage = Math.floor(currentEntries.length / PAGE_SIZE) + 1;
                const f = filtersRef.current;
                fetchPage(nextPage, f.search, f.typeFilter, f.termFilter);
              }
              return currentTotal;
            });
            return currentEntries;
          });
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFilters = [search, typeFilter, termFilter].filter(Boolean).length;
  const selectedTerm  = terms.find(t => t.id === termFilter);
  const termLabel     = selectedTerm ? (selectedTerm.termName?.name ?? selectedTerm.name) : "";

  return (
    <div>
      <PageHeader
        title="School Ledger"
        description="Complete financial history — all transactions as the school's single ledger. Click any row to expand."
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {/* ── Filter bar ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by student name or admission no…"
            className={inputCls + " pl-9 w-full"}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Term filter */}
        <select
          value={termFilter}
          onChange={e => setTermFilter(e.target.value)}
          className={inputCls + " max-w-[180px]"}
        >
          <option value="">All terms</option>
          {terms.map(t => (
            <option key={t.id} value={t.id}>
              {t.termName?.name ?? t.name} {t.academicYear}{t.isActive ? " ✓" : ""}
            </option>
          ))}
        </select>

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
          {typeFilter ? TYPE_OPTIONS.find(o => o.value === typeFilter)?.label ?? "Type" : "Type"}
          {typeFilter && <span className="ml-1 bg-teal text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">1</span>}
        </button>

        {/* Refresh */}
        <button
          type="button"
          onClick={() => fetchPage(1, search, typeFilter, termFilter)}
          disabled={initialLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate hover:text-ink dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${initialLoading ? "animate-spin" : ""}`} />
        </button>

        {activeFilters > 0 && (
          <button
            type="button"
            onClick={() => { setSearch(""); setTypeFilter(""); setTermFilter(""); }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate hover:text-danger transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear ({activeFilters})
          </button>
        )}
      </div>

      {/* ── Type filter panel ── */}
      {showPanel && (
        <div className="mb-5 rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border p-4 shadow-sm">
          <p className="text-xs font-medium text-slate dark:text-dark-muted mb-2">Transaction type</p>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTypeFilter(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  typeFilter === opt.value
                    ? "bg-teal text-white border-teal"
                    : "bg-white border-line text-slate hover:text-ink dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Term summary ── */}
      {!initialLoading && termFilter && entries.length > 0 && (
        <TermSummaryBanner entries={entries} termName={termLabel} />
      )}

      {/* ── Entry count ── */}
      {!initialLoading && total > 0 && (
        <p className="text-xs text-slate dark:text-dark-muted mb-3">
          {entries.length < total
            ? `Showing ${entries.length.toLocaleString()} of ${total.toLocaleString()} entries`
            : `All ${total.toLocaleString()} entries`}
          {termFilter && termLabel && <span> in <span className="font-medium text-ink dark:text-dark-text">{termLabel}</span></span>}
          {typeFilter && <span> · {TYPE_OPTIONS.find(o => o.value === typeFilter)?.label}</span>}
          {search && <span> matching &ldquo;{search}&rdquo;</span>}
        </p>
      )}

      {/* ── Table ── */}
      {initialLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : entries.length === 0 ? (
        <EmptyState
          message={activeFilters > 0 ? "No entries match the current filter." : "No transactions recorded yet."}
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
                  {entries.map(e => <EntryRow key={e.id} e={e} />)}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Infinite scroll sentinel + loading indicator ── */}
          <div ref={sentinelRef} className="h-px" />

          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate dark:text-dark-muted">
              <Loader2 className="h-4 w-4 animate-spin text-teal" />
              Loading more…
            </div>
          )}

          {!hasMore && entries.length > 0 && !initialLoading && (
            <p className="text-center text-xs text-slate dark:text-dark-muted py-6">
              All {total.toLocaleString()} entries loaded
            </p>
          )}
        </>
      )}
    </div>
  );
}
