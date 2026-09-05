"use client";

/**
 * AlertDismissibleCard
 *
 * One of the three top notification cards on the parent dashboard.
 * Variants:
 *   "fees"       — orange wallet icon, orange accents
 *   "assignment" — purple clipboard icon, purple accents
 *   "attendance" — green checkmark icon, green accents
 *
 * The card is dismissible (×) and persists the dismissed state in
 * sessionStorage so it doesn't flicker back on the same session.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Wallet, ClipboardList, CheckCircle } from "lucide-react";

type Variant = "fees" | "assignment" | "attendance";

interface AlertDismissibleCardProps {
  id:          string;          // unique key for sessionStorage
  variant:     Variant;
  title:       string;
  body:        string;
  linkLabel:   string;
  linkHref:    string;
}

const CONFIG = {
  fees: {
    iconBg:   "bg-[#FFF3E8]",
    iconColor: "text-[#F79009]",
    Icon:     Wallet,
    linkColor: "text-[#F79009]",
    border:   "border-[#FDEDC9]",
  },
  assignment: {
    iconBg:   "bg-[#F3EEFF]",
    iconColor: "text-[#7B5EA7]",
    Icon:     ClipboardList,
    linkColor: "text-[#7B5EA7]",
    border:   "border-[#E4D8FF]",
  },
  attendance: {
    iconBg:   "bg-[#EDFAF4]",
    iconColor: "text-[#17B26A]",
    Icon:     CheckCircle,
    linkColor: "text-[#17B26A]",
    border:   "border-[#C6F1DC]",
  },
} as const;

export default function AlertDismissibleCard({
  id,
  variant,
  title,
  body,
  linkLabel,
  linkHref,
}: AlertDismissibleCardProps) {
  const storageKey = `parent-alert-dismissed-${id}`;
  const [dismissed, setDismissed] = useState(false);

  // Read dismissal from sessionStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    if (sessionStorage.getItem(storageKey) === "1") setDismissed(true);
  }, [storageKey]);

  function dismiss() {
    sessionStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  if (dismissed) return null;

  const c = CONFIG[variant];

  return (
    <div
      className={`relative flex flex-col gap-2 rounded-2xl bg-white dark:bg-dark-surface
                  border ${c.border} dark:border-dark-border shadow-xs p-4
                  min-w-0`}
    >
      {/* Dismiss button */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center
                   rounded-full text-slate/50 hover:text-slate hover:bg-black/5 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c.iconBg}`}>
        <c.Icon className={`h-5 w-5 ${c.iconColor}`} strokeWidth={1.8} aria-hidden="true" />
      </div>

      {/* Text */}
      <div className="pr-4">
        <p className={`text-sm font-semibold ${c.linkColor} leading-snug`}>{title}</p>
        <p className="text-xs text-slate dark:text-dark-muted mt-0.5 leading-relaxed">{body}</p>
      </div>

      {/* CTA */}
      <Link
        href={linkHref}
        className={`text-xs font-semibold ${c.linkColor} hover:underline flex items-center gap-1 mt-1`}
      >
        {linkLabel} →
      </Link>
    </div>
  );
}
