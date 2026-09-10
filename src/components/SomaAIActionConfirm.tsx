"use client";

/**
 * src/components/SomaAIActionConfirm.tsx
 *
 * Confirmation dialog shown inside the Soma AI chat panel before any
 * write/system action is executed. Actions are never performed automatically
 * — the user must explicitly confirm.
 *
 * Usage:
 *   <SomaAIActionConfirm
 *     action={{ type: "send_message", label: "Send SMS to all parents", description: "…", risk: "medium" }}
 *     onConfirm={() => executeAction()}
 *     onCancel={() => dismiss()}
 *   />
 */

import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle, XCircle, Info, Loader2 } from "lucide-react";

export type ActionRisk = "low" | "medium" | "high";

export interface PendingAction {
  /** Machine identifier for the action type */
  type: string;
  /** Human-readable action label, e.g. "Send SMS to Form 3 parents" */
  label: string;
  /** Detailed description of what will happen */
  description: string;
  /** Risk level controls the visual treatment */
  risk: ActionRisk;
  /** Optional list of affected entities for the user to review */
  affectedItems?: string[];
  /** True while the action is executing after confirm */
  executing?: boolean;
}

interface Props {
  action: PendingAction;
  onConfirm: () => void;
  onCancel: () => void;
}

const RISK_CONFIG: Record<
  ActionRisk,
  { icon: React.ReactNode; bg: string; border: string; confirmClass: string; label: string }
> = {
  low: {
    icon: <Info className="h-5 w-5 text-info" />,
    bg: "bg-info/5 dark:bg-info/10",
    border: "border-info/20",
    confirmClass:
      "bg-teal text-white hover:bg-teal-dark disabled:opacity-40",
    label: "Confirm",
  },
  medium: {
    icon: <AlertTriangle className="h-5 w-5 text-warn" />,
    bg: "bg-warn-bg dark:bg-warn/10",
    border: "border-warn/20",
    confirmClass:
      "bg-warn text-white hover:bg-warn/90 disabled:opacity-40",
    label: "Yes, proceed",
  },
  high: {
    icon: <AlertTriangle className="h-5 w-5 text-danger" />,
    bg: "bg-danger-bg dark:bg-danger/10",
    border: "border-danger/20",
    confirmClass:
      "bg-danger text-white hover:bg-danger/90 disabled:opacity-40",
    label: "Yes, I understand — proceed",
  },
};

export default function SomaAIActionConfirm({ action, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cfg = RISK_CONFIG[action.risk];

  // Focus cancel by default (safest choice) on mount
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Keyboard: Escape → cancel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="action-confirm-title"
      aria-describedby="action-confirm-desc"
      className={`mx-2 my-3 rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <span className="shrink-0 mt-0.5">{cfg.icon}</span>
        <div>
          <p
            id="action-confirm-title"
            className="text-sm font-semibold text-foreground leading-snug"
          >
            {action.label}
          </p>
          <p
            id="action-confirm-desc"
            className="text-xs text-slate mt-1 leading-relaxed"
          >
            {action.description}
          </p>
        </div>
      </div>

      {/* Affected items preview */}
      {action.affectedItems && action.affectedItems.length > 0 && (
        <div className="mb-3 pl-8">
          <p className="text-[11px] font-semibold text-slate uppercase tracking-wide mb-1">
            This will affect:
          </p>
          <ul className="text-xs text-slate space-y-0.5">
            {action.affectedItems.slice(0, 5).map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-slate/50 shrink-0" />
                {item}
              </li>
            ))}
            {action.affectedItems.length > 5 && (
              <li className="text-slate/60/60">
                … and {action.affectedItems.length - 5} more
              </li>
            )}
          </ul>
        </div>
      )}

      {/* High-risk extra warning */}
      {action.risk === "high" && (
        <p className="text-xs text-danger font-medium mb-3 pl-8">
          This action cannot be undone.
        </p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pl-8">
        <button
          type="button"
          onClick={onConfirm}
          disabled={action.executing}
          className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold
                      transition-colors ${cfg.confirmClass}`}
        >
          {action.executing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <CheckCircle className="h-3.5 w-3.5" />
              {cfg.label}
            </>
          )}
        </button>

        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={action.executing}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-medium
                     border border-border text-slate hover:text-foreground hover:bg-background
                     disabled:opacity-40 transition-colors"
        >
          <XCircle className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
}
