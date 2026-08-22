"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  DollarSign, Banknote, Search, X, Loader2,
  CheckCircle2, AlertTriangle,
} from "lucide-react";
import {
  PageHeader, EmptyState, Spinner, ErrorBanner, primaryButtonClass,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface Payment {
  id:          string;
  amount:      string;
  postedAt:    string;
  description: string;
  student:     { fullName: string; admissionNumber: string } | null;
}

interface StudentResult {
  id:              string;
  fullName:        string;
  admissionNumber: string;
  schoolClass:     { name: string };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${Math.abs(n).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

const METHODS = [
  { value: "CASH",          label: "Cash"          },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE",        label: "Cheque"        },
];

const inputCls =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

// ── Post Payment Modal ─────────────────────────────────────────────────────

type ModalStep = "search" | "form" | "confirm";

function PostPaymentModal({
  onClose,
  onSuccess,
}: {
  onClose:   () => void;
  onSuccess: () => void;
}) {
  // Step control
  const [step, setStep] = useState<ModalStep>("search");

  // Student search state
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<StudentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropOpen,  setDropOpen]  = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const listRef                   = useRef<HTMLUListElement>(null);

  // Selected student
  const [student, setStudent] = useState<StudentResult | null>(null);

  // Payment form state
  const [amount,     setAmount]     = useState("");
  const [method,     setMethod]     = useState("CASH");
  const [reference,  setReference]  = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err,        setErr]        = useState<string | null>(null);

  const amountNum = parseFloat(amount);
  const validForm = !isNaN(amountNum) && amountNum > 0;

  // ── Student search ──
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setDropOpen(false); return; }
    setSearching(true);
    try {
      const res  = await fetch(`/api/finance/students?search=${encodeURIComponent(q.trim())}&pageSize=8`);
      const data = res.ok ? await res.json() : { students: [] };
      setResults(data.students ?? []);
      setDropOpen(true);
      setActiveIdx(-1);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch]);

  // Keep keyboard-active item visible
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  function selectStudent(s: StudentResult) {
    setStudent(s);
    setQuery(s.fullName);
    setDropOpen(false);
    setStep("form");
  }

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropOpen || results.length === 0) return;
    if (e.key === "ArrowDown")  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); selectStudent(results[activeIdx]); }
    else if (e.key === "Escape") setDropOpen(false);
  }

  // ── Payment submit ──
  async function submit() {
    if (!student) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/finance/payments", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          studentId: student.id,
          amount:    amountNum,
          method,
          reference: reference.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Failed to post payment."); setStep("form"); return; }
      onSuccess();
    } catch {
      setErr("An unexpected error occurred.");
      setStep("form");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Backdrop close on Escape ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Post payment"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-white shadow-2xl dark:bg-dark-surface dark:border-dark-border">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4 dark:border-dark-border">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-teal" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-ink dark:text-dark-text">Post Payment</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate hover:text-ink dark:text-dark-muted dark:hover:text-dark-text transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs">
            {(["search", "form", "confirm"] as ModalStep[]).map((s, i) => {
              const labels = ["Find student", "Payment details", "Confirm"];
              const done   = step === "form"    ? i < 1
                           : step === "confirm" ? i < 2
                           : false;
              const active = step === s;
              return (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && <div className={`h-px w-8 ${done ? "bg-teal" : "bg-line dark:bg-dark-border"}`} />}
                  <span className={`font-medium ${active ? "text-teal" : done ? "text-teal/70" : "text-slate dark:text-dark-muted"}`}>
                    {labels[i]}
                  </span>
                </div>
              );
            })}
          </div>

          {err && (
            <p className="text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">
              {err}
            </p>
          )}

          {/* ── Step 1: Student search ── */}
          {step === "search" && (
            <div>
              <label className="block text-xs font-medium text-slate dark:text-dark-muted mb-1.5">
                Search student by name or admission number
              </label>
              <div className="relative">
                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate dark:text-dark-muted" aria-hidden="true" />
                  <input
                    ref={inputRef}
                    type="text"
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleSearchKey}
                    onFocus={() => { if (results.length) setDropOpen(true); }}
                    onBlur={() => setTimeout(() => setDropOpen(false), 150)}
                    placeholder="e.g. Dennis Kamau or 1207"
                    aria-label="Search students"
                    aria-autocomplete="list"
                    aria-expanded={dropOpen}
                    className={`${inputCls} pl-9 pr-9`}
                  />
                  <span className="absolute right-3 flex items-center">
                    {searching ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-teal" />
                    ) : query ? (
                      <button type="button" tabIndex={-1}
                        onClick={() => { setQuery(""); setResults([]); setDropOpen(false); inputRef.current?.focus(); }}
                        className="text-slate hover:text-ink dark:text-dark-muted transition-colors"
                        aria-label="Clear"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </span>
                </div>

                {dropOpen && (
                  <ul
                    ref={listRef}
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-xl overflow-hidden
                               bg-white border border-line shadow-xl dark:bg-dark-surface dark:border-dark-border"
                    style={{ maxHeight: "260px", overflowY: "auto" }}
                  >
                    {results.length === 0 ? (
                      <li className="px-4 py-3 text-xs text-slate dark:text-dark-muted text-center">
                        No students found
                      </li>
                    ) : results.map((s, idx) => (
                      <li
                        key={s.id}
                        role="option"
                        aria-selected={idx === activeIdx}
                        onMouseDown={() => selectStudent(s)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors
                          ${idx < results.length - 1 ? "border-b border-line/60 dark:border-dark-border/60" : ""}
                          ${idx === activeIdx ? "bg-teal/5 dark:bg-teal/10" : "hover:bg-paper dark:hover:bg-dark-border/40"}`}
                      >
                        <div className="flex items-center justify-center h-7 w-7 rounded-full shrink-0 bg-teal text-white text-[10px] font-bold select-none" aria-hidden="true">
                          {s.fullName.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-ink dark:text-dark-text truncate leading-tight">{s.fullName}</p>
                          <p className="text-[10px] text-slate dark:text-dark-muted font-mono leading-tight">
                            {s.admissionNumber} · {s.schoolClass.name}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Payment form ── */}
          {step === "form" && student && (
            <div className="space-y-4">
              {/* Selected student pill */}
              <div className="flex items-center justify-between rounded-lg border border-teal/30 bg-teal/5 px-3 py-2 dark:bg-teal/10 dark:border-teal/20">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center justify-center h-7 w-7 rounded-full bg-teal text-white text-[10px] font-bold select-none" aria-hidden="true">
                    {student.fullName.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink dark:text-dark-text">{student.fullName}</p>
                    <p className="text-[10px] text-slate dark:text-dark-muted font-mono">{student.admissionNumber} · {student.schoolClass.name}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setStudent(null); setQuery(""); setStep("search"); setErr(null); }}
                  className="text-slate hover:text-ink dark:text-dark-muted transition-colors"
                  aria-label="Change student"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-slate dark:text-dark-muted mb-1">
                  Amount (KES) <span className="text-danger">*</span>
                </label>
                <input
                  type="number" min="1" step="any"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className={inputCls}
                  autoFocus
                />
              </div>

              {/* Method */}
              <div>
                <label className="block text-xs font-medium text-slate dark:text-dark-muted mb-1">
                  Payment method
                </label>
                <div className="flex gap-2">
                  {METHODS.map(m => (
                    <button
                      key={m.value} type="button"
                      onClick={() => setMethod(m.value)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        method === m.value
                          ? "bg-teal text-white border-teal"
                          : "bg-white border-line text-slate hover:border-teal/40 dark:bg-dark-surface dark:border-dark-border dark:text-dark-muted"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reference */}
              <div>
                <label className="block text-xs font-medium text-slate dark:text-dark-muted mb-1">
                  Reference <span className="text-slate/50">(optional)</span>
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="e.g. cheque number, bank ref"
                  className={inputCls}
                />
              </div>

              <button
                type="button"
                onClick={() => setStep("confirm")}
                disabled={!validForm}
                className={primaryButtonClass + " w-full mt-1"}
              >
                <CheckCircle2 className="h-4 w-4" />
                Continue
              </button>
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === "confirm" && student && (
            <div className="space-y-4">
              <div className="rounded-lg border border-warn/30 bg-warn-bg/60 px-4 py-3 flex gap-3 items-start">
                <AlertTriangle className="h-5 w-5 text-warn shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-ink dark:text-dark-text">
                    Confirm payment?
                  </p>
                  <p className="text-xs text-slate dark:text-dark-muted mt-0.5">
                    This is <span className="font-semibold text-danger">irreversible</span>. Once posted it is permanently recorded in the ledger.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-line bg-paper dark:bg-dark-surface dark:border-dark-border divide-y divide-line dark:divide-dark-border text-sm">
                {[
                  { label: "Student", value: student.fullName },
                  { label: "Admission", value: student.admissionNumber },
                  { label: "Amount",  value: `KES ${amountNum.toLocaleString("en-KE", { minimumFractionDigits: 2 })}` },
                  { label: "Method",  value: METHODS.find(m => m.value === method)?.label ?? method },
                  ...(reference.trim() ? [{ label: "Reference", value: reference.trim() }] : []),
                ].map(row => (
                  <div key={row.label} className="flex justify-between px-4 py-2.5">
                    <span className="text-slate dark:text-dark-muted">{row.label}</span>
                    <span className="font-medium text-ink dark:text-dark-text">{row.value}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className={primaryButtonClass + " flex-1"}
                >
                  {submitting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <CheckCircle2 className="h-4 w-4" />}
                  {submitting ? "Posting…" : "Confirm & Post"}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("form")}
                  disabled={submitting}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate hover:text-ink transition-colors dark:border-dark-border dark:text-dark-muted"
                >
                  Back
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const [payments,    setPayments]    = useState<Payment[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [showModal,   setShowModal]   = useState(false);
  const [successMsg,  setSuccessMsg]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/finance/ledger?entryType=PAYMENT&pageSize=50");
      if (!res.ok) throw new Error("Failed to load payments");
      const data = await res.json();
      setPayments(data.entries ?? []);
    } catch {
      setError("Could not load payments. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSuccess() {
    setShowModal(false);
    setSuccessMsg("Payment posted successfully.");
    load();
    setTimeout(() => setSuccessMsg(null), 5000);
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Post new fee payments and review payment history."
        action={
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className={primaryButtonClass}
          >
            <Banknote className="h-4 w-4" aria-hidden="true" />
            Post Payment
          </button>
        }
      />

      {successMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success-bg px-4 py-3 text-sm text-success font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {successMsg}
        </div>
      )}

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : payments.length === 0 ? (
        <EmptyState
          message="No payments recorded yet."
          icon={<DollarSign className="h-6 w-6" />}
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Student</th>
                  <th className={premiumThClass}>Description</th>
                  <th className={`${premiumThClass} text-right`}>Amount</th>
                  <th className={`${premiumThClass} text-right`}>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className={premiumTrClass}>
                    <td className={premiumTdClass}>
                      <p className="font-medium text-ink dark:text-dark-text">
                        {p.student?.fullName ?? "—"}
                      </p>
                      <p className="text-xs text-slate font-mono mt-0.5 dark:text-dark-muted">
                        {p.student?.admissionNumber}
                      </p>
                    </td>
                    <td className={`${premiumTdClass} text-slate max-w-[200px] truncate dark:text-dark-muted`}>
                      {p.description || "—"}
                    </td>
                    <td className={`${premiumTdClass} text-right tabular-nums font-semibold text-success`}>
                      {formatKES(p.amount)}
                    </td>
                    <td className={`${premiumTdClass} text-right text-xs text-slate dark:text-dark-muted`}>
                      {formatDate(p.postedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <PostPaymentModal
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
