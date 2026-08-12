"use client";

/**
 * ExamFilterBar
 *
 * Cascading filter bar: Exam Period → Form → Stream → Subject
 *
 * Design principles:
 * - State is driven by explicit user actions and a single "initialise" effect
 *   that runs once when periods are first loaded.
 * - No cascading useEffects that override each other.
 * - onChange fires whenever the complete selection changes, debounced by a
 *   stable key to prevent duplicate calls.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import SearchableSelect from "@/components/SearchableSelect";
import { labelClass } from "@/components/ui";
import { AlertCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FilterSelection = {
  periodId: string;
  /** Empty string when "All streams" is chosen */
  classId: string;
  subjectId: string;
  form: number;
};

type Period = {
  id: string;
  name: string;
  academicYear: string;
  term: number | null;
  isCurrent?: boolean;
};

export type ExamFilterBarProps = {
  classes: { id: string; name: string; form: number }[];
  subjects: { id: string; name: string; applicableForms: number[] }[];
  hideSubject?: boolean;
  onChange: (selection: FilterSelection) => void;
  defaultClassId?: string;
  defaultSubjectId?: string;
  lockClass?: boolean;
  frameworkId?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function periodLabel(p: Period): string {
  if (p.term) return `Term ${p.term} — ${p.academicYear}`;
  return `${p.name} ${p.academicYear}`;
}

function FilterField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  searchPlaceholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string; sub?: string }[];
  placeholder: string;
  disabled?: boolean;
  searchPlaceholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[160px]">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder ?? "Search…"}
        disabled={disabled}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ExamFilterBar({
  classes,
  subjects,
  hideSubject = false,
  onChange,
  defaultClassId,
  defaultSubjectId,
  lockClass = false,
  frameworkId,
}: ExamFilterBarProps) {
  // ── Remote data ────────────────────────────────────────────────────────────
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [periodsError, setPeriodsError] = useState<string | null>(null);

  // ── Selection state ────────────────────────────────────────────────────────
  const [periodId, setPeriodId] = useState("");
  const [form,     setForm]     = useState<number | "">("");
  const [classId,  setClassId]  = useState("");
  const [subjectId, setSubjectId] = useState("");

  // Tracks last key we fired onChange for — prevents duplicate emissions
  const prevKey = useRef("");

  // ── Fetch periods ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setPeriodsLoading(true);
    setPeriodsError(null);
    setPeriodId("");
    setForm("");
    setClassId("");
    setSubjectId("");
    prevKey.current = "";

    // 30 s timeout — allow time for the database to respond under load
    const timer = setTimeout(() => controller.abort(), 30_000);

    const url = frameworkId
      ? `/api/assessments/periods?frameworkId=${encodeURIComponent(frameworkId)}`
      : "/api/assessments/periods";

    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        clearTimeout(timer);
        if (!r.ok) {
          const json = await r.json().catch(() => ({}));
          throw new Error(String((json as Record<string, unknown>).error ?? `HTTP ${r.status}`));
        }
        const json = await r.json();
        if (!Array.isArray(json.periods)) throw new Error("Invalid response");
        return json.periods as Period[];
      })
      .then((ps) => {
        if (cancelled) return;
        setPeriods(ps);
        const chosen = ps.find((p) => p.isCurrent) ?? ps[0];
        if (chosen) {
          setPeriodId(chosen.id);
          const forms = [...new Set(classes.map((c) => c.form))].sort((a, b) => a - b);
          let initialForm: number | "" = "";
          if (defaultClassId) {
            const match = classes.find((c) => c.id === defaultClassId);
            if (match) initialForm = match.form;
          }
          // Do NOT auto-select a form — default to "All forms" unless a
          // specific class was pre-selected (drill-down from a tile).
          setForm(initialForm);
          if (defaultClassId && initialForm !== "") {
            const match = classes.find((c) => c.id === defaultClassId && c.form === initialForm);
            if (match) setClassId(match.id);
          }
          if (!hideSubject) {
            if (defaultSubjectId) {
              const match = subjects.find((s) => s.id === defaultSubjectId);
              if (match) setSubjectId(match.id);
            } else {
              // Auto-select the first subject applicable to the resolved form
              const resolvedForm = typeof initialForm === "number" ? initialForm : null;
              const firstSubject = resolvedForm !== null
                ? subjects.find((s) => s.applicableForms.includes(resolvedForm))
                : subjects[0];
              if (firstSubject) setSubjectId(firstSubject.id);
            }
          }
        }
        setPeriodsLoading(false);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        // Aborted by cleanup (StrictMode or unmount) — stay in loading state
        // so the second effect run can complete normally.
        if (err instanceof Error && err.name === "AbortError") return;
        if (cancelled) return;
        setPeriodsError(err instanceof Error ? err.message : "Couldn't load exam periods.");
        setPeriodsLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameworkId]);

  // ── Derived options (pure computation, no side effects) ───────────────────

  const periodOptions = useMemo(() =>
    periods.map((p) => ({
      id: p.id,
      label: periodLabel(p),
      sub: p.isCurrent ? "Current" : undefined,
    })),
  [periods]);

  const availableForms = useMemo(() =>
    [...new Set(classes.map((c) => c.form))].sort((a, b) => a - b),
  [classes]);

  const formOptions = useMemo(() => [
    { id: "", label: "All forms" },
    ...availableForms.map((f) => ({ id: String(f), label: `Form ${f}` })),
  ], [availableForms]);

  const availableStreams = useMemo(() => {
    if (form === "") return [];
    return classes
      .filter((c) => c.form === form)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, form]);

  const streamOptions = useMemo(() => {
    if (availableStreams.length <= 1)
      return availableStreams.map((c) => ({ id: c.id, label: c.name }));
    return [
      { id: "", label: "All streams" },
      ...availableStreams.map((c) => ({ id: c.id, label: c.name })),
    ];
  }, [availableStreams]);

  const availableSubjects = useMemo(() => {
    if (form === "") return [];
    return subjects
      .filter((s) => s.applicableForms.includes(form as number))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [subjects, form]);

  const subjectOptions = useMemo(() =>
    availableSubjects.map((s) => ({ id: s.id, label: s.name })),
  [availableSubjects]);

  // ── Fire onChange when selection is complete ───────────────────────────────
  useEffect(() => {
    if (!periodId) return;
    const subjectReady = hideSubject || subjectId !== "";
    if (!subjectReady) return;

    const key = `${periodId}|${form}|${classId}|${subjectId}`;
    if (key === prevKey.current) return;
    prevKey.current = key;

    onChange({ periodId, classId, subjectId, form: form === "" ? 0 : (form as number) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId, form, classId, subjectId, hideSubject]);

  // ── User-driven handlers — each fully controls its own state ──────────────

  function handlePeriodChange(id: string) {
    prevKey.current = "";
    setPeriodId(id);
    // Don't reset form/stream/subject — keep the user's choices when they
    // switch period so they can compare the same class across periods.
  }

  function handleFormChange(id: string) {
    prevKey.current = "";
    const newForm = id === "" ? "" : parseInt(id, 10);
    setForm(newForm);
    setClassId("");
    if (!hideSubject && typeof newForm === "number") {
      const first = subjects.find((s) => s.applicableForms.includes(newForm));
      setSubjectId(first?.id ?? "");
    } else {
      setSubjectId("");
    }
  }

  function handleStreamChange(id: string) {
    prevKey.current = "";
    setClassId(id);
    setSubjectId("");
  }

  function handleSubjectChange(id: string) {
    prevKey.current = "";
    setSubjectId(id);
  }

  // ── Disabled states ────────────────────────────────────────────────────────
  const formDisabled    = periodsLoading || !periodId;
  const streamDisabled  = periodsLoading || !periodId || form === "";
  const subjectDisabled = streamDisabled;
  const showStream      = !lockClass || availableStreams.length > 1;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-wrap items-end gap-4 mb-6">

      {/* Exam Period */}
      <div className="flex flex-col gap-1.5 min-w-[200px]">
        <label htmlFor="ef-period" className={labelClass}>Exam period</label>
        {periodsLoading ? (
          <div className="h-[42px] rounded-lg border border-line bg-paper animate-pulse" />
        ) : periodsError ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2.5 text-xs text-danger">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{periodsError}</span>
          </div>
        ) : periods.length === 0 ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-2.5 text-xs text-slate">
            No exam periods set up yet
          </div>
        ) : (
          <SearchableSelect
            value={periodId}
            onChange={handlePeriodChange}
            options={periodOptions}
            placeholder="Select period"
            searchPlaceholder="Search periods…"
            disabled={periods.length <= 1}
          />
        )}
      </div>

      {/* Form */}
      <FilterField
        id="ef-form"
        label="Form"
        value={form === "" ? "" : String(form)}
        onChange={handleFormChange}
        options={formOptions}
        placeholder="Select form"
        searchPlaceholder="Search forms…"
        disabled={formDisabled}
      />

      {/* Stream */}
      {showStream && (
        <FilterField
          id="ef-stream"
          label="Stream"
          value={classId}
          onChange={handleStreamChange}
          options={streamOptions}
          placeholder="Select stream"
          searchPlaceholder="Search streams…"
          disabled={streamDisabled}
        />
      )}

      {/* Subject */}
      {!hideSubject && (
        <FilterField
          id="ef-subject"
          label="Subject"
          value={subjectId}
          onChange={handleSubjectChange}
          options={subjectOptions}
          placeholder="Select subject"
          searchPlaceholder="Search subjects…"
          disabled={subjectDisabled}
        />
      )}

    </div>
  );
}
