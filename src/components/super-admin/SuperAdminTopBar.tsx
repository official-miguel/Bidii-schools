"use client";

/**
 * SuperAdminTopBar
 * Fixed top header for the super-admin control plane.
 * Shows the current page title (via document.title read hack or passed prop)
 * and the logged-in email with a shield badge.
 */

import { useState, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import NotificationCenter, { NotificationBell } from "@/components/NotificationCenter";

interface Props {
  userEmail: string;
}

export default function SuperAdminTopBar({ userEmail }: Props) {
  const initials = userEmail.slice(0, 2).toUpperCase();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  return (
    <header
      aria-label="Super admin top bar"
      className="fixed top-0 left-0 md:left-44 right-0 h-16 z-30
                 bg-card border-b border-border shadow-xs
                 flex items-center justify-between px-4 sm:px-6 gap-4"
    >
      {/* Brand label */}
      <div className="flex items-center gap-2.5 min-w-0">
        <ShieldCheck className="h-5 w-5 text-teal shrink-0" strokeWidth={2} aria-hidden />
        <span className="text-sm font-semibold text-foreground truncate">
          Super Admin Console
        </span>
        <span className="hidden sm:inline-flex items-center rounded-full bg-teal-50 border border-teal/20
                         text-teal text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wide">
          Internal only
        </span>
      </div>

      {/* Right — notifications + user badge */}
      <div className="flex items-center gap-2 shrink-0">
        {/* This was a placeholder button with no handler and no panel — a bell
            a super admin could click forever with nothing happening. */}
        <div ref={notifRef} className="relative shrink-0">
          <NotificationBell
            onClick={() => setNotifOpen((v) => !v)}
            isOpen={notifOpen}
          />
          <NotificationCenter
            isOpen={notifOpen}
            onClose={() => setNotifOpen(false)}
          />
        </div>

        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <div
            className="flex items-center justify-center h-8 w-8 rounded-full
                       bg-teal/10 text-teal text-xs font-semibold select-none shrink-0"
            aria-hidden
          >
            {initials}
          </div>
          <span className="hidden sm:block text-xs text-slate max-w-[160px] truncate">
            {userEmail}
          </span>
        </div>
      </div>
    </header>
  );
}
