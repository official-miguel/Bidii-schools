"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import {
  PageHeader, EmptyState, Spinner, ErrorBanner,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

interface Debtor {
  studentId:       string;
  fullName:        string;
  admissionNumber: string;
  className:       string;
  balance:         string;
  daysOverdue:     number;
  bucket:          string;
}

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function bucketClass(b: string) {
  if (b === "0-30" || b === "31-60") return "bg-warn-bg text-warn border-warn/20";
  return "bg-danger-bg text-danger border-danger/20";
}

const inputCls =
  "rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

export default function DebtorsPage() {
  const [debtors,   setDebtors]   = useState<Debtor[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  // Filter state
  const [search,    setSearch]    = useState("");
  const [operator,  setOperator]  = useState<"above" | "below">("above");
  const [amount,    setAmount]    = useState("");
  const [showPanel, setShowPanel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/finance/reports/aging");
      if (!res.ok) throw new Error("Failed to load debtors");
      const data = await res.json();
      setDebtors(data.rows ?? []);
    } catch {
      setError("Could not load debtors. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Apply filters client-side
  const amountVal = parseFloat(amount);
  const hasAmountFilter = !isNaN(amountVal) && amountVal > 0;

  const filtered = debtors.filter(d => {
    // Name / admission / class search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matches =
        d.fullName.toLowerCase().includes(q) ||
        d.admissionNumber.toLowerCase().includes(q) ||
        (d.className ?? "").toLowerCase().includes(q);
      if (!matches) return false;
    }
    // Balance filter — balance is stored as a negative number, abs() is what the student owes
    if (hasAmountFilter) {
      const owed = Math.abs(parseFloat(d.balance));
      if (operator === "above" && owed <= amountVal) return false;
      if (operator === "below" && owed >= amountVal) return false;
    }
    return true;
  });

  const activeFilterCount = (search.trim() ? 1 : 0) + (hasAmountFilter ? 1 : 0);

  function clearFilters() {
    setSearch("");
    setAmount("");
    setOperator("above");
  }

  return (
    <div>
      <PageHeader
        title="Debtors"
        description="Students with outstanding fee balances."
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {!loading && debtors.length > 0 && (
        <>
          {/* ── Filter bar ── */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {/* Name / class search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate dark:text-dark-muted pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, admission no., class…"
                className={inputCls + " pl-9 w-full"}
              />
            </div>

            {/* Balance filter toggle */}
            <button
              type="button"
              onClick={() => setShowPanel(v => !v)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                showPanel || hasAmountFilter
                  ? "border-teal bg-teal/5 text-teal dark:border-teal/60"
                  : "border-line bg-white text-slate hover:text-ink hover:border-teal/40 dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted"
              }`}
              aria-label="Balance filter"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Balance filter
              {hasAmountFilter && (
                <span className="ml-1 bg-teal text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">1</span>
              )}
            </button>

            {/* Clear all filters */}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate hover:text-danger transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Clear ({activeFilterCount})
              </button>
            )}
          </div>

          {/* ── Balance filter panel ── */}
          {showPanel && (
            <div className="mb-5 rounded-xl border border-line bg-white dark:bg-dark-surface dark:border-dark-border p-4 flex flex-wrap items-end gap-3 shadow-sm">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate dark:text-dark-muted">Condition</label>
                <div className="flex rounded-lg border border-line dark:border-dark-border overflow-hidden">
                  {(["above", "below"] as const).map(op => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setOperator(op)}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors capitalize ${
                        operator === op
                          ? "bg-teal text-white"
                          : "bg-white text-slate hover:bg-paper dark:bg-dark-surface dark:text-dark-muted dark:hover:bg-dark-border/30"
                      }`}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                <label className="text-xs font-medium text-slate dark:text-dark-muted">
                  Amount (KES)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className={inputCls + " w-full"}
                />
              </div>

              {hasAmountFilter && (
                <div className="flex flex-col justify-end">
                  <p className="text-xs text-slate dark:text-dark-muted pb-2">
                    Showing students owing{" "}
                    <span className="font-semibold text-ink dark:text-dark-text">
                      {operator} KES {Number(amount).toLocaleString("en-KE")}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Summary banner ── */}
          <div className="flex items-center gap-2 rounded-lg bg-warn-bg border border-warn/20 px-4 py-3 mb-5">
            <AlertTriangle className="h-4 w-4 text-warn shrink-0" aria-hidden="true" />
            <p className="text-sm text-warn font-medium">
              {filtered.length === debtors.length
                ? `${debtors.length} student${debtors.length !== 1 ? "s" : ""} with outstanding balances`
                : `${filtered.length} of ${debtors.length} student${debtors.length !== 1 ? "s" : ""} match your filter`}
            </p>
          </div>
        </>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : debtors.length === 0 ? (
        <EmptyState
          message="No outstanding debtors — all accounts are settled."
          icon={<AlertTriangle className="h-6 w-6" />}
        />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-line bg-paper p-8 text-center dark:border-dark-border dark:bg-dark-surface">
          <p className="text-sm text-slate dark:text-dark-muted">No debtors match the current filter.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-sm font-medium text-teal hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[580px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Student</th>
                  <th className={premiumThClass}>Class</th>
                  <th className={`${premiumThClass} text-right`}>Balance owed</th>
                  <th className={`${premiumThClass} text-right`}>Days overdue</th>
                  <th className={premiumThClass}>Bucket</th>
                  <th className={premiumThClass} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.studentId} className={premiumTrClass}>
                    <td className={premiumTdClass}>
                      <p className="font-medium text-ink dark:text-dark-text">{d.fullName}</p>
                      <p className="text-xs text-slate font-mono mt-0.5 dark:text-dark-muted">{d.admissionNumber}</p>
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>
                      {d.className ?? "—"}
                    </td>
                    <td className={`${premiumTdClass} text-right tabular-nums font-semibold text-danger`}>
                      {formatKES(d.balance)}
                    </td>
                    <td className={`${premiumTdClass} text-right tabular-nums text-slate dark:text-dark-muted`}>
                      {d.daysOverdue}d
                    </td>
                    <td className={premiumTdClass}>
                      <span className={`text-xs font-semibold rounded-full border px-2.5 py-1 ${bucketClass(d.bucket)}`}>
                        {d.bucket}
                      </span>
                    </td>
                    <td className={premiumTdClass}>
                      <Link
                        href={`/staff/finance/students/${d.studentId}`}
                        className="inline-flex items-center gap-1 text-sm text-teal font-medium hover:underline"
                      >
                        View ledger
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
