"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarDays, Plus, Pencil, X } from "lucide-react";
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

// ── Modal ──────────────────────────────────────────────────────────────────

interface ModalProps {
  existing?:    Term;
  termNames:    FinancialTermName[];
  onClose:      () => void;
  onSaved:      (t: Term) => void;
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

      const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save."); setSaving(false); return; }

      onSaved(data.term);
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

          {/* Term Name — from financial academic terms in Settings */}
          <div>
            <label className={labelCls}>Term</label>
            {termNames.length === 0 ? (
              <p className="text-sm text-slate dark:text-dark-muted">
                No term names configured yet. Go to{" "}
                <a href="/staff/finance/settings" className="text-teal underline">Finance Settings</a>
                {" "}and create financial academic terms first.
              </p>
            ) : (
              <select
                value={termNameId}
                onChange={e => setTermNameId(e.target.value)}
                className={inputCls}
                required
              >
                <option value="">— Select a term —</option>
                {termNames.map(tn => (
                  <option key={tn.id} value={tn.id}>{tn.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Academic Year — describes which year this term belongs to */}
          <div>
            <label className={labelCls}>Academic Year</label>
            <input
              type="number"
              min={2000}
              max={2100}
              value={academicYear}
              onChange={e => setAcademicYear(e.target.value)}
              className={inputCls}
              required
            />
            <p className="text-xs text-slate mt-1 dark:text-dark-muted">
              The calendar year this term runs in, e.g. 2025.
            </p>
          </div>

          {/* Mark as active */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-line accent-teal"
            />
            <span className="text-sm text-ink dark:text-dark-text">
              Set as current term (mark as active)
            </span>
          </label>
          <p className="text-xs text-slate -mt-2 dark:text-dark-muted">
            Only one term should be active at a time. Activating this term will indicate the current billing period.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-line text-sm font-medium text-slate hover:text-ink hover:bg-paper dark:border-dark-border dark:text-dark-muted"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving || termNames.length === 0} className={primaryButtonClass}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add term"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function TermsPage() {
  const [terms,      setTerms]      = useState<Term[]>([]);
  const [termNames,  setTermNames]  = useState<FinancialTermName[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [modal,      setModal]      = useState<"add" | Term | null>(null);

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

  function handleSaved(t: Term) {
    setTerms(prev => {
      const idx = prev.findIndex(x => x.id === t.id);
      return idx >= 0
        ? prev.map(x => x.id === t.id ? t : x)
        : [t, ...prev];
    });
    setModal(null);
  }

  return (
    <div>
      <PageHeader
        title="Terms"
        description="Configure financial academic terms and set the current billing period."
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
                      <p className="font-medium text-ink dark:text-dark-text">
                        {t.termName?.name ?? t.name}
                      </p>
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>
                      {t.academicYear}
                    </td>
                    <td className={premiumTdClass}>
                      <Badge variant={t.isActive ? "success" : "default"}>
                        {t.isActive ? "Current term" : "Closed"}
                      </Badge>
                    </td>
                    <td className={premiumTdClass}>
                      <button
                        onClick={() => setModal(t)}
                        disabled={!!t.invoicingCompletedAt}
                        title={t.invoicingCompletedAt ? "Invoicing completed — term locked" : "Edit term"}
                        className="text-slate hover:text-teal transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
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
    </div>
  );
}
