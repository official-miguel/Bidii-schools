"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  GitMerge, CheckCircle2, AlertCircle,
  RefreshCw, Loader2, User, Search, X,
} from "lucide-react";
import {
  PageHeader, Badge, EmptyState, Spinner,
  secondaryButtonClass, ErrorBanner, SuccessBanner,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface QueueItem {
  id:                 string;
  mpesaTransactionId: string;
  rawAccountNumber:   string;
  amount:             string;
  paidAt:             string;
  status:             string;
  suggestedStudent: {
    id:              string;
    fullName:        string;
    admissionNumber: string;
  } | null;
  suggestedConfidence: number | null;
}

interface StudentResult {
  id:              string;
  fullName:        string;
  admissionNumber: string;
  schoolClass:     { name: string };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function ConfidencePill({ score }: { score: number }) {
  const pct     = Math.round(score * 100);
  const variant = pct >= 80 ? "success" : pct >= 50 ? "warn" : "danger";
  return <Badge variant={variant}>{pct}% match</Badge>;
}

// ── Per-item student search + confirm ──────────────────────────────────────

function ReconcileItem({
  item,
  onResolved,
  onError,
}: {
  item:       QueueItem;
  onResolved: (id: string, txId: string) => void;
  onError:    (msg: string) => void;
}) {
  // Start with the suggested student pre-selected (if any)
  const [selected,  setSelected]  = useState<StudentResult | null>(
    item.suggestedStudent
      ? { id: item.suggestedStudent.id, fullName: item.suggestedStudent.fullName,
          admissionNumber: item.suggestedStudent.admissionNumber, schoolClass: { name: "" } }
      : null
  );
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<StudentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open,      setOpen]      = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [confirming,setConfirming]= useState(false);
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const listRef                   = useRef<HTMLUListElement>(null);

  // Search whenever query changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/finance/students?search=${encodeURIComponent(query.trim())}&pageSize=8`);
        const data = res.ok ? await res.json() : { students: [] };
        setResults(data.students ?? []);
        setOpen(true);
        setActiveIdx(-1);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      (listRef.current.children[activeIdx] as HTMLElement | undefined)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  function pick(s: StudentResult) {
    setSelected(s);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pick(results[activeIdx]); }
    else if (e.key === "Escape") setOpen(false);
  }

  async function confirm() {
    if (!selected) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/finance/reconciliation/${item.id}/resolve`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ studentId: selected.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error ?? "Failed to reconcile payment.");
      } else {
        onResolved(item.id, item.mpesaTransactionId);
      }
    } catch {
      onError("An unexpected error occurred.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="bg-white border border-line rounded-xl p-5 dark:bg-dark-surface dark:border-dark-border">
      {/* Transaction details */}
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono text-sm font-semibold text-ink dark:text-dark-text">
          {item.mpesaTransactionId}
        </span>
        <Badge variant="warn">Unmatched</Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm mb-4">
        <div>
          <p className="text-xs text-slate dark:text-dark-muted">Amount</p>
          <p className="font-semibold text-success">{formatKES(item.amount)}</p>
        </div>
        <div>
          <p className="text-xs text-slate dark:text-dark-muted">Account reference</p>
          <p className="font-mono text-ink dark:text-dark-text">{item.rawAccountNumber}</p>
        </div>
        <div>
          <p className="text-xs text-slate dark:text-dark-muted">Paid at</p>
          <p className="text-ink dark:text-dark-text">{formatDate(item.paidAt)}</p>
        </div>
      </div>

      {/* Match section */}
      <div className="border-t border-line dark:border-dark-border pt-4">
        <p className="text-xs font-medium text-slate dark:text-dark-muted mb-2">
          Match to student
        </p>

        {/* Selected student chip */}
        {selected ? (
          <div className="flex items-center gap-3 rounded-lg border border-teal/30 bg-teal/5 px-3 py-2.5 mb-3">
            <div className="h-8 w-8 rounded-full bg-teal flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink dark:text-dark-text leading-tight">
                {selected.fullName}
              </p>
              <p className="text-xs font-mono text-slate dark:text-dark-muted">
                {selected.admissionNumber}
                {selected.schoolClass.name ? ` · ${selected.schoolClass.name}` : ""}
              </p>
            </div>
            {item.suggestedStudent && item.suggestedStudent.id === selected.id && item.suggestedConfidence !== null && (
              <ConfidencePill score={item.suggestedConfidence} />
            )}
            <button
              type="button"
              onClick={clearSelection}
              className="text-slate hover:text-danger transition-colors ml-1"
              aria-label="Change student"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* Search input */
          <div className="relative mb-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate dark:text-dark-muted"
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
              placeholder="Type student name or admission number…"
              className="w-full rounded-lg border border-line bg-paper pl-9 pr-9 py-2 text-sm text-ink
                         placeholder:text-slate outline-none transition-colors
                         focus:border-teal/50 focus:ring-2 focus:ring-teal/20
                         dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {searching
                ? <Loader2 className="h-3.5 w-3.5 animate-spin text-teal" />
                : query
                  ? <button type="button" tabIndex={-1} onClick={() => setQuery("")}>
                      <X className="h-3.5 w-3.5 text-slate hover:text-ink" />
                    </button>
                  : null}
            </span>

            {/* Dropdown */}
            {open && (
              <ul
                ref={listRef}
                role="listbox"
                className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-line bg-white shadow-xl overflow-auto dark:bg-dark-surface dark:border-dark-border"
                style={{ maxHeight: "240px" }}
              >
                {results.length === 0 ? (
                  <li className="px-4 py-3 text-xs text-slate dark:text-dark-muted text-center">
                    No students found
                  </li>
                ) : results.map((s, idx) => (
                  <li
                    key={s.id}
                    role="option"
                    aria-selected={idx === activeIdx}
                    onMouseDown={() => pick(s)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors
                      ${idx < results.length - 1 ? "border-b border-line/60 dark:border-dark-border/60" : ""}
                      ${idx === activeIdx ? "bg-teal/5" : "hover:bg-paper dark:hover:bg-dark-border/40"}`}
                  >
                    <div className="h-7 w-7 rounded-full bg-teal flex items-center justify-center shrink-0 text-[10px] font-bold text-white">
                      {s.fullName.split(" ").map(n => n[0]).slice(0,2).join("").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink dark:text-dark-text truncate">{s.fullName}</p>
                      <p className="text-[10px] font-mono text-slate dark:text-dark-muted">
                        {s.admissionNumber} · {s.schoolClass.name}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Confirm button */}
        <button
          type="button"
          onClick={confirm}
          disabled={!selected || confirming}
          className="inline-flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white
                     hover:bg-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {confirming
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <CheckCircle2 className="h-4 w-4" />}
          {confirming ? "Confirming…" : "Confirm match"}
        </button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ReconciliationPage() {
  const [items,   setItems]   = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/reconciliation");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError("Could not load reconciliation queue. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleResolved(id: string, txId: string) {
    setItems(prev => prev.filter(i => i.id !== id));
    setSuccess(`Payment ${txId} reconciled successfully.`);
  }

  return (
    <div>
      <PageHeader
        title="M-Pesa Reconciliation"
        description="Match unrecognised M-Pesa C2B payments to students before crediting their accounts."
        action={
          <button onClick={load} className={secondaryButtonClass} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {error   && <div className="mb-4"><ErrorBanner   message={error}   onDismiss={() => setError(null)}   /></div>}
      {success && <div className="mb-4"><SuccessBanner message={success} onDismiss={() => setSuccess(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          message="No pending reconciliation items — all M-Pesa payments have been matched."
          icon={<GitMerge className="h-6 w-6" />}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-warn-bg border border-warn/20 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-warn shrink-0" aria-hidden="true" />
            <p className="text-sm text-warn font-medium">
              {items.length} unmatched payment{items.length !== 1 ? "s" : ""} require manual reconciliation
            </p>
          </div>

          {items.map(item => (
            <ReconcileItem
              key={item.id}
              item={item}
              onResolved={handleResolved}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}
