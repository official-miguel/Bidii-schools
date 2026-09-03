/**
 * PaymentHistory — renders a parent-visible list of fee payments.
 * Empty state shown when no payments exist.
 *
 * Requirements: 7.3
 */

import { Receipt } from "lucide-react";

export interface PaymentItem {
  id: string;
  receiptNumber: string;
  amount: number;
  method: string;
  paidAt: string | Date;
}

interface PaymentHistoryProps {
  payments: PaymentItem[];
}

function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatKsh(value: number): string {
  return new Intl.NumberFormat("en-KE", {
    style:                 "currency",
    currency:              "KES",
    minimumFractionDigits: 2,
  }).format(value);
}

const METHOD_LABEL: Record<string, string> = {
  CASH:          "Cash",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE:        "Cheque",
  MPESA:         "M-Pesa",
};

export default function PaymentHistory({ payments }: PaymentHistoryProps) {
  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Receipt className="h-10 w-10 text-slate dark:text-dark-muted mb-3" />
        <p className="text-sm font-semibold text-ink dark:text-dark-text">
          No payments recorded yet.
        </p>
        <p className="text-xs text-slate dark:text-dark-muted mt-1">
          Payment receipts will appear here once fees have been paid.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 rounded-xl border border-line
                     bg-card px-4 py-3 shadow-xs dark:bg-dark-surface dark:border-dark-border"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
              <Receipt className="h-4 w-4 text-success" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink dark:text-dark-text truncate">
                {payment.receiptNumber}
              </p>
              <p className="text-xs text-slate dark:text-dark-muted">
                {METHOD_LABEL[payment.method] ?? payment.method}
                {" · "}
                {formatDate(payment.paidAt)}
              </p>
            </div>
          </div>
          <p className="text-sm font-bold text-success shrink-0">
            {formatKsh(payment.amount)}
          </p>
        </div>
      ))}
    </div>
  );
}
