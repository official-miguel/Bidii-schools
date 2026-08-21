"use client";

import { useEffect, useState, useCallback } from "react";
import { Layers, Plus, Pencil, Trash2, X } from "lucide-react";
import {
  PageHeader, EmptyState, Spinner, ErrorBanner, primaryButtonClass,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface SchoolClass {
  id:     string;
  name:   string;
  form:   number;
  stream: string | null;
}

interface FinancialTermName {
  id:   string;
  name: string;
}

interface FeeStructure {
  id:            string;
  form:          number;
  stream:        string | null;
  termNameId:    string | null;
  termName:      FinancialTermName | null;
  amountPerTerm: string;
  createdAt:     string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function classLabel(s: FeeStructure, classes: SchoolClass[]) {
  const cls =
    classes.find(c => c.form === s.form && (c.stream ?? null) === (s.stream ?? null)) ??
    classes.find(c => c.form === s.form);
  return cls ? cls.name : `Form ${s.form}${s.stream ? ` – ${s.stream}` : ""}`;
}

const inputCls =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

const labelCls = "block text-sm font-medium text-ink dark:text-dark-text mb-1";

// ── Delete Confirm Modal ───────────────────────────────────────────────────

function DeleteConfirmModal({ structure, classes, onClose, onDeleted }: {
  structure: FeeStructure;
  classes:   SchoolClass[];
  onClose:   () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function confirm() {
    setDeleting(true);
    setError(null);
    try {
      const res  = await fetch(`/api/finance/fee-structures/${structure.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to delete."); setDeleting(false); return; }
      onDeleted(structure.id);
    } catch {
      setError("Network error. Please try again.");
      setDeleting(false);
    }
  }

  const label = classLabel(structure, classes);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-dark-surface shadow-xl border border-line dark:border-dark-border animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-border">
          <h2 className="text-base font-semibold text-ink dark:text-dark-text">Delete fee structure?</h2>
          <button onClick={onClose} className="text-slate hover:text-ink dark:text-dark-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {error && (
            <p className="text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">{error}</p>
          )}
          <p className="text-sm text-ink dark:text-dark-text">
            Delete the fee structure for <span className="font-semibold">{label}</span>
            {structure.stream && <span> ({structure.stream})</span>}
            {structure.termName && <span> — {structure.termName.name}</span>}?
          </p>
          <p className="text-xs text-slate dark:text-dark-muted">
            This only removes the fee definition. It does not affect any invoices already generated.
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
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add / Edit Modal ───────────────────────────────────────────────────────

interface ModalProps {
  existing?:  FeeStructure;
  classes:    SchoolClass[];
  termNames:  FinancialTermName[];
  onClose:    () => void;
  onSaved:    (s: FeeStructure) => void;
}

function FeeStructureModal({ existing, classes, termNames, onClose, onSaved }: ModalProps) {
  const isEdit = !!existing;

  const uniqueForms = Array.from(new Set(classes.map(c => c.form))).sort((a, b) => a - b);

  const defaultForm = existing
    ? String(existing.form)
    : uniqueForms.length > 0 ? String(uniqueForms[0]) : "1";

  const [selectedForm,   setSelectedForm]   = useState(defaultForm);
  const [selectedStream, setSelectedStream] = useState(existing?.stream ?? "");
  const [termNameId,     setTermNameId]     = useState(existing?.termNameId ?? "");
  const [amountPerTerm,  setAmountPerTerm]  = useState(existing?.amountPerTerm ?? "");
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const streamsForForm = classes
    .filter(c => c.form === parseInt(selectedForm, 10) && c.stream)
    .map(c => c.stream as string);

  useEffect(() => {
    if (!streamsForForm.includes(selectedStream)) setSelectedStream("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedForm]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amount = parseFloat(amountPerTerm);
    if (isNaN(amount) || amount <= 0) {
      setError("Enter a valid basic school fees amount.");
      return;
    }

    setSaving(true);
    try {
      // Always send form + stream + termNameId + amountPerTerm so the API
      // can enforce uniqueness correctly on both create and update.
      const body = {
        form:          parseInt(selectedForm, 10),
        stream:        selectedStream.trim() || null,
        termNameId:    termNameId || null,
        amountPerTerm: amount,
      };

      const res = await fetch(
        isEdit ? `/api/finance/fee-structures/${existing!.id}` : "/api/finance/fee-structures",
        {
          method:  isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save.");
        setSaving(false);
        return;
      }
      onSaved(data.feeStructure);
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-dark-surface shadow-xl border border-line dark:border-dark-border animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-border">
          <div>
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">
              {isEdit ? "Edit fee structure" : "Add fee structure"}
            </h2>
            {!isEdit && (
              <p className="text-xs text-slate dark:text-dark-muted mt-0.5">
                A stream-specific structure overrides the class default for students in that stream.
              </p>
            )}
          </div>
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

          {/* Class / Form */}
          <div>
            <label className={labelCls}>Class / Form</label>
            {uniqueForms.length === 0 ? (
              <p className="text-sm text-slate dark:text-dark-muted">
                No classes found. Please create classes first.
              </p>
            ) : (
              <select
                value={selectedForm}
                onChange={e => setSelectedForm(e.target.value)}
                className={inputCls}
                required
                disabled={isEdit}
              >
                {uniqueForms.map(f => {
                  const rep = classes.find(c => c.form === f && !c.stream) ?? classes.find(c => c.form === f);
                  return (
                    <option key={f} value={f}>
                      {rep ? rep.name.replace(/\s*[-–]\s*\w+$/, "") || `Form ${f}` : `Form ${f}`}
                    </option>
                  );
                })}
              </select>
            )}
            {isEdit && (
              <p className="text-xs text-slate mt-1 dark:text-dark-muted">
                Class cannot be changed on an existing structure. Delete and recreate if needed.
              </p>
            )}
          </div>

          {/* Stream */}
          <div>
            <label className={labelCls}>
              Stream <span className="text-slate font-normal">(optional — leave blank to apply to all streams)</span>
            </label>
            {streamsForForm.length > 0 ? (
              <select
                value={selectedStream}
                onChange={e => setSelectedStream(e.target.value)}
                className={inputCls}
                disabled={isEdit}
              >
                <option value="">All streams (default)</option>
                {streamsForForm.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value=""
                placeholder="No streams for this class"
                className={inputCls}
                disabled
              />
            )}
            {isEdit && streamsForForm.length > 0 && (
              <p className="text-xs text-slate mt-1 dark:text-dark-muted">
                Stream cannot be changed on an existing structure.
              </p>
            )}
          </div>

          {/* Term */}
          <div>
            <label className={labelCls}>Term</label>
            {termNames.length === 0 ? (
              <p className="text-sm text-slate dark:text-dark-muted">
                No term names configured yet. Go to{" "}
                <a href="/staff/finance/settings" className="text-teal underline">Finance Settings</a>
                {" "}to create term names first.
              </p>
            ) : (
              <select
                value={termNameId}
                onChange={e => setTermNameId(e.target.value)}
                className={inputCls}
                disabled={isEdit}
              >
                <option value="">— All terms (default) —</option>
                {termNames.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            {isEdit && (
              <p className="text-xs text-slate mt-1 dark:text-dark-muted">
                Term cannot be changed on an existing structure.
              </p>
            )}
          </div>

          {/* Basic School Fees */}
          <div>
            <label className={labelCls}>Basic School Fees (KES)</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={amountPerTerm}
              onChange={e => setAmountPerTerm(e.target.value)}
              placeholder="e.g. 15000"
              className={inputCls}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-line text-sm font-medium text-slate hover:text-ink hover:bg-paper dark:border-dark-border dark:text-dark-muted"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add structure"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FeeStructuresPage() {
  const [structures,   setStructures]   = useState<FeeStructure[]>([]);
  const [classes,      setClasses]      = useState<SchoolClass[]>([]);
  const [termNames,    setTermNames]    = useState<FinancialTermName[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [modal,        setModal]        = useState<"add" | FeeStructure | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeeStructure | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fsRes, clsRes, namesRes] = await Promise.all([
        fetch("/api/finance/fee-structures"),
        fetch("/api/classes"),
        fetch("/api/finance/academic-term-names"),
      ]);

      if (!fsRes.ok) throw new Error("Failed to load fee structures");

      const fsData    = await fsRes.json();
      const clsData   = clsRes.ok   ? await clsRes.json()   : [];
      const namesData = namesRes.ok ? await namesRes.json() : { termNames: [] };

      setStructures(fsData.feeStructures ?? []);
      setClasses(Array.isArray(clsData) ? clsData : []);
      setTermNames(namesData.termNames ?? []);
    } catch {
      setError("Could not load fee structures. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSaved(s: FeeStructure) {
    setStructures(prev => {
      const idx = prev.findIndex(x => x.id === s.id);
      return idx >= 0 ? prev.map(x => x.id === s.id ? s : x) : [s, ...prev];
    });
    setModal(null);
  }

  function handleDeleted(id: string) {
    setStructures(prev => prev.filter(s => s.id !== id));
    setDeleteTarget(null);
  }

  return (
    <div>
      <PageHeader
        title="Fee Structures"
        description="Define the basic school fees per class, stream, and term. A stream-specific structure overrides the class default."
        action={
          <button className={primaryButtonClass} onClick={() => setModal("add")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add structure
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : structures.length === 0 ? (
        <EmptyState
          message="No fee structures configured yet."
          icon={<Layers className="h-6 w-6" />}
          action={
            <button className={primaryButtonClass} onClick={() => setModal("add")}>
              <Plus className="h-4 w-4" />Add structure
            </button>
          }
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Class / Stream</th>
                  <th className={premiumThClass}>Term</th>
                  <th className={`${premiumThClass} text-right`}>Basic School Fees</th>
                  <th className={premiumThClass}></th>
                </tr>
              </thead>
              <tbody>
                {structures.map(s => (
                  <tr key={s.id} className={premiumTrClass}>
                    <td className={premiumTdClass}>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-ink dark:text-dark-text">
                          {classLabel(s, classes)}
                        </p>
                        {s.stream && (
                          <span className="text-xs bg-teal/10 text-teal font-medium px-1.5 py-0.5 rounded">
                            stream override
                          </span>
                        )}
                      </div>
                      {s.stream && (
                        <p className="text-xs text-slate dark:text-dark-muted mt-0.5">{s.stream}</p>
                      )}
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>
                      {s.termName?.name ?? "All terms"}
                    </td>
                    <td className={`${premiumTdClass} text-right tabular-nums font-semibold text-ink dark:text-dark-text`}>
                      {formatKES(s.amountPerTerm)}
                    </td>
                    <td className={premiumTdClass}>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setModal(s)}
                          className="text-slate hover:text-teal transition-colors"
                          aria-label={`Edit ${classLabel(s, classes)}`}
                          title="Edit amount"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(s)}
                          className="text-slate hover:text-danger transition-colors"
                          aria-label={`Delete ${classLabel(s, classes)}`}
                          title="Delete structure"
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
        <FeeStructureModal
          existing={modal === "add" ? undefined : modal}
          classes={classes}
          termNames={termNames}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          structure={deleteTarget}
          classes={classes}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
