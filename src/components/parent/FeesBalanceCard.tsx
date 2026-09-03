/**
 * FeesBalanceCard — displays a student's current fee balance prominently.
 *
 * currentBalance > 0  → credit (overpayment), shown in green
 * currentBalance < 0  → outstanding balance, shown in orange with warning icon
 * currentBalance = 0  → fully settled, shown in green
 * currentBalance null → unable to fetch, shown in grey
 *
 * Requirements: 7.1, 7.3
 */

import { AlertTriangle, CheckCircle, HelpCircle } from "lucide-react";

interface FeesBalanceCardProps {
  /** Current balance as a number. Positive = credit, negative = owes money. */
  currentBalance: number | null;
  totalInvoiced: number | null;
  totalPaid: number | null;
}

function formatKsh(value: number): string {
  return new Intl.NumberFormat("en-KE", {
    style:                 "currency",
    currency:              "KES",
    minimumFractionDigits: 2,
  }).format(Math.abs(value));
}

export default function FeesBalanceCard({
  currentBalance,
  totalInvoiced,
  totalPaid,
}: FeesBalanceCardProps) {
  // Secondary stats row (invoiced / paid)
  const secondaryStats =
    totalInvoiced !== null || totalPaid !== null ? (
      <div className="mt-3 flex gap-6 text-xs">
        <span className="text-slate dark:text-dark-muted">
          <span className="font-semibold text-ink dark:text-dark-text">
            {totalInvoiced !== null ? formatKsh(totalInvoiced) : "—"}
          </span>{" "}
          invoiced
        </span>
        <span className="text-slate dark:text-dark-muted">
          <span className="font-semibold text-ink dark:text-dark-text">
            {totalPaid !== null ? formatKsh(totalPaid) : "—"}
          </span>{" "}
          paid
        </span>
      </div>
    ) : null;

  // Null balance — account not set up
  if (currentBalance === null) {
    return (
      <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
        <p className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted mb-3">
          Current Balance
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate/10 flex items-center justify-center shrink-0">
            <HelpCircle className="h-5 w-5 text-slate dark:text-dark-muted" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate dark:text-dark-muted">
              Balance information unavailable
            </p>
            <p className="text-xs text-slate/70 dark:text-dark-muted/70">
              Finance account not yet set up for this student.
            </p>
          </div>
        </div>
        {secondaryStats}
      </div>
    );
  }

  // Outstanding balance (negative = student owes)
  if (currentBalance < 0) {
    return (
      <div className="bg-warn-bg border border-warn/30 rounded-xl p-5 shadow-xs dark:border-warn/20">
        <p className="text-xs font-semibold text-warn/70 uppercase tracking-wide mb-3">
          Current Balance
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-warn/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-warn" />
          </div>
          <div>
            <p className="text-2xl font-bold text-warn">
              {formatKsh(currentBalance)}{" "}
              <span className="text-sm font-normal">outstanding</span>
            </p>
            <p className="text-xs text-warn/80 mt-0.5">
              ⚠️ Outstanding balance — KSh{" "}
              {Math.abs(currentBalance).toLocaleString()} — please clear at the
              school bursar&apos;s office.
            </p>
          </div>
        </div>
        {secondaryStats}
      </div>
    );
  }

  // Credit or zero balance (fees up to date)
  return (
    <div className="bg-success-bg border border-success/30 rounded-xl p-5 shadow-xs dark:border-success/20">
      <p className="text-xs font-semibold text-success/70 uppercase tracking-wide mb-3">
        Current Balance
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
          <CheckCircle className="h-5 w-5 text-success" />
        </div>
        <div>
          {currentBalance > 0 ? (
            <>
              <p className="text-2xl font-bold text-success">
                {formatKsh(currentBalance)}{" "}
                <span className="text-sm font-normal">credit</span>
              </p>
              <p className="text-xs text-success/80 mt-0.5">
                ✅ Fees are up to date — account has a credit.
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-success">KES 0.00</p>
              <p className="text-xs text-success/80 mt-0.5">
                ✅ Fees are up to date — no outstanding balance.
              </p>
            </>
          )}
        </div>
      </div>
      {secondaryStats}
    </div>
  );
}
