"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Users,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ArrowRight,
  ReceiptText,
  RefreshCw,
  Loader2,
  Banknote,
  PieChart,
} from "lucide-react";import {
  PageHeader,
  Badge,
  EmptyState,
  Spinner,
  primaryButtonClass,
  premiumTableContainerClass,
  premiumTheadClass,
  premiumThClass,
  premiumTdClass,
  premiumTrClass,
  ErrorBanner,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Summary {
  totalInvoiced: string;
  totalCollected: string;
  totalOutstanding: string;
  collectionRate: number;
  debtorCount: number;
}

interface LedgerEntry {
  id: string;
  entryType: string;
  amount: string;
  description: string;
  postedAt: string;
  isVoided: boolean;
  student: { fullName: string; admissionNumber: string } | null;
}

interface Notification {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  student: { fullName: string; admissionNumber: string } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatKES(amount: string | number) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(n)) return "KES 0.00";
  return `KES ${Math.abs(n).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function entryTypeLabel(type: string): {
  label: string;
  variant: "success" | "info" | "warn" | "default";
} {
  switch (type) {
    case "PAYMENT":
      return { label: "Payment", variant: "success" };
    case "INVOICE":
      return { label: "Invoice", variant: "info" };
    case "CREDIT_ADJUSTMENT":
      return { label: "Credit Adj.", variant: "success" };
    case "DEBIT_ADJUSTMENT":
      return { label: "Debit Adj.", variant: "warn" };
    case "OPENING_BALANCE":
      return { label: "Opening Bal.", variant: "default" };
    default:
      return { label: type, variant: "default" };
  }
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  highlight,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  highlight?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className={`rounded-xl border p-5 flex gap-4 items-start transition-all ${
        highlight
          ? "border-danger/30 bg-danger-bg/40 dark:bg-danger/10"
          : "bg-white border-line hover:shadow-sm dark:bg-dark-surface dark:border-dark-border"
      } ${href ? "cursor-pointer hover:border-teal/40" : ""}`}
    >
      <div
        className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
          highlight ? "bg-danger/10 text-danger" : "bg-teal/10 text-teal"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p
          className={`font-semibold tabular-nums leading-tight break-words ${
            value.length > 14 ? "text-base" : value.length > 10 ? "text-lg" : "text-2xl"
          } ${highlight ? "text-danger" : "text-ink dark:text-dark-text"}`}
        >
          {value}
        </p>
        <p className="text-slate text-sm mt-1.5 dark:text-dark-muted">{label}</p>
        {sub && (
          <p className="text-slate/60 text-xs mt-0.5 dark:text-dark-muted/60">{sub}</p>
        )}
      </div>
      {href && (
        <ArrowRight
          className="h-4 w-4 text-slate/40 shrink-0 mt-1"
          aria-hidden="true"
        />
      )}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function FinanceDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recentEntries, setRecentEntries] = useState<LedgerEntry[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, l, n] = await Promise.all([
        fetch("/api/finance/reports/summary").then((r) =>
          r.ok ? r.json() : null
        ),
        fetch("/api/finance/ledger?pageSize=10").then((r) =>
          r.ok ? r.json() : { entries: [] }
        ),
        fetch("/api/finance/notifications").then((r) =>
          r.ok ? r.json() : { notifications: [] }
        ),
      ]);
      setSummary(s);
      setRecentEntries(l?.entries ?? []);
      setNotifications(n?.notifications ?? []);
    } catch {
      setError("Could not load dashboard. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    setMarkingId(id);
    await fetch(`/api/finance/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setMarkingId(null);
  }

  const outstanding = summary ? parseFloat(summary.totalOutstanding) : 0;

  return (
    <div>
      <PageHeader
        title="Finance"
        description="School fee ledger, invoicing, payments, and debtor management."
        action={
          <div className="flex items-center gap-2">
            <Link href="/staff/finance/payments" className={primaryButtonClass}>
              <Banknote className="h-4 w-4" aria-hidden="true" />
              Post Payment
            </Link>
            <Link
              href="/staff/finance/reports"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white text-sm font-medium px-4 py-2.5 text-ink hover:bg-paper hover:border-slate-light transition-all duration-100 dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
            >
              <PieChart className="h-4 w-4" aria-hidden="true" />
              Reports
            </Link>
          </div>
        }
      />

      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      )}

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-line bg-paper animate-pulse"
            />
          ))}
        </div>
      ) : (
        summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Total invoiced"
              value={formatKES(summary.totalInvoiced)}
              icon={<ReceiptText className="h-5 w-5" />}
            />
            <StatCard
              label="Total collected"
              value={formatKES(summary.totalCollected)}
              sub={`${summary.collectionRate.toFixed(1)}% collection rate`}
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <StatCard
              label="Outstanding"
              value={formatKES(summary.totalOutstanding)}
              icon={<TrendingDown className="h-5 w-5" />}
              highlight={outstanding > 0}
              href="/staff/finance/debtors"
            />
            <StatCard
              label="Active debtors"
              value={String(summary.debtorCount)}
              icon={<AlertTriangle className="h-5 w-5" />}
              highlight={summary.debtorCount > 0}
              href="/staff/finance/debtors"
            />
          </div>
        )
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent ledger activity */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">
              Recent activity
            </h2>
            <Link
              href="/staff/finance/ledger"
              className="text-sm text-teal hover:underline font-medium"
            >
              View all
            </Link>
          </div>

          <div className={premiumTableContainerClass}>
            {loading ? (
              <div className="p-8 flex justify-center">
                <Spinner />
              </div>
            ) : recentEntries.length === 0 ? (
              <div className="p-10 text-center">
                <EmptyState
                  message="No transactions recorded yet."
                  icon={<DollarSign className="h-6 w-6" />}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className={premiumTheadClass}>
                    <tr>
                      <th className={premiumThClass}>Student</th>
                      <th className={premiumThClass}>Type</th>
                      <th className={`${premiumThClass} text-right`}>Amount</th>
                      <th className={`${premiumThClass} text-right`}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentEntries.map((e) => {
                      const { label, variant } = entryTypeLabel(e.entryType);
                      return (
                        <tr key={e.id} className={premiumTrClass}>
                          <td className={premiumTdClass}>
                            <p className="font-medium text-ink dark:text-dark-text">
                              {e.student?.fullName ?? "—"}
                            </p>
                            <p className="text-xs text-slate font-mono dark:text-dark-muted">
                              {e.student?.admissionNumber}
                            </p>
                          </td>
                          <td className={premiumTdClass}>
                            <Badge variant={variant}>{label}</Badge>
                          </td>
                          <td
                            className={`${premiumTdClass} text-right tabular-nums font-semibold text-ink dark:text-dark-text`}
                          >
                            {formatKES(e.amount)}
                          </td>
                          <td
                            className={`${premiumTdClass} text-right text-xs text-slate dark:text-dark-muted`}
                          >
                            {timeAgo(e.postedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Notification feed */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-ink dark:text-dark-text flex items-center gap-2">
              <Bell className="h-4 w-4 text-teal" aria-hidden="true" />
              Notifications
            </h2>
            {notifications.length > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
                {notifications.length}
              </span>
            )}
          </div>

          <div className="space-y-2">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl border border-line bg-paper animate-pulse"
                />
              ))
            ) : notifications.length === 0 ? (
              <div className="rounded-xl border border-line bg-white p-6 text-center dark:bg-dark-surface dark:border-dark-border">
                <CheckCircle2
                  className="h-8 w-8 text-success mx-auto mb-2"
                  aria-hidden="true"
                />
                <p className="text-sm text-slate dark:text-dark-muted">
                  All caught up!
                </p>
              </div>
            ) : (
              notifications.slice(0, 8).map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl border border-line bg-white p-4 hover:border-teal/30 transition-all dark:bg-dark-surface dark:border-dark-border"
                >
                  <div className="flex items-start gap-3">
                    <Bell
                      className="h-4 w-4 text-teal mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink leading-snug dark:text-dark-text line-clamp-2">
                        {n.message}
                      </p>
                      <p className="text-xs text-slate mt-1 dark:text-dark-muted">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => markRead(n.id)}
                      disabled={markingId === n.id}
                      aria-label="Mark as read"
                      title="Mark as read"
                      className="shrink-0 text-slate hover:text-teal transition-colors disabled:opacity-40"
                    >
                      {markingId === n.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick-action links */}
      <div className="mt-8">
        <h2 className="text-base font-semibold text-ink dark:text-dark-text mb-3">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            {
              href:  "/staff/finance/payments",
              icon:  <Banknote className="h-5 w-5" />,
              label: "Post Payment",
              desc:  "Record a fee payment for a student",
            },
            {
              href:  "/staff/finance/debtors",
              icon:  <TrendingDown className="h-5 w-5" />,
              label: "View Debtors",
              desc:  "Outstanding balances & aging report",
            },
            {
              href:  "/staff/finance/students",
              icon:  <Users className="h-5 w-5" />,
              label: "Student Ledger",
              desc:  "Per-student balance & transaction history",
            },
            {
              href:  "/staff/finance/reconciliation",
              icon:  <RefreshCw className="h-5 w-5" />,
              label: "Reconcile M-Pesa",
              desc:  "Match unallocated M-Pesa payments",
            },
            {
              href:  "/staff/finance/fee-structures",
              icon:  <ReceiptText className="h-5 w-5" />,
              label: "Fee Structures",
              desc:  "Set up term charges & billing rules",
            },
            {
              href:  "/staff/finance/reports",
              icon:  <PieChart className="h-5 w-5" />,
              label: "Reports",
              desc:  "Collection rates, analytics & exports",
            },
          ].map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="flex items-start gap-3 rounded-xl border border-line bg-white p-4 hover:border-teal/40 hover:shadow-sm transition-all dark:bg-dark-surface dark:border-dark-border"
            >
              <div
                className="h-9 w-9 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                {a.icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink dark:text-dark-text">
                  {a.label}
                </p>
                <p className="text-xs text-slate mt-0.5 dark:text-dark-muted truncate">
                  {a.desc}
                </p>
              </div>
              <ArrowRight
                className="h-4 w-4 text-slate/40 shrink-0 ml-auto mt-1"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
