"use client";

/**
 * RemoveStudentDialog
 *
 * Two-step confirmation dialog for removing a student from active enrollment.
 * Step 1: Choose between Transfer Student and Expel Student.
 * Step 2 (Expulsion only): Enter a mandatory reason.
 *
 * On confirmation the dialog calls POST /api/students/[id]/archive and
 * notifies the parent component via onSuccess so the list can refresh.
 *
 * Design follows the existing Bidii Modal + ui.tsx design language exactly:
 * teal accents, rounded-xl cards, same button classes, same typography scale.
 */

import { useState, useRef, useEffect } from "react";
import { X, ArrowLeftRight, UserX, AlertTriangle, ChevronRight } from "lucide-react";
import {
  secondaryButtonClass,
  dangerButtonClass,
  inputClass,
  labelClass,
  ErrorBanner,
} from "@/components/ui";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RemoveStudentTarget {
  id: string;
  fullName: string;
  admissionNumber: string;
  className?: string;
}

interface Props {
  student: RemoveStudentTarget;
  onClose:   () => void;
  onSuccess: (archiveType: "TRANSFER" | "EXPULSION") => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RemoveStudentDialog({ student, onClose, onSuccess }: Props) {
  const [step, setStep]               = useState<"choose" | "expel">("choose");
  const [reason, setReason]           = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const backdropRef                   = useRef<HTMLDivElement>(null);
  const reasonRef                     = useRef<HTMLTextAreaElement>(null);

  // ── Body scroll lock ──────────────────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Escape key ────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Focus reason field when expel step opens ──────────────────────────────
  useEffect(() => {
    if (step === "expel") {
      setTimeout(() => reasonRef.current?.focus(), 50);
    }
  }, [step]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleTransfer() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${student.id}/archive`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ type: "TRANSFER" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Couldn't archive student."); return; }
      onSuccess("TRANSFER");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExpel() {
    if (!reason.trim()) {
      setError("A reason is required to expel a student.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${student.id}/archive`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ type: "EXPULSION", reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Couldn't archive student."); return; }
      onSuccess("EXPULSION");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    /* Backdrop */
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm
                 flex items-end sm:items-center justify-center
                 px-0 sm:px-4 py-0 sm:py-8"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      {/* Dialog panel */}
      <div
        className="relative w-full sm:max-w-md
                   bg-card rounded-t-2xl sm:rounded-2xl
                   border border-border shadow-xl
                   flex flex-col max-h-[92dvh]
                   modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-line" aria-hidden="true" />
        </div>

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4
                        border-b border-border shrink-0">
          <div>
            <h2 id="remove-dialog-title"
                className="text-base font-semibold text-foreground leading-snug">
              Remove Student
            </h2>
            <p className="mt-1 text-sm text-slate">
              <span className="font-medium text-foreground">{student.fullName}</span>
              {" · "}
              <span className="font-mono text-xs">{student.admissionNumber}</span>
              {student.className && <>{" · "}{student.className}</>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center h-11 w-11 sm:h-8 sm:w-8
                       rounded-lg text-slate hover:text-foreground hover:bg-background
                       transition-colors shrink-0 -mr-2 -mt-1"
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">

          {error && (
            <div className="mb-4">
              <ErrorBanner message={error} onDismiss={() => setError(null)} />
            </div>
          )}

          {/* ── Step 1: Choose action ── */}
          {step === "choose" && (
            <div className="space-y-3">
              <p className="text-sm text-slate leading-relaxed">
                This student will be removed from the active Students module and
                moved into the History archive. Every associated record — grades,
                attendance, discipline, achievements, library activity, and documents —
                is permanently preserved.
              </p>

              {/* Transfer option */}
              <button
                type="button"
                onClick={handleTransfer}
                disabled={loading}
                className="w-full group flex items-start gap-4 rounded-xl border border-border
                           bg-card hover:border-teal/40 hover:bg-teal-50/30
                           px-4 py-4 text-left transition-all duration-100
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-teal/10 text-teal
                                flex items-center justify-center">
                  <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground group-hover:text-teal
                                transition-colors">
                    Transfer Student
                  </p>
                  <p className="text-xs text-slate mt-0.5 leading-relaxed">
                    Student is leaving for another school. All records are archived
                    immediately — no reason required.
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate/40 shrink-0 mt-1
                                         group-hover:text-teal transition-colors"
                              aria-hidden="true" />
              </button>

              {/* Expel option */}
              <button
                type="button"
                onClick={() => { setError(null); setStep("expel"); }}
                disabled={loading}
                className="w-full group flex items-start gap-4 rounded-xl border border-border
                           bg-card hover:border-danger/30 hover:bg-danger-bg/20
                           px-4 py-4 text-left transition-all duration-100
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-danger-bg text-danger
                                flex items-center justify-center">
                  <UserX className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground group-hover:text-danger
                                transition-colors">
                    Expel Student
                  </p>
                  <p className="text-xs text-slate mt-0.5 leading-relaxed">
                    Student is being expelled. A mandatory reason is required and
                    will be recorded as a discipline entry.
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate/40 shrink-0 mt-1
                                         group-hover:text-danger transition-colors"
                              aria-hidden="true" />
              </button>
            </div>
          )}

          {/* ── Step 2: Expulsion reason ── */}
          {step === "expel" && (
            <div className="space-y-4">
              {/* Warning banner */}
              <div className="flex items-start gap-3 rounded-xl bg-danger-bg/50
                              border border-danger/20 px-4 py-3.5">
                <AlertTriangle className="h-4 w-4 text-danger shrink-0 mt-0.5"
                               aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-danger">Expulsion</p>
                  <p className="text-xs text-danger/80 mt-0.5 leading-relaxed">
                    This will create a permanent discipline record marked as
                    Expulsion and archive the student. This action cannot be undone.
                  </p>
                </div>
              </div>

              {/* Reason input */}
              <div>
                <label htmlFor="expel-reason" className={labelClass}>
                  Reason for expulsion{" "}
                  <span className="text-danger" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="expel-reason"
                  ref={reasonRef}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Describe the reason for this expulsion in detail…"
                  className={`${inputClass} resize-none`}
                />
                <p className="mt-1.5 text-xs text-slate text-right">
                  {reason.length}/1000
                </p>
                <p className="text-xs text-slate leading-relaxed">
                  This reason will be saved as a discipline record in{" "}
                  <span className="font-medium">{student.fullName}</span>&apos;s history.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-border bg-background px-6 py-4
                        rounded-b-2xl sm:rounded-b-2xl">
          {step === "choose" ? (
            <button
              type="button"
              onClick={onClose}
              className={`${secondaryButtonClass} w-full`}
            >
              Cancel
            </button>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => { setStep("choose"); setError(null); }}
                disabled={loading}
                className={`${secondaryButtonClass} sm:w-auto`}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleExpel}
                disabled={loading || !reason.trim()}
                className={`${dangerButtonClass} sm:w-auto`}
              >
                {loading ? "Expelling…" : "Confirm Expulsion"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
