"use client";

import Link from "next/link";
import { GitMerge, BarChart2, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";

const tiles = [
  {
    href:  "/staff/finance/reconciliation",
    icon:  <GitMerge className="h-6 w-6" />,
    label: "Reconciliation",
    desc:  "Match unrecognised M-Pesa C2B payments to student accounts.",
  },
  {
    href:  "/staff/finance/reports",
    icon:  <BarChart2 className="h-6 w-6" />,
    label: "Reports",
    desc:  "Analytics, aging report, payment trends, and class collection rates.",
  },
];

export default function AnalysisPage() {
  return (
    <div>
      <PageHeader
        title="Analysis"
        description="Reconcile M-Pesa payments and view finance analytics."
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
