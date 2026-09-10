"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { DeptAnalyticsPayload } from "@/app/api/assessments/department/analytics/route";
import type { DeptComparePayload } from "@/app/api/assessments/department/compare/route";
import ExamFilterBar, { type FilterSelection } from "@/components/assessment/ExamFilterBar";
import { labelClass, inputClass } from "@/components/ui";

// Recharts-based chart components — loaded only when the analytics panel mounts.
const DeptMeanTrend      = dynamic(() => import("./DeptMeanTrend"),       { ssr: false });
const DeptSubjectBar     = dynamic(() => import("./DeptSubjectBar"),       { ssr: false });
const DeptComparisonLine = dynamic(() => import("./DeptComparisonLine"),   { ssr: false });
const DeptHeatmap        = dynamic(() => import("./DeptHeatmap"),          { ssr: false });

interface Department {
  id: string;
  name: string;
}

interface DeptAnalyticsPageProps {
  departments: Department[];
  defaultDepartmentId?: string;
  /** Classes available to this user (role-scoped by the server page). */
  classes: { id: string; name: string; form: number }[];
  /** Subjects available to this user (role-scoped by the server page). */
  subjects: { id: string; name: string; applicableForms: number[] }[];
  /** Default period ID — passed to ExamFilterBar as a hint but ExamFilterBar
   *  still auto-selects the current period. Kept for backwards compat. */
  currentPeriodId?: string;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      {children}
    </div>
  );
}

export default function DeptAnalyticsPage({
  departments,
  defaultDepartmentId,
  classes,
  subjects,
}: DeptAnalyticsPageProps) {
  const [deptId,   setDeptId]   = useState(defaultDepartmentId ?? departments[0]?.id ?? "");

  // Filter state — driven by ExamFilterBar
  const [periodId,  setPeriodId]  = useState("");
  const [classId,   setClassId]   = useState("");
  const [subjectId, setSubjectId] = useState("");

  const handleFilterChange = useCallback((sel: FilterSelection) => {
    setPeriodId(sel.periodId);
    setClassId(sel.classId);
    setSubjectId(sel.subjectId);
  }, []);

  const [data,        setData]        = useState<DeptAnalyticsPayload | null>(null);
  const [compareData, setCompareData] = useState<DeptComparePayload | null>(null);

  const [loading,        setLoading]        = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [compareError,   setCompareError]   = useState<string | null>(null);

  // ── Single-dept analytics (subject breakdown, own trend, heatmap) ─────────
  const load = useCallback(() => {
    if (!deptId || !periodId) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ periodId, departmentId: deptId });
    if (classId)   params.set("classId",   classId);
    if (subjectId) params.set("subjectId", subjectId);

    fetch(`/api/assessments/department/analytics?${params}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError("Failed to load analytics."))
      .finally(() => setLoading(false));
  }, [deptId, periodId, classId, subjectId]);

  // ── Cross-dept comparison (re-fetches only when period or dept changes) ────
  const loadCompare = useCallback(() => {
    if (!periodId) return;
    setCompareLoading(true);
    setCompareError(null);
    fetch(`/api/assessments/department/compare?periodId=${periodId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error) setCompareError(d.error); else setCompareData(d); })
      .catch(() => setCompareError("Failed to load comparison data."))
      .finally(() => setCompareLoading(false));
  }, [periodId]);

  useEffect(() => { load(); },        [load]);
  useEffect(() => { loadCompare(); }, [loadCompare]);

  const isPartial =
    data &&
    data.subjectBreakdown.some((s) => s.meanPoints === null) &&
    data.subjectBreakdown.some((s) => s.meanPoints !== null);

  return (
    <div className="space-y-5">

      {/* ── Department selector (not part of cascade) ── */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="da-dept" className={labelClass}>Department</label>
          <select
            id="da-dept"
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            className={inputClass}
            style={{ minWidth: 180 }}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Cascading filter bar: Period → Form → Stream → Subject ── */}
      <ExamFilterBar
        classes={classes}
        subjects={subjects}
        hideSubject={false}
        onChange={handleFilterChange}
      />

      {/* ── Errors ── */}
      {error && (
        <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
      )}

      {/* ── Partial data notice ── */}
      {isPartial && !loading && (
        <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
          Some subjects have incomplete mark entry. Charts show partial data.
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-line/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Charts ── */}
      {!loading && data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* 1 — Subject breakdown for the selected dept */}
          <ChartCard title="Subject Breakdown">
            <DeptSubjectBar
              data={data.subjectBreakdown}
              drillDownBase="/principal/assessments/dashboard"
            />
          </ChartCard>

          {/* 2 — Selected dept's own mean trend vs school average */}
          <ChartCard title="Department Mean Trend">
            <DeptMeanTrend data={data.trendData} deptName={data.departmentName} />
          </ChartCard>

          {/* 3 — All departments compared on one chart */}
          <ChartCard title="All Departments Comparison">
            {compareLoading && (
              <div className="h-48 rounded-lg bg-line/40 animate-pulse" />
            )}
            {compareError && (
              <div className="rounded-md bg-danger-bg text-danger text-xs px-3 py-2">
                {compareError}
              </div>
            )}
            {!compareLoading && compareData && (
              <DeptComparisonLine
                data={compareData}
                activePeriodId={periodId}
                activeDeptId={deptId}
              />
            )}
          </ChartCard>

          {/* 4 — Class × Subject heatmap */}
          <ChartCard title="Class × Subject Heatmap">
            <DeptHeatmap cells={data.heatmap} />
          </ChartCard>

        </div>
      )}
    </div>
  );
}
