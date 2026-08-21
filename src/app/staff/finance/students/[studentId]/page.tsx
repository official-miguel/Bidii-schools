"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ReceiptText,
  Banknote,
  TrendingDown,
  TrendingUp,
  FileText,
  CreditCard,
  Printer,
  ChevronDown,
  ChevronRight,
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

interface LedgerEntry {
  id: string;
  entryType: string;
  amount: string;
  description: string;
  postedAt: string;
  paymentMethod: string | null;
  isVoided: boolean;
  runningBalance: string;
  referenceId: string | null;
  term: { name: string } | null;
}

interface Payment {
  id: string;
  receiptNumber: string;
  amount: string;
  method: string;
  paidAt: string;
  reference: string | null;
  reconciliationStatus: string;
  term: { name: string } | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  totalAmount: string;
  lineItems: { description: string; amount: number; type: string }[];
  generatedAt: string;
  isProrated: boolean;
  proratedDays: number | null;
  term: { name: string } | null;
}

interface Account {
  currentBalance: string;
  totalInvoiced: string;
  totalPaid: string;
  financeSetupCompletedAt: string | null;
  lastActivityAt: string;
}

interface Student {
  fullName: string;
  admissionNumber: string;
  schoolClass: { name: string; form: number };
}

function formatKES(s: string) {
  const n = parseFloat(s);
  if (isNaN(n)) return "KES 0.00";
  return `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

type Tab = "ledger" | "payments" | "invoices";

export default function StudentLedgerPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("ledger");

  // Track which invoice ledger entry is expanded (by ledger entry id)
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/finance/students/${studentId}/ledger`);
      if (!res.ok) throw new Error("Failed to load ledger");
      const data = await res.json();
      setStudent(data.student);
      setAccount(data.account);
      setEntries(data.entries ?? []);
      setPayments(data.payments ?? []);
      setInvoices(data.invoices ?? []);
    } catch {
      setError("Could not load student ledger. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Build a map from invoiceNumber → lineItems for O(1) lookup in ledger rows
  const invoiceByNumber = new Map<string, { description: string; amount: number; type: string }[]>();
  for (const inv of invoices) {
    if (inv.invoiceNumber && Array.isArray(inv.lineItems)) {
      invoiceByNumber.set(inv.invoiceNumber, inv.lineItems as { description: string; amount: number; type: string }[]);
    }
  }

  const balance = parseFloat(account?.currentBalance ?? "0");

  const tabs: {
    id: Tab;
    label: string;
    icon: React.ReactNode;
    count: number;
  }[] = [
    {
      id: "ledger",
      label: "Ledger",
      icon: <FileText className="h-3.5 w-3.5" aria-hidden="true" />,
      count: entries.length,
    },
    {
      id: "payments",
      label: "Payments",
      icon: <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />,
      count: payments.length,
    },
    {
      id: "invoices",
      label: "Invoices",
      icon: <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />,
      count: invoices.length,
    },
  ];

  return (
    <div>
      {/* Back link */}
      <Link
        href="/staff/finance/students"
        className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink mb-4 transition-colors dark:text-dark-muted dark:hover:text-dark-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to students
      </Link>

      <PageHeader
        title={loading ? "Loading…" : (student?.fullName ?? "Student")}
        description={
          student
            ? `${student.admissionNumber} · ${student.schoolClass.name}`
            : ""
        }
        action={
          account ? (
            <Link
              href={`/staff/finance/payments?studentId=${studentId}`}
              className={primaryButtonClass}
            >
              <Banknote className="h-4 w-4" aria-hidden="true" />
              Post Payment
            </Link>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Account summary cards */}
      {account && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: "Current balance",
              value: formatKES(account.currentBalance),
              icon: <TrendingDown className="h-5 w-5" aria-hidden="true" />,
              highlight: balance < 0,
            },
            {
              label: "Total invoiced",
              value: formatKES(account.totalInvoiced),
              icon: <ReceiptText className="h-5 w-5" aria-hidden="true" />,
              highlight: false,
            },
            {
              label: "Total paid",
              value: formatKES(account.totalPaid),
              icon: <TrendingUp className="h-5 w-5" aria-hidden="true" />,
              highlight: false,
            },
            {
              label: "Invoices",
              value: String(invoices.length),
              icon: <FileText className="h-5 w-5" aria-hidden="true" />,
              highlight: false,
            },
          ].map((c) => (
            <div
              key={c.label}
              className={`rounded-xl border p-4 flex gap-3 items-start ${
                c.highlight
                  ? "border-danger/30 bg-danger-bg/40"
                  : "bg-white border-line dark:bg-dark-surface dark:border-dark-border"
              }`}
            >
              <div
                className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                  c.highlight
                    ? "bg-danger/10 text-danger"
                    : "bg-teal/10 text-teal"
                }`}
              >
                {c.icon}
              </div>
              <div>
                <p
                  className={`text-xl font-semibold tabular-nums leading-none ${
                    c.highlight
                      ? "text-danger"
                      : "text-ink dark:text-dark-text"
                  }`}
                >
                  {c.value}
                </p>
                <p className="text-xs text-slate mt-1 dark:text-dark-muted">
                  {c.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-line mb-5 dark:border-dark-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? "border-teal text-teal"
                : "border-transparent text-slate hover:text-ink dark:text-dark-muted dark:hover:text-dark-text"
            }`}
          >
            {t.icon}
            {t.label}
            {t.count > 0 && (
              <span
                className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${
                  tab === t.id
                    ? "bg-teal/10 text-teal"
                    : "bg-line text-slate"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-xl border border-line bg-paper animate-pulse"
            />
          ))}
        </div>
      ) : tab === "ledger" ? (
        entries.length === 0 ? (
          <EmptyState
            message="No ledger entries yet."
            icon={<FileText className="h-6 w-6" />}
          />
        ) : (
          <div className={premiumTableContainerClass}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className={premiumTheadClass}>
                  <tr>
                    <th className={premiumThClass}>Date</th>
                    <th className={premiumThClass}>Type</th>
                    <th className={premiumThClass}>Description</th>
                    <th className={`${premiumThClass} text-right`}>Amount</th>
                    <th className={`${premiumThClass} text-right`}>
                      Running Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const { label, variant } = entryTypeLabel(e.entryType);
                    const rb = parseFloat(e.runningBalance);
                    const isInvoice = e.entryType === "INVOICE" && e.referenceId;
                    const lineItems = isInvoice ? (invoiceByNumber.get(e.referenceId!) ?? []) : [];
                    const isExpanded = expandedEntryId === e.id;
                    const hasBreakdown = isInvoice && lineItems.length > 1;

                    return (
                      <React.Fragment key={e.id}>
                        <tr
                          className={`${premiumTrClass} ${e.isVoided ? "opacity-50" : ""} ${hasBreakdown ? "cursor-pointer hover:bg-teal/5" : ""}`}
                          onClick={() => hasBreakdown && setExpandedEntryId(isExpanded ? null : e.id)}
                        >
                          <td className={`${premiumTdClass} text-slate text-xs dark:text-dark-muted whitespace-nowrap`}>
                            {formatDate(e.postedAt)}
                          </td>
                          <td className={premiumTdClass}>
                            <div className="flex items-center gap-1.5">
                              {hasBreakdown && (
                                isExpanded
                                  ? <ChevronDown className="h-3.5 w-3.5 text-teal shrink-0" />
                                  : <ChevronRight className="h-3.5 w-3.5 text-slate/50 shrink-0" />
                              )}
                              <Badge variant={variant}>{label}</Badge>
                            </div>
                            {e.isVoided && <span className="ml-1 text-xs text-slate">(voided)</span>}
                          </td>
                          <td className={`${premiumTdClass} text-ink dark:text-dark-text max-w-[220px]`}>
                            <span className="truncate block">{e.description}</span>
                            {hasBreakdown && !isExpanded && (
                              <span className="text-xs text-slate dark:text-dark-muted">
                                {lineItems.length} item{lineItems.length !== 1 ? "s" : ""} — click to expand
                              </span>
                            )}
                          </td>
                          <td className={`${premiumTdClass} text-right tabular-nums font-medium text-ink dark:text-dark-text`}>
                            {formatKES(e.amount)}
                          </td>
                          <td className={`${premiumTdClass} text-right tabular-nums font-semibold ${rb < 0 ? "text-danger" : "text-success"}`}>
                            {formatKES(e.runningBalance)}
                          </td>
                        </tr>

                        {/* Expanded line items breakdown */}
                        {isExpanded && hasBreakdown && (
                          <>
                            {lineItems.map((li, idx) => (
                              <tr key={`${e.id}-li-${idx}`} className="bg-paper/60 dark:bg-dark-border/10 border-b border-line/40 dark:border-dark-border/40">
                                <td className={`${premiumTdClass} text-slate text-xs dark:text-dark-muted`} />
                                <td className={premiumTdClass}>
                                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium border ${
                                    li.type === "BASE_FEE"
                                      ? "bg-teal/5 text-teal border-teal/20"
                                      : "bg-warn/5 text-warn border-warn/20"
                                  }`}>
                                    {li.type === "BASE_FEE" ? "Base fee" : "Expense"}
                                  </span>
                                </td>
                                <td className={`${premiumTdClass} text-slate dark:text-dark-muted pl-8`}>
                                  {li.description}
                                </td>
                                <td className={`${premiumTdClass} text-right tabular-nums text-slate dark:text-dark-muted`}>
                                  {formatKES(String(li.amount))}
                                </td>
                                <td className={premiumTdClass} />
                              </tr>
                            ))}
                            {/* Total row */}
                            <tr className="bg-paper/80 dark:bg-dark-border/20 border-b-2 border-line dark:border-dark-border">
                              <td className={premiumTdClass} />
                              <td className={premiumTdClass} />
                              <td className={`${premiumTdClass} pl-8 text-xs font-semibold text-ink dark:text-dark-text`}>
                                Total invoice
                              </td>
                              <td className={`${premiumTdClass} text-right tabular-nums font-bold text-ink dark:text-dark-text`}>
                                {formatKES(e.amount)}
                              </td>
                              <td className={premiumTdClass} />
                            </tr>
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : tab === "payments" ? (
        payments.length === 0 ? (
          <EmptyState
            message="No payments recorded yet."
            icon={<CreditCard className="h-6 w-6" />}
          />
        ) : (
          <div className={premiumTableContainerClass}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead className={premiumTheadClass}>
                  <tr>
                    <th className={premiumThClass}>Date</th>
                    <th className={premiumThClass}>Receipt</th>
                    <th className={premiumThClass}>Method</th>
                    <th className={premiumThClass}>Term</th>
                    <th className={`${premiumThClass} text-right`}>Amount</th>
                    <th
                      className={premiumThClass}
                      aria-label="Actions"
                    ></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className={premiumTrClass}>
                      <td
                        className={`${premiumTdClass} text-slate text-xs dark:text-dark-muted`}
                      >
                        {formatDate(p.paidAt)}
                      </td>
                      <td className={premiumTdClass}>
                        <span className="font-mono text-xs text-ink dark:text-dark-text">
                          {p.receiptNumber}
                        </span>
                      </td>
                      <td
                        className={`${premiumTdClass} text-slate dark:text-dark-muted`}
                      >
                        {p.method}
                      </td>
                      <td
                        className={`${premiumTdClass} text-slate dark:text-dark-muted`}
                      >
                        {p.term?.name ?? "—"}
                      </td>
                      <td
                        className={`${premiumTdClass} text-right tabular-nums font-semibold text-success`}
                      >
                        {formatKES(p.amount)}
                      </td>
                      <td className={premiumTdClass}>
                        <Link
                          href={`/api/finance/payments/${p.id}/receipt`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs text-teal hover:underline font-medium"
                        >
                          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                          Receipt
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : invoices.length === 0 ? (
        <EmptyState
          message="No invoices generated yet."
          icon={<ReceiptText className="h-6 w-6" />}
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Date</th>
                  <th className={premiumThClass}>Invoice #</th>
                  <th className={premiumThClass}>Term</th>
                  <th className={premiumThClass}>Type</th>
                  <th className={`${premiumThClass} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className={premiumTrClass}>
                    <td
                      className={`${premiumTdClass} text-slate text-xs dark:text-dark-muted`}
                    >
                      {formatDate(i.generatedAt)}
                    </td>
                    <td className={premiumTdClass}>
                      <span className="font-mono text-xs text-ink dark:text-dark-text">
                        {i.invoiceNumber}
                      </span>
                    </td>
                    <td
                      className={`${premiumTdClass} text-slate dark:text-dark-muted`}
                    >
                      {i.term?.name ?? "—"}
                    </td>
                    <td className={premiumTdClass}>
                      {i.isProrated ? (
                        <Badge variant="warn">Prorated</Badge>
                      ) : (
                        <Badge variant="info">Standard</Badge>
                      )}
                    </td>
                    <td
                      className={`${premiumTdClass} text-right tabular-nums font-semibold text-danger`}
                    >
                      {formatKES(i.totalAmount)}
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
