"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CreditCard, DollarSign, Banknote } from "lucide-react";
import {
  PageHeader, Badge, EmptyState, Spinner, ErrorBanner, primaryButtonClass,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

interface Payment {
  id: string;
  amount: string;
  postedAt: string;
  description: string;
  student: { fullName: string; admissionNumber: string } | null;
}

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/finance/ledger?entryType=PAYMENT&pageSize=50");
      if (!res.ok) throw new Error("Failed to load payments");
      const data = await res.json();
      setPayments(data.entries ?? []);
    } catch {
      setError("Could not load payments. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Post new fee payments and review payment history."
        action={
          <Link href="/staff/finance/payments" className={primaryButtonClass}>
            <Banknote className="h-4 w-4" aria-hidden="true" />
            Post Payment
          </Link>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : payments.length === 0 ? (
        <EmptyState
          message="No payments recorded yet."
          icon={<DollarSign className="h-6 w-6" />}
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Student</th>
                  <th className={premiumThClass}>Description</th>
                  <th className={`${premiumThClass} text-right`}>Amount</th>
                  <th className={`${premiumThClass} text-right`}>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className={premiumTrClass}>
                    <td className={premiumTdClass}>
                      <p className="font-medium text-ink dark:text-dark-text">
                        {p.student?.fullName ?? "—"}
                      </p>
                      <p className="text-xs text-slate font-mono mt-0.5 dark:text-dark-muted">
                        {p.student?.admissionNumber}
                      </p>
                    </td>
                    <td className={`${premiumTdClass} text-slate max-w-[200px] truncate dark:text-dark-muted`}>
                      {p.description || "—"}
                    </td>
                    <td className={`${premiumTdClass} text-right tabular-nums font-semibold text-success`}>
                      {formatKES(p.amount)}
                    </td>
                    <td className={`${premiumTdClass} text-right text-xs text-slate dark:text-dark-muted`}>
                      {formatDate(p.postedAt)}
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
