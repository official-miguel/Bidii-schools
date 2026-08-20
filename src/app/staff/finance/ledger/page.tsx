"use client";

import { useEffect, useState, useCallback } from "react";
import { DollarSign } from "lucide-react";
import {
  PageHeader, Badge, EmptyState, Spinner, ErrorBanner,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

interface LedgerEntry {
  id: string;
  entryType: string;
  amount: string;
  description: string;
  postedAt: string;
  isVoided: boolean;
  student: { fullName: string; admissionNumber: string } | null;
}

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function timeAgo(iso: string) {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function entryTypeLabel(type: string): { label: string; variant: "success" | "info" | "warn" | "default" } {
  switch (type) {
    case "PAYMENT":           return { label: "Payment",     variant: "success" };
    case "INVOICE":           return { label: "Invoice",     variant: "info" };
    case "CREDIT_ADJUSTMENT": return { label: "Credit Adj.", variant: "success" };
    case "DEBIT_ADJUSTMENT":  return { label: "Debit Adj.",  variant: "warn" };
    case "OPENING_BALANCE":   return { label: "Opening Bal.",variant: "default" };
    default:                  return { label: type,          variant: "default" };
  }
}

export default function LedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/finance/ledger?pageSize=50");
      if (!res.ok) throw new Error("Failed to load ledger");
      const data = await res.json();
      setEntries(data.entries ?? []);
    } catch {
      setError("Could not load ledger. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="Ledger"
        description="Full transaction history — invoices, payments, and balance adjustments."
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : entries.length === 0 ? (
        <EmptyState
          message="No transactions recorded yet."
          icon={<DollarSign className="h-6 w-6" />}
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[540px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Student</th>
                  <th className={premiumThClass}>Type</th>
                  <th className={premiumThClass}>Description</th>
                  <th className={`${premiumThClass} text-right`}>Amount</th>
                  <th className={`${premiumThClass} text-right`}>When</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const { label, variant } = entryTypeLabel(e.entryType);
                  return (
                    <tr key={e.id} className={`${premiumTrClass} ${e.isVoided ? "opacity-50" : ""}`}>
                      <td className={premiumTdClass}>
                        <p className="font-medium text-ink dark:text-dark-text">
                          {e.student?.fullName ?? "—"}
                        </p>
                        <p className="text-xs text-slate font-mono mt-0.5 dark:text-dark-muted">
                          {e.student?.admissionNumber}
                        </p>
                      </td>
                      <td className={premiumTdClass}>
                        <Badge variant={variant}>{label}</Badge>
                        {e.isVoided && (
                          <span className="ml-1.5 text-xs text-slate line-through dark:text-dark-muted">voided</span>
                        )}
                      </td>
                      <td className={`${premiumTdClass} text-slate max-w-[200px] truncate dark:text-dark-muted`}>
                        {e.description || "—"}
                      </td>
                      <td className={`${premiumTdClass} text-right tabular-nums font-semibold text-ink dark:text-dark-text`}>
                        {formatKES(e.amount)}
                      </td>
                      <td className={`${premiumTdClass} text-right text-xs text-slate dark:text-dark-muted`}>
                        {timeAgo(e.postedAt)}
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
