"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2, X, FileText, Delete, Plus } from "lucide-react";
import {
  scoreToGrade,
  subjectScore,
  gradeColour,
  type KcseGrade,
} from "@/lib/assessment/grading844";
import {
  ErrorBanner,
  EmptyState,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { SkeletonTable } from "@/components/ui/ProgressivePage";
import ExamFilterBar, { type FilterSelection } from "@/components/assessment/ExamFilterBar";

// ---------------------------------------------------------------------------
// Formula evaluator
// ---------------------------------------------------------------------------
// Evaluates a formula string like:
//   (Paper 1 / 80) * 40 + (Paper 2 / 100) * 60
// where paper names are replaced with their numeric raw score before eval.
//
// Returns null if any referenced paper has a null score (not entered yet) or
// if the formula itself is syntactically invalid / produces NaN/Infinity.
//
function evaluateFormula(
  formula: string,
  papers: Paper[],
  scores: (number | null)[]   // parallel to papers array
): number | null {
  if (!formula.trim()) return null;

  let expr = formula;

  // Replace paper names (longest first to avoid partial matches)
  const sorted = [...papers].sort((a, b) => b.name.length - a.name.length);
  for (let i = 0; i < sorted.length; i++) {
    const paper = sorted[i];
    const idx = papers.findIndex((p) => p.id === paper.id);
    const score = scores[idx];
    if (score === null) return null; // incomplete → no result
    // Escape special regex chars in paper name then replace globally
    const escaped = paper.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expr = expr.replace(new RegExp(escaped, "g"), String(score));
  }

  try {
    // Use Function constructor — safe here because the user built the formula
    // themselves through the button keyboard (no free-text injection path).
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expr});`)() as number;
    if (typeof result !== "number" || !isFinite(result) || isNaN(result)) return null;
    return result;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Period is still used for the label display inside the grid.
type Period = {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent?: boolean;
  frameworkId?: string;
};

type Paper = {
  id: string;
  name: string;
  maxMarks: number;
  sortOrder: number;
};

type StudentRow = {
  student: { id: string; fullName: string; admissionNumber: string };
  scores: Record<string, number | null>; // paperId → score
};

type MarksheetData = {
  period: Period & { frameworkId: string };
  subject: { id: string; name: string; code: string };
  schoolClass: { id: string; name: string; form: number };
  papers: Paper[];
  rows: StudentRow[];
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /** All classes the user can pick from (must include `form` for the filter chain). */
  classes: { id: string; name: string; form: number }[];
  /** All subjects the user can pick from (must include `applicableForms`). */
  subjects: { id: string; name: string; applicableForms: number[] }[];
  /** Pre-selected classId (e.g. locked to teacher's own class). */
  defaultClassId?: string;
  /** Pre-selected subjectId. */
  defaultSubjectId?: string;
  /** When true the Stream selector is hidden and the single class is auto-selected. */
  lockClass?: boolean;
  /** Read-only — no save button or cell editing. */
  readOnly?: boolean;
  /**
   * When true the user sees the "+ Paper" button.
   * Principals, HODs, Exam Officers should pass true.
   * Regular teachers pass false (default).
   */
  canManagePapers?: boolean;
  /**
   * When true the user sees the "%" formula button.
   * Should only be true for HOD / Exam Officer / Director / Principal.
   * Defaults to the value of canManagePapers when not explicitly set.
   */
  canUseFormula?: boolean;
};

// ---------------------------------------------------------------------------
// Cell component — a single score input
// ---------------------------------------------------------------------------

function ScoreCell({
  value,
  maxMarks,
  onChange,
  readOnly,
}: {
  value: number | null;
  maxMarks: number;
  onChange: (v: number | null) => void;
  readOnly: boolean;
}) {
  const [raw, setRaw] = useState(value === null ? "" : String(value));
  const [error, setError] = useState(false);

  const prevValue = useRef(value);
  useEffect(() => {
    if (prevValue.current !== value) {
      setRaw(value === null ? "" : String(value));
      setError(false);
      prevValue.current = value;
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    setRaw(text);
    if (text === "") { setError(false); onChange(null); return; }
    const num = parseFloat(text);
    if (isNaN(num) || num < 0 || num > maxMarks) { setError(true); return; }
    setError(false);
    onChange(num);
  }

  if (readOnly) {
    return (
      <span className="text-sm text-ink tabular-nums">
        {value === null ? <span className="text-slate/50">—</span> : value}
      </span>
    );
  }

  return (
    <input
      type="number"
      min={0}
      max={maxMarks}
      step={0.5}
      value={raw}
      onChange={handleChange}
      className={`w-16 rounded-md border px-2 py-1 text-sm tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-teal/20 focus:border-teal transition-colors ${
        error
          ? "border-danger bg-danger-bg/30 text-danger"
          : "border-line bg-white text-ink hover:border-teal/40"
      }`}
      placeholder="—"
    />
  );
}

// ---------------------------------------------------------------------------
// Grade badge
// ---------------------------------------------------------------------------

function GradeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate/50 text-xs">—</span>;
  const { grade } = scoreToGrade(pct);
  const { bg, text } = gradeColour(grade as KcseGrade);
  return (
    <span className={`inline-flex items-center justify-center min-w-[2rem] rounded-md px-1.5 py-0.5 text-xs font-semibold ${bg} ${text}`}>
      {grade}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EditableMaxMarks — click the "/80" to change a paper's max marks in-place
// ---------------------------------------------------------------------------

function EditableMaxMarks({
  paperId,
  maxMarks,
  onUpdated,
}: {
  paperId: string;
  maxMarks: number;
  onUpdated: (paperId: string, newMaxMarks: number) => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [value,   setValue]     = useState(String(maxMarks));
  const [saving,  setSaving]    = useState(false);
  const [error,   setError]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep in sync if parent changes the paper (e.g. after add-paper reload)
  useEffect(() => { setValue(String(maxMarks)); }, [maxMarks]);

  function startEdit() { setEditing(true); setValue(String(maxMarks)); setError(false); }

  async function commit() {
    const mm = parseInt(value, 10);
    if (isNaN(mm) || mm < 1 || mm > 9999) { setError(true); inputRef.current?.focus(); return; }
    if (mm === maxMarks) { setEditing(false); return; }
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/assessments/papers?paperId=${paperId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxMarks: mm }),
      });
      if (res.ok) { onUpdated(paperId, mm); setEditing(false); }
      else        { setError(true); }
    } catch { setError(true); }
    finally { setSaving(false); }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter")  { e.preventDefault(); commit(); }
    if (e.key === "Escape") { setEditing(false); setValue(String(maxMarks)); setError(false); }
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Click to change max marks"
        onClick={startEdit}
        className="block font-normal text-slate/60 hover:text-teal hover:underline transition-colors cursor-pointer text-xs"
      >
        /{maxMarks}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 mt-0.5">
      <span className="text-slate/60">/</span>
      <input
        ref={inputRef}
        autoFocus
        type="number"
        min={1}
        max={9999}
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(false); }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className={`w-14 rounded-md border px-1 py-0 text-xs text-center focus:outline-none focus:ring-2 focus:ring-teal/20 ${
          error
            ? "border-danger text-danger bg-red-50"
            : "border-teal/40 text-ink bg-white"
        }`}
      />
    </span>
  );
}



// ---------------------------------------------------------------------------
// DeletePaperButton — trash icon that asks "are you sure?" inline before
// calling DELETE /api/assessments/papers?paperId=
// ---------------------------------------------------------------------------

function DeletePaperButton({
  paper,
  onDeleted,
}: {
  paper: Paper;
  onDeleted: (paperId: string) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "deleting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleConfirm() {
    setPhase("deleting");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/assessments/papers?paperId=${paper.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (res.ok) {
        onDeleted(paper.id);
      } else {
        setErrorMsg(json.error ?? "Couldn't delete paper.");
        setPhase("error");
      }
    } catch {
      setErrorMsg("Couldn't delete paper.");
      setPhase("error");
    }
  }

  if (phase === "idle") {
    return (
      <button
        type="button"
        title={`Delete ${paper.name}`}
        onClick={() => setPhase("confirm")}
        className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded text-slate/40 hover:text-danger hover:bg-danger-bg transition-colors focus:outline-none focus:ring-1 focus:ring-danger/40"
      >
        <Trash2 className="w-3 h-3" strokeWidth={1.8} aria-hidden="true" />
      </button>
    );
  }

  if (phase === "confirm") {
    return (
      <span className="inline-flex items-center gap-1 mt-0.5 flex-wrap justify-center">
        <span className="text-xs text-danger font-medium whitespace-nowrap">Delete?</span>
        <button
          type="button"
          onClick={handleConfirm}
          className="text-xs px-1.5 py-0.5 rounded bg-danger text-white hover:bg-danger/80 transition-colors focus:outline-none focus:ring-1 focus:ring-danger/40"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          className="text-xs px-1.5 py-0.5 rounded border border-line text-slate hover:bg-paper transition-colors focus:outline-none focus:ring-1 focus:ring-slate/40"
        >
          No
        </button>
      </span>
    );
  }

  if (phase === "deleting") {
    return <span className="text-xs text-slate italic">Deleting…</span>;
  }

  // error phase
  return (
    <span className="inline-flex items-center gap-1 mt-0.5 flex-wrap justify-center">
      <span className="text-xs text-danger truncate max-w-[8rem]" title={errorMsg ?? ""}>{errorMsg}</span>
      <button
        type="button"
        onClick={() => setPhase("idle")}
        className="text-xs text-slate underline hover:text-ink"
      >
        Dismiss
      </button>
    </span>
  );
}


// ---------------------------------------------------------------------------
// FormulaCalculator — modal that lets the user build a % formula
// ---------------------------------------------------------------------------

function FormulaCalculator({
  papers,
  formula,
  onApply,
  onClose,
  previewRows,
}: {
  papers: Paper[];
  formula: string;
  onApply: (f: string) => void;
  onClose: () => void;
  /** A sample of resolved-score rows so we can show a live preview. */
  previewRows: { name: string; scores: (number | null)[]; isSample?: boolean }[];
}) {
  const [expr, setExpr] = useState(formula);
  const displayRef = useRef<HTMLDivElement>(null);

  // ── helpers ──────────────────────────────────────────────────────────────
  function append(token: string) {
    setExpr((prev) => {
      // Add a space around paper names and operators for readability,
      // but not around digits (so "42" stays as one token).
      const needsSpace = /[a-zA-Z0-9)]$/.test(prev) && /^[a-zA-Z(]/.test(token);
      const spaceBefore = needsSpace ? " " : "";
      const spaceAfter  = /^[a-zA-Z]/.test(token) ? " " : ""; // pad after paper name
      return prev + spaceBefore + token + spaceAfter;
    });
  }

  function appendOp(op: string) {
    setExpr((prev) => {
      const trimmed = prev.trimEnd();
      return trimmed + " " + op + " ";
    });
  }

  function backspace() {
    setExpr((prev) => {
      const trimmed = prev.trimEnd();
      // If the tail looks like a paper name, remove the whole word
      const paperNames = [...papers].sort((a, b) => b.name.length - a.name.length);
      for (const p of paperNames) {
        if (trimmed.endsWith(p.name)) {
          return trimmed.slice(0, trimmed.length - p.name.length).trimEnd();
        }
      }
      // Otherwise remove one character
      return trimmed.slice(0, -1);
    });
  }

  // ── live preview ─────────────────────────────────────────────────────────
  const preview = useMemo(() => {
    return previewRows.slice(0, 3).map((r) => ({
      name: r.name,
      isSample: r.isSample ?? false,
      result: evaluateFormula(expr, papers, r.scores),
    }));
  }, [expr, papers, previewRows]);

  const isValid = useMemo(
    () => expr.trim() === "" || preview.some((p) => p.result !== null),
    [expr, preview]
  );

  // Auto-scroll display to end when expression grows
  useEffect(() => {
    if (displayRef.current) {
      displayRef.current.scrollLeft = displayRef.current.scrollWidth;
    }
  }, [expr]);

  // ── button style helpers ─────────────────────────────────────────────────
  const digitBtn =
    "flex items-center justify-center h-10 w-10 rounded-lg bg-white border border-line text-sm font-medium text-ink hover:bg-teal-50 hover:border-teal/40 active:bg-teal-100 transition-colors focus:outline-none focus:ring-2 focus:ring-teal/30 select-none";
  const opBtn =
    "flex items-center justify-center h-10 w-10 rounded-lg bg-teal-50 border border-teal/20 text-sm font-semibold text-teal hover:bg-teal-100 hover:border-teal/40 active:bg-teal-100 transition-colors focus:outline-none focus:ring-2 focus:ring-teal/30 select-none";
  const paperBtn =
    "inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-teal text-white text-xs font-medium hover:bg-teal-dark active:bg-teal-dark transition-colors focus:outline-none focus:ring-2 focus:ring-teal/40 select-none shrink-0";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md mx-0 sm:mx-4 overflow-hidden animate-scale-in">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-line">
          <div>
            <h2 className="text-base font-semibold text-ink leading-tight">
              % Formula
            </h2>
            <p className="text-xs text-slate mt-0.5">
              Build how the percentage is calculated for this subject.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate hover:text-ink hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-teal/30"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* ── Formula display bar ── */}
          <div className="relative">
            <div
              ref={displayRef}
              className="min-h-[2.75rem] w-full rounded-lg border border-line bg-slate-50 px-3 py-2 text-sm font-mono text-ink overflow-x-auto whitespace-nowrap scrollbar-none"
            >
              {expr || <span className="text-slate/50 font-sans italic text-xs">Tap paper names and operators to build a formula…</span>}
            </div>
            {/* small live-validity dot */}
            {expr.trim() && (
              <span
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${
                  isValid ? "bg-success" : "bg-danger"
                }`}
              />
            )}
          </div>

          {/* ── Paper name chips ── */}
          <div>
            <p className="text-xs font-medium text-slate mb-2 uppercase tracking-wide">Papers</p>
            <div className="flex flex-wrap gap-2">
              {papers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => append(p.name)}
                  className={paperBtn}
                >
                  <FileText className="w-3 h-3 opacity-80" strokeWidth={1.8} aria-hidden="true" />
                  {p.name}
                  <span className="opacity-60 text-[10px]">/{p.maxMarks}</span>
                </button>
              ))}
              {papers.length === 0 && (
                <p className="text-xs text-slate italic">No papers added yet.</p>
              )}
            </div>
          </div>

          {/* ── Calculator keyboard ── */}
          <div className="grid grid-cols-4 gap-2">
            {/* Row 1: 7 8 9 ÷ */}
            {["7","8","9"].map((d) => (
              <button key={d} type="button" onClick={() => append(d)} className={digitBtn}>{d}</button>
            ))}
            <button type="button" onClick={() => appendOp("/")} className={opBtn}>÷</button>

            {/* Row 2: 4 5 6 × */}
            {["4","5","6"].map((d) => (
              <button key={d} type="button" onClick={() => append(d)} className={digitBtn}>{d}</button>
            ))}
            <button type="button" onClick={() => appendOp("*")} className={opBtn}>×</button>

            {/* Row 3: 1 2 3 − */}
            {["1","2","3"].map((d) => (
              <button key={d} type="button" onClick={() => append(d)} className={digitBtn}>{d}</button>
            ))}
            <button type="button" onClick={() => appendOp("-")} className={opBtn}>−</button>

            {/* Row 4: ( 0 ) + */}
            <button type="button" onClick={() => append("(")} className={opBtn}>(</button>
            <button type="button" onClick={() => append("0")} className={digitBtn}>0</button>
            <button type="button" onClick={() => append(")")} className={opBtn}>)</button>
            <button type="button" onClick={() => appendOp("+")} className={opBtn}>+</button>

            {/* Row 5: . [blank] ⌫ C */}
            <button type="button" onClick={() => append(".")} className={digitBtn}>.</button>
            <div /> {/* spacer */}
            <button
              type="button"
              onClick={backspace}
              className="flex items-center justify-center h-10 w-10 rounded-lg bg-warn-bg border border-warn/20 text-warn hover:bg-warn/20 transition-colors focus:outline-none focus:ring-2 focus:ring-warn/30 select-none"
              aria-label="Backspace"
            >
              <Delete className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setExpr("")}
              className="flex items-center justify-center h-10 w-10 rounded-lg bg-danger-bg border border-danger/20 text-danger hover:bg-danger/10 transition-colors focus:outline-none focus:ring-2 focus:ring-danger/30 select-none text-xs font-semibold"
            >
              C
            </button>
          </div>

          {/* ── Live preview ── */}
          {expr.trim() && (
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-slate uppercase tracking-wide">Preview</p>
                {preview.some((r) => r.isSample) && (
                  <span className="text-[10px] text-slate/60 italic">using max marks as sample</span>
                )}
              </div>
              {preview.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-0.5">
                  <span className="text-slate truncate max-w-[60%]">{p.name}</span>
                  <span className={`font-medium tabular-nums ${p.result === null ? "text-slate/50" : "text-ink"}`}>
                    {p.result === null ? "—" : `${Math.round(p.result * 10) / 10}%`}
                  </span>
                </div>
              ))}
              {previewRows.length === 0 && (
                <p className="text-xs text-slate italic">No papers added yet — add papers first.</p>
              )}
            </div>
          )}

          {/* ── Tip ── */}
          <p className="text-xs text-slate/70 leading-relaxed">
            Example: <span className="font-mono bg-slate-100 px-1 rounded">
              {papers.length >= 2
                ? `(${papers[0].name} / ${papers[0].maxMarks}) * 40 + (${papers[1].name} / ${papers[1].maxMarks}) * 60`
                : papers.length === 1
                  ? `${papers[0].name} / ${papers[0].maxMarks} * 100`
                  : `Paper 1 / 80 * 100`}
            </span>
          </p>

          {/* ── Actions ── */}
          <div className="flex items-center gap-2 pt-1">
            {formula && (
              <button
                type="button"
                onClick={() => { onApply(""); onClose(); }}
                className="text-xs text-slate hover:text-danger underline underline-offset-2 transition-colors mr-auto"
              >
                Reset to default
              </button>
            )}
            <button type="button" onClick={onClose} className={secondaryButtonClass}>
              Cancel
            </button>
            <button
              type="button"
              disabled={expr.trim() !== "" && !isValid}
              onClick={() => { onApply(expr.trim()); onClose(); }}
              className={primaryButtonClass}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function AddPaperModal({
  subjectId,
  frameworkId,
  existingCount,
  onClose,
  onAdded,
}: {
  subjectId: string;
  frameworkId: string;
  existingCount: number;
  onClose: () => void;
  onAdded: (paper: Paper) => void;
}) {
  const defaultName = `Paper ${existingCount + 1}`;
  const [name, setName] = useState(defaultName);
  const [maxMarks, setMaxMarks] = useState("100");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const mm = parseInt(maxMarks, 10);
    if (!name.trim()) { setError("Paper name is required."); return; }
    if (isNaN(mm) || mm < 1 || mm > 9999) { setError("Max marks must be between 1 and 9999."); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/assessments/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, frameworkId, name: name.trim(), maxMarks: mm }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Couldn't add paper."); return; }
      onAdded(json.paper as Paper);
    } catch {
      setError("Couldn't add paper.");
    } finally {
      setSaving(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-ink mb-1">Add paper</h2>
        <p className="text-xs text-slate mb-5">
          Teachers enter raw marks; the system converts them to a percentage automatically.
        </p>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Paper name</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paper 1"
              autoFocus
            />
          </div>

          <div>
            <label className={labelClass}>Out of (max marks)</label>
            <input
              type="number"
              min={1}
              max={9999}
              className={inputClass}
              value={maxMarks}
              onChange={(e) => setMaxMarks(e.target.value)}
              placeholder="100"
            />
            <p className="text-xs text-slate mt-1">
              Teachers enter the raw score (e.g. 47/80). The system calculates the percentage.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={secondaryButtonClass} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={primaryButtonClass}
            >
              {saving ? "Adding…" : "Add paper"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MarksheetGrid({
  classes,
  subjects,
  defaultClassId,
  defaultSubjectId,
  lockClass = false,
  readOnly = false,
  canManagePapers = false,
  canUseFormula,
}: Props) {
  // ── Filter selection (driven by ExamFilterBar) ─────────────────────────
  const [periodId,  setPeriodId]  = useState<string>("");
  const [classId,   setClassId]   = useState<string>(defaultClassId ?? classes[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState<string>(defaultSubjectId ?? "");

  // We keep a local copy of periods for the breadcrumb label only.
  const [periods, setPeriods] = useState<Period[]>([]);

  const handleFilterChange = useCallback((sel: FilterSelection) => {
    setPeriodId(sel.periodId);
    setClassId(sel.classId);
    setSubjectId(sel.subjectId);
  }, []);

  // Fetch periods list once so we can display the period name in the breadcrumb.
  useEffect(() => {
    fetch("/api/assessments/periods")
      .then((r) => r.json())
      .then((d) => { if (d.periods) setPeriods(d.periods); })
      .catch(() => {/* non-critical */});
  }, []);

  const [data, setData] = useState<MarksheetData | null>(null);
  const [edits, setEdits] = useState<Map<string, number | null>>(new Map());

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Add-paper modal state
  const [showAddPaper, setShowAddPaper] = useState(false);

  // Formula calculator state
  const [showFormula, setShowFormula] = useState(false);
  const [customFormula, setCustomFormula] = useState<string>("");
  // Whether the current customFormula was auto-loaded from the dept config
  const [formulaFromDept, setFormulaFromDept] = useState(false);

  // HOD/Principal/ExamOfficer gate — canUseFormula defaults to canManagePapers
  const formulaEnabled = canUseFormula ?? canManagePapers;

  // -------------------------------------------------------------------------
  // Load marksheet whenever filters change
  // -------------------------------------------------------------------------
  const loadMarksheet = useCallback(async () => {
    if (!periodId || !classId || !subjectId) return;
    setLoading(true);
    setLoadError(null);
    setData(null);
    setEdits(new Map());
    setSavedAt(null);

    try {
      const res = await fetch(
        `/api/assessments/marksheet?periodId=${periodId}&classId=${classId}&subjectId=${subjectId}`
      );
      const json = await res.json();
      if (!res.ok) { setLoadError(json.error ?? "Couldn't load marksheet."); return; }
      setData(json);
    } catch {
      setLoadError("Couldn't load marksheet.");
    } finally {
      setLoading(false);
    }
  }, [periodId, classId, subjectId]);

  useEffect(() => { loadMarksheet(); }, [loadMarksheet]);

  // -------------------------------------------------------------------------
  // Auto-load department formula when marksheet data is ready
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!data) return;
    const { frameworkId } = data.period;
    const form = data.schoolClass.form;
    const sid  = data.subject.id;
    fetch(
      `/api/assessments/department-formulas/for-marksheet?subjectId=${sid}&form=${form}&frameworkId=${frameworkId}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.formula && d.formula.trim()) {
          setCustomFormula(d.formula);
          setFormulaFromDept(true);
        } else {
          // Only reset to blank if no user override has been made yet
          setFormulaFromDept((prev) => {
            if (prev) setCustomFormula("");
            return false;
          });
        }
      })
      .catch(() => { /* non-critical */ });
  // Only re-run when the subject/class/framework changes, not on every edit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.period.frameworkId, data?.schoolClass.form, data?.subject.id]);

  // -------------------------------------------------------------------------
  // Edit handler
  // -------------------------------------------------------------------------
  const handleScoreChange = useCallback((studentId: string, paperId: string, value: number | null) => {
    setEdits((prev) => { const next = new Map(prev); next.set(`${studentId}:${paperId}`, value); return next; });
    setSavedAt(null);
  }, []);

  // Memoised resolver: given a studentId+paperId, returns the pending edit
  // value if one exists, otherwise falls back to the original stored score.
  // Re-created only when the edits Map reference changes.
  const resolveScore = useCallback((studentId: string, paperId: string, original: number | null) => {
    const key = `${studentId}:${paperId}`;
    return edits.has(key) ? edits.get(key)! : original;
  }, [edits]);

  // -------------------------------------------------------------------------
  // Save (batch)
  // -------------------------------------------------------------------------
  async function handleSave() {
    if (!data || edits.size === 0) return;
    setSaving(true);
    setSaveError(null);

    const items = Array.from(edits.entries()).map(([key, score]) => {
      const [studentId, paperId] = key.split(":");
      return { periodId, studentId, paperId, score };
    });

    try {
      const res = await fetch("/api/assessments/marksheet/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, items }),
      });
      const json = await res.json();
      if (!res.ok) { setSaveError(json.error ?? "Couldn't save marks."); return; }
      setSavedAt(Date.now());
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((row) => {
            const newScores = { ...row.scores };
            for (const paper of prev.papers) {
              const key = `${row.student.id}:${paper.id}`;
              if (edits.has(key)) newScores[paper.id] = edits.get(key)!;
            }
            return { ...row, scores: newScores };
          }),
        };
      });
      setEdits(new Map());
    } catch {
      setSaveError("Couldn't save marks.");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Paper added callback — append to current data without a full reload
  // -------------------------------------------------------------------------
  function handlePaperAdded(paper: Paper) {
    setShowAddPaper(false);
    setData((prev) => {
      if (!prev) return prev;
      // Append the new paper column; existing rows get null for this paper
      return {
        ...prev,
        papers: [...prev.papers, paper],
        rows: prev.rows.map((row) => ({
          ...row,
          scores: { ...row.scores, [paper.id]: null },
        })),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Max-marks updated callback — patch the paper in local state
  // -------------------------------------------------------------------------
  function handleMaxMarksUpdated(paperId: string, newMaxMarks: number) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        papers: prev.papers.map((p) =>
          p.id === paperId ? { ...p, maxMarks: newMaxMarks } : p
        ),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Paper deleted callback — remove column from local state
  // -------------------------------------------------------------------------
  function handlePaperDeleted(paperId: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        papers: prev.papers.filter((p) => p.id !== paperId),
        rows: prev.rows.map((row) => {
          const scores = { ...row.scores };
          delete scores[paperId];
          return { ...row, scores };
        }),
      };
    });
    // Drop any unsaved edits for this paper
    setEdits((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key.endsWith(`:${paperId}`)) next.delete(key);
      }
      return next;
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const hasEdits = edits.size > 0;
  const currentPeriodLabel = periods.find((p) => p.id === periodId);

  // Preview rows for the formula calculator.
  // When no marks have been entered yet we fall back to using each paper's
  // maxMarks as a sample value so the HOD can verify the formula shape even
  // before any scores are recorded.
  const formulaPreviewRows = useMemo(() => {
    if (!data) return [];

    const sampleRows = data.rows.slice(0, 3).map((row) => {
      const scores = data.papers.map((p) => {
        const resolved = resolveScore(row.student.id, p.id, row.scores[p.id] ?? null);
        // Fall back to maxMarks as a demo value when the cell is empty
        return resolved !== null ? resolved : p.maxMarks;
      });
      return { name: row.student.fullName, scores, isSample: scores.some((_, i) => resolveScore(row.student.id, data.papers[i].id, row.scores[data.papers[i].id] ?? null) === null) };
    });

    // If there are no student rows at all, produce one synthetic "Sample" row
    // using each paper's maxMarks so the preview is always meaningful.
    if (sampleRows.length === 0) {
      return [{
        name: "Sample student",
        scores: data.papers.map((p) => p.maxMarks),
        isSample: true,
      }];
    }

    return sampleRows;
  }, [data, resolveScore]);

  // Memoised array of paper maxMarks — avoids a new array allocation per row
  // in the render loop below.
  const paperMaxMarks = useMemo(
    () => data?.papers.map((p) => p.maxMarks) ?? [],
    [data?.papers]
  );

  // Pre-resolve all scores so each row render reads from a plain array rather
  // than calling resolveScore (which closes over edits Map) multiple times.
  const resolvedRows = useMemo(() => {
    if (!data) return [];
    return data.rows.map((row) => {
      const scores = data.papers.map((p) =>
        resolveScore(row.student.id, p.id, row.scores[p.id] ?? null)
      );
      const pct = customFormula.trim()
        ? evaluateFormula(customFormula, data.papers, scores)
        : subjectScore(scores, paperMaxMarks);
      return { row, scores, pct };
    });
  }, [data, resolveScore, paperMaxMarks, customFormula]);

  return (
    <div>
      {/* ---- Filter bar ---- */}
      <ExamFilterBar
        classes={classes}
        subjects={subjects}
        defaultClassId={defaultClassId}
        defaultSubjectId={defaultSubjectId}
        lockClass={lockClass}
        onChange={handleFilterChange}
      />

      {/* ---- Status banners ---- */}
      {savedAt && (
        <div className="mb-3 rounded-lg bg-success-bg border border-success/20 text-success text-sm px-4 py-2.5">
          Marks saved successfully.
        </div>
      )}
      {saveError && <ErrorBanner message={saveError} />}
      {loadError && <ErrorBanner message={loadError} />}

      {loading && (
        <div className="mt-4">
          <SkeletonTable rows={8} cols={4} hasAvatar={false} />
        </div>
      )}

      {!loading && data && data.rows.length === 0 && (
        <EmptyState message="No students in this class yet." />
      )}

      {/* ---- Grid ---- */}
      {!loading && data && data.rows.length > 0 && (
        <>
          {currentPeriodLabel && (
            <p className="text-xs text-slate/70 mb-3">
              {data.schoolClass.name} · {data.subject.name} ({data.subject.code}) ·{" "}
              {currentPeriodLabel.name}, {currentPeriodLabel.academicYear}
            </p>
          )}

          <div className="bg-white border border-line rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-line bg-slate-50/80 text-left text-xs text-slate font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 w-32 whitespace-nowrap">Adm. No.</th>
                    <th className="px-4 py-3 whitespace-nowrap">Student</th>

                    {/* ── Paper columns ── */}
                    {data.papers.map((p) => (
                      <th key={p.id} className="px-4 py-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center gap-0.5">
                          {p.name}
                          {canManagePapers && !readOnly && (
                            <DeletePaperButton paper={p} onDeleted={handlePaperDeleted} />
                          )}
                        </span>
                        {canManagePapers && !readOnly ? (
                          <EditableMaxMarks
                            paperId={p.id}
                            maxMarks={p.maxMarks}
                            onUpdated={handleMaxMarksUpdated}
                          />
                        ) : (
                          <span className="block font-normal text-slate/60 text-xs">/{p.maxMarks}</span>
                        )}
                      </th>
                    ))}

                    {/* ── Add Paper button ── */}
                    {canManagePapers && !readOnly && (
                      <th className="px-2 py-3 text-center">
                        <button
                          type="button"
                          title="Add paper"
                          onClick={() => setShowAddPaper(true)}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal text-white text-sm font-bold hover:bg-teal-dark transition-colors focus:outline-none focus:ring-2 focus:ring-teal/40"
                        >
                          +
                        </button>
                      </th>
                    )}

                    <th className="px-4 py-3 text-center whitespace-nowrap">
                      {formulaEnabled ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <button
                            type="button"
                            title={customFormula ? "Edit % formula" : "Set % formula"}
                            onClick={() => setShowFormula(true)}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-teal/30 ${
                              customFormula
                                ? "bg-teal text-white hover:bg-teal-dark"
                                : "bg-slate-100 text-slate hover:bg-teal-50 hover:text-teal"
                            }`}
                          >
                            %
                            <Plus className="w-2.5 h-2.5 opacity-70" strokeWidth={2.5} aria-hidden="true" />
                          </button>
                          {formulaFromDept && customFormula && (
                            <span className="text-[9px] font-medium text-teal/80 leading-none">dept</span>
                          )}
                        </div>
                      ) : (
                        <span>%</span>
                      )}
                    </th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedRows.map(({ row, scores: resolvedScores, pct }, i) => {
                    return (
                      <tr
                        key={row.student.id}
                        className={`border-b border-line last:border-0 transition-colors ${
                          i % 2 === 0 ? "bg-white hover:bg-slate-50/30" : "bg-slate-50/20 hover:bg-slate-50/40"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-slate bg-slate-50 border border-line rounded px-1.5 py-0.5">
                            {row.student.admissionNumber}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{row.student.fullName}</td>

                        {data.papers.map((p, pi) => (
                          <td key={p.id} className="px-4 py-3 text-center">
                            <ScoreCell
                              value={resolvedScores[pi]}
                              maxMarks={p.maxMarks}
                              onChange={(v) => handleScoreChange(row.student.id, p.id, v)}
                              readOnly={readOnly}
                            />
                          </td>
                        ))}

                        {/* Empty cell under the + button column */}
                        {canManagePapers && !readOnly && <td />}

                        <td className="px-4 py-3 text-center tabular-nums text-ink">
                          {pct !== null ? (
                            <span className="text-sm font-medium">{Math.round(pct * 10) / 10}%</span>
                          ) : (
                            <span className="text-slate/50 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <GradeBadge pct={pct} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ---- Save bar ---- */}
          {!readOnly && (
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-line">
              <p className="text-sm">
                {hasEdits ? (
                  <span className="text-amber-700 font-medium">
                    {edits.size} unsaved change{edits.size !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-slate/70">All changes saved.</span>
                )}
              </p>
              <div className="flex gap-2">
                {hasEdits && (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => { setEdits(new Map()); setSavedAt(null); }}
                  >
                    Discard
                  </button>
                )}
                <button
                  type="button"
                  className={primaryButtonClass}
                  disabled={saving || !hasEdits}
                  onClick={handleSave}
                >
                  {saving ? "Saving…" : "Save marks"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- Add Paper modal ---- */}
      {showAddPaper && data && (
        <AddPaperModal
          subjectId={data.subject.id}
          frameworkId={data.period.frameworkId}
          existingCount={data.papers.length}
          onClose={() => setShowAddPaper(false)}
          onAdded={handlePaperAdded}
        />
      )}

      {/* ---- Formula Calculator modal ---- */}
      {showFormula && data && (
        <FormulaCalculator
          papers={data.papers}
          formula={customFormula}
          onApply={setCustomFormula}
          onClose={() => setShowFormula(false)}
          previewRows={formulaPreviewRows}
        />
      )}
    </div>
  );
}
