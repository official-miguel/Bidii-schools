"use client";

/**
 * SuperAdminTopBar
 * Fixed top header for the super-admin control plane.
 * Shows the current page title (via document.title read hack or passed prop)
 * and the logged-in email with a shield badge.
 */

import { ShieldCheck, Bell } from "lucide-react";

interface Props {
  userEmail: string;
}

export default function SuperAdminTopBar({ userEmail }: Props) {
  const initials = userEmail.slice(0, 2).toUpperCase();

  return (
    <header
      aria-label="Super admin top bar"
      className="fixed top-0 left-0 md:left-16 right-0 h-16 z-30
                 bg-white border-b border-line shadow-xs
                 dark:bg-dark-surface dark:border-dark-border
                 flex items-center justify-between px-4 sm:px-6 gap-4"
    >
      {/* Brand label */}
      <div className="flex items-center gap-2.5 min-w-0">
        <ShieldCheck className="h-5 w-5 text-teal shrink-0" strokeWidth={2} aria-hidden />
        <span className="text-sm font-semibold text-ink dark:text-dark-text truncate">
          Super Admin Console
        </span>
        <span className="hidden sm:inline-flex items-center rounded-full bg-teal-50 border border-teal/20
                         text-teal text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wide">
          Internal only
        </span>
      </div>

      {/* Right — notifications placeholder + user badge */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          aria-label="Notifications"
          className="flex items-center justify-center h-9 w-9 rounded-lg text-slate
                     hover:bg-slate-100 transition-colors dark:hover:bg-dark-border dark:text-dark-muted"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-line dark:border-dark-border">
          <div
            className="flex items-center justify-center h-8 w-8 rounded-full
                       bg-teal/10 text-teal text-xs font-semibold select-none shrink-0"
            aria-hidden
          >
            {initials}
          </div>
          <span className="hidden sm:block text-xs text-slate dark:text-dark-muted max-w-[160px] truncate">
            {userEmail}
          </span>
        </div>
      </div>
    </header>
  );
}
