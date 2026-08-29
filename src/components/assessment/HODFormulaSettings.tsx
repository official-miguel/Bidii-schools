"use client";

/**
 * HODFormulaSettings
 *
 * Settings page client component for the HOD's department formula configuration.
 * Design matches ExamSetupTabs from the principal dashboard.
 *
 * Layout:
 *   Tab 1 — Frameworks (read-only list of active frameworks, for reference)
 *   Tab 2 — Mark Formulas (per-subject, per-form formula editor)
 *
 * Mark Formulas tab:
 *   - One accordion card per subject in the HOD's department
 *   - Each card expands to show a row per form the subject applies to
 *   - Each row: framework selector + formula display + "Edit" button
 *   - Edit opens the full FormulaCalculator modal (same as marksheet)
 *   - Saving calls PUT /api/assessments/department-formulas
 *   - Reset calls DELETE /api/assessments/department-formulas?id=
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ChevronDown, ChevronRight, FileText, Delete, X,
  CheckCircle2, Settings2, BookOpen,
} from "lucide-react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Subject {
  id: string;
  name: string;
  code: string;
  applicableForms: number[];
}

interface Framework {
  id: string;
  type: string;
  label: string;
  academicYear: string;
  isActive: boolean;
}

interface FormulaConfig {
  id: string;
  subjectId: string;
  form: number;
  frameworkId: string;
  formula: string;
  updatedAt: string;
}

interface Paper {
  id: string;
  name: string;
  maxMarks: number;
  sortOrder: number;
}

interface HODFormulaSettingsProps {
  department: { id: string; name: string };
  subjects: Subject[];
  frameworks: Framework[];
  initialFormulas: FormulaConfig[];
  /** Distinct form numbers registered at this school — used as the fallback
   *  when a subject has an empty applicableForms array. */
  schoolForms: number[];
}

type Tab = "frameworks" | "formulas";

// ── Shared style constants (matching ExamSetupTabs) ───────────────────────────

const FRAMEWORK_TYPE_LABELS: Record<string, string> = {
  EIGHT_FOUR_FOUR: "8-4-4 / KCSE",
  CBC: "CBC (Junior Secondary)",
  CBE: "CBE / TVET",
};

const FRAMEWORK_TYPE_COLORS: Record<string, string> = {
  EIGHT_FOUR_FOUR: "bg-amber-100 text-amber-800",
  CBC: "bg-blue-100 text-blue-800",
  CBE: "bg-green-100 text-green-800",
};

// ── Formula evaluator (same logic as MarksheetGrid) ───────────────────────────

function evaluateFormula(
  formula: string,
  papers: Paper[],
  scores: (number | null)[]
): number | null {
  if (!formula.trim()) return null;
  let expr = formula;
  const sorted = [...papers].sort((a, b) => b.name.length - a.name.length);
  for (const paper of sorted) {
    const idx = papers.findIndex((p) => p.id === paper.id);
    const score = scores[idx];
    if (score === null) return null;
    const escaped = paper.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expr = expr.replace(new RegExp(escaped, "g"), String(score));
  }
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expr});`)() as number;
    if (typeof result !== "number" || !isFinite(result) || isNaN(result)) return null;
    return result;
  } catch { return null; }
}

// ── FormulaCalculator modal (extracted from MarksheetGrid, self-contained) ────

function FormulaCalculator({
  papers,
  formula,
  onApply,
  onClose,
}: {
  papers: Paper[];
  formula: string;
  onApply: (f: string) => void;
  onClose: () => void;
}) {
  const [expr, setExpr] = useState(formula);
  const displayRef = useRef<HTMLDivElement>(null);

  function append(token: string) {
    setExpr((prev) => {
      const needsSpace = /[a-zA-Z0-9)]$/.test(prev) && /^[a-zA-Z(]/.test(token);
      return prev + (needsSpace ? " " : "") + token + (/^[a-zA-Z]/.test(token) ? " " : "");
    });
  }
  function appendOp(op: string) {
    setExpr((prev) => prev.trimEnd() + " " + op + " ");
  }
  function backspace() {
    setExpr((prev) => {
      const trimmed = prev.trimEnd();
      for (const p of [...papers].sort((a, b) => b.name.length - a.name.length)) {
        if (trimmed.endsWith(p.name))
          return trimmed.slice(0, trimmed.length - p.name.length).trimEnd();
      }
      return trimmed.slice(0, -1);
    });
  }

  // Sample preview using paper maxMarks
  const sampleScores = papers.map((p) => p.maxMarks);
  const previewResult = useMemo(
    () => evaluateFormula(expr, papers, sampleScores),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expr, papers]
  );
  const isValid = expr.trim() === "" || previewResult !== null;

  useEffect(() => {
    if (displayRef.current)
      displayRef.current.scrollLeft = displayRef.current.scrollWidth;
  }, [expr]);

  const digitBtn = "flex items-center justify-center h-10 w-10 rounded-lg bg-white border border-line text-sm font-medium text-ink hover:bg-teal-50 hover:border-teal/40 active:bg-teal-100 transition-colors focus:outline-none focus:ring-2 focus:ring-teal/30 select-none";
  const opBtn    = "flex items-center justify-center h-10 w-10 rounded-lg bg-teal-50 border border-teal/20 text-sm font-semibold text-teal hover:bg-teal-100 hover:border-teal/40 active:bg-teal-100 transition-colors focus:outline-none focus:ring-2 focus:ring-teal/30 select-none";
  const paperBtn = "inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal-dark active:bg-teal-dark transition-colors focus:outline-none focus:ring-2 focus:ring-teal/40 select-none shrink-0";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md mx-0 sm:mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-line">
          <div>
            <h2 className="text-base font-semibold text-ink">% Formula</h2>
            <p className="text-xs text-slate mt-0.5">Build how the percentage is calculated.</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate hover:text-ink hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Display bar */}
          <div className="relative">
            <div ref={displayRef}
              className="min-h-[2.75rem] w-full rounded-lg border border-line bg-slate-50 px-3 py-2 text-sm font-mono text-ink overflow-x-auto whitespace-nowrap scrollbar-none">
              {expr || <span className="text-slate/50 font-sans italic text-xs">Tap paper names and operators…</span>}
            </div>
            {expr.trim() && (
              <span className={`absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${isValid ? "bg-success" : "bg-danger"}`} />
            )}
          </div>
          {/* Paper chips */}
          <div>
            <p className="text-xs font-medium text-slate mb-2 uppercase tracking-wide">Papers</p>
            <div className="flex flex-wrap gap-2">
              {papers.map((p) => (
                <button key={p.id} type="button" onClick={() => append(p.name)} className={paperBtn}>
                  <FileText className="w-3 h-3 opacity-80" />
                  {p.name}
                  <span className="opacity-60 text-[10px]">/{p.maxMarks}</span>
                </button>
              ))}
              {papers.length === 0 && <p className="text-xs text-slate italic">No papers for this subject/framework yet — add them in the marksheet first.</p>}
            </div>
          </div>
          {/* Keyboard */}
          <div className="grid grid-cols-4 gap-2">
            {["7","8","9"].map((d) => <button key={d} type="button" onClick={() => append(d)} className={digitBtn}>{d}</button>)}
            <button type="button" onClick={() => appendOp("/")} className={opBtn}>÷</button>
            {["4","5","6"].map((d) => <button key={d} type="button" onClick={() => append(d)} className={digitBtn}>{d}</button>)}
            <button type="button" onClick={() => appendOp("*")} className={opBtn}>×</button>
            {["1","2","3"].map((d) => <button key={d} type="button" onClick={() => append(d)} className={digitBtn}>{d}</button>)}
            <button type="button" onClick={() => appendOp("-")} className={opBtn}>−</button>
            <button type="button" onClick={() => append("(")} className={opBtn}>(</button>
            <button type="button" onClick={() => append("0")} className={digitBtn}>0</button>
            <button type="button" onClick={() => append(")")} className={opBtn}>)</button>
            <button type="button" onClick={() => appendOp("+")} className={opBtn}>+</button>
            <button type="button" onClick={() => append(".")} className={digitBtn}>.</button>
            <div />
            <button type="button" onClick={backspace}
              className="flex items-center justify-center h-10 w-10 rounded-lg bg-warn-bg border border-warn/20 text-warn hover:bg-warn/20 transition-colors focus:outline-none focus:ring-2 focus:ring-warn/30 select-none">
              <Delete className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setExpr("")}
              className="flex items-center justify-center h-10 w-10 rounded-lg bg-danger-bg border border-danger/20 text-danger hover:bg-danger/10 transition-colors focus:outline-none focus:ring-2 focus:ring-danger/30 select-none text-xs font-semibold">
              C
            </button>
          </div>
          {/* Preview */}
          {expr.trim() && (
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2.5">
              <p className="text-xs font-medium text-slate uppercase tracking-wide mb-1">Sample preview</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate">Using max marks as sample input</span>
                <span className={`font-medium tabular-nums ${previewResult === null ? "text-slate/50" : "text-ink"}`}>
                  {previewResult === null ? "Invalid formula" : `${Math.round(previewResult * 10) / 10}%`}
                </span>
              </div>
            </div>
          )}
          {/* Tip */}
          <p className="text-xs text-slate/70 leading-relaxed">
            Example:{" "}
            <span className="font-mono bg-slate-100 px-1 rounded">
              {papers.length >= 2
                ? `(${papers[0].name} / ${papers[0].maxMarks}) * 40 + (${papers[1].name} / ${papers[1].maxMarks}) * 60`
                : papers.length === 1 ? `${papers[0].name} / ${papers[0].maxMarks} * 100` : "Paper 1 / 80 * 100"}
            </span>
          </p>
          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {formula && (
              <button type="button" onClick={() => { onApply(""); onClose(); }}
                className="text-xs text-slate hover:text-danger underline underline-offset-2 transition-colors mr-auto">
                Reset to default
              </button>
            )}
            <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
            <button type="button" disabled={expr.trim() !== "" && !isValid}
              onClick={() => { onApply(expr.trim()); onClose(); }} className={primaryButtonClass}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SubjectFormulaCard ─────────────────────────────────────────────────────────
// One accordion card per subject. Expands to show a row per applicable form.

function SubjectFormulaCard({
  subject,
  frameworks,
  departmentId,
  formulas,
  onFormulaChange,
  schoolForms,
}: {
  subject: Subject;
  frameworks: Framework[];
  departmentId: string;
  formulas: FormulaConfig[];
  onFormulaChange: (config: FormulaConfig) => void;
  schoolForms: number[];
}) {
  const [open, setOpen] = useState(false);

  // Use the subject's explicit form list; fall back to the school's registered forms
  const forms = subject.applicableForms.length > 0
    ? [...subject.applicableForms].sort((a, b) => a - b)
    : schoolForms;

  // Only show 8-4-4 frameworks — formula calculation is specific to this type
  const kcseFrameworks = frameworks.filter((fw) => fw.type === "EIGHT_FOUR_FOUR");

  const formulaCount = formulas.filter(
    (f) => f.subjectId === subject.id && f.formula.trim() !== ""
  ).length;

  return (
    <div className="rounded-xl border border-line bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-9 h-9 rounded-lg bg-royal/10 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-royal" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink text-sm truncate">{subject.name}</p>
            <p className="text-xs text-slate mt-0.5">
              {subject.code} · Forms {forms.join(", ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {formulaCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-teal bg-teal/10 rounded-full px-2.5 py-1">
              <CheckCircle2 className="w-3 h-3" />
              {formulaCount} formula{formulaCount !== 1 ? "s" : ""} set
            </span>
          )}
          {open
            ? <ChevronDown className="w-4 h-4 text-slate" />
            : <ChevronRight className="w-4 h-4 text-slate" />}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-line">
          {kcseFrameworks.length === 0 && (
            <div className="px-5 py-4 text-sm text-slate italic">
              No active 8-4-4 frameworks found. The principal must create a framework first.
            </div>
          )}
          {kcseFrameworks.length > 0 && (
            <div className="divide-y divide-line">
              {forms.map((form) => (
                <FormFormulaRow
                  key={form}
                  subject={subject}
                  form={form}
                  frameworks={kcseFrameworks}
                  departmentId={departmentId}
                  formulas={formulas}
                  onFormulaChange={onFormulaChange}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FormFormulaRow ─────────────────────────────────────────────────────────────
// One row inside a SubjectFormulaCard: form selector, framework selector,
// formula display and edit button.

function FormFormulaRow({
  subject,
  form,
  frameworks,
  departmentId,
  formulas,
  onFormulaChange,
}: {
  subject: Subject;
  form: number;
  frameworks: Framework[];
  departmentId: string;
  formulas: FormulaConfig[];
  onFormulaChange: (config: FormulaConfig) => void;
}) {
  const [selectedFrameworkId, setSelectedFrameworkId] = useState(
    frameworks[0]?.id ?? ""
  );
  const [papers, setPapers] = useState<Paper[]>([]);
  const [papersLoading, setPapersLoading] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The current saved formula for this (subject, form, framework)
  const savedConfig = formulas.find(
    (f) => f.subjectId === subject.id && f.form === form && f.frameworkId === selectedFrameworkId
  );
  const currentFormula = savedConfig?.formula ?? "";

  // Load papers when subject or framework changes
  useEffect(() => {
    if (!selectedFrameworkId || !subject.id) return;
    setPapersLoading(true);
    fetch(`/api/assessments/papers?subjectId=${subject.id}&frameworkId=${selectedFrameworkId}`)
      .then((r) => r.json())
      .then((d) => setPapers(d.papers ?? []))
      .catch(() => setPapers([]))
      .finally(() => setPapersLoading(false));
  }, [subject.id, selectedFrameworkId]);

  async function handleApply(formula: string) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/assessments/department-formulas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId,
          subjectId: subject.id,
          form,
          frameworkId: selectedFrameworkId,
          formula,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setSaveError(json.error ?? "Couldn't save formula."); return; }
      onFormulaChange({
        id: json.config.id,
        subjectId: subject.id,
        form,
        frameworkId: selectedFrameworkId,
        formula,
        updatedAt: json.config.updatedAt,
      });
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!savedConfig) return;
    setDeleting(true);
    try {
      await fetch(`/api/assessments/department-formulas?id=${savedConfig.id}`, {
        method: "DELETE",
      });
      onFormulaChange({
        ...savedConfig,
        formula: "",
      });
    } catch { /* silent */ }
    finally { setDeleting(false); }
  }

  const hasFormula = currentFormula.trim() !== "";

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Form label */}
        <div className="shrink-0 w-20">
          <span className="inline-flex items-center justify-center rounded-lg bg-slate-100 text-ink text-xs font-semibold px-2.5 py-1.5 w-full">
            Form {form}
          </span>
        </div>

        {/* Framework selector */}
        <div className="relative min-w-[180px]">
          <select
            value={selectedFrameworkId}
            onChange={(e) => setSelectedFrameworkId(e.target.value)}
            className="w-full appearance-none rounded-lg border border-line bg-white pl-3 pr-7 py-2 text-xs text-ink focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/20 transition-colors"
          >
            {frameworks.map((fw) => (
              <option key={fw.id} value={fw.id}>
                {fw.label} ({fw.academicYear})
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate" />
        </div>

        {/* Formula display */}
        <div className="flex-1 min-w-[160px]">
          {hasFormula ? (
            <div className="rounded-lg border border-teal/30 bg-teal/5 px-3 py-2">
              <p className="text-xs font-mono text-ink truncate" title={currentFormula}>
                {currentFormula}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line px-3 py-2">
              <p className="text-xs text-slate italic">
                No formula — uses raw score as percentage
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {papersLoading ? (
            <span className="text-xs text-slate animate-pulse">Loading papers…</span>
          ) : (
            <button
              type="button"
              onClick={() => setShowCalc(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-royal bg-royal/5 px-3 py-1.5 text-xs font-medium text-royal hover:bg-royal/10 transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {hasFormula ? "Edit formula" : "Set formula"}
            </button>
          )}
          {hasFormula && !deleting && (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1 text-xs text-slate hover:text-danger transition-colors"
              title="Remove formula"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {deleting && <span className="text-xs text-slate italic">Removing…</span>}
          {saving && <span className="text-xs text-slate italic">Saving…</span>}
        </div>
      </div>

      {saveError && (
        <p className="mt-2 text-xs text-danger">{saveError}</p>
      )}

      {/* Formula calculator modal */}
      {showCalc && (
        <FormulaCalculator
          papers={papers}
          formula={currentFormula}
          onApply={handleApply}
          onClose={() => setShowCalc(false)}
        />
      )}
    </div>
  );
}

// ── FrameworksTab ─────────────────────────────────────────────────────────────
// Read-only view of active frameworks (mirrors principal's FrameworkManager
// look but without edit controls).

function FrameworksTab({ frameworks }: { frameworks: Framework[] }) {
  if (frameworks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
        No active frameworks yet. The principal must create a framework first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate">
        These are the active assessment frameworks for your school. Formulas you set
        in the <strong>Mark Formulas</strong> tab are linked to a specific framework.
      </p>
      <div className="space-y-2">
        {frameworks.map((fw) => (
          <div
            key={fw.id}
            className="flex items-center gap-3 rounded-xl border border-line bg-white px-5 py-4 shadow-sm"
          >
            <span
              className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                FRAMEWORK_TYPE_COLORS[fw.type] ?? "bg-slate-100 text-slate-700"
              }`}
            >
              {FRAMEWORK_TYPE_LABELS[fw.type] ?? fw.type}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink text-sm">{fw.label}</p>
              <p className="text-xs text-slate mt-0.5">Academic year {fw.academicYear}</p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-success-bg text-success text-xs font-medium px-2.5 py-1">
              <CheckCircle2 className="w-3 h-3" />
              Active
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function HODFormulaSettings({
  department,
  subjects,
  frameworks,
  initialFormulas,
  schoolForms,
}: HODFormulaSettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("formulas");
  const [formulas, setFormulas] = useState<FormulaConfig[]>(initialFormulas);

  const handleFormulaChange = useCallback((updated: FormulaConfig) => {
    setFormulas((prev) => {
      // Remove old entry for same (subjectId, form, frameworkId)
      const filtered = prev.filter(
        (f) =>
          !(f.subjectId === updated.subjectId &&
            f.form === updated.form &&
            f.frameworkId === updated.frameworkId)
      );
      // If formula is empty string, just remove it; otherwise upsert
      if (updated.formula.trim() === "") return filtered;
      return [...filtered, updated];
    });
  }, []);

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "formulas",   label: "Mark Formulas" },
    { id: "frameworks", label: "Frameworks" },
  ];

  return (
    <div>
      {/* ── Tab bar — same style as ExamSetupTabs ── */}
      <div className="flex gap-1 mb-8 border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? "border-royal text-royal"
                : "border-transparent text-slate hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Mark Formulas tab ── */}
      {activeTab === "formulas" && (
        <div className="space-y-5">
          <div className="mb-2">
            <h2 className="text-base font-semibold text-ink mb-1">
              Mark Calculation Formulas
            </h2>
            <p className="text-sm text-slate">
              Set a custom percentage formula for each subject and form in{" "}
              <strong>{department.name}</strong>. The formula uses paper names
              (e.g. <span className="font-mono bg-slate-100 px-1 rounded text-xs">Paper 1</span>,{" "}
              <span className="font-mono bg-slate-100 px-1 rounded text-xs">Paper 2</span>) defined in the
              marksheet. If no formula is set, the system uses the raw score directly.
            </p>
          </div>

          {subjects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center text-sm text-slate">
              No subjects in this department yet. The principal must add subjects to{" "}
              {department.name}.
            </div>
          ) : (
            <div className="space-y-3">
              {subjects.map((subject) => (
                <SubjectFormulaCard
                  key={subject.id}
                  subject={subject}
                  frameworks={frameworks}
                  departmentId={department.id}
                  formulas={formulas}
                  onFormulaChange={handleFormulaChange}
                  schoolForms={schoolForms}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Frameworks tab ── */}
      {activeTab === "frameworks" && (
        <div>
          <div className="mb-6">
            <h2 className="text-base font-semibold text-ink mb-1">
              Assessment Frameworks
            </h2>
            <p className="text-sm text-slate">
              Active frameworks your school is using. Formulas are linked to a specific
              framework so they remain accurate as academic years change.
            </p>
          </div>
          <FrameworksTab frameworks={frameworks} />
        </div>
      )}
    </div>
  );
}
