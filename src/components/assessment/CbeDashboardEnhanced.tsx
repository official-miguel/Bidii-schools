"use client";

import { useEffect, useState } from "react";
import {
  ALL_LEVELS,
  levelColour,
  LEVEL_SHORT,
  type PerformanceLevel,
} from "@/lib/assessment/gradingCbe";
import { gradeColour } from "@/lib/assessment/grading844";
import { EmptyState, ErrorBanner, inputClass, labelClass } from "@/components/ui";
import AssessmentAiPanel from "@/components/assessment/AssessmentAiPanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = { id: string; name: string; academicYear: string; isCurrent?: boolean };

// Junior CBE
type LevelDist = {
  learningAreaId:   string;
  learningAreaName: string;
  counts:   Record<PerformanceLevel | "NYE", number>;
  percents: Record<PerformanceLevel | "NYE", number>;
};
type AreaStat = {
  learningAreaId: string; learningAreaName: string;
  subStrandCount: number; meanAttainment: number | null;
  meanLevel: PerformanceLevel | null;
};
type SubStrandStat = {
  subStrandId: string; subStrandName: string; strandName: string; learningAreaName: string;
  counts: Record<PerformanceLevel | "NYE", number>;
  meanAttainment: number | null; meanLevel: PerformanceLevel | null;
};
type StudentTableRow = {
  student: { id: string; fullName: string; admissionNumber: string };
  cells: { subStrandId: string; level: PerformanceLevel | null }[];
  meanAttainment: number | null; meanLevel: PerformanceLevel | null;
};
type RadarStudent = {
  student: { id: string; fullName: string };
  axes: { learningAreaId: string; learningAreaName: string; value: number }[];
};
type JuniorData = {
  period: { id: string; name: string; academicYear: string };
  schoolClass: { id: string; name: string };
  hasData: boolean;
  subStrandColumns?: { id: string; name: string; strandName: string; learningAreaName: string }[];
  subStrandStats?: SubStrandStat[];
  learningAreaStats?: AreaStat[];
  levelDistribution?: LevelDist[];
  studentTable?: StudentTableRow[];
  learnerRadar?: RadarStudent[];
};

// Senior CBE pathway
type SubjectPathwayStat = {
  subject: { id: string; name: string; code: string };
  classMeanSba: number | null; classMeanExam: number | null; classMeanWeighted: number | null;
  sbaWeight: number; examWeight: number; studentCount: number;
};
type TrackPerf = { track: string; subjectCount: number; classMeanWeighted: number | null };
type StudentSummary = {
  student: { id: string; fullName: string; admissionNumber: string };
  overallWeighted: number | null; grade: string | null; subjectCount: number;
};
type PathwayData = {
  period: { id: string; name: string; academicYear: string };
  schoolClass: { id: string; name: string };
  hasData: boolean;
  subjectStats?: SubjectPathwayStat[];
  trackPerformance?: TrackPerf[];
  studentSummaries?: StudentSummary[];
};

type Props = {
  classes: { id: string; name: string; frameworkType: string }[];
  defaultClassId?: string;
  /** If true, only show classes of type CBE. */
  cbeOnly?: boolean;
};

// ---------------------------------------------------------------------------
// Pure CSS radar chart (no external lib)
// ---------------------------------------------------------------------------

function RadarChart({ axes, maxValue = 4, gridColor = "#e2e8f0", axisColor = "#cbd5e1", labelColor = "#64748b" }: {
  axes: { name: string; value: number }[];
  maxValue?: number;
  gridColor?: string;
  axisColor?: string;
  labelColor?: string;
}) {
  const N = axes.length;
  if (N < 3) return null;
  const cx = 100; const cy = 100; const r = 80;
  const angle = (i: number) => (Math.PI * 2 * i) / N - Math.PI / 2;
  const pt = (i: number, val: number) => {
    const frac = val / maxValue;
    const a = angle(i);
    return { x: cx + Math.cos(a) * r * frac, y: cy + Math.sin(a) * r * frac };
  };
  // Grid rings at 1, 2, 3, 4
  const rings = [1, 2, 3, 4].map((ring) =>
    axes.map((_, i) => {
      const p = pt(i, ring);
      return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(" ") + "Z"
  );
  const dataPath = axes.map((a, i) => {
    const p = pt(i, a.value);
    return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ") + "Z";

  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-xs mx-auto">
      {/* Grid */}
      {rings.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={gridColor} strokeWidth="1" />
      ))}
      {/* Axis lines */}
      {axes.map((_, i) => {
        const p = pt(i, maxValue);
        return <line key={i} x1={cx} y1={cy} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} stroke={axisColor} strokeWidth="1" />;
      })}
      {/* Data polygon — chart series — intentional */}
      <path d={dataPath} fill="rgba(59,130,246,0.2)" stroke="#3b82f6" strokeWidth="2" />
      {/* Labels */}
      {axes.map((a, i) => {
        const p = pt(i, maxValue * 1.18);
        return (
          <text key={i} x={p.x.toFixed(1)} y={p.y.toFixed(1)} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill={labelColor} className="font-sans">
            {a.name.length > 10 ? a.name.slice(0, 9) + "…" : a.name}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Level distribution stacked bar (% mode)
// ---------------------------------------------------------------------------

function LevelDistBar({ dist }: { dist: LevelDist }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-36 shrink-0 text-xs font-medium text-foreground truncate" title={dist.learningAreaName}>
        {dist.learningAreaName}
      </div>
      <div className="flex-1 flex h-5 rounded overflow-hidden gap-px">
        {ALL_LEVELS.map((l) => {
          const pct = dist.percents[l];
          if (pct === 0) return null;
          const { bg } = levelColour(l);
          return (
            <div key={l} className={`${bg} flex items-center justify-center text-[9px] font-semibold text-white`}
              style={{ width: `${pct}%` }} title={`${l}: ${pct}%`}>
              {pct >= 12 ? `${pct}%` : ""}
            </div>
          );
        })}
        {dist.percents.NYE > 0 && (
          <div className="bg-slate-200 flex-1" style={{ width: `${dist.percents.NYE}%` }} title={`NYE: ${dist.percents.NYE}%`} />
        )}
      </div>
      <div className="flex gap-1.5 text-[10px] text-slate tabular-nums w-28 shrink-0">
        {ALL_LEVELS.map((l) => <span key={l}>{l}:{dist.percents[l]}%</span>)}
      </div>
    </div>
  );
}

function LvlBadge({ level }: { level: PerformanceLevel | null }) {
  if (!level) return <span className="text-slate text-xs">—</span>;
  const { bg, text } = levelColour(level);
  return <span className={`inline-block rounded px-1 py-0.5 text-[11px] font-semibold ${bg} ${text}`}>{LEVEL_SHORT[level]}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SBA vs Exam split bar for one subject
// ---------------------------------------------------------------------------

function SplitBar({ sba, exam, sbaWeight, examWeight }: { sba: number | null; exam: number | null; sbaWeight: number; examWeight: number }) {
  const sbaFill  = sba  !== null ? Math.max(0, Math.min(100, Math.round(sba)))  : 0;
  const examFill = exam !== null ? Math.max(0, Math.min(100, Math.round(exam))) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 flex items-center gap-1">
        <div className="w-14 text-[10px] text-slate text-right tabular-nums">
          {sba !== null ? `${sba.toFixed(1)}%` : "—"}
        </div>
        <div className="flex-1 h-2 bg-line rounded-full overflow-hidden">
          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${sbaFill}%` }} />
        </div>
        <span className="text-[10px] text-slate">SBA ({Math.round(sbaWeight * 100)}%)</span>
      </div>
      <div className="flex-1 flex items-center gap-1">
        <span className="text-[10px] text-slate">Exam ({Math.round(examWeight * 100)}%)</span>
        <div className="flex-1 h-2 bg-line rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${examFill}%` }} />
        </div>
        <div className="w-14 text-[10px] text-slate tabular-nums">
          {exam !== null ? `${exam.toFixed(1)}%` : "—"}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Junior CBE dashboard view
// ---------------------------------------------------------------------------

function JuniorView({ data, selectedStudent, setSelectedStudent }: {
  data: JuniorData;
  selectedStudent: string;
  setSelectedStudent: (id: string) => void;
}) {
  const totalStudents = data.studentTable?.length ?? 0;

  const radarStudent = data.learnerRadar?.find((r) => r.student.id === selectedStudent) ?? data.learnerRadar?.[0];

  // Read CSS variable values for dark-mode-aware chart chrome
  const radarGridColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#e2e8f0')
    : '#e2e8f0';
  const radarAxisColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#cbd5e1')
    : '#cbd5e1';
  const radarLabelColor = typeof window !== 'undefined'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--color-muted-foreground').trim() || '#64748b')
    : '#64748b';

  return (
    <div className="space-y-5">
      {/* Performance-level distribution per learning area */}
      {data.levelDistribution && data.levelDistribution.length > 0 && (
        <Section title="Performance-level distribution by learning area">
          <div className="flex flex-wrap gap-2 mb-4">
            {ALL_LEVELS.map((l) => {
              const { bg, text } = levelColour(l);
              return (
                <span key={l} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${bg} ${text}`}>
                  {LEVEL_SHORT[l]} — {l === "EE" ? "Exceeds" : l === "ME" ? "Meets" : l === "AE" ? "Approaches" : "Below"} Expectation
                </span>
              );
            })}
          </div>
          <div className="space-y-3">
            {data.levelDistribution.map((d) => <LevelDistBar key={d.learningAreaId} dist={d} />)}
          </div>
          <p className="mt-3 text-[11px] text-slate">
            * Percentage of learners at each level. No numeric mean is computed — consistent with CBE non-ranking design.
          </p>
        </Section>
      )}

      {/* Per-learner radar */}
      {data.learnerRadar && data.learnerRadar.length > 0 && (
        <Section title="Per-learner attainment radar">
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className={labelClass}>Select learner</label>
              <select className={inputClass} value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}>
                {data.learnerRadar.map((r) => (
                  <option key={r.student.id} value={r.student.id}>{r.student.fullName}</option>
                ))}
              </select>
            </div>
          </div>
          {radarStudent && (
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="w-full md:w-72">
                <RadarChart axes={radarStudent.axes.map((a) => ({ name: a.learningAreaName, value: a.value }))} />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate mb-3">Axis scale: 1 (BE) → 4 (EE). Each axis = mean attainment across all sub-strands in that learning area.</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-slate text-left">
                      <th className="pb-2 font-medium">Learning Area</th>
                      <th className="pb-2 font-medium text-center">Mean (1–4)</th>
                      <th className="pb-2 font-medium text-center">Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {radarStudent.axes.map((a) => {
                      const level = a.value > 0 ?
                        (a.value >= 3.5 ? "EE" : a.value >= 2.5 ? "ME" : a.value >= 1.5 ? "AE" : "BE") as PerformanceLevel
                        : null;
                      return (
                        <tr key={a.learningAreaId} className="border-b border-border last:border-0">
                          <td className="py-1 pr-4 font-medium text-foreground">{a.learningAreaName}</td>
                          <td className="py-1 text-center tabular-nums">{a.value > 0 ? a.value.toFixed(2) : "—"}</td>
                          <td className="py-1 text-center"><LvlBadge level={level} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Learning area summary */}
      {data.learningAreaStats && data.learningAreaStats.length > 0 && (
        <Section title="Learning area attainment summary">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-slate text-left">
                  <th className="pb-2 font-medium">Learning Area</th>
                  <th className="pb-2 font-medium text-center">Sub-strands</th>
                  <th className="pb-2 font-medium text-center">Class mean (1–4)</th>
                  <th className="pb-2 font-medium text-center">Level</th>
                </tr>
              </thead>
              <tbody>
                {data.learningAreaStats.map((a) => (
                  <tr key={a.learningAreaId} className="border-b border-border last:border-0">
                    <td className="py-1.5 font-medium text-foreground pr-4">{a.learningAreaName}</td>
                    <td className="py-1.5 text-center text-slate">{a.subStrandCount}</td>
                    <td className="py-1.5 text-center tabular-nums">{a.meanAttainment !== null ? a.meanAttainment.toFixed(2) : "—"}</td>
                    <td className="py-1.5 text-center"><LvlBadge level={a.meanLevel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Sub-strand attainment bars */}
      {data.subStrandStats && data.subStrandStats.length > 0 && (
        <Section title="Attainment by sub-strand">
          <div className="space-y-3">
            {data.subStrandStats.map((s) => (
              <div key={s.subStrandId} className="flex items-center gap-3">
                <div className="w-44 shrink-0">
                  <p className="text-xs font-medium text-foreground truncate" title={s.subStrandName}>{s.subStrandName}</p>
                  <p className="text-[10px] text-slate">{s.strandName} · {s.learningAreaName}</p>
                </div>
                <div className="flex-1 flex h-4 rounded overflow-hidden gap-px">
                  {ALL_LEVELS.map((l) => {
                    const count = s.counts[l] ?? 0;
                    const pct   = totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0;
                    if (pct === 0) return null;
                    const { bg } = levelColour(l);
                    return <div key={l} className={bg} style={{ width: `${pct}%` }} title={`${l}: ${count}`} />;
                  })}
                  {(() => { const nye = s.counts.NYE ?? 0; const pct = totalStudents > 0 ? Math.round((nye / totalStudents) * 100) : 0; return pct > 0 ? <div className="bg-slate-200 flex-1" style={{ width: `${pct}%` }} title={`NYE: ${nye}`} /> : null; })()}
                </div>
                <LvlBadge level={s.meanLevel} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Student table */}
      {data.studentTable && data.studentTable.length > 0 && data.subStrandColumns && (
        <Section title="Student attainment">
          <div className="overflow-x-auto">
            <table className="text-xs min-w-full">
              <thead>
                <tr className="border-b border-border text-slate text-left">
                  <th className="pb-2 pr-3 font-medium whitespace-nowrap">Student</th>
                  {data.subStrandColumns.map((col) => (
                    <th key={col.id} className="pb-2 px-1 font-medium text-center whitespace-nowrap" title={`${col.strandName} › ${col.learningAreaName}`}>{col.name}</th>
                  ))}
                  <th className="pb-2 pl-3 font-medium text-center">Level</th>
                </tr>
              </thead>
              <tbody>
                {data.studentTable.map((row, i) => (
                  <tr key={row.student.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-background/40"}`}>
                    <td className="py-1 pr-3 font-medium text-foreground whitespace-nowrap">{row.student.fullName}</td>
                    {row.cells.map((cell) => (
                      <td key={cell.subStrandId} className="py-1 px-1 text-center"><LvlBadge level={cell.level} /></td>
                    ))}
                    <td className="py-1 pl-3 text-center"><LvlBadge level={row.meanLevel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Senior CBE pathway dashboard view
// ---------------------------------------------------------------------------

function PathwayView({ data }: { data: PathwayData }) {
  return (
    <div className="space-y-5">
      {/* Track performance */}
      {data.trackPerformance && data.trackPerformance.length > 0 && (
        <Section title="Subject-track performance (weighted pathway score)">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.trackPerformance.map((t) => {
              const score = t.classMeanWeighted;
              const grade = score !== null ? { ...(score >= 75 ? { bg: "bg-green-100", text: "text-green-800" } : score >= 60 ? { bg: "bg-blue-100", text: "text-blue-800" } : score >= 40 ? { bg: "bg-amber-100", text: "text-amber-800" } : { bg: "bg-red-100", text: "text-red-800" }) } : null;
              return (
                <div key={t.track} className={`rounded-xl border border-border p-4 ${grade?.bg ?? ""}`}>
                  <p className={`text-sm font-semibold ${grade?.text ?? "text-foreground"}`}>{t.track}</p>
                  <p className={`text-2xl font-bold tabular-nums mt-1 ${grade?.text ?? "text-foreground"}`}>
                    {score !== null ? `${score.toFixed(1)}%` : "—"}
                  </p>
                  <p className={`text-xs mt-0.5 ${grade?.text ?? "text-slate"}`}>{t.subjectCount} subject{t.subjectCount !== 1 ? "s" : ""}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* SBA vs Exam split per subject */}
      {data.subjectStats && data.subjectStats.length > 0 && (
        <Section title="SBA vs exam score split by subject (class averages)">
          <div className="flex gap-4 mb-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-400 inline-block" /> School-Based Assessment (SBA)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> External Exam</span>
          </div>
          <div className="space-y-4">
            {data.subjectStats.filter((s) => s.studentCount > 0).map((s) => (
              <div key={s.subject.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">{s.subject.name}</span>
                  <span className="text-xs text-slate tabular-nums">
                    Weighted avg: {s.classMeanWeighted !== null ? `${s.classMeanWeighted.toFixed(1)}%` : "—"}
                    {" · "}{s.studentCount} student{s.studentCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <SplitBar sba={s.classMeanSba} exam={s.classMeanExam} sbaWeight={s.sbaWeight} examWeight={s.examWeight} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Student pathway summary */}
      {data.studentSummaries && data.studentSummaries.length > 0 && (
        <Section title="Student pathway performance overview">
          <p className="text-xs text-slate mb-3">Weighted combined score across all assessed subjects. No class ranking is produced.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-slate text-left">
                  <th className="pb-2 font-medium">Student</th>
                  <th className="pb-2 font-medium text-center">Subjects assessed</th>
                  <th className="pb-2 font-medium text-center">Overall weighted %</th>
                  <th className="pb-2 font-medium text-center">Indicative grade</th>
                </tr>
              </thead>
              <tbody>
                {data.studentSummaries.map((s, i) => {
                  const col = s.grade ? gradeColour(s.grade as Parameters<typeof gradeColour>[0]) : { bg: "", text: "text-slate" };
                  return (
                    <tr key={s.student.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-background/40"}`}>
                      <td className="py-1.5 font-medium text-foreground">{s.student.fullName}</td>
                      <td className="py-1.5 text-center tabular-nums text-slate">{s.subjectCount}</td>
                      <td className="py-1.5 text-center tabular-nums">
                        {s.overallWeighted !== null ? `${s.overallWeighted.toFixed(1)}%` : <span className="text-slate">—</span>}
                      </td>
                      <td className="py-1.5 text-center">
                        {s.grade ? (
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${col.bg} ${col.text}`}>{s.grade}</span>
                        ) : <span className="text-slate">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main enhanced CBE dashboard
// ---------------------------------------------------------------------------

export default function CbeDashboardEnhanced({ classes, defaultClassId, cbeOnly = true }: Props) {
  const cbeClasses = cbeOnly ? classes.filter((c) => c.frameworkType === "CBE") : classes;

  const [periods,  setPeriods]  = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [classId,  setClassId]  = useState(
    defaultClassId ?? cbeClasses[0]?.id ?? ""
  );
  const [view, setView] = useState<"junior" | "pathway">("junior");
  const [selectedStudent, setSelectedStudent] = useState("");

  const [juniorData,  setJuniorData]  = useState<JuniorData | null>(null);
  const [pathwayData, setPathwayData] = useState<PathwayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Load periods
  useEffect(() => {
    fetch("/api/assessments/periods")
      .then((r) => r.json())
      .then((j) => {
        if (j.periods?.length) {
          setPeriods(j.periods);
          const cur = j.periods.find((p: Period) => p.isCurrent) ?? j.periods[0];
          setPeriodId(cur.id);
        }
      })
      .catch(() => {});
  }, []);

  // Load dashboard data
  useEffect(() => {
    if (!periodId || !classId) return;
    setLoading(true);
    setError(null);
    setJuniorData(null);
    setPathwayData(null);
    setSelectedStudent("");

    Promise.all([
      fetch(`/api/assessments/cbe/dashboard?periodId=${periodId}&classId=${classId}`).then((r) => r.json()),
      fetch(`/api/assessments/cbe/pathway-dashboard?periodId=${periodId}&classId=${classId}`).then((r) => r.json()),
    ])
      .then(([junior, pathway]) => {
        if (junior.error && pathway.error) { setError(junior.error); return; }
        setJuniorData(junior);
        setPathwayData(pathway);
        if (junior.learnerRadar?.length) setSelectedStudent(junior.learnerRadar[0].student.id);
      })
      .catch(() => setError("Couldn't load CBE dashboard."))
      .finally(() => setLoading(false));
  }, [periodId, classId]);

  const hasJunior  = juniorData?.hasData  === true;
  const hasPathway = pathwayData?.hasData === true;
  const hasAnyData = hasJunior || hasPathway;

  return (
    <div>
      {/* Selectors */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        {periods.length > 0 && (
          <div>
            <label className={labelClass}>Period</label>
            <select className={inputClass} value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.academicYear}</option>
              ))}
            </select>
          </div>
        )}
        {cbeClasses.length > 1 && (
          <div>
            <label className={labelClass}>Class</label>
            <select className={inputClass} value={classId} onChange={(e) => setClassId(e.target.value)}>
              {cbeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {hasAnyData && (
          <div>
            <label className={labelClass}>View</label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setView("junior")}
                className={`rounded-l-md border border-border px-3 py-2 text-sm font-medium transition-colors ${view === "junior" ? "bg-teal text-white border-teal" : "bg-card text-foreground hover:bg-background"}`}
              >
                Junior CBE
              </button>
              <button
                type="button"
                onClick={() => setView("pathway")}
                className={`rounded-r-md border-t border-b border-r border-border px-3 py-2 text-sm font-medium transition-colors ${view === "pathway" ? "bg-teal text-white border-teal" : "bg-card text-foreground hover:bg-background"}`}
              >
                Senior CBE (Pathway)
              </button>
            </div>
          </div>
        )}
      </div>

      {error   && <ErrorBanner message={error} />}
      {loading && <p className="text-slate text-sm">Loading dashboard…</p>}

      {!loading && !hasAnyData && !error && (
        <EmptyState message="No CBE assessment entries recorded for this period and class yet." />
      )}

      {!loading && hasAnyData && view === "junior" && (
        hasJunior
          ? <JuniorView data={juniorData!} selectedStudent={selectedStudent} setSelectedStudent={setSelectedStudent} />
          : <EmptyState message="No Junior CBE (performance-level) data for this selection." />
      )}

      {!loading && hasAnyData && view === "pathway" && (
        hasPathway
          ? <PathwayView data={pathwayData!} />
          : <EmptyState message="No Senior CBE pathway (numeric) data for this selection." />
      )}

      {/* ---- AI Insights panel — lazy-mounted once period + class are both set ---- */}
      {periodId && classId && (
        <AssessmentAiPanel
          periodId={periodId}
          classId={classId}
          framework="CBE"
        />
      )}
    </div>
  );
}
