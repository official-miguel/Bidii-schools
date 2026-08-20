"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart2, TrendingUp, TrendingDown, AlertTriangle,
  ReceiptText, RefreshCw, Users,
} from "lucide-react";
import {
  PageHeader, Spinner, EmptyState, ErrorBanner,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass, secondaryButtonClass, Badge,
} from "@/components/ui";
import ContextNavigation from "@/components/ContextNavigation";

interface Summary {
  totalInvoiced: string;
  totalCollected: string;
  totalOutstanding: string;
  collectionRate: number;
  debtorCount: number;
}

interface AgingRow {
  studentId: string;
  fullName: string;
  admissionNumber: string;
  className: string;
  totalInvoiced: string;
  totalPaid: string;
  balance: string;
  daysOverdue: number;
  bucket: string;
}

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function bucketBadge(b: string) {
  if (b === "0-30" || b === "31-60") return <Badge variant="warn">{b} days</Badge>;
  return <Badge variant="danger">{b} days</Badge>;
}

export default function PrincipalFinancePage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [aging,   setAging]   = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, a] = await Promise.all([
        fetch("/api/finance/reports/summary").then(r => r.ok ? r.json() : null),
        fetch("/api/finance/reports/aging").then(r => r.ok ? r.json() : { rows: [] }),
      ]);
      setSummary(s);
      setAging(a?.rows ?? []);
    } catch {
      setError("Could not load finance data. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const navItems = [
    { href: "/principal/finance", label: "Finance Overview", icon: <BarChart2 className="h-3.5 w-3.5" />, exact: true },
  ];

  return (
    <div>
      <div className="border-b border-line mb-6 dark:border-dark-border">
        <ContextNavigation items={navItems} />
      </div>

      <PageHeader
        title="Finance Overview"
        description="Read-only school finance summary and debtor report."
        action={
          <button onClick={load} disabled={loading} className={secondaryButtonClass}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <>
          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Total invoiced",  value: formatKES(summary.totalInvoiced),    icon: <ReceiptText className="h-5 w-5" />,   highlight: false },
                { label: "Total collected", value: formatKES(summary.totalCollected),   icon: <TrendingUp className="h-5 w-5" />,    highlight: false, sub: `${summary.collectionRate.toFixed(1)}% rate` },
                { label: "Outstanding",     value: formatKES(summary.totalOutstanding), icon: <TrendingDown className="h-5 w-5" />,  highlight: parseFloat(summary.totalOutstanding) > 0 },
                { label: "Active debtors",  value: String(summary.debtorCount),         icon: <AlertTriangle className="h-5 w-5" />, highlight: summary.debtorCount > 0 },
              ].map(c => (
                <div key={c.label} className={`rounded-xl border p-5 flex gap-4 items-start ${
                  c.highlight ? "border-danger/30 bg-danger-bg/40" : "bg-white border-line dark:bg-dark-surface dark:border-dark-border"
                }`}>
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                    c.highlight ? "bg-danger/10 text-danger" : "bg-teal/10 text-teal"
                  }`} aria-hidden="true">{c.icon}</div>
                  <div>
                    <p className={`text-2xl font-semibold tabular-nums leading-none ${c.highlight ? "text-danger" : "text-ink dark:text-dark-text"}`}>{c.value}</p>
                    <p className="text-slate text-sm mt-1.5 dark:text-dark-muted">{c.label}</p>
                    {"sub" in c && c.sub && <p className="text-slate/60 text-xs mt-0.5">{c.sub}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Debtors list */}
          <h2 className="text-base font-semibold text-ink mb-3 dark:text-dark-text flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" aria-hidden="true" />
            Debtor list
          </h2>
          {aging.length === 0 ? (
            <EmptyState message="No students with outstanding balances." icon={<Users className="h-6 w-6" />} />
          ) : (
            <div className={premiumTableContainerClass}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className={premiumTheadClass}>
                    <tr>
                      <th className={premiumThClass}>Student</th>
                      <th className={premiumThClass}>Class</th>
                      <th className={`${premiumThClass} text-right`}>Balance</th>
                      <th className={`${premiumThClass} text-right`}>Days Overdue</th>
                      <th className={premiumThClass}>Bucket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aging.map(row => (
                      <tr key={row.studentId} className={premiumTrClass}>
                        <td className={premiumTdClass}>
                          <p className="font-medium text-ink dark:text-dark-text">{row.fullName}</p>
                          <p className="text-xs font-mono text-slate dark:text-dark-muted">{row.admissionNumber}</p>
                        </td>
                        <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>{row.className ?? "—"}</td>
                        <td className={`${premiumTdClass} text-right tabular-nums text-danger font-semibold`}>{formatKES(row.balance)}</td>
                        <td className={`${premiumTdClass} text-right tabular-nums text-slate`}>{row.daysOverdue}d</td>
                        <td className={premiumTdClass}>{bucketBadge(row.bucket)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
