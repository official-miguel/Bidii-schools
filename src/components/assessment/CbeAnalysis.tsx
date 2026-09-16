"use client";

/**
 * CbeAnalysis — the CBE in-depth analysis view.
 *
 * Deliberately a mirror of DashboardCharts (the 8-4-4 view): same filter bar,
 * same sections, same layout. Only the grading differs:
 *
 *   • Scores are RAW MARKS out of 100 — 80 stays 80, never converted to points.
 *   • Attainment is shown as the CBE achievement band (EE1, EE2, ME1 …) drawn
 *     from the school's active grading scale, not as an 8-4-4 letter grade.
 *
 * There is no junior/senior split — every CBE class is analysed the same way.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { bandColour } from "@/lib/assessment/gradingCbe";
import { ErrorBanner, EmptyState } from "@/components/ui";
import ExamFilterBar, { type FilterSelection } from "@/components/assessment/ExamFilterBar";
import AssessmentAiPanel from "@/components/assessment/AssessmentAiPanel";

// ---------------------------------------------------------------------------
// Types — mirrors the /api/assessments/cbe/analysis response
// ---------------------------------------------------------------------------

type SubjectPerformance = {
  subject: { id: string; name: string; code: string };
  meanMark: number | null;
  band: string | null;
  studentCount: number;
};

type ClassComparison = {
  schoolClass: { id: string; name: string; form: number };
  meanMark: number | null;
  band: string | null;
  countTop: number;
  countBottom: number;
  studentCount: number;
};

type BandStudent = {
  admissionNumber: string;
  fullName: string;
  className: string;
  meanMark: number;
};

type ScorecardCell = { mark: number | null; band: string | null };
type ScorecardRow = {
  admissionNumber: string;
  fullName: string;
  className: string;
  subjects: ScorecardCell[];
  meanMark: number | null;
  band: string | null;
};
type Scorecard = {
  scopeLabel: string;
  subjects: { id: string; name: string; code: string }[];
  multiClass: boolean;
  rows: ScorecardRow[];
};

type HeatmapRow = {
  subjectId: string;
  subjectName: string;
  classes: { classId: string; className: string; meanMark: number | null }[];
  totalMeanMark: number | null;
};

type AnalysisData = {
  bands: string[];
  usedDefaultScale: boolean;
  summary: { overallMeanMark: number | null; overallBand: string | null; studentCount: number };
  subjectPerformance: SubjectPerformance[];
  bandDistribution: { band: string; count: number }[];
  bandStudents: Record<string, BandStudent[]>;
  classComparison: ClassComparison[];
  trendData: { period: { id: string; name: string; academicYear: string; term?: number | null }; meanMark: number | null }[];
  subjectClassHeatmap: HeatmapRow[];
  heatmapClassSummary: { classId: string; className: string; meanMark: number | null }[];
  heatmapTotalSummary: { meanMark: number } | null;
  scorecard: Scorecard | null;
};

type Props = {
  classes: { id: string; name: string; form: number }[];
  subjects: { id: string; name: string; applicableForms: number[] }[];
  defaultClassId?: string;
  defaultSubjectId?: string;
  hideFilters?: boolean;
};

// ---------------------------------------------------------------------------
// Small chart helpers
// ---------------------------------------------------------------------------

function HBar({ value, max, colour }: { value: number; max: number; colour: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-line rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const MiniBar = memo(function MiniBar({
  value, max, label, selected, onClick,
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
      title={clickable ? `${value} learner${value !== 1 ? "s" : ""} at ${label} — click to view` : undefined}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
}

function BandBadge({ band }: { band: string | null }) {
  if (!band) return <span className="text-slate">—</span>;
  const { bg, text } = bandColour(band);
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${bg} ${text}`}>{band}</span>;
}

/** Heat colour keyed on raw marks out of 100. */
function heatColourMark(mark: number | null): string {
  if (mark === null) return "bg-background text-slate";
  if (mark >= 75) return "bg-green-100 text-green-800";
  if (mark >= 58) return "bg-blue-100 text-blue-800";
  if (mark >= 41) return "bg-amber-100 text-amber-800";
  if (mark >= 31) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CbeAnalysis({
  classes, subjects, defaultClassId, defaultSubjectId, hideFilters = false,
}: Props) {
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

  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBand, setSelectedBand] = useState<string | null>(null);

  useEffect(() => {
    if (!periodId) return;

    const params = new URLSearchParams({ periodId });
    if (classId) params.set("classId", classId);
    if (subjectId) params.set("subjectId", subjectId);
    if (!classId && form) params.set("form", String(form));

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelectedBand(null);

    fetch(`/api/assessments/cbe/analysis?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const text = await r.text();
        let json: Record<string, unknown>;
        try { json = JSON.parse(text); }
        catch { throw new Error(`Server error ${r.status}: ${text.slice(0, 200)}`); }
        if (!r.ok || json.error) throw new Error(String(json.error ?? `HTTP ${r.status}`));
        return json;
      })
      .then((json) => { setData(json as unknown as AnalysisData); setError(null); })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Couldn't load CBE analysis.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [periodId, classId, subjectId, form]);

  const bandDist = data?.bandDistribution ?? [];
  const maxBandCount = Math.max(...bandDist.map((b) => b.count), 1);
  const totalStudents = data?.summary.studentCount ?? 0;

  const sortedSubjectPerformance = useMemo(
    () => (data ? [...data.subjectPerformance].sort((a, b) => (b.meanMark ?? 0) - (a.meanMark ?? 0)) : []),
    [data]
  );

  const sortedClassComparison = useMemo(
    () => (data ? [...data.classComparison].sort((a, b) => (b.meanMark ?? 0) - (a.meanMark ?? 0)) : []),
    [data]
  );

  const drillStudents = selectedBand ? (data?.bandStudents[selectedBand] ?? []) : [];
  const scorecard = data?.scorecard ?? null;

  const gridColor = typeof window !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue("--color-border").trim() || "#e5e7eb"
    : "#e5e7eb";
  const tickColor = typeof window !== "undefined"
    ? getComputedStyle(document.documentElement).getPropertyValue("--color-muted-foreground").trim() || "#94a3b8"
    : "#94a3b8";

  return (
    <div>
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

          {/* ---- Summary ---- */}
          <Section title="Overall summary">
            <div className="flex items-center gap-6">
              {data.summary.overallBand && (() => {
                const { bg, text } = bandColour(data.summary.overallBand);
                return (
                  <div className={`flex flex-col items-center justify-center rounded-xl w-24 h-24 ${bg}`}>
                    <span className={`text-3xl font-display font-bold ${text}`}>
                      {data.summary.overallBand}
                    </span>
                    <span className={`text-xs mt-0.5 ${text}`}>Mean level</span>
                  </div>
                );
              })()}
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-foreground">
                  <span className="font-semibold tabular-nums">
                    {data.summary.overallMeanMark?.toFixed(2) ?? "—"}
                  </span>{" "}
                  <span className="text-slate">mean marks (out of 100)</span>
                </p>
                <p className="text-sm text-foreground">
                  <span className="font-semibold tabular-nums">{totalStudents}</span>{" "}
                  <span className="text-slate">learners assessed</span>
                </p>
              </div>
            </div>
          </Section>

          {/* ---- Achievement level distribution ---- */}
          <Section title="Achievement level distribution">
            <div className="flex items-end gap-1 h-16 mb-2">
              {data.bands.map((band) => {
                const count = bandDist.find((b) => b.band === band)?.count ?? 0;
                return (
                  <MiniBar
                    key={band}
                    value={count}
                    max={maxBandCount}
                    label={band}
                    selected={selectedBand === band}
                    onClick={() => setSelectedBand((cur) => (cur === band ? null : band))}
                  />
                );
              })}
            </div>
            <p className="text-[10px] text-slate mt-1">Click a bar to see learners at that level</p>
          </Section>

          {/* ---- Level drill-down ---- */}
          {selectedBand && (
            <div className="md:col-span-2 bg-card border border-royal/30 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BandBadge band={selectedBand} />
                  <span className="text-sm font-semibold text-foreground">
                    {selectedBand} learners
                  </span>
                  <span className="text-xs text-slate">
                    — {drillStudents.length} learner{drillStudents.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBand(null)}
                  className="text-xs text-slate hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-background"
                >
                  ✕ Close
                </button>
              </div>

              {drillStudents.length === 0 ? (
                <p className="text-xs text-slate">No learners at this level.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-slate text-left">
                        <th className="pb-1.5 font-medium">Adm. No.</th>
                        <th className="pb-1.5 font-medium">Name</th>
                        <th className="pb-1.5 font-medium">Class</th>
                        <th className="pb-1.5 font-medium text-right">Mean marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drillStudents.map((s) => (
                        <tr key={s.admissionNumber} className="border-b border-border last:border-0">
                          <td className="py-1.5 pr-2 tabular-nums text-slate">{s.admissionNumber}</td>
                          <td className="py-1.5 pr-2 font-medium text-foreground">{s.fullName}</td>
                          <td className="py-1.5 pr-2 text-slate">{s.className}</td>
                          <td className="py-1.5 tabular-nums text-foreground text-right">{s.meanMark.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ---- Class comparison / learner scorecard ---- */}
          {(classId || form) ? (
            <Section title={`${form && !classId ? "Form scorecard" : "Class scorecard"}${scorecard ? ` — ${scorecard.scopeLabel}` : ""}`}>
              {!scorecard || scorecard.rows.length === 0 ? (
                <p className="text-sm text-slate">No learners found in this scope.</p>
              ) : scorecard.subjects.length === 0 ? (
                <p className="text-sm text-slate">No marks entered for this class yet.</p>
              ) : (
                <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 420 }}>
                  <table className="text-xs w-full border-collapse">
                    <thead className="sticky top-0 z-30">
                      <tr className="border-b-2 border-border text-slate text-left bg-card">
                        <th className="pb-2 font-medium pr-1 text-center sticky left-0 z-20 bg-card" style={{ minWidth: 24 }}>#</th>
                        <th className="pb-2 font-medium pr-4 whitespace-nowrap sticky z-20 bg-card shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)]" style={{ left: 24, minWidth: 140 }}>
                          Learner
                        </th>
                        {scorecard.multiClass && (
                          <th className="pb-2 font-medium text-center px-2 whitespace-nowrap">Class</th>
                        )}
                        {scorecard.subjects.map((s) => (
                          <th key={s.id} className="pb-2 font-medium text-center px-1 whitespace-nowrap" title={s.name}>
                            {s.code || s.name.slice(0, 6)}
                          </th>
                        ))}
                        <th className="pb-2 font-medium text-center px-1 border-l border-border whitespace-nowrap">Mean marks</th>
                        <th className="pb-2 font-medium text-center px-1 whitespace-nowrap">Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scorecard.rows.map((row, idx) => (
                        <tr key={row.admissionNumber} className="border-b border-border last:border-0 group hover:bg-slate-50">
                          <td className="py-1 pr-1 text-center tabular-nums sticky left-0 z-10 bg-card group-hover:bg-slate-50 text-slate" style={{ minWidth: 24 }}>
                            {idx + 1}
                          </td>
                          <td className="py-1 pr-4 font-medium whitespace-nowrap sticky z-10 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)] bg-card group-hover:bg-slate-50 text-foreground" style={{ left: 24, minWidth: 140 }}>
                            {row.fullName}
                            <span className="block text-[10px] font-normal text-slate">{row.admissionNumber}</span>
                          </td>
                          {scorecard.multiClass && (
                            <td className="py-1 px-2 text-center text-slate whitespace-nowrap">{row.className}</td>
                          )}
                          {row.subjects.map((cell, si) => (
                            <td key={scorecard.subjects[si].id} className="py-1 px-1 text-center">
                              {cell.mark !== null ? (
                                <div className="flex flex-col items-center leading-tight">
                                  <span className="tabular-nums text-foreground font-medium">{cell.mark.toFixed(0)}</span>
                                  <span className={`text-[10px] font-semibold ${bandColour(cell.band).text}`}>
                                    {cell.band ?? "—"}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate">—</span>
                              )}
                            </td>
                          ))}
                          <td className="py-1 px-1 text-center tabular-nums font-semibold border-l border-border text-foreground">
                            {row.meanMark !== null ? row.meanMark.toFixed(2) : "—"}
                          </td>
                          <td className="py-1 px-1 text-center"><BandBadge band={row.band} /></td>
                        </tr>
                      ))}
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
            <Section title="Class comparison">
              {data.classComparison.length === 0 ? (
                <p className="text-sm text-slate">No class data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-slate text-left">
                        <th className="pb-2 font-medium">Class</th>
                        <th className="pb-2 font-medium text-center">Learners</th>
                        <th className="pb-2 font-medium text-center">Mean marks</th>
                        <th className="pb-2 font-medium text-center">Level</th>
                        <th className="pb-2 font-medium text-center text-success">{data.bands[0] ?? "Top"}</th>
                        <th className="pb-2 font-medium text-center text-danger">{data.bands[data.bands.length - 1] ?? "Low"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedClassComparison.map((cc) => (
                        <tr key={cc.schoolClass.id} className="border-b border-border last:border-0">
                          <td className="py-1.5 pr-2 font-medium text-foreground">{cc.schoolClass.name}</td>
                          <td className="py-1.5 text-center text-slate">{cc.studentCount}</td>
                          <td className="py-1.5 text-center tabular-nums text-foreground">{cc.meanMark?.toFixed(2) ?? "—"}</td>
                          <td className="py-1.5 text-center"><BandBadge band={cc.band} /></td>
                          <td className="py-1.5 text-center text-success tabular-nums">{cc.countTop}</td>
                          <td className="py-1.5 text-center text-danger tabular-nums">{cc.countBottom}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {/* ---- Subject mean marks ---- */}
          <Section title="Subject mean marks">
            {data.subjectPerformance.length === 0 ? (
              <p className="text-sm text-slate">No subject data yet.</p>
            ) : (
              <div className="space-y-3">
                {sortedSubjectPerformance.map((sp) => (
                  <div key={sp.subject.id} className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center rounded w-9 h-6 text-xs font-semibold shrink-0 bg-royal/10 text-royal tabular-nums">
                      {sp.meanMark !== null ? sp.meanMark.toFixed(1) : "—"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{sp.subject.name}</p>
                      <HBar value={sp.meanMark ?? 0} max={100} colour="bg-royal" />
                    </div>
                    <BandBadge band={sp.band} />
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ---- Trend ---- */}
          {data.trendData.length > 1 && (() => {
            const lineData = data.trendData.map((t) => ({
              label: t.period.term ? `T${t.period.term} ${t.period.academicYear}` : t.period.name,
              mean: t.meanMark ?? null,
              isCurrent: t.period.id === periodId,
            }));
            const currentEntry = lineData.find((d) => d.isCurrent);
            return (
              <Section title="Mean marks trend (all periods)">
                {currentEntry && (
                  <p className="text-xs text-slate mb-3">
                    Current selection:{" "}
                    <span className="font-semibold text-foreground">{currentEntry.label}</span>
                    {currentEntry.mean !== null && (
                      <>
                        {" — "}
                        <span className="font-semibold text-royal tabular-nums">
                          {currentEntry.mean.toFixed(2)} marks
                        </span>
                      </>
                    )}
                  </p>
                )}
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={lineData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    {/* chart series — intentional */}
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: tickColor /* chart series — intentional */ }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 20, 40, 60, 80, 100]}
                      tick={{ fontSize: 10, fill: tickColor /* chart series — intentional */ }}
                      tickLine={false}
                      axisLine={false}
                      width={36}
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
                              <span className="font-semibold text-royal tabular-nums">{d.mean.toFixed(2)} marks</span>
                            </p>
                            {d.isCurrent && (
                              <p className="text-[10px] text-royal mt-1 font-medium">◆ Selected period</p>
                            )}
                          </div>
                        );
                      }}
                    />
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
                        return (
                          <circle
                            key={props.key}
                            cx={props.cx}
                            cy={props.cy}
                            r={entry.isCurrent ? 5 : 3}
                            fill={entry.isCurrent ? "#1d4ed8" : "#fff"} /* chart series — intentional */
                            stroke="#1d4ed8"
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
              data.subjectClassHeatmap[0].totalMeanMark !== null) && (
              <Section title="Subject × class heat-map (mean marks)">
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b border-border text-slate text-left">
                        <th className="pb-2 font-medium pr-3">Subject</th>
                        {data.subjectClassHeatmap[0].classes.map((c) => (
                          <th key={c.classId} className="pb-2 font-medium text-center px-1">{c.className}</th>
                        ))}
                        {data.subjectClassHeatmap[0].totalMeanMark !== null && (
                          <th className="pb-2 font-medium text-center px-1 border-l border-border text-slate">Total</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.subjectClassHeatmap.map((row) => (
                        <tr key={row.subjectId} className="border-b border-border last:border-0">
                          <td className="py-1 pr-3 font-medium text-foreground whitespace-nowrap">{row.subjectName}</td>
                          {row.classes.map((c) => (
                            <td key={c.classId} className="py-1 px-1 text-center">
                              <span className={`inline-block rounded px-1.5 py-0.5 tabular-nums font-medium ${heatColourMark(c.meanMark)}`}>
                                {c.meanMark !== null ? c.meanMark.toFixed(1) : "—"}
                              </span>
                            </td>
                          ))}
                          {row.totalMeanMark !== null && (
                            <td className="py-1 px-1 text-center border-l border-border">
                              <span className={`inline-block rounded px-1.5 py-0.5 tabular-nums font-medium ${heatColourMark(row.totalMeanMark)}`}>
                                {row.totalMeanMark.toFixed(1)}
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {data.heatmapClassSummary?.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-border bg-background">
                          <td className="py-2 pr-3 text-xs font-semibold text-foreground whitespace-nowrap">Mean marks</td>
                          {data.heatmapClassSummary.map((c) => (
                            <td key={c.classId} className="py-2 px-1 text-center">
                              <span className={`inline-block rounded px-1.5 py-0.5 tabular-nums font-bold text-xs ${heatColourMark(c.meanMark)}`}>
                                {c.meanMark !== null ? c.meanMark.toFixed(1) : "—"}
                              </span>
                            </td>
                          ))}
                          {data.heatmapTotalSummary && (
                            <td className="py-2 px-1 text-center border-l border-border">
                              <span className={`inline-block rounded px-1.5 py-0.5 tabular-nums font-bold text-xs ${heatColourMark(data.heatmapTotalSummary.meanMark)}`}>
                                {data.heatmapTotalSummary.meanMark.toFixed(1)}
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

      {/* ---- AI Insights ---- */}
      {periodId && classId && (
        <AssessmentAiPanel periodId={periodId} classId={classId} framework="CBE" />
      )}
    </div>
  );
}
