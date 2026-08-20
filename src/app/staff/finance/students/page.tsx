"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  Clock,
  ChevronRight,
  Users,
} from "lucide-react";
import {
  PageHeader,
  Badge,
  EmptyState,
  primaryButtonClass,
  premiumTableContainerClass,
  premiumTheadClass,
  premiumThClass,
  premiumTdClass,
  premiumTrClass,
  ErrorBanner,
} from "@/components/ui";

interface FinanceAccount {
  currentBalance: string;
  totalInvoiced: string;
  totalPaid: string;
  financeSetupCompletedAt: string | null;
  financePending: boolean;
}

interface Student {
  id: string;
  fullName: string;
  admissionNumber: string;
  schoolClass: { name: string; form: number; stream: string | null };
  financeAccount: FinanceAccount | { financePending: true } | null;
}

function formatKES(s: string) {
  const n = parseFloat(s);
  if (isNaN(n)) return "KES 0.00";
  return `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function BalanceCell({
  account,
}: {
  account: FinanceAccount | { financePending: true } | null;
}) {
  if (
    !account ||
    ("financePending" in account &&
      account.financePending &&
      !("currentBalance" in account))
  ) {
    return (
      <span className="text-sm text-slate dark:text-dark-muted">—</span>
    );
  }
  const acc = account as FinanceAccount;
  const n = parseFloat(acc.currentBalance);
  if (isNaN(n) || n === 0)
    return (
      <span className="text-sm text-slate tabular-nums dark:text-dark-muted">
        KES 0.00
      </span>
    );
  if (n < 0)
    return (
      <span className="text-sm text-danger font-semibold tabular-nums">
        {formatKES(acc.currentBalance)} owed
      </span>
    );
  return (
    <span className="text-sm text-success font-semibold tabular-nums">
      {formatKES(acc.currentBalance)} credit
    </span>
  );
}

export default function StudentsFinancePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [balanceOp, setBalanceOp] = useState<"" | "gt" | "lt">("");
  const [balanceVal, setBalanceVal] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async (q: string, bOp: string, bVal: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (q) params.set("search", q);
      if (bOp && bVal) {
        params.set("balanceOp", bOp);
        params.set("balanceVal", bVal);
      }
      const res = await fetch(`/api/finance/students?${params}`);
      if (!res.ok) throw new Error("Failed to load students");
      const data = await res.json();
      setStudents(data.students ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Could not load students. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => load(search, balanceOp, balanceVal),
      300,
    );
    return () => clearTimeout(debounceRef.current);
  }, [search, balanceOp, balanceVal, load]);

  const pendingCount = students.filter((s) => {
    const acc = s.financeAccount as FinanceAccount | null;
    return acc?.financePending ?? true;
  }).length;

  return (
    <div>
      <PageHeader
        title="Student Finances"
        description="View and manage individual student fee accounts and ledgers."
      />

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate pointer-events-none"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or admission number…"
            aria-label="Search students"
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-line rounded-lg bg-white focus:outline-none focus:border-teal focus:ring-2 focus:ring-teal/15 dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
          />
        </div>

        <button
          onClick={() => setShowFilters((f) => !f)}
          aria-expanded={showFilters}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-white text-sm font-medium px-3.5 py-2.5 text-ink hover:bg-paper hover:border-slate-light transition-all dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {balanceOp && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-teal"
              aria-label="Active filter"
            />
          )}
        </button>

        {!loading && (
          <span className="text-sm text-slate dark:text-dark-muted ml-auto">
            {total} student{total !== 1 ? "s" : ""}
            {pendingCount > 0 && (
              <span className="ml-2 text-warn font-medium">
                · {pendingCount} pending setup
              </span>
            )}
          </span>
        )}
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="rounded-xl border border-line bg-paper p-4 mb-5 flex flex-wrap gap-4 items-end dark:bg-dark-surface dark:border-dark-border">
          <div>
            <label className="block text-xs font-medium text-slate mb-1.5 dark:text-dark-muted">
              Balance filter
            </label>
            <select
              value={balanceOp}
              onChange={(e) =>
                setBalanceOp(e.target.value as "" | "gt" | "lt")
              }
              className="text-sm border border-line rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
            >
              <option value="">No filter</option>
              <option value="lt">Owes more than</option>
              <option value="gt">Credit more than</option>
            </select>
          </div>

          {balanceOp && (
            <div>
              <label className="block text-xs font-medium text-slate mb-1.5 dark:text-dark-muted">
                Amount (KES)
              </label>
              <input
                type="number"
                min="0"
                value={balanceVal}
                onChange={(e) => setBalanceVal(e.target.value)}
                placeholder="e.g. 1000"
                className="w-36 text-sm border border-line rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-teal dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
              />
            </div>
          )}

          {balanceOp && (
            <button
              onClick={() => {
                setBalanceOp("");
                setBalanceVal("");
              }}
              className="text-sm text-slate hover:text-danger transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-xl border border-line bg-paper animate-pulse"
            />
          ))}
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          message={
            search ? "No students match your search." : "No students found."
          }
          icon={<Users className="h-6 w-6" />}
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Student</th>
                  <th className={premiumThClass}>Class</th>
                  <th className={`${premiumThClass} text-right`}>Balance</th>
                  <th className={premiumThClass}>Status</th>
                  <th
                    className={premiumThClass}
                    aria-label="Actions"
                  ></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const acc = s.financeAccount as FinanceAccount | null;
                  const pending = acc?.financePending ?? true;
                  return (
                    <tr key={s.id} className={premiumTrClass}>
                      <td className={premiumTdClass}>
                        <p className="font-medium text-ink dark:text-dark-text">
                          {s.fullName}
                        </p>
                        <p className="text-xs text-slate font-mono mt-0.5 dark:text-dark-muted">
                          {s.admissionNumber}
                        </p>
                      </td>
                      <td
                        className={`${premiumTdClass} text-slate dark:text-dark-muted`}
                      >
                        {s.schoolClass.name}
                      </td>
                      <td className={`${premiumTdClass} text-right`}>
                        <BalanceCell account={s.financeAccount} />
                      </td>
                      <td className={premiumTdClass}>
                        {pending ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg border border-warn/20 text-warn text-xs font-medium px-2.5 py-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            Finance Pending
                          </span>
                        ) : (
                          <Badge variant="success">Set up</Badge>
                        )}
                      </td>
                      <td className={premiumTdClass}>
                        <Link
                          href={`/staff/finance/students/${s.id}`}
                          className="inline-flex items-center gap-1 text-sm text-teal font-medium hover:underline"
                        >
                          View ledger
                          <ChevronRight
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
