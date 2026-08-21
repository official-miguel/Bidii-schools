"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarDays, Plus, Pencil, Trash2, X, AlertTriangle, CheckCircle2, Users } from "lucide-react";
import {
  PageHeader, Badge, EmptyState, Spinner, ErrorBanner, primaryButtonClass,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface FinancialTermName {
  id:   string;
  name: string;
}

interface Term {
  id:                   string;
  name:                 string;
  termNameId:           string | null;
  termName:             FinancialTermName | null;
  academicYear:         number;
  isActive:             boolean;
  invoicingCompletedAt: string | null;
}

interface InvoicingResult {
  succeeded:          number;
  skipped:            number;
  carriedForward?:    number;
  errors:             Array<{ studentId: string; admissionNumber: string; reason: string }>;
  classesWithoutFees: Array<{ form: number; stream: string | null; className: string }>;
  fatalError?:        string;
}

// ── Invoicing Result Panel ─────────────────────────────────────────────────

function InvoicingResultPanel({ result, termName, onClose }: {
  result: InvoicingResult;
  termName: string;
  onClose: () => void;
}) {
  const hasWarnings = result.classesWithoutFees.length > 0 || result.errors.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-dark-surface shadow-xl border border-line dark:border-dark-border animate-scale-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-border shrink-0">
          <div className="flex items-center gap-2">
            {result.fatalError ? (
              <AlertTriangle className="h-5 w-5 text-danger" />
            ) : hasWarnings ? (
              <AlertTriangle className="h-5 w-5 text-warn" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-success" />
            )}
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">
              {termName} — Term created
            </h2>
          </div>
          <button onClick={onClose} className="text-slate hover:text-ink dark:text-dark-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {result.fatalError && (
            <p className="text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">
              {result.fatalError}
            </p>
          )}

          {/* Summary stats */}
          {!result.fatalError && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Invoiced",        value: result.succeeded,           color: "text-success" },
                { label: "Carried forward", value: result.carriedForward ?? 0, color: result.carriedForward ? "text-warn" : "text-slate dark:text-dark-muted" },
                { label: "Skipped",         value: result.skipped,             color: "text-slate dark:text-dark-muted" },
                { label: "Errors",          value: result.errors.length,       color: result.errors.length > 0 ? "text-danger" : "text-slate dark:text-dark-muted" },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-line dark:border-dark-border bg-paper dark:bg-dark-border/20 p-3 text-center">
                  <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate dark:text-dark-muted mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {(result.carriedForward ?? 0) > 0 && (
            <p className="text-xs text-slate dark:text-dark-muted bg-paper border border-line rounded-lg px-3 py-2 dark:bg-dark-border/20 dark:border-dark-border">
              {result.carriedForward} student{result.carriedForward !== 1 ? "s" : ""} had an unpaid balance from a previous term. Their opening balance has been recorded on this term&apos;s ledger.
            </p>
          )}

          {/* Classes without fee structures */}
          {result.classesWithoutFees.length > 0 && (
            <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warn shrink-0" />
                <p className="text-sm font-medium text-ink dark:text-dark-text">
                  {result.classesWithoutFees.length} class{result.classesWithoutFees.length !== 1 ? "es" : ""} without a fee structure
                </p>
              </div>
              <p className="text-xs text-slate dark:text-dark-muted">
                Students in these classes were not invoiced. Set up fee structures for them and re-run invoicing.
              </p>
              <ul className="space-y-1 mt-2">
                {result.classesWithoutFees.map(c => (
                  <li key={`${c.form}:${c.stream ?? ""}`} className="flex items-center gap-2 text-sm text-ink dark:text-dark-text">
                    <Users className="h-3.5 w-3.5 text-warn shrink-0" />
                    {c.className}
                  </li>
                ))}
              </ul>
              <a
                href="/staff/finance/fee-structures"
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-teal underline"
              >
                Go to Fee Structures →
              </a>
            </div>
          )}

          {/* Per-student errors */}
          {result.errors.length > 0 && (
            <div className="rounded-xl border border-danger/20 bg-danger-bg/40 p-4 space-y-2">
              <p className="text-sm font-medium text-danger">
                {result.errors.length} student{result.errors.length !== 1 ? "s" : ""} could not be invoiced
              </p>
              <ul className="space-y-1 max-h-32 overflow-y-auto">
                {result.errors.map(e => (
                  <li key={e.studentId} className="text-xs text-slate dark:text-dark-muted">
                    <span className="font-mono">{e.admissionNumber}</span> — {e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!result.fatalError && result.succeeded > 0 && result.classesWithoutFees.length === 0 && result.errors.length === 0 && (
            <p className="text-sm text-slate dark:text-dark-muted">
              All students have been invoiced successfully for this term.
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-line dark:border-dark-border shrink-0">
          <button onClick={onClose} className={primaryButtonClass}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ───────────────────────────────────────────────────

function DeleteConfirmModal({ term, onClose, onDeleted }: {
  term:      Term;
  onClose:   () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function confirm() {
    setDeleting(true);
    setError(null);
    try {
      const res  = await fetch(`/api/finance/terms/${term.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to delete."); setDeleting(false); return; }
      onDeleted(term.id);
    } catch {
      setError("Network error. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface shadow-xl border border-line dark:border-dark-border animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-border">
          <h2 className="text-base font-semibold text-ink dark:text-dark-text">Delete term?</h2>
          <button onClick={onClose} className="text-slate hover:text-ink dark:text-dark-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {error && (
            <p className="text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">{error}</p>
          )}
          <p className="text-sm text-ink dark:text-dark-text">
            You are about to permanently delete <span className="font-semibold">{term.termName?.name ?? term.name} ({term.academicYear})</span>.
          </p>
          <p className="text-sm text-slate dark:text-dark-muted">
            This will also delete all invoices, ledger entries, and payments linked to this term. Student balances will be reversed accordingly. <span className="font-medium text-danger">This cannot be undone.</span>
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-line text-sm font-medium text-slate hover:text-ink hover:bg-paper dark:border-dark-border dark:text-dark-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={deleting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-danger text-white text-sm font-medium hover:bg-danger/90 disabled:opacity-60 transition-colors"
            >
              {deleting ? "Deleting…" : "Delete term"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Term Modal ─────────────────────────────────────────────────────────────

interface ModalProps {
  existing?:  Term;
  termNames:  FinancialTermName[];
  onClose:    () => void;
  onSaved:    (t: Term, invoicing?: InvoicingResult) => void;
}

const inputCls =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

const labelCls = "block text-sm font-medium text-ink dark:text-dark-text mb-1";

function TermModal({ existing, termNames, onClose, onSaved }: ModalProps) {
  const isEdit   = !!existing;
  const thisYear = new Date().getFullYear();

  const [termNameId,   setTermNameId]   = useState(existing?.termNameId ?? "");
  const [academicYear, setAcademicYear] = useState(String(existing?.academicYear ?? thisYear));
  const [isActive,     setIsActive]     = useState(existing?.isActive ?? true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!termNameId) { setError("Please select a term."); return; }
    const selectedName = termNames.find(t => t.id === termNameId);
    if (!selectedName) { setError("Invalid term selected."); return; }

    setSaving(true);
    try {
      const body = {
        name:         selectedName.name,
        termNameId,
        academicYear: parseInt(academicYear, 10),
        isActive,
      };

      const url    = isEdit ? `/api/finance/terms/${existing!.id}` : "/api/finance/terms";
      const method = isEdit ? "PUT" : "POST";

      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 422 && data.classesWithoutFees?.length > 0) {
          setError(
            `Cannot create term — these classes have no fee structure: ${(data.classesWithoutFees as { name: string }[]).map(c => c.name).join(", ")}. Set up fee structures first.`
          );
        } else {
          setError(data.error ?? "Failed to save.");
        }
        setSaving(false);
        return;
      }

      onSaved(data.term, data.invoicing);
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-dark-surface shadow-xl border border-line dark:border-dark-border animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-border">
          <h2 className="text-base font-semibold text-ink dark:text-dark-text">
            {isEdit ? "Edit term" : "Add term"}
          </h2>
          <button onClick={onClose} className="text-slate hover:text-ink dark:text-dark-muted dark:hover:text-dark-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          {error && (
            <p className="text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div>
            <label className={labelCls}>Term</label>
            {termNames.length === 0 ? (
              <p className="text-sm text-slate dark:text-dark-muted">
                No term names configured yet. Go to{" "}
                <a href="/staff/finance/settings" className="text-teal underline">Finance Settings</a>
                {" "}and create financial academic terms first.
              </p>
            ) : (
              <select value={termNameId} onChange={e => setTermNameId(e.target.value)} className={inputCls} required>
                <option value="">— Select a term —</option>
                {termNames.map(tn => <option key={tn.id} value={tn.id}>{tn.name}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className={labelCls}>Academic Year</label>
            <input
              type="number" min={2000} max={2100}
              value={academicYear}
              onChange={e => setAcademicYear(e.target.value)}
              className={inputCls}
              required
            />
            <p className="text-xs text-slate mt-1 dark:text-dark-muted">The calendar year this term runs in, e.g. 2025.</p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-line accent-teal"
            />
            <span className="text-sm text-ink dark:text-dark-text">Set as current term (mark as active)</span>
          </label>
          <p className="text-xs text-slate -mt-2 dark:text-dark-muted">
            Only one term should be active at a time. Activating this term will indicate the current billing period.
          </p>

          {!isEdit && (
            <p className="text-xs text-slate bg-paper border border-line rounded-lg px-3 py-2 dark:bg-dark-border/20 dark:border-dark-border dark:text-dark-muted">
              When you add this term, all students will be automatically invoiced based on their class fee structures. All classes must have a fee structure configured before a term can be created.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-line text-sm font-medium text-slate hover:text-ink hover:bg-paper dark:border-dark-border dark:text-dark-muted">
              Cancel
            </button>
            <button type="submit" disabled={saving || termNames.length === 0} className={primaryButtonClass}>
              {saving ? (isEdit ? "Saving…" : "Creating & invoicing…") : isEdit ? "Save changes" : "Add term"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function TermsPage() {
  const [terms,          setTerms]          = useState<Term[]>([]);
  const [termNames,      setTermNames]      = useState<FinancialTermName[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [modal,          setModal]          = useState<"add" | Term | null>(null);
  const [invoicingPanel, setInvoicingPanel] = useState<{ result: InvoicingResult; termName: string } | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<Term | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [termsRes, namesRes] = await Promise.all([
        fetch("/api/finance/terms"),
        fetch("/api/finance/academic-term-names"),
      ]);
      if (!termsRes.ok) throw new Error("Failed to load terms");
      const termsData = await termsRes.json();
      const namesData = namesRes.ok ? await namesRes.json() : { termNames: [] };
      setTerms(termsData.terms ?? []);
      setTermNames(namesData.termNames ?? []);
    } catch {
      setError("Could not load terms. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSaved(t: Term, invoicing?: InvoicingResult) {
    setTerms(prev => {
      const idx = prev.findIndex(x => x.id === t.id);
      return idx >= 0 ? prev.map(x => x.id === t.id ? t : x) : [t, ...prev];
    });
    setModal(null);
    // Show invoicing result for new terms only
    if (invoicing) {
      setInvoicingPanel({ result: invoicing, termName: t.termName?.name ?? t.name });
    }
  }

  function handleDeleted(id: string) {
    setTerms(prev => prev.filter(t => t.id !== id));
    setDeleteTarget(null);
  }

  return (
    <div>
      <PageHeader
        title="Terms"
        description="Configure financial academic terms. Adding a term automatically invoices all students."
        action={
          <button className={primaryButtonClass} onClick={() => setModal("add")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add term
          </button>
        }
      />

      {termNames.length === 0 && !loading && (
        <div className="mb-5 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-ink dark:text-dark-text">
          <span className="font-medium">Setup required:</span> No financial term names found. Go to{" "}
          <a href="/staff/finance/settings" className="text-teal underline font-medium">Finance Settings</a>
          {" "}to create term names (e.g. &quot;Term 1&quot;, &quot;Term 2&quot;) before adding terms here.
        </div>
      )}

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : terms.length === 0 ? (
        <EmptyState
          message="No terms configured yet."
          icon={<CalendarDays className="h-6 w-6" />}
          action={
            <button className={primaryButtonClass} onClick={() => setModal("add")}>
              <Plus className="h-4 w-4" />Add term
            </button>
          }
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Term</th>
                  <th className={premiumThClass}>Academic Year</th>
                  <th className={premiumThClass}>Status</th>
                  <th className={premiumThClass}></th>
                </tr>
              </thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={t.id} className={premiumTrClass}>
                    <td className={premiumTdClass}>
                      <p className="font-medium text-ink dark:text-dark-text">{t.termName?.name ?? t.name}</p>
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>{t.academicYear}</td>
                    <td className={premiumTdClass}>
                      <div className="flex items-center gap-2">
                        <Badge variant={t.isActive ? "success" : "default"}>
                          {t.isActive ? "Current term" : "Closed"}
                        </Badge>
                        {t.invoicingCompletedAt && (
                          <Badge variant="teal">Invoiced</Badge>
                        )}
                      </div>
                    </td>
                    <td className={premiumTdClass}>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setModal(t)}
                          disabled={!!t.invoicingCompletedAt}
                          title={t.invoicingCompletedAt ? "Invoicing completed — term locked" : "Edit term"}
                          className="text-slate hover:text-teal transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(t)}
                          title="Delete term"
                          className="text-slate hover:text-danger transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <TermModal
          existing={modal === "add" ? undefined : modal}
          termNames={termNames}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {invoicingPanel && (
        <InvoicingResultPanel
          result={invoicingPanel.result}
          termName={invoicingPanel.termName}
          onClose={() => setInvoicingPanel(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          term={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
