"use client";

/**
 * MpesaPayButton
 *
 * Renders a "Pay via M-Pesa" button. On click it opens a modal that shows:
 *  - The school's paybill number (read-only, for parent's reference)
 *  - The student's admission number (read-only — used as AccountReference)
 *  - An amount input (pre-filled with the outstanding balance when available)
 *
 * The parent only needs to enter the amount and tap "Send". Safaricom pushes
 * a PIN prompt to the phone number already registered on their account —
 * no phone number input needed.
 *
 * States:
 *  idle    — trigger button visible, modal closed
 *  open    — modal open, form ready
 *  loading — POST /api/parent/fees/stk-push in-flight
 *  pending — STK prompt sent to parent's phone, waiting for PIN
 *  error   — API or Daraja error shown inline, form still editable
 *
 * Requirements: 7.4
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { X, Smartphone, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MpesaPayButtonProps {
  studentId:        string;
  studentName:      string;
  admissionNumber:  string;
  paybillNumber:    string | null;
  /** Pre-fills amount from the outstanding balance (absolute value, KES) */
  suggestedAmount?: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatKsh(value: number): string {
  return new Intl.NumberFormat("en-KE", {
    style:                 "currency",
    currency:              "KES",
    minimumFractionDigits: 2,
  }).format(Math.abs(value));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ModalState = "idle" | "open" | "loading" | "pending" | "error";

export default function MpesaPayButton({
  studentId,
  studentName,
  admissionNumber,
  paybillNumber,
  suggestedAmount,
}: MpesaPayButtonProps) {
  const formId   = useId();
  const amountId = `${formId}-amount`;

  const [state, setState]   = useState<ModalState>("idle");
  const [amount, setAmount] = useState(
    suggestedAmount && suggestedAmount > 0
      ? String(Math.ceil(Math.abs(suggestedAmount)))
      : ""
  );
  const [error, setError] = useState<string | null>(null);

  const firstFocusRef = useRef<HTMLInputElement>(null);

  // Sync suggested amount when the balance prop changes (e.g. child switcher)
  useEffect(() => {
    if (suggestedAmount && suggestedAmount > 0 && !amount) {
      setAmount(String(Math.ceil(Math.abs(suggestedAmount))));
    }
    // intentionally omit `amount` to avoid overwriting user edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedAmount]);

  // Auto-focus the amount field when modal opens
  useEffect(() => {
    if (state === "open") {
      setTimeout(() => firstFocusRef.current?.focus(), 50);
    }
  }, [state]);

  // Close on Escape
  useEffect(() => {
    if (state === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state !== "loading" && state !== "pending") {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const openModal = useCallback(() => {
    setError(null);
    setState("open");
  }, []);

  const closeModal = useCallback(() => {
    if (state === "loading") return;
    setState("idle");
    setError(null);
  }, [state]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const parsedAmount = parseInt(amount, 10);
      if (!amount || isNaN(parsedAmount) || parsedAmount < 1) {
        setError("Please enter a valid amount (minimum KES 1).");
        return;
      }
      if (parsedAmount > 150_000) {
        setError("Amount cannot exceed KES 150,000 per transaction.");
        return;
      }

      setState("loading");

      try {
        const res = await fetch("/api/parent/fees/stk-push", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          // No phone — server uses parent.phone from the authenticated session
          body: JSON.stringify({ studentId, amount: parsedAmount }),
        });

        const data = (await res.json()) as { error?: string };

        if (!res.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
          setState("error");
          return;
        }

        setState("pending");
      } catch {
        setError("Network error. Please check your connection and try again.");
        setState("error");
      }
    },
    [amount, studentId]
  );

  const isOpen = state !== "idle";

  return (
    <>
      {/* ── Trigger button ── */}
      <Button
        variant="primary"
        size="sm"
        leftIcon={<Smartphone className="h-4 w-4" />}
        onClick={openModal}
        aria-haspopup="dialog"
      >
        Pay via M-Pesa
      </Button>

      {/* ── Modal overlay ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${formId}-title`}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              if (state !== "loading" && state !== "pending") closeModal();
            }}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative w-full max-w-sm rounded-2xl bg-card border border-line shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-200">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#4caf50]/10 flex items-center justify-center shrink-0">
                  <Smartphone className="h-5 w-5 text-[#4caf50]" />
                </div>
                <div>
                  <h2
                    id={`${formId}-title`}
                    className="text-sm font-semibold text-foreground leading-tight"
                  >
                    Pay via M-Pesa
                  </h2>
                  <p className="text-xs text-slate leading-tight mt-0.5">
                    {studentName}
                  </p>
                </div>
              </div>
              {state !== "loading" && state !== "pending" && (
                <button
                  onClick={closeModal}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate
                             hover:bg-background hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-4">

              {/* ── Pending state ── */}
              {state === "pending" && (
                <div className="text-center py-2 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-[#4caf50]/10 flex items-center justify-center mx-auto">
                    <Smartphone className="h-7 w-7 text-[#4caf50] animate-pulse" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Check your phone
                    </p>
                    <p className="text-xs text-slate mt-1 leading-relaxed">
                      An M-Pesa prompt for{" "}
                      <span className="font-semibold text-foreground">
                        {formatKsh(parseInt(amount, 10))}
                      </span>{" "}
                      has been sent to your registered number. Enter your PIN to complete the payment.
                    </p>
                  </div>
                  <p className="text-xs text-slate/70">
                    The payment will appear in your history once confirmed.
                  </p>
                  <Button variant="secondary" size="sm" onClick={closeModal}>
                    Close
                  </Button>
                </div>
              )}

              {/* ── Form (open / loading / error) ── */}
              {state !== "pending" && (
                <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-4">

                  {/* Reference info — paybill + account number */}
                  <div className="rounded-lg bg-background border border-line divide-y divide-line overflow-hidden">
                    {paybillNumber && (
                      <div className="flex items-center justify-between px-3.5 py-2.5">
                        <span className="text-xs text-slate">Paybill number</span>
                        <span className="text-sm font-bold text-foreground tracking-widest">
                          {paybillNumber}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="text-xs text-slate">Account number</span>
                      <span className="text-sm font-semibold text-foreground font-mono">
                        {admissionNumber}
                      </span>
                    </div>
                  </div>

                  {/* Amount input */}
                  <div>
                    <label
                      htmlFor={amountId}
                      className="block text-xs font-medium text-foreground mb-1.5"
                    >
                      Amount (KES)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate select-none pointer-events-none">
                        KES
                      </span>
                      <input
                        ref={firstFocusRef}
                        id={amountId}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={150000}
                        step={1}
                        value={amount}
                        onChange={(e) => {
                          setAmount(e.target.value);
                          setError(null);
                        }}
                        disabled={state === "loading"}
                        required
                        placeholder="e.g. 5000"
                        className="w-full pl-12 pr-4 py-2.5 rounded-lg border border-line bg-background
                                   text-sm text-foreground placeholder:text-slate/50
                                   focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal
                                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      />
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-2 rounded-lg bg-danger/5 border border-danger/20 px-3.5 py-2.5">
                      <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
                      <p className="text-xs text-danger leading-relaxed">{error}</p>
                    </div>
                  )}

                  {/* Info note */}
                  <div className="flex items-start gap-2 rounded-lg bg-background border border-line px-3.5 py-2.5">
                    <CheckCircle2 className="h-4 w-4 text-slate shrink-0 mt-0.5" />
                    <p className="text-xs text-slate leading-relaxed">
                      A payment prompt will be sent to your registered M-Pesa number.
                      Enter your PIN on your phone to authorise. No amount is charged until you confirm.
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={closeModal}
                      disabled={state === "loading"}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      loading={state === "loading"}
                      className="flex-1"
                    >
                      Send Request
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
