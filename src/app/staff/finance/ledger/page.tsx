"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  DollarSign, ChevronDown, ChevronRight, Search, X,
  SlidersHorizontal, RefreshCw, Loader2, Users,
} from "lucide-react";
import {
  PageHeader, Badge, EmptyState, Spinner, ErrorBanner,
  premiumTheadClass, premiumThClass, premiumTdClass, premiumTrClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface LedgerEntry {
  id:            string;
  entryType:     string;
  amount:        string;
  description:   string;
  postedAt:      string;
  isVoided:      boolean;
  referenceId:   string | null;
  referenceType: string | null;
  paymentMethod: string | null;
  student:       { id: string; fullName: string; admissionNumber: string } | null;
  term:          { id: string; name: string } | null;
}

interface Term {
  id:           string;
  name:         string;
  academicYear: number;
  isActive:     boolean;
  termName:     { name: string } | null;
}

/**
 * Server-computed per-term batch statistics returned by the ledger API.
 * outstanding = live SUM(abs(currentBalance)) for debtors in this term.
 * invoiced    = frozen SUM(Invoice.totalAmount) at the time invoices were issued.
 * count       = number of students with an invoice for this term.
 * postedAt    = earliest invoice generatedAt (the batch creation timestamp).
 */
interface TermBatchStat {
  outstanding: string;
  invoiced:    string;
  count:       number;
  postedAt:    string;
  termName:    string;
}

// A display row is either a single ledger entry or a batch invoice summary.
interface SingleRow {
  kind:  "single";
  entry: LedgerEntry;
}
interface BatchRow {
  kind:        "batch";
  termId:      string;
  termName:    string;
  outstanding: number; // live, server-computed
  invoiced:    number; // frozen invoice total
  count:       number; // total students in batch (not just current page)
  postedAt:    string;
  entries:     LedgerEntry[]; // individual entries loaded so far (for expansion)
}
type DisplayRow = SingleRow | BatchRow;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatKES(s: string | number) {
  const n = typeof s === "number" ? s : parseFloat(s as string);
  return isNaN(n) ? String(s) : `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
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

/**
 * Groups ledger entries into display rows using server-side termBatchStats.
 *
 * Strategy:
 *  - Any INVOICE entry whose termId exists in termBatchStats (and that term
 *    has count > 1) is a batch member. All such entries for the same termId
 *    are collected into one BatchRow keyed by termId.
 *  - The batch row's outstanding/invoiced/count/postedAt all come from the
 *    server — NOT from the entries themselves. This means the batch row is
 *    correct even when only a partial page of its entries has been loaded.
 *  - Everything else (non-invoice entries, carry-forward entries, single
 *    invoices) renders as a SingleRow.
 *  - Batch rows appear at the position of their first-seen member entry so
 *    the chronological order of the ledger is preserved.
 */
function groupEntries(
  entries:        LedgerEntry[],
  termBatchStats: Record<string, TermBatchStat>,
): DisplayRow[] {
  // Collect batch members by termId first (all pages merged)
  const batchEntriesByTerm = new Map<string, LedgerEntry[]>();

  for (const e of entries) {
    const tId = e.term?.id;
    if (
      e.entryType === "INVOICE" &&
      tId &&
      e.referenceType !== "CARRY_FORWARD" &&
      termBatchStats[tId] &&
      termBatchStats[tId].count > 1
    ) {
      const list = batchEntriesByTerm.get(tId) ?? [];
      list.push(e);
      batchEntriesByTerm.set(tId, list);
    }
  }

  const rows: DisplayRow[]        = [];
  const renderedBatches           = new Set<string>(); // termIds already emitted as BatchRow

  for (const e of entries) {
    const tId = e.term?.id;

    // ── Batch invoice member ──────────────────────────────────────────────
    if (
      e.entryType === "INVOICE" &&
      tId &&
      e.referenceType !== "CARRY_FORWARD" &&
      termBatchStats[tId] &&
      termBatchStats[tId].count > 1
    ) {
      if (!renderedBatches.has(tId)) {
        // First time we see this termId: emit the BatchRow (server stats drive it)
        const stat = termBatchStats[tId];
        rows.push({
          kind:        "batch",
          termId:      tId,
          termName:    stat.termName,
          outstanding: parseFloat(stat.outstanding),
          invoiced:    parseFloat(stat.invoiced),
          count:       stat.count,
          postedAt:    stat.postedAt,
          entries:     batchEntriesByTerm.get(tId) ?? [],
        });
        renderedBatches.add(tId);
      }
      // Subsequent entries for the same batch are already in entries[] above —
      // don't emit them as SingleRows.
      continue;
    }

    // ── Everything else ───────────────────────────────────────────────────
    rows.push({ kind: "single", entry: e });
  }

  return rows;
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

// ── Single entry row ───────────────────────────────────────────────────────

function SingleEntryRow({ e }: { e: LedgerEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { label, variant } = entryTypeLabel(e.entryType);
  const cashIn       = isCashIn(e.entryType);
  const isOpeningBal = e.entryType === "OPENING_BALANCE" || e.referenceType === "CARRY_FORWARD";

  return (
    <>
      <tr
        className={`${premiumTrClass} ${e.isVoided ? "opacity-50" : ""} cursor-pointer hover:bg-teal/5 transition-colors ${isOpeningBal ? "bg-slate-50/50 dark:bg-dark-border/20" : ""}`}
        onClick={() => setExpanded(v => !v)}
      >
        <td className={`${premiumTdClass} whitespace-nowrap`}>
          <div className="flex items-center gap-1.5">
            {expanded
              ? <ChevronDown  className="h-3.5 w-3.5 text-teal shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-slate/40 shrink-0" />}
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
            <span className="text-slate dark:text-dark-muted text-xs">{e.description}</span>
          )}
        </td>
        <td className={`${premiumTdClass} text-right tabular-nums font-semibold ${cashIn ? "text-success" : "text-danger"}`}>
          <span className="text-xs mr-0.5">{cashIn ? "+" : "−"}</span>
          {formatKES(e.amount)}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-paper/60 dark:bg-dark-border/10">
          <td colSpan={4} className="px-8 py-3 border-b border-line/60 dark:border-dark-border/60">
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
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Batch invoice row ──────────────────────────────────────────────────────

function BatchInvoiceRow({ row }: { row: BatchRow }) {
  const [expanded, setExpanded] = useState(false);

  // When all students have paid, outstanding is 0 — show green instead of red.
  const allPaid       = row.outstanding === 0;
  // How much has been collected: invoiced total minus what's still owed.
  const collected     = Math.max(0, row.invoiced - row.outstanding);
  const collectedPct  = row.invoiced > 0 ? Math.round((collected / row.invoiced) * 100) : 0;

  return (
    <>
      {/* Summary row */}
      <tr
        className={`${premiumTrClass} cursor-pointer hover:bg-teal/8 transition-colors border-l-2 border-l-teal/40`}
        onClick={() => setExpanded(v => !v)}
      >
        <td className={`${premiumTdClass} whitespace-nowrap`}>
          <div className="flex items-center gap-1.5">
            {expanded
              ? <ChevronDown  className="h-3.5 w-3.5 text-teal shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-teal/60 shrink-0" />}
            <div>
              <p className="text-xs text-ink dark:text-dark-text font-medium">{formatDate(row.postedAt)}</p>
              <p className="text-[10px] text-slate dark:text-dark-muted">{timeAgo(row.postedAt)}</p>
            </div>
          </div>
        </td>

        <td className={premiumTdClass}>
          <Badge variant="info">Batch Invoice</Badge>
        </td>

        <td className={premiumTdClass}>
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-teal shrink-0" />
            <div>
              <p className="text-sm font-semibold text-ink dark:text-dark-text">
                {row.termName} — {row.count} students
              </p>
              <p className="text-xs text-slate dark:text-dark-muted">
                {allPaid
                  ? "Fully collected · click to expand"
                  : `${collectedPct}% collected · click to expand`}
              </p>
            </div>
          </div>
        </td>

        {/* Amount column — live outstanding (server-computed) */}
        <td className={`${premiumTdClass} text-right`}>
          <p className={`tabular-nums font-bold ${allPaid ? "text-success" : "text-danger"}`}>
            {allPaid ? "" : "− "}{formatKES(row.outstanding)}
          </p>
          <p className="text-[10px] text-slate dark:text-dark-muted tabular-nums">
            of {formatKES(row.invoiced)} invoiced
          </p>
        </td>
      </tr>

      {/* Expanded: individual student invoice rows loaded in this session */}
      {expanded && (
        <>
          {row.entries.length === 0 ? (
            <tr className="bg-teal/5">
              <td colSpan={4} className="px-10 py-3 text-xs text-slate dark:text-dark-muted italic border-b border-line/40 dark:border-dark-border/40">
                Scroll up to load individual invoices for this batch.
              </td>
            </tr>
          ) : (
            row.entries.map(e => (
              <tr key={e.id} className="bg-teal/5 border-b border-line/40 dark:border-dark-border/40">
                <td className={`${premiumTdClass} pl-10 text-xs text-slate dark:text-dark-muted whitespace-nowrap`}>
                  {formatDate(e.postedAt)}
                </td>
                <td className={premiumTdClass}>
                  <Badge variant="info">Invoice</Badge>
                </td>
                <td className={premiumTdClass}>
                  <p className="text-sm font-medium text-ink dark:text-dark-text">{e.student?.fullName ?? "—"}</p>
                  <p className="text-xs font-mono text-slate dark:text-dark-muted">{e.student?.admissionNumber ?? ""}</p>
                  {e.referenceId && (
                    <p className="text-[10px] text-slate dark:text-dark-muted font-mono">{e.referenceId}</p>
                  )}
                </td>
                {/* Individual entries show the frozen invoice amount — not live balance */}
                <td className={`${premiumTdClass} text-right tabular-nums text-danger`}>
                  − {formatKES(e.amount)}
                </td>
              </tr>
            ))
          )}

          {row.entries.length > 0 && row.entries.length < row.count && (
            <tr className="bg-teal/5">
              <td colSpan={4} className="px-10 py-2 text-[11px] text-slate dark:text-dark-muted italic border-b border-line/40 dark:border-dark-border/40">
                Showing {row.entries.length} of {row.count} · scroll up to load more
              </td>
            </tr>
          )}
        </>
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LedgerPage() {
  const [entries,         setEntries]         = useState<LedgerEntry[]>([]);
  const [total,           setTotal]           = useState(0);
  const [initialLoading,  setInitialLoading]  = useState(true);
  const [loadingMore,     setLoadingMore]      = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [search,          setSearch]          = useState("");
  const [typeFilter,      setTypeFilter]      = useState("");
  const [termFilter,      setTermFilter]      = useState("");
  const [showPanel,       setShowPanel]       = useState(false);
  const [terms,           setTerms]           = useState<Term[]>([]);
  const [termBatchStats,  setTermBatchStats]  = useState<Record<string, TermBatchStat>>({});

  const tableRef    = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchingRef = useRef(false);
  const filtersRef  = useRef({ search: "", typeFilter: "", termFilter: "" });

  const hasMore = entries.length < total;

  // Load terms once
  useEffect(() => {
    fetch("/api/finance/terms")
      .then(r => r.ok ? r.json() : { terms: [] })
      .then(d => setTerms(d.terms ?? []));
  }, []);

  const fetchPage = useCallback(async (
    p: number, q: string, type: string, term: string, scrollToBottom = false,
  ) => {
    if (p === 1) { setInitialLoading(true); setEntries([]); setTotal(0); }
    else           setLoadingMore(true);
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
      if (data.termBatchStats) setTermBatchStats(data.termBatchStats);
    } catch {
      setError("Could not load ledger. Please try again.");
    } finally {
      setInitialLoading(false);
      setLoadingMore(false);
      fetchingRef.current = false;
      if (scrollToBottom) {
        requestAnimationFrame(() => {
          const el = tableRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchPage(1, "", "", "", true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter changes — debounced
  useEffect(() => {
    const prev = filtersRef.current;
    if (prev.search === search && prev.typeFilter === typeFilter && prev.termFilter === termFilter) return;
    filtersRef.current = { search, typeFilter, termFilter };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPage(1, search, typeFilter, termFilter, true);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, termFilter]);

  // Infinite scroll — loads older entries when sentinel scrolls into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !fetchingRef.current) {
        setEntries(cur => {
          setTotal(tot => {
            if (cur.length < tot) {
              fetchingRef.current = true;
              const nextPage = Math.floor(cur.length / PAGE_SIZE) + 1;
              const f = filtersRef.current;
              fetchPage(nextPage, f.search, f.typeFilter, f.termFilter, false);
            }
            return tot;
          });
          return cur;
        });
      }
    }, { root: tableRef.current, rootMargin: "200px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoading]);

  const displayRows   = groupEntries(entries, termBatchStats);
  const activeFilters = [search, typeFilter, termFilter].filter(Boolean).length;
  const selectedTerm  = terms.find(t => t.id === termFilter);
  const termLabel     = selectedTerm ? (selectedTerm.termName?.name ?? selectedTerm.name) : "";

  return (
    <div className="flex flex-col h-full">
      {/* ── Sticky header + filters ── */}
      <div className="shrink-0">
        <PageHeader
          title="School Ledger"
          description="Complete financial history — batch invoices are grouped by term. Click any row to expand."
        />

        {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" />
            <input
              type="text" value={search}
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

          <select value={termFilter} onChange={e => setTermFilter(e.target.value)} className={inputCls + " max-w-[180px]"}>
            <option value="">All terms</option>
            {terms.map(t => (
              <option key={t.id} value={t.id}>
                {t.termName?.name ?? t.name} {t.academicYear}{t.isActive ? " ✓" : ""}
              </option>
            ))}
          </select>

          <button
            type="button" onClick={() => setShowPanel(v => !v)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              showPanel || typeFilter
                ? "border-teal bg-teal/5 text-teal"
                : "border-line bg-white text-slate hover:text-ink dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {typeFilter ? TYPE_OPTIONS.find(o => o.value === typeFilter)?.label ?? "Type" : "Type"}
            {typeFilter && (
              <span className="ml-1 bg-teal text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">1</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => fetchPage(1, search, typeFilter, termFilter, true)}
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
              <X className="h-3.5 w-3.5" />Clear ({activeFilters})
            </button>
          )}
        </div>

        {showPanel && (
          <div className="mb-3 rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border p-4 shadow-sm">
            <p className="text-xs font-medium text-slate dark:text-dark-muted mb-2">Transaction type</p>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value} type="button"
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

        {!initialLoading && total > 0 && (
          <p className="text-xs text-slate dark:text-dark-muted mb-2">
            {entries.length < total
              ? `${entries.length.toLocaleString()} of ${total.toLocaleString()} loaded`
              : `All ${total.toLocaleString()} entries`}
            {termLabel && (
              <span> · <span className="font-medium text-ink dark:text-dark-text">{termLabel}</span></span>
            )}
          </p>
        )}
      </div>



      {/* ── Scrollable ledger table ── */}
      {initialLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : entries.length === 0 ? (
        <EmptyState
          message={activeFilters > 0 ? "No entries match the current filter." : "No transactions recorded yet."}
          icon={<DollarSign className="h-6 w-6" />}
        />
      ) : (
        <div
          ref={tableRef}
          className="flex-1 overflow-y-auto rounded-xl border border-line dark:border-dark-border bg-white dark:bg-dark-surface"
          style={{ maxHeight: "calc(100vh - 280px)", minHeight: "400px" }}
        >
          {/* Sentinel at top — triggers loading older entries */}
          <div ref={sentinelRef} className="h-px" />

          {loadingMore && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate dark:text-dark-muted">
              <Loader2 className="h-4 w-4 animate-spin text-teal" />Loading older entries…
            </div>
          )}

          {!hasMore && entries.length > 0 && (
            <p className="text-center text-xs text-slate dark:text-dark-muted py-3 border-b border-line/40 dark:border-dark-border/40">
              Beginning of ledger
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className={premiumTheadClass + " sticky top-0 z-10"}>
                <tr>
                  <th className={premiumThClass}>Date</th>
                  <th className={premiumThClass}>Type</th>
                  <th className={premiumThClass}>Details</th>
                  <th className={`${premiumThClass} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {/* Entries are newest-first from API; reverse so oldest renders at top */}
                {[...displayRows].reverse().map((row, idx) =>
                  row.kind === "batch"
                    ? <BatchInvoiceRow key={`batch-${row.termId}`} row={row} />
                    : <SingleEntryRow  key={row.entry.id}          e={row.entry} />
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
