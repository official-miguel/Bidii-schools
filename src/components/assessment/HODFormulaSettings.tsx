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
 *   - A single exam-period selector at the top — formulas are saved per
 *     period, so switching to a period that has never been configured shows
 *     an empty (reset) set
 *   - One accordion card per subject in the HOD's department
 *   - Each card expands to an "All classes" row (the subject-wide formula for
 *     the whole school) followed by a row per class LEVEL the subject applies
 *     to. A level row covers every stream at that level, and falls back to
 *     the subject-wide formula when it has none of its own.
 *   - Each row: formula display + "Edit" button
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

interface Period {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent: boolean;
}

/** `form: 0` is the subject-wide entry — it applies to every class level. */
const SUBJECT_WIDE = 0;

interface FormulaConfig {
  id: string;
  subjectId: string;
  form: number;
  periodId: string;
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
  /** Every exam period at the school — formulas are saved per period. */
  periods: Period[];
  initialFormulas: FormulaConfig[];
  /** Distinct class levels registered at this school — used as the fallback
   *  when a subject has an empty applicableForms array. */
  schoolForms: number[];
  /** Maps each class level to its stream-free stage name, e.g. { 3: "Form 3" }.
   *  A formula always covers the whole level, never a single stream. */
  schoolFormLabels?: Record<number, string>;
}

type Tab = "frameworks" | "formulas";

// ── Shared style constants (matching ExamSetupTabs) ───────────────────────────

const FRAMEWORK_TYPE_LABELS: Record<string, string> = {
  EIGHT_FOUR_FOUR: "8-4-4 / KCSE",
  CBE: "CBE",
};

const FRAMEWORK_TYPE_COLORS: Record<string, string> = {
  EIGHT_FOUR_FOUR: "bg-amber-100 text-amber-800",
  CBE: "bg-blue-100 text-blue-800",
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

// ── Virtual papers — always available in the formula calculator ───────────────
// These are the three standard paper names every subject always has available
// in the formula builder, even before the actual paper records exist in the DB.
// At grading time the evaluator skips any paper whose score is null, so a
// formula that references Paper 2 is simply not evaluated until Paper 2 exists.
const VIRTUAL_PAPERS: Paper[] = [
  { id: "__virtual_p1", name: "Paper 1", maxMarks: 100, sortOrder: 0 },
  { id: "__virtual_p2", name: "Paper 2", maxMarks: 100, sortOrder: 1 },
  { id: "__virtual_p3", name: "Paper 3", maxMarks: 100, sortOrder: 2 },
];

/**
 * Merge real papers (from DB) with the virtual defaults.
 * Real papers take precedence — if Paper 1 already exists in the DB, the
 * virtual placeholder for it is removed. Any real paper beyond Paper 3 is
 * appended at the end.
 */
function mergeWithVirtuals(realPapers: Paper[]): { papers: Paper[]; hasVirtuals: boolean } {
  const realNames = new Set(realPapers.map((p) => p.name.trim().toLowerCase()));
  const virtuals = VIRTUAL_PAPERS.filter(
    (v) => !realNames.has(v.name.toLowerCase())
  );
  const merged = [...realPapers, ...virtuals].sort((a, b) => a.sortOrder - b.sortOrder);
  return { papers: merged, hasVirtuals: virtuals.length > 0 };
}

// ── FormulaCalculator modal (extracted from MarksheetGrid, self-contained) ────

function FormulaCalculator({
  papers: realPapers,
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

  // Always show Paper 1 / 2 / 3 — merge real papers with virtual placeholders.
  const { papers, hasVirtuals } = useMemo(() => mergeWithVirtuals(realPapers), [realPapers]);

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

  const digitBtn = "flex items-center justify-center h-10 w-10 rounded-lg bg-card border border-border text-sm font-medium text-foreground hover:bg-teal-50 hover:border-teal/40 active:bg-teal-100 transition-colors focus:outline-none focus:ring-2 focus:ring-teal/30 select-none";
  const opBtn    = "flex items-center justify-center h-10 w-10 rounded-lg bg-teal-50 border border-teal/20 text-sm font-semibold text-teal hover:bg-teal-100 hover:border-teal/40 active:bg-teal-100 transition-colors focus:outline-none focus:ring-2 focus:ring-teal/30 select-none";
  const paperBtn = "inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal-dark active:bg-teal-dark transition-colors focus:outline-none focus:ring-2 focus:ring-teal/40 select-none shrink-0";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md mx-0 sm:mx-4 overflow-hidden flex flex-col max-h-[90dvh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">% Formula</h2>
            <p className="text-xs text-slate mt-0.5">Build how the percentage is calculated.</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate hover:text-foreground hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Display bar */}
          <div className="relative">
            <div ref={displayRef}
              className="min-h-[2.75rem] w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm font-mono text-foreground overflow-x-auto whitespace-nowrap scrollbar-none">
              {expr || <span className="text-slate/50 font-sans italic text-xs">Tap paper names and operators…</span>}
            </div>
            {expr.trim() && (
              <span className={`absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${isValid ? "bg-success" : "bg-danger"}`} />
            )}
          </div>
          {/* Paper chips */}
          <div>
            <p className="text-xs font-medium text-slate mb-2 uppercase tracking-wide">Papers</p>
            {hasVirtuals && (
              <p className="text-xs text-warn-foreground bg-warn border border-warn/30 rounded-lg px-3 py-2 mb-2 leading-relaxed">
                <span className="font-semibold">Note:</span> Papers shown with a dashed border haven&apos;t been added to the marksheet yet.
                The formula will only calculate once those papers exist and have scores entered.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {papers.map((p) => {
                const isVirtual = p.id.startsWith("__virtual_");
                return (
                  <button key={p.id} type="button" onClick={() => append(p.name)}
                    className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-teal/40 select-none shrink-0 ${
                      isVirtual
                        ? "border-2 border-dashed border-teal/40 text-teal/70 hover:bg-teal/5"
                        : "bg-teal text-white hover:bg-teal-dark"
                    }`}
                  >
                    <FileText className="w-3 h-3 opacity-80" />
                    {p.name}
                    {isVirtual
                      ? <span className="opacity-50 text-[10px]">(not added yet)</span>
                      : <span className="opacity-60 text-[10px]">/{p.maxMarks}</span>
                    }
                  </button>
                );
              })}
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
            <div className="rounded-lg border border-border bg-muted px-3 py-2.5">
              <p className="text-xs font-medium text-slate uppercase tracking-wide mb-1">Sample preview</p>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate">Using max marks as sample input</span>
                <span className={`font-medium tabular-nums ${previewResult === null ? "text-slate/50" : "text-foreground"}`}>
                  {previewResult === null ? "Invalid formula" : `${Math.round(previewResult * 10) / 10}%`}
                </span>
              </div>
            </div>
          )}
          {/* Tip */}
          <p className="text-xs text-slate/70 leading-relaxed">
            Example:{" "}
            <span className="font-mono bg-muted px-1 rounded">
              {realPapers.length >= 2
                ? `(${realPapers[0].name} / ${realPapers[0].maxMarks}) * 40 + (${realPapers[1].name} / ${realPapers[1].maxMarks}) * 60`
                : `(Paper 1 / 80) * 40 + (Paper 2 / 100) * 60`}
            </span>
          </p>
          {/* Actions */}
          <div className="flex items-center gap-2 border-t border-border sticky bottom-0 bg-card -mx-5 px-5 py-3 mt-0">
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
  frameworkId,
  periodId,
  departmentId,
  formulas,
  onFormulaChange,
  schoolForms,
  schoolFormLabels = {},
}: {
  subject: Subject;
  /** The 8-4-4 framework used only to look up this subject's papers. */
  frameworkId: string;
  /** The exam period these formulas belong to. */
  periodId: string;
  departmentId: string;
  formulas: FormulaConfig[];
  onFormulaChange: (config: FormulaConfig) => void;
  schoolForms: number[];
  schoolFormLabels?: Record<number, string>;
}) {
  const [open, setOpen] = useState(false);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [papersLoading, setPapersLoading] = useState(false);

  // Class levels this subject is taught at — the subject's own list, falling
  // back to every level the school has registered.
  const forms = subject.applicableForms.length > 0
    ? [...subject.applicableForms].sort((a, b) => a - b)
    : schoolForms;

  // Papers are the same for every level, so load them once per subject.
  useEffect(() => {
    if (!open || !frameworkId || !subject.id) return;
    setPapersLoading(true);
    fetch(`/api/assessments/papers?subjectId=${subject.id}&frameworkId=${frameworkId}`)
      .then((r) => r.json())
      .then((d) => setPapers(d.papers ?? []))
      .catch(() => setPapers([]))
      .finally(() => setPapersLoading(false));
  }, [open, subject.id, frameworkId]);

  // Formulas saved for this subject in the selected period only.
  const periodFormulas = formulas.filter(
    (f) => f.subjectId === subject.id && f.periodId === periodId && f.formula.trim() !== ""
  );
  const subjectWide = periodFormulas.find((f) => f.form === SUBJECT_WIDE);
  const formulaCount = periodFormulas.length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
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
            <p className="font-semibold text-foreground text-sm truncate">{subject.name}</p>
            <p className="text-xs text-slate mt-0.5">
              {subject.code} · {forms.map((f) => schoolFormLabels[f] ?? `Form ${f}`).join(", ")}
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
        <div className="border-t border-border divide-y divide-border">
          {/* Subject-wide row — one formula for every class taking this subject */}
          <FormFormulaRow
            subject={subject}
            form={SUBJECT_WIDE}
            formLabel="All classes"
            isSubjectWide
            periodId={periodId}
            departmentId={departmentId}
            papers={papers}
            papersLoading={papersLoading}
            formulas={formulas}
            onFormulaChange={onFormulaChange}
          />
          {/* Per-level rows — every stream at a level shares the same formula */}
          {forms.map((form) => (
            <FormFormulaRow
              key={form}
              subject={subject}
              form={form}
              formLabel={schoolFormLabels[form] ?? `Form ${form}`}
              periodId={periodId}
              departmentId={departmentId}
              papers={papers}
              papersLoading={papersLoading}
              formulas={formulas}
              inheritedFormula={subjectWide?.formula ?? ""}
              onFormulaChange={onFormulaChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── FormFormulaRow ─────────────────────────────────────────────────────────────
// One row inside a SubjectFormulaCard: the class level (or "All classes"),
// the formula it resolves to, and an edit button.

function FormFormulaRow({
  subject,
  form,
  formLabel,
  isSubjectWide = false,
  periodId,
  departmentId,
  papers,
  papersLoading,
  formulas,
  inheritedFormula = "",
  onFormulaChange,
}: {
  subject: Subject;
  /** Class level, or SUBJECT_WIDE (0) for the whole-subject row. */
  form: number;
  /** Stream-free label, e.g. "Form 3" or "All classes". */
  formLabel: string;
  isSubjectWide?: boolean;
  periodId: string;
  departmentId: string;
  papers: Paper[];
  papersLoading: boolean;
  formulas: FormulaConfig[];
  /** The subject-wide formula this level falls back to when it has none. */
  inheritedFormula?: string;
  onFormulaChange: (config: FormulaConfig) => void;
}) {
  const [showCalc, setShowCalc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The saved formula for this exact (subject, level, period)
  const savedConfig = formulas.find(
    (f) => f.subjectId === subject.id && f.form === form && f.periodId === periodId
  );
  const ownFormula = savedConfig?.formula ?? "";
  const hasOwnFormula = ownFormula.trim() !== "";

  // What this row actually grades with: its own formula, else the
  // subject-wide one, else nothing.
  const effectiveFormula = hasOwnFormula ? ownFormula : inheritedFormula.trim();
  const isInherited = !hasOwnFormula && effectiveFormula !== "";

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
          periodId,
          formula,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setSaveError(json.error ?? "Couldn't save formula."); return; }
      onFormulaChange({
        id: json.config.id,
        subjectId: subject.id,
        form,
        periodId,
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
      onFormulaChange({ ...savedConfig, formula: "" });
    } catch { /* silent */ }
    finally { setDeleting(false); }
  }

  return (
    <div className={`px-5 py-4 ${isSubjectWide ? "bg-royal/[0.03]" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        {/* Level label */}
        <div className="shrink-0 w-28">
          <span
            className={`inline-flex items-center justify-center rounded-lg text-xs font-semibold px-2.5 py-1.5 w-full ${
              isSubjectWide
                ? "bg-royal/10 text-royal"
                : "bg-slate-100 text-foreground"
            }`}
          >
            {formLabel}
          </span>
        </div>

        {/* Formula display */}
        <div className="flex-1 min-w-[160px]">
          {effectiveFormula ? (
            <div
              className={`rounded-lg border px-3 py-2 ${
                isInherited
                  ? "border-dashed border-royal/30 bg-royal/5"
                  : "border-teal/30 bg-teal/5"
              }`}
            >
              <p className="text-xs font-mono text-foreground truncate" title={effectiveFormula}>
                {effectiveFormula}
              </p>
              {isInherited && (
                <p className="text-[11px] text-royal/80 mt-0.5">
                  From the &ldquo;All classes&rdquo; formula — set one here to override it.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-2">
              <p className="text-xs text-slate italic">
                {isSubjectWide
                  ? "No subject-wide formula — each level uses its own, or the raw score"
                  : "No formula — uses raw score as percentage"}
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
              {hasOwnFormula ? "Edit formula" : "Set formula"}
            </button>
          )}
          {hasOwnFormula && !deleting && (
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
          formula={ownFormula}
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
      <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-slate">
        No active frameworks yet. The principal must create a framework first.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate">
        These are the active assessment frameworks for your school. Formulas you set
        in the <strong>Mark Formulas</strong> tab are saved per exam period, not per
        framework.
      </p>
      <div className="space-y-2">
        {frameworks.map((fw) => (
          <div
            key={fw.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-sm"
          >
            <span
              className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                FRAMEWORK_TYPE_COLORS[fw.type] ?? "bg-slate-100 text-slate-700"
              }`}
            >
              {FRAMEWORK_TYPE_LABELS[fw.type] ?? fw.type}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm">{fw.label}</p>
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
  periods,
  initialFormulas,
  schoolForms,
  schoolFormLabels = {},
}: HODFormulaSettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("formulas");
  const [formulas, setFormulas] = useState<FormulaConfig[]>(initialFormulas);

  // Formulas belong to one exam period at a time. Default to the current one.
  const [periodId, setPeriodId] = useState<string>(
    periods.find((p) => p.isCurrent)?.id ?? periods[0]?.id ?? ""
  );

  // Papers are looked up against the school's 8-4-4 framework — periods
  // themselves are shared across frameworks, so this is just a lookup key.
  const paperFrameworkId =
    frameworks.find((fw) => fw.type === "EIGHT_FOUR_FOUR" && fw.isActive)?.id ??
    frameworks.find((fw) => fw.type === "EIGHT_FOUR_FOUR")?.id ??
    "";

  const handleFormulaChange = useCallback((updated: FormulaConfig) => {
    setFormulas((prev) => {
      // Remove old entry for same (subjectId, form, periodId)
      const filtered = prev.filter(
        (f) =>
          !(f.subjectId === updated.subjectId &&
            f.form === updated.form &&
            f.periodId === updated.periodId)
      );
      // If formula is empty string, just remove it; otherwise upsert
      if (updated.formula.trim() === "") return filtered;
      return [...filtered, updated];
    });
  }, []);

  const selectedPeriod = periods.find((p) => p.id === periodId) ?? null;
  const periodFormulaCount = formulas.filter(
    (f) => f.periodId === periodId && f.formula.trim() !== ""
  ).length;

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "formulas",   label: "Mark Formulas" },
    { id: "frameworks", label: "Frameworks" },
  ];

  return (
    <div>
      {/* ── Tab bar — same style as ExamSetupTabs ── */}
      <div className="flex gap-1 mb-8 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? "border-royal text-royal"
                : "border-transparent text-slate hover:text-foreground"
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
            <h2 className="text-base font-semibold text-foreground mb-1">
              Mark Calculation Formulas
            </h2>
            <p className="text-sm text-slate">
              Set a custom percentage formula for each subject in{" "}
              <strong>{department.name}</strong>. A formula covers a whole class
              level — every stream at that level uses it — or the whole subject
              across the school. The formula uses paper names
              (e.g. <span className="font-mono bg-slate-100 px-1 rounded text-xs">Paper 1</span>,{" "}
              <span className="font-mono bg-slate-100 px-1 rounded text-xs">Paper 2</span>) defined in the
              marksheet. Whatever you set here is what every marksheet for that
              subject uses — a teacher&apos;s own formula in the marksheet is ignored.
              If no formula is set, the system uses the raw score directly.
            </p>
          </div>

          {/* Exam period selector — formulas are saved per period */}
          <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate mb-2">
              Exam period
            </label>
            {periods.length === 0 ? (
              <p className="text-sm text-slate italic">
                No exam periods yet. The principal must create one first.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[240px]">
                  <select
                    value={periodId}
                    onChange={(e) => setPeriodId(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-border bg-card pl-3 pr-8 py-2 text-sm text-foreground focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/20 transition-colors"
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.academicYear}){p.isCurrent ? " — current" : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
                </div>
                <p className="text-xs text-slate flex-1 min-w-[220px]">
                  {periodFormulaCount > 0 ? (
                    <>
                      <span className="font-medium text-foreground">{periodFormulaCount}</span>{" "}
                      formula{periodFormulaCount !== 1 ? "s" : ""} saved for{" "}
                      <span className="font-medium text-foreground">{selectedPeriod?.name}</span>.
                    </>
                  ) : (
                    <>
                      No formulas set for{" "}
                      <span className="font-medium text-foreground">{selectedPeriod?.name}</span> yet —
                      each exam period starts fresh.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          {periods.length === 0 ? null : subjects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-slate">
              No subjects in this department yet. The principal must add subjects to{" "}
              {department.name}.
            </div>
          ) : (
            <div className="space-y-3">
              {subjects.map((subject) => (
                <SubjectFormulaCard
                  key={`${subject.id}:${periodId}`}
                  subject={subject}
                  frameworkId={paperFrameworkId}
                  periodId={periodId}
                  departmentId={department.id}
                  formulas={formulas}
                  onFormulaChange={handleFormulaChange}
                  schoolForms={schoolForms}
                  schoolFormLabels={schoolFormLabels}
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
            <h2 className="text-base font-semibold text-foreground mb-1">
              Assessment Frameworks
            </h2>
            <p className="text-sm text-slate">
              Active frameworks your school is using. Formulas are linked to an exam
              period, so each period keeps its own set and a new period starts fresh.
            </p>
          </div>
          <FrameworksTab frameworks={frameworks} />
        </div>
      )}
    </div>
  );
}
