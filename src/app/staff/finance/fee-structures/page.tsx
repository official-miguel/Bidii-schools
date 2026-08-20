"use client";

import { useEffect, useState, useCallback } from "react";
import { Layers, Plus, Pencil, X } from "lucide-react";
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

// ── Modal ──────────────────────────────────────────────────────────────────

interface ModalProps {
  existing?:  FeeStructure;
  classes:    SchoolClass[];
  termNames:  FinancialTermName[];
  onClose:    () => void;
  onSaved:    (s: FeeStructure) => void;
}

const inputCls =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

const labelCls = "block text-sm font-medium text-ink dark:text-dark-text mb-1";

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
      if (!res.ok) { setError(data.error ?? "Failed to save."); setSaving(false); return; }
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
          <h2 className="text-base font-semibold text-ink dark:text-dark-text">
            {isEdit ? "Edit fee structure" : "Add fee structure"}
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
          </div>

          {/* Stream */}
          <div>
            <label className={labelCls}>
              Stream <span className="text-slate font-normal">(optional)</span>
            </label>
            {streamsForForm.length > 0 ? (
              <select
                value={selectedStream}
                onChange={e => setSelectedStream(e.target.value)}
                className={inputCls}
              >
                <option value="">All streams</option>
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
          </div>

          {/* Term — from Financial Academic Term Names (Settings) */}
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
              >
                <option value="">— All terms —</option>
                {termNames.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
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
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [classes,    setClasses]    = useState<SchoolClass[]>([]);
  const [termNames,  setTermNames]  = useState<FinancialTermName[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [modal,      setModal]      = useState<"add" | FeeStructure | null>(null);

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

  return (
    <div>
      <PageHeader
        title="Fee Structures"
        description="Define the basic school fees per class, stream, and term."
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
                      <p className="font-medium text-ink dark:text-dark-text">
                        {classLabel(s, classes)}
                      </p>
                      {s.stream && (
                        <p className="text-xs text-slate dark:text-dark-muted">{s.stream}</p>
                      )}
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>
                      {s.termName?.name ?? "All terms"}
                    </td>
                    <td className={`${premiumTdClass} text-right tabular-nums font-semibold text-ink dark:text-dark-text`}>
                      {formatKES(s.amountPerTerm)}
                    </td>
                    <td className={premiumTdClass}>
                      <button
                        onClick={() => setModal(s)}
                        className="text-slate hover:text-teal transition-colors"
                        aria-label={`Edit ${classLabel(s, classes)}`}
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
        <FeeStructureModal
          existing={modal === "add" ? undefined : modal}
          classes={classes}
          termNames={termNames}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
