"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  ALL_LEVELS,
  levelColour,
  LEVEL_SHORT,
  type PerformanceLevel,
} from "@/lib/assessment/gradingCbe";
import { EmptyState, ErrorBanner, inputClass, labelClass } from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = { id: string; name: string; academicYear: string; isCurrent?: boolean };

type SubStrandColumn = {
  id: string; name: string; strandName: string; learningAreaName: string;
};

type SubStrandStat = {
  subStrandId: string;
  subStrandName: string;
  strandName: string;
  learningAreaName: string;
  counts: Record<PerformanceLevel | "NYE", number>;
  meanAttainment: number | null;
  meanLevel: PerformanceLevel | null;
};

type AreaStat = {
  learningAreaId: string;
  learningAreaName: string;
  subStrandCount: number;
  meanAttainment: number | null;
  meanLevel: PerformanceLevel | null;
};

type StudentTableRow = {
  student: { id: string; fullName: string; admissionNumber: string };
  cells:   { subStrandId: string; level: PerformanceLevel | null }[];
  meanAttainment: number | null;
  meanLevel: PerformanceLevel | null;
};

type DashboardData = {
  period:            { id: string; name: string; academicYear: string };
  schoolClass:       { id: string; name: string };
  hasData:           boolean;
  subStrandColumns?: SubStrandColumn[];
  subStrandStats?:   SubStrandStat[];
  learningAreaStats?: AreaStat[];
  studentTable?:     StudentTableRow[];
};

type Props = {
  classes:         { id: string; name: string }[];
  defaultClassId?: string;
};

// ---------------------------------------------------------------------------
// Sub-strand stacked bar
// ---------------------------------------------------------------------------

const StackedBar = memo(function StackedBar({ stat, total }: { stat: SubStrandStat; total: number }) {
  if (total === 0) return <span className="text-slate text-xs">—</span>;
  return (
    <div className="flex h-4 w-full rounded overflow-hidden gap-px">
      {ALL_LEVELS.map((l) => {
        const count = stat.counts[l] ?? 0;
        const pct   = Math.round((count / total) * 100);
        if (pct === 0) return null;
        const { bg } = levelColour(l);
        return (
          <div
            key={l}
            className={`${bg} flex items-center justify-center text-[10px] font-medium`}
            style={{ width: `${pct}%` }}
            title={`${l}: ${count}`}
          />
        );
      })}
      {(() => {
        const nye = stat.counts.NYE ?? 0;
        const pct = Math.round((nye / total) * 100);
        return pct > 0 ? (
          <div
            className="bg-line flex-1"
            style={{ width: `${pct}%` }}
            title={`NYE: ${nye}`}
          />
        ) : null;
      })()}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Level badge (small)
// ---------------------------------------------------------------------------

const LvlBadge = memo(function LvlBadge({ level }: { level: PerformanceLevel | null }) {
  if (!level) return <span className="text-slate text-xs">—</span>;
  const { bg, text } = levelColour(level);
  return (
    <span className={`inline-block rounded px-1 py-0.5 text-[11px] font-semibold ${bg} ${text}`}>
      {LEVEL_SHORT[level]}
    </span>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CbeDashboard({ classes, defaultClassId }: Props) {
  const [periods,  setPeriods]  = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [classId,  setClassId]  = useState(defaultClassId ?? classes[0]?.id ?? "");

  const [data,    setData]    = useState<DashboardData | null>(null);
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
    setData(null);
    fetch(`/api/assessments/cbe/dashboard?periodId=${periodId}&classId=${classId}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) setError(j.error); else setData(j); })
      .catch(() => setError("Couldn't load dashboard."))
      .finally(() => setLoading(false));
  }, [periodId, classId]);

  const totalStudents = data?.studentTable?.length ?? 0;

  // Memoised legend — ALL_LEVELS is a module constant so this only rerenders
  // when the theme or data changes, not on every filter interaction.
  const levelLegend = useMemo(() => ALL_LEVELS.map((l) => {
    const { bg, text } = levelColour(l);
    return (
      <span key={l} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${bg} ${text}`}>
        {l}
      </span>
    );
  }), []);

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
        <div>
          <label className={labelClass}>Class</label>
          <select className={inputClass} value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {error   && <ErrorBanner message={error} />}
      {loading && <p className="text-slate text-sm">Loading dashboard…</p>}

      {!loading && data && !data.hasData && (
        <EmptyState message="No CBE assessment entries recorded for this period and class yet." />
      )}

      {!loading && data && data.hasData && (
        <div className="space-y-6">

          {/* Learning area summary */}
          {data.learningAreaStats && data.learningAreaStats.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Learning area attainment</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-slate text-left">
                      <th className="pb-2 font-medium">Learning Area</th>
                      <th className="pb-2 font-medium text-center">Sub-strands</th>
                      <th className="pb-2 font-medium text-center">Mean score</th>
                      <th className="pb-2 font-medium text-center">Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.learningAreaStats.map((a) => (
                      <tr key={a.learningAreaId} className="border-b border-border last:border-0">
                        <td className="py-1.5 font-medium text-foreground pr-4">{a.learningAreaName}</td>
                        <td className="py-1.5 text-center text-slate">{a.subStrandCount}</td>
                        <td className="py-1.5 text-center tabular-nums">
                          {a.meanAttainment !== null ? a.meanAttainment.toFixed(2) : "—"}
                        </td>
                        <td className="py-1.5 text-center"><LvlBadge level={a.meanLevel} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-strand attainment bars */}
          {data.subStrandStats && data.subStrandStats.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-1">Attainment by sub-strand</h3>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                {levelLegend}
                <span className="text-xs text-slate">NYE = not yet entered</span>
              </div>
              <div className="space-y-3">
                {data.subStrandStats.map((s) => (
                  <div key={s.subStrandId} className="flex items-center gap-3">
                    <div className="w-44 shrink-0">
                      <p className="text-xs font-medium text-foreground truncate" title={s.subStrandName}>{s.subStrandName}</p>
                      <p className="text-[10px] text-slate">{s.strandName} · {s.learningAreaName}</p>
                    </div>
                    <div className="flex-1">
                      <StackedBar stat={s} total={totalStudents} />
                    </div>
                    <LvlBadge level={s.meanLevel} />
                    <div className="flex gap-1.5 text-[10px] text-slate tabular-nums w-28 shrink-0">
                      {ALL_LEVELS.map((l) => (
                        <span key={l}>{l}:{s.counts[l] ?? 0}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Student attainment table */}
          {data.studentTable && data.studentTable.length > 0 && data.subStrandColumns && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Student attainment</h3>
              <div className="overflow-x-auto">
                <table className="text-xs min-w-full">
                  <thead>
                    <tr className="border-b border-border text-slate text-left">
                      <th className="pb-2 pr-3 font-medium whitespace-nowrap">Student</th>
                      {data.subStrandColumns.map((col) => (
                        <th key={col.id} className="pb-2 px-1 font-medium text-center whitespace-nowrap" title={`${col.strandName} › ${col.learningAreaName}`}>
                          {col.name}
                        </th>
                      ))}
                      <th className="pb-2 pl-3 font-medium text-center">Mean</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.studentTable.map((row, i) => (
                      <tr key={row.student.id} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-background/40"}`}>
                        <td className="py-1 pr-3 font-medium text-foreground whitespace-nowrap">{row.student.fullName}</td>
                        {row.cells.map((cell) => (
                          <td key={cell.subStrandId} className="py-1 px-1 text-center">
                            <LvlBadge level={cell.level} />
                          </td>
                        ))}
                        <td className="py-1 pl-3 text-center">
                          <LvlBadge level={row.meanLevel} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
