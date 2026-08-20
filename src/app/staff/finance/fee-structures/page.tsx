"use client";

import { useEffect, useState, useCallback } from "react";
import { Layers, Plus, Pencil, X } from "lucide-react";
import {
  PageHeader, EmptyState, Spinner, ErrorBanner, primaryButtonClass,
  premiumTableContainerClass, premiumTheadClass, premiumThClass,
  premiumTdClass, premiumTrClass,
} from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────

interface FeeStructure {
  id:             string;
  form:           number;
  stream:         string | null;
  boardingStatus: string | null;
  amountPerTerm:  string;
  createdAt:      string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatKES(s: string) {
  const n = parseFloat(s);
  return isNaN(n) ? s : `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
}

function rowLabel(s: FeeStructure) {
  const parts = [`Form ${s.form}`];
  if (s.stream) parts.push(s.stream);
  return parts.join(" – ");
}

function boardingLabel(b: string | null) {
  if (!b) return "All";
  return b === "DAY" ? "Day" : "Boarding";
}

// ── Modal ──────────────────────────────────────────────────────────────────

interface ModalProps {
  existing?: FeeStructure;
  onClose:   () => void;
  onSaved:   (s: FeeStructure) => void;
}

const inputCls =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink " +
  "focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal " +
  "dark:bg-dark-surface dark:border-dark-border dark:text-dark-text";

const labelCls = "block text-sm font-medium text-ink dark:text-dark-text mb-1";

function FeeStructureModal({ existing, onClose, onSaved }: ModalProps) {
  const isEdit = !!existing;

  const [form,           setForm]           = useState(existing ? String(existing.form) : "1");
  const [stream,         setStream]         = useState(existing?.stream ?? "");
  const [boardingStatus, setBoardingStatus] = useState(existing?.boardingStatus ?? "");
  const [amountPerTerm,  setAmountPerTerm]  = useState(existing ? existing.amountPerTerm : "");
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amount = parseFloat(amountPerTerm);
    if (isNaN(amount) || amount <= 0) {
      setError("Enter a valid amount per term.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        form:           parseInt(form, 10),
        stream:         stream.trim() || null,
        boardingStatus: boardingStatus || null,
        amountPerTerm:  amount,
      };

      const res = await fetch(
        isEdit
          ? `/api/finance/fee-structures/${existing!.id}`
          : "/api/finance/fee-structures",
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line dark:border-dark-border">
          <h2 className="text-base font-semibold text-ink dark:text-dark-text">
            {isEdit ? "Edit fee structure" : "Add fee structure"}
          </h2>
          <button onClick={onClose} className="text-slate hover:text-ink dark:text-dark-muted dark:hover:text-dark-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          {error && <p className="text-sm text-danger bg-danger-bg border border-danger/20 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className={labelCls}>Form</label>
            <select value={form} onChange={e => setForm(e.target.value)} className={inputCls} required>
              {[1, 2, 3, 4].map(n => (
                <option key={n} value={n}>Form {n}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Stream <span className="text-slate font-normal">(optional)</span></label>
            <input
              type="text"
              value={stream}
              onChange={e => setStream(e.target.value)}
              placeholder="e.g. North, South — leave blank for all streams"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Boarding type</label>
            <select value={boardingStatus} onChange={e => setBoardingStatus(e.target.value)} className={inputCls}>
              <option value="">All (Day &amp; Boarding)</option>
              <option value="DAY">Day only</option>
              <option value="BOARDING">Boarding only</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Amount per term (KES)</label>
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
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [modal,      setModal]      = useState<"add" | FeeStructure | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/finance/fee-structures");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setStructures(data.feeStructures ?? []);
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
      return idx >= 0
        ? prev.map(x => x.id === s.id ? s : x)
        : [s, ...prev];
    });
    setModal(null);
  }

  return (
    <div>
      <PageHeader
        title="Fee Structures"
        description="Define the base fee per form, stream, and boarding type."
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
          action={<button className={primaryButtonClass} onClick={() => setModal("add")}><Plus className="h-4 w-4" />Add structure</button>}
        />
      ) : (
        <div className={premiumTableContainerClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className={premiumTheadClass}>
                <tr>
                  <th className={premiumThClass}>Form / Stream</th>
                  <th className={premiumThClass}>Boarding</th>
                  <th className={`${premiumThClass} text-right`}>Amount / Term</th>
                  <th className={premiumThClass}></th>
                </tr>
              </thead>
              <tbody>
                {structures.map((s) => (
                  <tr key={s.id} className={premiumTrClass}>
                    <td className={premiumTdClass}>
                      <p className="font-medium text-ink dark:text-dark-text">{rowLabel(s)}</p>
                    </td>
                    <td className={`${premiumTdClass} text-slate dark:text-dark-muted`}>
                      {boardingLabel(s.boardingStatus)}
                    </td>
                    <td className={`${premiumTdClass} text-right tabular-nums font-semibold text-ink dark:text-dark-text`}>
                      {formatKES(s.amountPerTerm)}
                    </td>
                    <td className={premiumTdClass}>
                      <button
                        onClick={() => setModal(s)}
                        className="text-slate hover:text-teal transition-colors"
                        aria-label={`Edit ${rowLabel(s)}`}
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
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
