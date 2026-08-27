"use client";

/**
 * FinanceTopBar
 *
 * Fixed top bar for the finance and library modules.
 * On desktop it sits at left-64 (aligning with the sidebar).
 * On mobile (< md) it spans full width and shows an optional
 * hamburger button slot on the left so each sidebar can inject
 * its own menu trigger.
 */

import FinanceStudentSearch from "@/components/finance/FinanceStudentSearch";

interface Props {
  roleLabel:        string;
  userInitials:     string;
  /** Mobile hamburger button injected by the sidebar component */
  mobileMenuButton?: React.ReactNode;
}

export default function FinanceTopBar({ roleLabel, userInitials, mobileMenuButton }: Props) {
  return (
    <header
      className="fixed top-0 right-0 z-30 h-16 flex items-center gap-3 px-4
                 bg-white/95 backdrop-blur-sm border-b border-line
                 dark:bg-dark-sidebar/95 dark:border-dark-border
                 left-0 md:left-64"
      aria-label="Top bar"
    >
      {/* Hamburger slot — only rendered on mobile (sidebar hides on md+) */}
      {mobileMenuButton && (
        <div className="md:hidden shrink-0">
          {mobileMenuButton}
        </div>
      )}

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
