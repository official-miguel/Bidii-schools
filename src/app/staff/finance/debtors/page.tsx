"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import {
  PageHeader, EmptyState, Spinner, ErrorBanner,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

interface Debtor {
  studentId: string;
  fullName: string;
  admissionNumber: string;
  className: string;
  balance: string;
  daysOverdue: number;
  bucket: string;
}

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function bucketClass(b: string) {
  if (b === "0-30")  return "bg-warn-bg text-warn border-warn/20";
  if (b === "31-60") return "bg-warn-bg text-warn border-warn/20";
  return "bg-danger-bg text-danger border-danger/20";
}

export default function DebtorsPage() {
  const [debtors,  setDebtors]  = useState<Debtor[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

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

  return (
    <div>
      <PageHeader
        title="Debtors"
        description="Students with outstanding fee balances past the configured threshold."
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : debtors.length === 0 ? (
        <EmptyState
          message="No outstanding debtors — all accounts are settled."
          icon={<AlertTriangle className="h-6 w-6" />}
        />
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg bg-warn-bg border border-warn/20 px-4 py-3 mb-5">
            <AlertTriangle className="h-4 w-4 text-warn shrink-0" aria-hidden="true" />
            <p className="text-sm text-warn font-medium">
              {debtors.length} student{debtors.length !== 1 ? "s" : ""} with outstanding balances
            </p>
          </div>

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
                  {debtors.map((d) => (
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
        </>
      )}
    </div>
  );
}
