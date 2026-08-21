"use client";

/**
 * FinanceTopBar
 *
 * Fixed top bar for the finance module. Sits at left-64 (aligning with
 * the right edge of FinanceSidebarNav) and matches the TopAppBar aesthetic:
 * white/95 background, border-b border-line, h-16.
 *
 * Contains:
 *  - Live student search pill (navigates to individual ledger on select)
 *  - Spacer
 *  - Role / user label chip (display only, no profile dropdown)
 */

import FinanceStudentSearch from "@/components/finance/FinanceStudentSearch";

interface Props {
  roleLabel:    string;
  userInitials: string;
}

export default function FinanceTopBar({ roleLabel, userInitials }: Props) {
  return (
    <header
      className="fixed top-0 right-0 z-30 h-16 flex items-center gap-3 px-4
                 bg-white/95 backdrop-blur-sm border-b border-line
                 dark:bg-dark-sidebar/95 dark:border-dark-border
                 left-0 md:left-64"
      aria-label="Finance top bar"
    >
      {/* Student search */}
      <FinanceStudentSearch />

      {/* Spacer */}
      <div className="flex-1" />

      {/* User chip */}
      <div className="flex items-center gap-2 select-none">
        <div
          className="w-8 h-8 rounded-full bg-teal text-white text-xs font-semibold
                     flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          {userInitials}
        </div>
        <span className="hidden sm:block text-xs font-medium text-ink dark:text-dark-text">
          {roleLabel}
        </span>
      </div>
    </header>
  );
}
