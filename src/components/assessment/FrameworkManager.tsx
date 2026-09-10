"use client";

/**
 * FrameworkManager — manages assessment frameworks and their periods.
 *
 * Used inside the Exam Setup hub. The principal can:
 *  - See all frameworks (active / inactive)
 *  - Create a new framework (type + label + academic year)
 *  - Toggle active/inactive on existing ones
 *  - Expand a framework to manage its assessment periods
 *  - Create periods, set one as Current, delete empty periods
 */

import { useState, useEffect, FormEvent } from "react";
import { Plus } from "lucide-react";
import { useFormDraft } from "@/lib/hooks/useFormDraft";

// ── Types ──────────────────────────────────────────────────────────────────

type FrameworkType = "EIGHT_FOUR_FOUR" | "CBE";

interface Framework {
  id: string;
  type: FrameworkType;
  label: string;
  academicYear: string;
  isActive: boolean;
  createdAt: string;
  _count: { periods: number; items: number };
}

interface Period {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent: boolean;
  maxMarks: number | null;
  weight: number;
}

const FRAMEWORK_TYPE_LABELS: Record<FrameworkType, string> = {
  EIGHT_FOUR_FOUR: "8-4-4 / KCSE",
  CBE: "CBE (Junior & Senior)",
};

const FRAMEWORK_TYPE_COLORS: Record<FrameworkType, string> = {
  EIGHT_FOUR_FOUR: "bg-amber-100 text-amber-800",
  CBE: "bg-blue-100 text-blue-800",
};

// ── Helper: small inline classes ───────────────────────────────────────────

const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-md bg-royal px-3 py-1.5 text-sm font-medium text-white hover:bg-royal-dark transition-colors disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-royal-50 transition-colors disabled:opacity-50";
const btnDanger =
  "inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50";
const inputCls =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm placeholder:text-slate focus:outline-none focus:ring-2 focus:ring-royal/30";
const labelCls = "block text-xs font-medium text-slate mb-1";

// ── FrameworkManager ───────────────────────────────────────────────────────

export default function FrameworkManager() {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create framework form
  const [showCreate, setShowCreate] = useState(false);

  const [fwDraft, setFwDraft, clearFwDraft] = useFormDraft("bidii_draft_framework_create", {
    createType:  "EIGHT_FOUR_FOUR" as FrameworkType,
    createLabel: "",
    createYear:  new Date().getFullYear().toString(),
  });

  const [createType,  setCreateType]  = useState<FrameworkType>(fwDraft.createType);
  const [createLabel, setCreateLabel] = useState(fwDraft.createLabel);
  const [createYear,  setCreateYear]  = useState(fwDraft.createYear);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Persist framework create form on change
  useEffect(() => {
    if (!showCreate) return;
    setFwDraft({ createType, createLabel, createYear });
  }, [createType, createLabel, createYear, showCreate, setFwDraft]);

  // Expanded framework for period management
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────

  async function loadFrameworks() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assessments/frameworks");
      if (!res.ok) throw new Error("Failed to load frameworks");
      const data = await res.json();
      setFrameworks(data.frameworks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFrameworks();
  }, []);

  // ── Create framework ─────────────────────────────────────────────────────

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/assessments/frameworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: createType,
          label: createLabel,
          academicYear: createYear,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "Failed to create");
        return;
      }
      setFrameworks((prev) => [...prev, data.framework]);
      setShowCreate(false);
      setCreateLabel("");
      clearFwDraft();
      setExpandedId(data.framework.id);
    } finally {
      setCreating(false);
    }
  }

  // ── Toggle active ─────────────────────────────────────────────────────────

  async function toggleActive(fw: Framework) {
    const res = await fetch(`/api/assessments/frameworks/${fw.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !fw.isActive }),
    });
    if (res.ok) {
      const data = await res.json();
      setFrameworks((prev) =>
        prev.map((f) => (f.id === fw.id ? data.framework : f))
      );
    }
  }

  // ── Delete framework ──────────────────────────────────────────────────────

  async function handleDelete(fw: Framework) {
    if (
      !confirm(
        `Delete "${fw.label}"? This cannot be undone. (Only possible if no marks have been entered.)`
      )
    )
      return;
    const res = await fetch(`/api/assessments/frameworks/${fw.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Failed to delete");
      return;
    }
    setFrameworks((prev) => prev.filter((f) => f.id !== fw.id));
    if (expandedId === fw.id) setExpandedId(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-line/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
        {error}{" "}
        <button className="underline" onClick={loadFrameworks}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Framework list */}
      {frameworks.length === 0 && !showCreate && (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-slate">
          No assessment frameworks yet. Create one to get started.
        </div>
      )}

      {frameworks.map((fw) => (
        <div
          key={fw.id}
          className="rounded-xl border border-border bg-card overflow-hidden"
        >
          {/* Framework header row */}
          <div className="flex items-center gap-3 px-5 py-4">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${FRAMEWORK_TYPE_COLORS[fw.type]}`}
            >
              {FRAMEWORK_TYPE_LABELS[fw.type]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground truncate">
                {fw.label}
                <span className="ml-2 text-xs text-slate font-normal">
                  {fw.academicYear}
                </span>
              </p>
              <p className="text-xs text-slate mt-0.5">
                {fw._count.periods} period{fw._count.periods !== 1 ? "s" : ""}
                {fw._count.items > 0
                  ? ` · ${fw._count.items.toLocaleString()} assessment items`
                  : ""}
              </p>
            </div>
            {/* Status badge */}
            {fw.isActive ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium shrink-0">
                Active
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-line text-slate font-medium shrink-0">
                Inactive
              </span>
            )}
            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() =>
                  setExpandedId((prev) => (prev === fw.id ? null : fw.id))
                }
                className={btnSecondary}
              >
                {expandedId === fw.id ? "Close" : "Manage Periods"}
              </button>
              <button onClick={() => toggleActive(fw)} className={btnSecondary}>
                {fw.isActive ? "Deactivate" : "Activate"}
              </button>
              {fw._count.items === 0 && (
                <button
                  onClick={() => handleDelete(fw)}
                  className={btnDanger}
                  title="Delete framework"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Expanded: period management */}
          {expandedId === fw.id && (
            <div className="border-t border-border bg-background/40 px-5 py-4">
              <PeriodManager framework={fw} />
            </div>
          )}
        </div>
      ))}

      {/* Create framework form */}
      {showCreate ? (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-border bg-card px-5 py-5 space-y-4"
        >
          <p className="font-medium text-foreground text-sm">New Assessment Framework</p>
          {createError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {createError}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Framework type</label>
              <select
                value={createType}
                onChange={(e) => {
                  setCreateType(e.target.value as FrameworkType);
                  // Pre-fill a sensible default label
                  const labels: Record<FrameworkType, string> = {
                    EIGHT_FOUR_FOUR: "KCSE",
                    CBE: "CBE",
                  };
                  setCreateLabel(labels[e.target.value as FrameworkType]);
                }}
                className={inputCls}
              >
                {(
                  Object.entries(FRAMEWORK_TYPE_LABELS) as [
                    FrameworkType,
                    string
                  ][]
                ).map(([val, lab]) => (
                  <option key={val} value={val}>
                    {lab}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Label (display name)</label>
              <input
                required
                value={createLabel}
                onChange={(e) => setCreateLabel(e.target.value)}
                placeholder="e.g. KCSE 2026"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Academic year</label>
              <input
                required
                value={createYear}
                onChange={(e) => setCreateYear(e.target.value)}
                placeholder="e.g. 2026"
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" className={btnPrimary} disabled={creating}>
              {creating ? "Creating…" : "Create Framework"}
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setShowCreate(false);
                setCreateError(null);
                clearFwDraft();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => {
            setShowCreate(true);
            setCreateLabel("KCSE");
          }}
          className={btnPrimary}
        >
          <Plus className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
          Add Framework
        </button>
      )}
    </div>
  );
}

// ── PeriodManager ──────────────────────────────────────────────────────────

function PeriodManager({ framework }: { framework: Framework }) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // New period form fields
  const [pName, setPName] = useState("");
  const [pYear, setPYear] = useState(framework.academicYear);
  const [pTerm, setPTerm] = useState("");
  const [pMaxMarks, setPMaxMarks] = useState("100");
  const [pWeight, setPWeight] = useState("1");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function loadPeriods() {
    setLoading(true);
    setError(null);
    try {
      // Reuse the marksheet API — fetch all periods for this framework via
      // a dedicated endpoint. We'll derive a minimal filtered call.
      const res = await fetch(
        `/api/assessments/periods?frameworkId=${framework.id}`
      );
      if (!res.ok) throw new Error("Failed to load periods");
      const data = await res.json();
      // Filter client-side to this framework.
      const all: Period[] = data.periods ?? [];
      setPeriods(all);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPeriods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framework.id]);

  async function handleAddPeriod(e: FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/assessments/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frameworkId: framework.id,
          name: pName,
          academicYear: pYear,
          term: pTerm ? parseInt(pTerm, 10) : null,
          maxMarks: pMaxMarks ? parseFloat(pMaxMarks) : null,
          weight: parseFloat(pWeight) || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Failed to create");
        return;
      }
      setPeriods((prev) => [...prev, data.period]);
      setPName("");
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  }

  async function setCurrentPeriod(p: Period) {
    const res = await fetch(`/api/assessments/periods/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCurrent: true }),
    });
    if (res.ok) {
      setPeriods((prev) =>
        prev.map((x) => ({ ...x, isCurrent: x.id === p.id }))
      );
    }
  }

  async function deletePeriod(p: Period) {
    if (!confirm(`Delete period "${p.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/assessments/periods/${p.id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Failed to delete");
      return;
    }
    setPeriods((prev) => prev.filter((x) => x.id !== p.id));
  }

  if (loading) return <div className="h-10 rounded-md bg-line/40 animate-pulse" />;
  if (error)
    return (
      <p className="text-sm text-red-600">
        {error}{" "}
        <button className="underline" onClick={loadPeriods}>
          Retry
        </button>
      </p>
    );

  const is844 = framework.type === "EIGHT_FOUR_FOUR";

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate uppercase tracking-wide">
        Assessment Periods
      </p>

      {periods.length === 0 && (
        <p className="text-sm text-slate">
          No periods yet. Add one to start collecting marks.
        </p>
      )}

      {periods.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background text-left text-xs text-slate">
                <th className="px-4 py-2 font-medium">Period</th>
                {is844 && <th className="px-4 py-2 font-medium">Term</th>}
                <th className="px-4 py-2 font-medium">Year</th>
                {is844 && <th className="px-4 py-2 font-medium">Max Marks</th>}
                {is844 && <th className="px-4 py-2 font-medium">Weight</th>}
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-0 hover:bg-background/40"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">{p.name}</td>
                  {is844 && (
                    <td className="px-4 py-2.5 text-slate">
                      {p.term ? `Term ${p.term}` : "—"}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-slate">{p.academicYear}</td>
                  {is844 && (
                    <td className="px-4 py-2.5 text-slate tabular-nums">
                      {p.maxMarks ?? "—"}
                    </td>
                  )}
                  {is844 && (
                    <td className="px-4 py-2.5 text-slate tabular-nums">
                      {p.weight}
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    {p.isCurrent ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5">
                        Current
                      </span>
                    ) : (
                      <span className="text-slate text-xs">Past</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!p.isCurrent && (
                        <button
                          onClick={() => setCurrentPeriod(p)}
                          className="text-xs text-royal hover:underline"
                        >
                          Set Current
                        </button>
                      )}
                      <button
                        onClick={() => deletePeriod(p)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add period form */}
      {showAdd ? (
        <form
          onSubmit={handleAddPeriod}
          className="rounded-lg border border-border bg-card px-4 py-4 space-y-3"
        >
          <p className="text-sm font-medium text-foreground">New Period</p>
          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {saveError}
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>Period name</label>
              <input
                required
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="e.g. Mid-Term 1"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Academic year</label>
              <input
                required
                value={pYear}
                onChange={(e) => setPYear(e.target.value)}
                placeholder="2026"
                className={inputCls}
              />
            </div>
            {is844 && (
              <div>
                <label className={labelCls}>Term (optional)</label>
                <select
                  value={pTerm}
                  onChange={(e) => setPTerm(e.target.value)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  <option value="1">Term 1</option>
                  <option value="2">Term 2</option>
                  <option value="3">Term 3</option>
                </select>
              </div>
            )}
            {is844 && (
              <div>
                <label className={labelCls}>Max marks</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={pMaxMarks}
                  onChange={(e) => setPMaxMarks(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
            {is844 && (
              <div>
                <label className={labelCls}>Weight</label>
                <input
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={pWeight}
                  onChange={(e) => setPWeight(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" className={btnPrimary} disabled={saving}>
              {saving ? "Saving…" : "Add Period"}
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setShowAdd(false);
                setSaveError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className={btnSecondary}
        >
          <Plus className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
          Add Period
        </button>
      )}
    </div>
  );
}
