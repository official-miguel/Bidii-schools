"use client";

import Link from "next/link";
import {
  Users, BookOpen, CreditCard,
  AlertTriangle, GitMerge, ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui";

const tiles = [
  {
    href:  "/staff/finance/students",
    icon:  <Users className="h-6 w-6" />,
    label: "Students",
    desc:  "View and search individual student fee accounts and balances.",
  },
  {
    href:  "/staff/finance/ledger",
    icon:  <BookOpen className="h-6 w-6" />,
    label: "Ledger",
    desc:  "Full transaction history — invoices, payments, and adjustments.",
  },
  {
    href:  "/staff/finance/payments",
    icon:  <CreditCard className="h-6 w-6" />,
    label: "Payments",
    desc:  "Post new payments and review payment records.",
  },
  {
    href:  "/staff/finance/debtors",
    icon:  <AlertTriangle className="h-6 w-6" />,
    label: "Debtors",
    desc:  "Students with outstanding balances past the threshold.",
  },
  {
    href:  "/staff/finance/reconciliation",
    icon:  <GitMerge className="h-6 w-6" />,
    label: "M-Pesa Reconciliation",
    desc:  "Match unrecognised M-Pesa payments to students before crediting their accounts.",
  },
];

export default function TransactionsPage() {
  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Manage student accounts, the fee ledger, payments, and outstanding debtors."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="group flex items-start gap-4 rounded-xl border border-line bg-white p-5
                       hover:border-teal/40 hover:shadow-sm transition-all duration-150
                       dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/40"
          >
            <div
              className="h-12 w-12 rounded-xl bg-teal/10 text-teal flex items-center justify-center
                         shrink-0 group-hover:bg-teal group-hover:text-white transition-colors duration-150"
              aria-hidden="true"
            >
              {tile.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-ink dark:text-dark-text">
                {tile.label}
              </p>
              <p className="text-sm text-slate mt-1 leading-snug dark:text-dark-muted">
                {tile.desc}
              </p>
            </div>
            <ArrowRight
              className="h-4 w-4 text-slate/40 shrink-0 mt-1 group-hover:text-teal transition-colors duration-150"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
