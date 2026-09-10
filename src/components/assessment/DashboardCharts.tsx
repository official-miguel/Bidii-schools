"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { gradeColour, ALL_GRADES, type KcseGrade } from "@/lib/assessment/grading844";
import { ErrorBanner, EmptyState } from "@/components/ui";
import ExamFilterBar, { type FilterSelection } from "@/components/assessment/ExamFilterBar";

// ---------------------------------------------------------------------------
// Types (mirrors the /api/assessments/dashboard response shape)
// ---------------------------------------------------------------------------

type SubjectPerformance = {
  subject: { id: string; name: string; code: string };
  meanScore: number | null;
  meanPoints: number | null;
  meanGrade: KcseGrade | null;
  studentCount: number;
};

type GradeDistEntry = { grade: KcseGrade; count: number };

type ClassComparison = {
  schoolClass: { id: string; name: string; form: number };
  meanPoints: number | null;
  meanGrade: KcseGrade | null;
  countA: number;
  countE: number;
  studentCount: number;
};

// Per-student subject scorecard (loaded when a single class is selected)
type ScorecardSubject = { id: string; name: string; code: string };
type ScorecardCell    = { pct: number | null; grade: KcseGrade | null; points: number | null };
type ScorecardRow     = {
  admissionNumber: string;
  fullName: string;
  className: string;          // populated for form-wide view
  subjects: ScorecardCell[];
  meanPoints: number | null;
  meanGrade: KcseGrade | null;
};
type ScorecardData    = {
  scopeLabel: string;         // e.g. "1 East" or "Form 1"
  subjects: ScorecardSubject[];
  rows: ScorecardRow[];
  meanFlagThreshold: number | null;
  multiClass: boolean;        // true when form filter used (no classId)
};

type TrendEntry = {
  period: { id: string; name: string; academicYear: string; term?: number | null };
  meanPoints: number | null;
};

type HeatmapRow = {
  subjectId: string;
  subjectName: string;
  classes: { classId: string; className: string; meanScore: number | null; meanPoints: number | null }[];
  totalMeanPoints: number | null;
};

type DashboardData = {
  filters: {
    periodId: string;
    classId?: string;
    subjectId?: string;
    form?: number;
  };
  summary: {
    overallMeanGrade: KcseGrade | null;
    overallMeanPoints: number | null;
    studentCount: number;
  };
  subjectPerformance: SubjectPerformance[];
  gradeDistribution: GradeDistEntry[];
  classComparison: ClassComparison[];
  trendData: TrendEntry[];
  subjectClassHeatmap: HeatmapRow[];
  heatmapClassSummary: {
    classId: string;
    className: string;
    meanScore: number | null;
    meanPoints: number | null;
  }[];
  heatmapTotalSummary: { meanScore: number | null; meanPoints: number } | null;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  classes: { id: string; name: string; form: number }[];
  subjects: { id: string; name: string; applicableForms: number[] }[];
  /** Pre-select a class in ExamFilterBar on first render (used by tile drill-down). */
  defaultClassId?: string;
  /** Pre-select a subject in ExamFilterBar on first render (used by tile drill-down). */
  defaultSubjectId?: string;
  /** Hide the filter bar entirely — used when drilling from tiles where filters are already determined. */
  hideFilters?: boolean;
};

// ---------------------------------------------------------------------------
// Small chart helpers (pure CSS bar charts — no external lib)
// ---------------------------------------------------------------------------

function HBar({
  value,
  max,
  colour,
}: {
  value: number;
  max: number;
  colour: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-line rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${colour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const MiniBar = memo(function MiniBar({
  value,
  max,
  label,
  selected,
  onClick,
}: {
  value: number;
  max: number;
  label: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const clickable = !!onClick && value > 0;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      title={clickable ? `${value} student${value !== 1 ? "s" : ""} with grade ${label} — click to view` : undefined}
      className={`flex flex-col items-center gap-1 min-w-[28px] rounded focus:outline-none focus:ring-1 focus:ring-royal/40 transition-opacity ${
        clickable ? "cursor-pointer hover:opacity-80" : "cursor-default"
      } ${selected ? "ring-2 ring-royal rounded" : ""}`}
    >
      <span className="text-[10px] tabular-nums text-slate">{value > 0 ? value : ""}</span>
      <div
        className={`w-5 rounded-sm overflow-hidden transition-colors ${selected ? "bg-royal/20" : "bg-line"}`}
        style={{ height: 48 }}
      >
        <div
          className={`w-full rounded-sm ${selected ? "bg-royal" : "bg-royal/60"}`}
          style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
        />
      </div>
      <span className={`text-[10px] font-medium ${selected ? "text-royal" : "text-slate"}`}>{label}</span>
    </button>
  );
});

// ---------------------------------------------------------------------------
// Section card wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Heat colour keyed on KCSE points (1–12 scale).
function heatColourPts(pts: number | null): string {
  if (pts === null) return "bg-background text-slate";
  if (pts >= 9)  return "bg-green-100 text-green-800";  // B and above
  if (pts >= 7)  return "bg-blue-100 text-blue-800";    // C+ / B-
  if (pts >= 5)  return "bg-amber-100 text-amber-800";  // C / C-
  if (pts >= 3)  return "bg-orange-100 text-orange-800"; // D / D+
  return "bg-red-100 text-red-800";                      // D- / E
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardCharts({ classes, subjects, defaultClassId, defaultSubjectId, hideFilters = false }: Props) {
  // ── Filter state — driven entirely by ExamFilterBar ───────────────────────
  const [periodId,  setPeriodId]  = useState("");
  const [classId,   setClassId]   = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [form,      setForm]      = useState(0);

  const handleFilterChange = useCallback((sel: FilterSelection) => {
    setPeriodId(sel.periodId);
    setClassId(sel.classId);
    setSubjectId(sel.subjectId);
    setForm(sel.form);
  }, []);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Grade drill-down ----
  type DrillStudent = {
    admissionNumber: string;
    fullName: string;
    className: string;
    meanPoints: number;
    meanGradeLabel: KcseGrade;
  };
  const [selectedGrade, setSelectedGrade] = useState<KcseGrade | null>(null);
  const [drillStudents, setDrillStudents] = useState<DrillStudent[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);

  // ---- Per-class scorecard (loaded when a single class is selected) ----
  const [scorecard, setScorecard]           = useState<ScorecardData | null>(null);
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [scorecardError, setScorecardError]     = useState<string | null>(null);

  // ---- Load dashboard data whenever filters change ----
  useEffect(() => {
    if (!periodId) return;

    const params = new URLSearchParams({ periodId });
    if (classId) params.set("classId", classId);
    if (subjectId) params.set("subjectId", subjectId);
    // When classId is empty (All streams) and form is set, pass form to API.
    if (!classId && form) params.set("form", String(form));

    const controller = new AbortController();

    setLoading(true);
    setError(null);
    // Do NOT wipe data here — keep the previous result visible while loading
    // so the page doesn't flash empty on every filter change.
    setSelectedGrade(null);
    setDrillStudents([]);

    fetch(`/api/assessments/dashboard?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error(`Server error ${r.status}: ${text.slice(0, 200)}`);
        }
        if (!r.ok || json.error) {
          throw new Error(String(json.error ?? `HTTP ${r.status}`));
        }
        return json;
      })
      .then((json) => {
        setData(json as DashboardData);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return; // stale request, ignore
        setError(err instanceof Error ? err.message : "Couldn't load dashboard data.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [periodId, classId, subjectId, form]);

  // ---- Load per-class scorecard when a class or form is selected ----
  useEffect(() => {
    if (!periodId || (!classId && !form)) {
      setScorecard(null);
      return;
    }
    const controller = new AbortController();
    setScorecardLoading(true);
    setScorecardError(null);

    const p = new URLSearchParams({ periodId });
    if (classId) p.set("classId", classId);
    else if (form) p.set("form", String(form));

    fetch(`/api/assessments/dashboard/class-scorecard?${p}`, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        let json: Record<string, unknown>;
        try { json = JSON.parse(text); }
        catch { throw new Error(`Server error ${r.status}`); }
        if (!r.ok || json.error) throw new Error(String(json.error ?? `HTTP ${r.status}`));
        return json as unknown as ScorecardData;
      })
      .then((d) => { setScorecard(d); setScorecardError(null); })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setScorecardError(err instanceof Error ? err.message : "Couldn't load scorecard.");
      })
      .finally(() => setScorecardLoading(false));

    return () => controller.abort();
  }, [periodId, classId, form]);

  // ---- Grade bar click ----
  async function handleGradeClick(grade: KcseGrade) {
    // Toggle off if already selected
    if (selectedGrade === grade) {
      setSelectedGrade(null);
      setDrillStudents([]);
      return;
    }
    setSelectedGrade(grade);
    setDrillStudents([]);
    setDrillError(null);
    setDrillLoading(true);
    try {
      const params = new URLSearchParams({ periodId, grade });
      if (classId) params.set("classId", classId);
      if (subjectId) params.set("subjectId", subjectId);
      if (!classId && form) params.set("form", String(form));
      const res = await fetch(`/api/assessments/dashboard/grade-students?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) { setDrillError(json.error ?? "Couldn't load students."); }
      else { setDrillStudents(json.students ?? []); }
    } catch {
      setDrillError("Couldn't load students.");
    } finally {
      setDrillLoading(false);
    }
  }

  // ---- Derived ----
  const gradeDist = data?.gradeDistribution ?? [];
  const maxGradeCount = Math.max(...gradeDist.map((g) => g.count), 1);
  const totalStudents = data?.summary.studentCount ?? 0;

  const sortedSubjectPerformance = useMemo(
    () => data ? [...data.subjectPerformance].sort((a, b) => (b.meanScore ?? 0) - (a.meanScore ?? 0)) : [],
    [data]
  );

  const sortedClassComparison = useMemo(
    () => data ? [...data.classComparison].sort((a, b) => (b.meanPoints ?? 0) - (a.meanPoints ?? 0)) : [],
    [data]
  );

  const gradeBarClickHandlers = useMemo(() => {
    const handlers: Partial<Record<string, () => void>> = {};
    for (const grade of ALL_GRADES) {
      handlers[grade] = () => handleGradeClick(grade);
    }
    return handlers;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId, classId, subjectId, form]);

  // Read theme-aware grid color from CSS variable
  const gridColor = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#e5e7eb'
    : '#e5e7eb';
  const tickColor = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--color-muted-foreground').trim() || '#94a3b8'
    : '#94a3b8';

  return (
    <div>
      {/* ---- Filter bar — hidden when drilling from a tile ---- */}
      {!hideFilters && (
        <ExamFilterBar
          classes={classes}
          subjects={subjects}
          hideSubject={true}
          onChange={handleFilterChange}
          defaultClassId={defaultClassId}
          defaultSubjectId={defaultSubjectId}
        />
      )}

      {error && <ErrorBanner message={error} />}

      {/* ── First load skeleton ── */}
      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="h-4 w-32 rounded bg-line animate-pulse" />
              <div className="h-24 rounded-lg bg-line animate-pulse" />
              <div className="h-3 w-48 rounded bg-line animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* ── Filter-change pill — shown over existing data while reloading ── */}
      {loading && data && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
          <span className="text-xs text-slate">Loading…</span>
        </div>
      )}

      {data && totalStudents === 0 && !loading && (
        <EmptyState message="No marks entered for this period yet." />
      )}

      {data && totalStudents > 0 && (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 transition-opacity duration-200 ${loading ? "opacity-50 pointer-events-none" : "opacity-100"}`}>

          {/* ---- Summary card ---- */}
          <Section title="Overall summary">
            <div className="flex items-center gap-6">
              {data.summary.overallMeanGrade && (() => {
                const { bg, text } = gradeColour(data.summary.overallMeanGrade);
                return (
                  <div
                    className={`flex flex-col items-center justify-center rounded-xl w-24 h-24 ${bg}`}
                  >
                    <span className={`text-4xl font-display font-bold ${text}`}>
                      {data.summary.overallMeanGrade}
                    </span>
                    <span className={`text-xs mt-0.5 ${text}`}>Mean grade</span>
                  </div>
                );
              })()}
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-foreground">
                  <span className="font-semibold tabular-nums">
                    {data.summary.overallMeanPoints?.toFixed(2) ?? "—"}
                  </span>{" "}
                  <span className="text-slate">mean points</span>
                </p>
                <p className="text-sm text-foreground">
                  <span className="font-semibold tabular-nums">{totalStudents}</span>{" "}
                  <span className="text-slate">students assessed</span>
                </p>
              </div>
            </div>
          </Section>

          {/* ---- Grade distribution ---- */}
          <Section title="Grade distribution">
            <div className="flex items-end gap-1 h-16 mb-2">
              {ALL_GRADES.map((grade) => {
                const entry = gradeDist.find((g) => g.grade === grade);
                const count = entry?.count ?? 0;
                return (
                  <MiniBar
                    key={grade}
                    value={count}
                    max={maxGradeCount}
                    label={grade}
                    selected={selectedGrade === grade}
                    onClick={gradeBarClickHandlers[grade]}
                  />
                );
              })}
            </div>
            <p className="text-[10px] text-slate mt-1">Click a bar to see students in that grade</p>
          </Section>

          {/* ---- Grade drill-down — full width so left-column cards never shift ---- */}
          {selectedGrade && (
            <div className="md:col-span-2 bg-card border border-royal/30 rounded-xl p-5">
              {(() => {
                const { bg, text } = gradeColour(selectedGrade);
                return (
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center rounded-lg w-8 h-8 text-sm font-bold ${bg} ${text}`}>
                        {selectedGrade}
                      </span>
                      <span className="text-sm font-semibold text-foreground">
                        Grade {selectedGrade} students
                      </span>
                      {!drillLoading && (
                        <span className="text-xs text-slate">
                          — {drillStudents.length} student{drillStudents.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {drillLoading && (
                        <span className="text-xs text-slate italic">Loading…</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedGrade(null); setDrillStudents([]); }}
                      className="text-xs text-slate hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-background"
                    >
                      ✕ Close
                    </button>
                  </div>
                );
              })()}

              {drillError && (
                <p className="text-xs text-danger">{drillError}</p>
              )}

              {!drillLoading && !drillError && drillStudents.length === 0 && (
                <p className="text-xs text-slate">No students found for this grade.</p>
              )}

              {!drillLoading && drillStudents.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-slate text-left">
                        <th className="pb-1.5 font-medium">Adm. No.</th>
                        <th className="pb-1.5 font-medium">Name</th>
                        <th className="pb-1.5 font-medium">Class</th>
                        <th className="pb-1.5 font-medium text-right">Mean pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillStudents.map((s) => (
                        <tr key={s.admissionNumber} className="border-b border-border last:border-0">
                          <td className="py-1.5 pr-2 tabular-nums text-slate">{s.admissionNumber}</td>
                          <td className="py-1.5 pr-2 font-medium text-foreground">{s.fullName}</td>
                          <td className="py-1.5 pr-2 text-slate">{s.className}</td>
                          <td className="py-1.5 tabular-nums text-foreground text-right">{s.meanPoints.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ---- Class comparison / per-student scorecard ---- */}
          {(classId || form) ? (
            <Section title={`${form && !classId ? "Form scorecard" : "Class scorecard"}${scorecard ? ` — ${scorecard.scopeLabel}` : ""}`}>
              {scorecardLoading && !scorecard && (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-7 rounded bg-line animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
                  ))}
                </div>
              )}
              {scorecardLoading && scorecard && (
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
                  <span className="text-xs text-slate">Loading…</span>
                </div>
              )}
              {scorecardError && (
                <p className="text-xs text-danger">{scorecardError}</p>
              )}
              {!scorecardLoading && !scorecardError && scorecard && scorecard.rows.length === 0 && (
                <p className="text-sm text-slate">No students found in this class.</p>
              )}
              {scorecard && scorecard.rows.length > 0 && scorecard.subjects.length === 0 && (
                <p className="text-sm text-slate">No marks entered for this class yet.</p>
              )}
              {scorecard && scorecard.rows.length > 0 && scorecard.subjects.length > 0 && (
                <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 420 }}>
                  <table className="text-xs w-full border-collapse">
                    <thead className="sticky top-0 z-30">
                      <tr className="border-b-2 border-border text-slate text-left bg-card">
                        <th className="pb-2 font-medium pr-1 text-center sticky left-0 z-20 bg-card" style={{ minWidth: 24 }}>#</th>
                        <th className="pb-2 font-medium pr-4 whitespace-nowrap sticky z-20 bg-card shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)]" style={{ left: 24, minWidth: 140 }}>
                          Student
                        </th>
                        {scorecard.multiClass && (
                          <th className="pb-2 font-medium text-center px-2 whitespace-nowrap">Class</th>
                        )}
                        {scorecard.subjects.map((s) => (
                          <th key={s.id} className="pb-2 font-medium text-center px-1 whitespace-nowrap" title={s.name}>
                            {s.code || s.name.slice(0, 6)}
                          </th>
                        ))}
                        <th className="pb-2 font-medium text-center px-1 border-l border-border whitespace-nowrap">Mean pts</th>
                        <th className="pb-2 font-medium text-center px-1 whitespace-nowrap">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scorecard.rows.map((row, idx) => {
                        const { bg, text } = row.meanGrade ? gradeColour(row.meanGrade) : { bg: "bg-background", text: "text-slate" };
                        const isFlagged = scorecard.meanFlagThreshold !== null
                          && row.meanPoints !== null
                          && row.meanPoints < scorecard.meanFlagThreshold;
                        return (
                          <tr key={row.admissionNumber} className={`border-b border-border last:border-0 group ${isFlagged ? "bg-red-50 hover:bg-red-100" : "hover:bg-slate-50"}`}>
                            <td className={`py-1 pr-1 text-center tabular-nums sticky left-0 z-10 ${isFlagged ? "bg-red-50 group-hover:bg-red-100 text-red-500" : "bg-card group-hover:bg-slate-50 text-slate"}`} style={{ minWidth: 24 }}>
                              {idx + 1}
                            </td>
                            <td className={`py-1 pr-4 font-medium whitespace-nowrap sticky z-10 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)] ${isFlagged ? "bg-red-50 group-hover:bg-red-100 text-red-700" : "bg-card group-hover:bg-slate-50 text-foreground"}`} style={{ left: 24, minWidth: 140 }}>
                              <span className="flex items-center gap-1">
                                {isFlagged && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                                {row.fullName}
                              </span>
                              <span className={`block text-[10px] font-normal ${isFlagged ? "text-red-400" : "text-slate"}`}>{row.admissionNumber}</span>
                            </td>
                            {scorecard.multiClass && (
                              <td className="py-1 px-2 text-center text-slate whitespace-nowrap">{row.className}</td>
                            )}
                            {row.subjects.map((cell, si) => (
                              <td key={scorecard.subjects[si].id} className="py-1 px-1 text-center">
                                {cell.pct !== null ? (
                                  <div className="flex flex-col items-center leading-tight">
                                    <span className="tabular-nums text-foreground font-medium">{cell.pct.toFixed(0)}%</span>
                                    <span className={`text-[10px] font-semibold ${cell.grade ? gradeColour(cell.grade).text : "text-slate"}`}>
                                      {cell.grade ?? "—"}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate">—</span>
                                )}
                              </td>
                            ))}
                            <td className={`py-1 px-1 text-center tabular-nums font-semibold border-l border-border ${isFlagged ? "text-red-600" : "text-foreground"}`}>
                              {row.meanPoints !== null ? row.meanPoints.toFixed(2) : "—"}
                            </td>
                            <td className="py-1 px-1 text-center">
                              {row.meanGrade ? (
                                <span className={`inline-block rounded px-1 py-0.5 text-[11px] font-bold ${bg} ${text}`}>{row.meanGrade}</span>
                              ) : (
                                <span className="text-slate">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {scorecard.subjects.some((s) => s.code) && (
                      <tfoot>
                        <tr>
                          <td colSpan={2 + (scorecard.multiClass ? 1 : 0) + scorecard.subjects.length + 2} className="pt-3 text-[10px] text-slate leading-relaxed">
                            {scorecard.subjects.map((s) => (
                              <span key={s.id} className="mr-3">
                                <span className="font-semibold">{s.code || s.name.slice(0, 6)}</span>{" = "}{s.name}
                              </span>
                            ))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </Section>
          ) : (
            <Section title="Class comparison">              {data.classComparison.length === 0 ? (
                <p className="text-sm text-slate">No class data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-slate text-left">
                        <th className="pb-2 font-medium">Class</th>
                        <th className="pb-2 font-medium text-center">Students</th>
                        <th className="pb-2 font-medium text-center">Mean pts</th>
                        <th className="pb-2 font-medium text-center">Grade</th>
                        <th className="pb-2 font-medium text-center text-success">A/A-</th>
                        <th className="pb-2 font-medium text-center text-danger">E</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedClassComparison.map((cc) => {
                          const { bg, text } = cc.meanGrade ? gradeColour(cc.meanGrade) : { bg: "bg-background", text: "text-slate" };
                          return (
                            <tr key={cc.schoolClass.id} className="border-b border-border last:border-0">
                              <td className="py-1.5 pr-2 font-medium text-foreground">{cc.schoolClass.name}</td>
                              <td className="py-1.5 text-center text-slate">{cc.studentCount}</td>
                              <td className="py-1.5 text-center tabular-nums text-foreground">{cc.meanPoints?.toFixed(2) ?? "—"}</td>
                              <td className="py-1.5 text-center">
                                <span className={`inline-block rounded px-1 py-0.5 text-[11px] font-semibold ${bg} ${text}`}>{cc.meanGrade ?? "—"}</span>
                              </td>
                              <td className="py-1.5 text-center text-success tabular-nums">{cc.countA}</td>
                              <td className="py-1.5 text-center text-danger tabular-nums">{cc.countE}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {/* ---- Subject performance ---- */}
          <Section title="Subject mean points">
            {data.subjectPerformance.length === 0 ? (
              <p className="text-sm text-slate">No subject data yet.</p>
            ) : (
              <div className="space-y-3">
                {sortedSubjectPerformance.map((sp) => (
                  <div key={sp.subject.id} className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center rounded w-9 h-6 text-xs font-semibold shrink-0 bg-royal/10 text-royal tabular-nums">
                      {sp.meanPoints !== null ? sp.meanPoints.toFixed(2) : "—"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{sp.subject.name}</p>
                      <HBar value={sp.meanPoints !== null ? Math.round(sp.meanPoints * 100) / 100 : 0} max={12} colour="bg-royal" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ---- Performance trend line chart ---- */}
          {data.trendData.length > 1 && (() => {
            const GRADE_LABELS: Record<number, string> = {
              12: "A", 11: "A-", 10: "B+", 9: "B", 8: "B-",
              7: "C+", 6: "C", 5: "C-", 4: "D+", 3: "D", 2: "D-", 1: "E",
            };
            // Merge into one series so the line is unbroken
            const lineData = data.trendData.map((t) => ({
              label: t.period.term
                ? `T${t.period.term} ${t.period.academicYear}`
                : t.period.name,
              mean: t.meanPoints ?? null,
              isCurrent: t.period.id === periodId,
            }));
            const currentEntry = lineData.find((d) => d.isCurrent);
            return (
              <Section title="Mean points trend (all periods)">
                {currentEntry && (
                  <p className="text-xs text-slate mb-3">
                    Current selection:{" "}
                    <span className="font-semibold text-foreground">
                      {currentEntry.label}
                    </span>
                    {currentEntry.mean !== null && (
                      <>
                        {" — "}
                        <span className="font-semibold text-royal tabular-nums">
                          {currentEntry.mean.toFixed(2)} pts
                        </span>
                        {" "}
                        <span className="text-slate">
                          ({GRADE_LABELS[Math.round(currentEntry.mean)] ?? ""})
                        </span>
                      </>
                    )}
                  </p>
                )}
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={lineData}
                    margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                  >
                    {/* chart series — intentional */}
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: tickColor /* chart series — intentional */ }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={[1, 12]}
                      ticks={[1, 3, 5, 7, 9, 11, 12]}
                      tick={{ fontSize: 10, fill: tickColor /* chart series — intentional */ }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => GRADE_LABELS[v] ? `${v} (${GRADE_LABELS[v]})` : String(v)}
                      width={52}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as typeof lineData[number];
                        if (d.mean === null) return null;
                        return (
                          <div className="bg-card border border-border rounded-lg shadow-md px-3 py-2 text-xs">
                            <p className="font-semibold text-foreground mb-0.5">{d.label}</p>
                            <p className="text-slate">
                              Mean:{" "}
                              <span className="font-semibold text-royal tabular-nums">
                                {d.mean.toFixed(2)} pts
                              </span>
                            </p>
                            {GRADE_LABELS[Math.round(d.mean)] && (
                              <p className="text-slate">
                                Grade:{" "}
                                <span className="font-semibold text-foreground">
                                  {GRADE_LABELS[Math.round(d.mean)]}
                                </span>
                              </p>
                            )}
                            {d.isCurrent && (
                              <p className="text-[10px] text-royal mt-1 font-medium">
                                ◆ Selected period
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    {/* Vertical reference line for the selected period */}
                    {currentEntry && (
                      <ReferenceLine
                        x={currentEntry.label}
                        stroke="#1d4ed8" /* chart series — intentional */
                        strokeDasharray="4 3"
                        strokeWidth={1.5}
                      />
                    )}
                    {/* chart series — intentional */}
                    <Line
                      type="monotone"
                      dataKey="mean"
                      stroke="#1d4ed8"
                      strokeWidth={2}
                      dot={(props) => {
                        const entry = props.payload as typeof lineData[number];
                        const r = entry.isCurrent ? 5 : 3;
                        const fill = entry.isCurrent ? "#1d4ed8" : "#fff"; // chart series — intentional
                        const stroke = "#1d4ed8"; // chart series — intentional
                        return (
                          <circle
                            key={props.key}
                            cx={props.cx}
                            cy={props.cy}
                            r={r}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={2}
                          />
                        );
                      }}
                      activeDot={{ r: 6, fill: "#1d4ed8" /* chart series — intentional */ }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Section>
            );
          })()}

          {/* ---- Subject × class heat-map ---- */}
          {data.subjectClassHeatmap.length > 0 &&
            (data.subjectClassHeatmap[0].classes.length > 1 ||
              data.subjectClassHeatmap[0].totalMeanPoints !== null) && (
              <Section title="Subject × class heat-map (mean %)">
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b border-border text-slate text-left">
                        <th className="pb-2 font-medium pr-3">Subject</th>
                        {data.subjectClassHeatmap[0].classes.map((c) => (
                          <th
                            key={c.classId}
                            className="pb-2 font-medium text-center px-1"
                          >
                            {c.className}
                          </th>
                        ))}
                        {data.subjectClassHeatmap[0].totalMeanPoints !== null && (
                          <th className="pb-2 font-medium text-center px-1 border-l border-border text-slate">
                            Total
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.subjectClassHeatmap.map((row) => (
                        <tr
                          key={row.subjectId}
                          className="border-b border-border last:border-0"
                        >
                          <td className="py-1 pr-3 font-medium text-foreground whitespace-nowrap">
                            {row.subjectName}
                          </td>
                          {row.classes.map((c) => (
                            <td key={c.classId} className="py-1 px-1 text-center">
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 tabular-nums font-medium ${heatColourPts(c.meanPoints)}`}
                              >
                                {c.meanPoints !== null ? c.meanPoints.toFixed(2) : "—"}
                              </span>
                            </td>
                          ))}
                          {row.totalMeanPoints !== null && (
                            <td className="py-1 px-1 text-center border-l border-border">
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 tabular-nums font-medium ${heatColourPts(row.totalMeanPoints)}`}
                              >
                                {row.totalMeanPoints.toFixed(2)}
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {/* ---- Mean points footer row ---- */}
                    {data.heatmapClassSummary?.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-border bg-background">
                          <td className="py-2 pr-3 text-xs font-semibold text-foreground whitespace-nowrap">
                            Mean points
                          </td>
                          {data.heatmapClassSummary.map((c) => (
                            <td key={c.classId} className="py-2 px-1 text-center">
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 tabular-nums font-bold text-xs ${heatColourPts(c.meanPoints)}`}
                              >
                                {c.meanPoints !== null ? c.meanPoints.toFixed(2) : "—"}
                              </span>
                            </td>
                          ))}
                          {data.heatmapTotalSummary && (
                            <td className="py-2 px-1 text-center border-l border-border">
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 tabular-nums font-bold text-xs ${heatColourPts(data.heatmapTotalSummary.meanPoints)}`}
                              >
                                {data.heatmapTotalSummary.meanPoints.toFixed(2)}
                              </span>
                            </td>
                          )}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </Section>
            )}

        </div>
      )}
    </div>
  );
}
