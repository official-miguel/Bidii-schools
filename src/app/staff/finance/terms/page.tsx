"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarDays, Plus, Pencil, X } from "lucide-react";
import {
  PageHeader, Badge, EmptyState, Spinner, ErrorBanner, primaryButtonClass,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface Term {
  id:                   string;
  name:                 string;
  academicYear:         number;
  startDate:            string;
  endDate:              string;
  isActive:             boolean;
  invoicingCompletedAt: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });
}

/** Convert a Date to the "yyyy-MM-dd" string an <input type="date"> expects. */
function toDateInput(iso: string) {
  return iso.slice(0, 10);
}

// ── Modal ──────────────────────────────────────────────────────────────────

interface ModalProps {
  existing?: Term;
  onClose:   () => void;
  onSaved:   (t: Term) => void;
}

const inputCls =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

const labelCls = "block text-sm font-medium text-ink dark:text-dark-text mb-1";

function TermModal({ existing, onClose, onSaved }: ModalProps) {
  const isEdit = !!existing;
  const thisYear = new Date().getFullYear();

  const [name,         setName]         = useState(existing?.name ?? "");
  const [academicYear, setAcademicYear] = useState(String(existing?.academicYear ?? thisYear));
  const [startDate,    setStartDate]    = useState(existing ? toDateInput(existing.startDate) : "");
  const [endDate,      setEndDate]      = useState(existing ? toDateInput(existing.endDate) : "");
  const [isActive,     setIsActive]     = useState(existing?.isActive ?? true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim())  { setError("Term name is required."); return; }
    if (!startDate)    { setError("Start date is required."); return; }
    if (!endDate)      { setError("End date is required."); return; }
    if (endDate <= startDate) { setError("End date must be after start date."); return; }

    setSaving(true);
    try {
      // API expects ISO datetime strings
      const body = {
        name:         name.trim(),
        academicYear: parseInt(academicYear, 10),
        startDate:    new Date(startDate).toISOString(),
        endDate:      new Date(endDate).toISOString(),
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
          {error && <p className="text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className={labelCls}>Term name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Term 1 2025"
              className={inputCls}
              required
            />
          </div>

          <div>
            <label className={labelCls}>Academic year</label>
            <input
              type="number"
              min={2000}
              max={2100}
              value={academicYear}
              onChange={e => setAcademicYear(e.target.value)}
              className={inputCls}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>End date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className={inputCls}
                required
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-line accent-teal"
            />
            <span className="text-sm text-ink dark:text-dark-text">Mark as active term</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-line text-sm font-medium text-slate hover:text-ink hover:bg-paper dark:border-dark-border dark:text-dark-muted"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={primaryButtonClass}>
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
  const [terms,   setTerms]   = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [modal,   setModal]   = useState<"add" | Term | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/finance/terms");
      if (!res.ok) throw new Error("Failed to load terms");
      const data = await res.json();
      setTerms(data.terms ?? []);
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
        description="Configure academic term periods and their billing windows."
        action={
          <button className={primaryButtonClass} onClick={() => setModal("add")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add term
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : terms.length === 0 ? (
        <EmptyState
          message="No terms configured yet."
          icon={<CalendarDays className="h-6 w-6" />}
          action={<button className={primaryButtonClass} onClick={() => setModal("add")}><Plus className="h-4 w-4" />Add term</button>}
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Term</th>
                  <th className={premiumThClass}>Year</th>
                  <th className={premiumThClass}>Start</th>
                  <th className={premiumThClass}>End</th>
                  <th className={premiumThClass}>Status</th>
                  <th className={premiumThClass}></th>
                </tr>
              </thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={t.id} className={premiumTrClass}>
                    <td className={premiumTdClass}>
                      <p className="font-medium text-ink dark:text-dark-text">{t.name}</p>
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>
                      {t.academicYear}
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>
                      {formatDate(t.startDate)}
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>
                      {formatDate(t.endDate)}
                    </td>
                    <td className={premiumTdClass}>
                      <Badge variant={t.isActive ? "success" : "default"}>
                        {t.isActive ? "Active" : "Closed"}
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
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
