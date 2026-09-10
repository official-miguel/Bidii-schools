"use client";

import { useState, FormEvent } from "react";
import {
  ErrorBanner,
  inputClass,
  primaryButtonClass,
} from "@/components/ui";

type SubjectWeight = {
  subject:      { id: string; name: string; code: string };
  sbaWeight:    number;
  examWeight:   number;
  sbaMaxMarks:  number;
  examMaxMarks: number;
  isDefault:    boolean;
};

export default function PathwayWeightsForm({
  initialWeights,
}: {
  initialWeights: SubjectWeight[];
}) {
  const [weights, setWeights] = useState<SubjectWeight[]>(initialWeights);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);

  function update(subjectId: string, field: keyof Omit<SubjectWeight, "subject" | "isDefault">, value: number) {
    setWeights((prev) =>
      prev.map((w) => {
        if (w.subject.id !== subjectId) return w;
        const next = { ...w, [field]: value, isDefault: false };
        // Auto-balance exam weight when SBA changes.
        if (field === "sbaWeight") next.examWeight = Math.round((1 - value) * 100) / 100;
        if (field === "examWeight") next.sbaWeight = Math.round((1 - value) * 100) / 100;
        return next;
      })
    );
    setSaved(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Validate sums
    for (const w of weights) {
      const sum = Math.round((w.sbaWeight + w.examWeight) * 100) / 100;
      if (sum !== 1) {
        setError(`Weights for ${w.subject.name} don't sum to 100% (got ${Math.round(sum * 100)}%).`);
        setSaving(false);
        return;
      }
    }

    const res = await fetch("/api/assessments/cbe/pathway-weights", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ items: weights.map((w) => ({
        subjectId:    w.subject.id,
        sbaWeight:    w.sbaWeight,
        examWeight:   w.examWeight,
        sbaMaxMarks:  w.sbaMaxMarks,
        examMaxMarks: w.examMaxMarks,
      })) }),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Couldn't save weights."); }
    else          { setSaved(true); }
    setSaving(false);
  }

  if (weights.length === 0) {
    return (
      <p className="text-slate text-sm">
        No subjects are configured for the active CBE framework yet. Add subjects first.
      </p>
    );
  }

  return (
    <form onSubmit={handleSave}>
      {error  && <ErrorBanner message={error} />}
      {saved  && <div className="mb-4 rounded-md bg-success-bg text-success text-sm px-3 py-2">Weights saved.</div>}

      <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background text-xs text-slate text-left">
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium text-center">SBA weight</th>
              <th className="px-4 py-3 font-medium text-center">SBA max marks</th>
              <th className="px-4 py-3 font-medium text-center">Exam weight</th>
              <th className="px-4 py-3 font-medium text-center">Exam max marks</th>
              <th className="px-4 py-3 font-medium text-center">Split</th>
            </tr>
          </thead>
          <tbody>
            {weights.map((w, i) => (
              <tr key={w.subject.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : "bg-background/40"}`}>
                <td className="px-4 py-3 font-medium text-foreground">
                  {w.subject.name}
                  <span className="ml-1 text-slate text-xs">({w.subject.code})</span>
                  {w.isDefault && <span className="ml-2 text-xs text-slate italic">default</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number" min={0} max={1} step={0.05}
                    value={w.sbaWeight}
                    onChange={(e) => update(w.subject.id, "sbaWeight", parseFloat(e.target.value) || 0)}
                    className={`${inputClass} w-20 text-center`}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number" min={1} step={1}
                    value={w.sbaMaxMarks}
                    onChange={(e) => update(w.subject.id, "sbaMaxMarks", parseInt(e.target.value) || 100)}
                    className={`${inputClass} w-20 text-center`}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number" min={0} max={1} step={0.05}
                    value={w.examWeight}
                    onChange={(e) => update(w.subject.id, "examWeight", parseFloat(e.target.value) || 0)}
                    className={`${inputClass} w-20 text-center`}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="number" min={1} step={1}
                    value={w.examMaxMarks}
                    onChange={(e) => update(w.subject.id, "examMaxMarks", parseInt(e.target.value) || 100)}
                    className={`${inputClass} w-20 text-center`}
                  />
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-slate text-xs">
                  {Math.round(w.sbaWeight * 100)}% / {Math.round(w.examWeight * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? "Saving…" : "Save weights"}
        </button>
      </div>
    </form>
  );
}
