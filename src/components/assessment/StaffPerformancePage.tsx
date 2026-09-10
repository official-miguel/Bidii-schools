"use client";

import { useEffect, useState, useCallback } from "react";
import type { TeacherRankResult } from "@/lib/assessment/teacherRanking";
import Top3Leaderboard from "./Top3Leaderboard";
import DeptTop3Leaderboard from "./DeptTop3Leaderboard";
import StaffRankTable from "./StaffRankTable";
import RankIcon from "./RankIcon";
import { ChevronDown, TrendingUp, TrendingDown, Minus } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeptStub {
  id: string;
  name: string;
}

interface RankingResponse {
  scope: "school" | "department";
  top3: TeacherRankResult[];
  schoolTop3?: TeacherRankResult[];
  fullList: TeacherRankResult[];
  ownRow: TeacherRankResult | null;
  ownDepartmentId: string | null;
  departments: DeptStub[];
}

interface StaffPerformancePageProps {
  /**
   * "teacher"  — sees own rank card + school view + dept view
   * "hod"      — sees dept leaderboard (own dept only) + full dept table
   * "director" — sees all-school view with dept tabs + full table per tab
   */
  viewMode: "teacher" | "hod" | "director";
  periodId: string;
  /** Pre-resolved primary dept id. */
  departmentId?: string;
  /**
   * All departments this teacher belongs to (primary + HOD roles).
   * When length > 1 a filter dropdown appears in "My Department" view.
   */
  teacherDepartments?: DeptStub[];
  /** For row highlight in the table. */
  currentTeacherId?: string;
  periods: Array<{ id: string; name: string; academicYear: string; term: number | null }>;
  /** Pre-loaded department list (director/principal only). */
  initialDepartments?: DeptStub[];
}

// ---------------------------------------------------------------------------
// OwnRankCard — shown in both School and Dept views
// ---------------------------------------------------------------------------

function OwnRankCard({ row, context }: { row: TeacherRankResult; context: "school" | "dept" }) {
  const trendIcon =
    row.trendDirection === 1  ? <TrendingUp  className="w-4 h-4 text-green-600" /> :
    row.trendDirection === -1 ? <TrendingDown className="w-4 h-4 text-danger"   /> :
                                <Minus        className="w-4 h-4 text-slate"    />;
  const trendLabel =
    row.trendDirection === 1  ? "Improved from last period" :
    row.trendDirection === -1 ? "Declined from last period" :
                                "Stable this period";
  const trendColour =
    row.trendDirection === 1  ? "text-green-600" :
    row.trendDirection === -1 ? "text-danger"    : "text-slate";

  return (
    <div className="bg-card border border-royal/20 rounded-xl p-5 shadow-sm flex items-start gap-5">
      {/* Rank icon */}
      <div className="shrink-0 flex flex-col items-center gap-1">
        <RankIcon rank={row.rank} size={48} />
        <span className="text-[11px] font-bold text-slate tabular-nums">#{row.rank}</span>
      </div>

      {/* Stats */}
      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <p className="text-xs text-slate font-medium uppercase tracking-wide">
            Your Ranking
            {context === "dept" && row.departmentName && (
              <span className="ml-1.5 normal-case font-normal">— {row.departmentName}</span>
            )}
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-bold text-royal">#{row.rank}</span>
            <span className="text-sm text-slate">
              · {(row.compositeScore * 100).toFixed(1)} composite pts
            </span>
          </div>
        </div>

        <div className={`flex items-center gap-1.5 text-sm font-medium ${trendColour}`}>
          {trendIcon}
          {trendLabel}
        </div>

        <div className="grid grid-cols-3 gap-3 text-xs text-slate pt-1">
          <div className="rounded-lg border border-border bg-background/60 p-2 text-center">
            <p className="font-semibold text-foreground text-sm tabular-nums">
              {Math.round(row.completionScore * 100)}%
            </p>
            <p className="mt-0.5">Mark entry</p>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-2 text-center">
            <p className="font-semibold text-foreground text-sm tabular-nums">
              {row.absoluteMean?.toFixed(1) ?? "—"}
            </p>
            <p className="mt-0.5">Mean pts</p>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-2 text-center">
            <p className="font-semibold text-foreground text-sm tabular-nums">
              {row.prevMean?.toFixed(1) ?? "—"}
            </p>
            <p className="mt-0.5">Prev period</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Director tab bar
// ---------------------------------------------------------------------------

interface TabBarProps {
  tabs: Array<{ id: string | null; label: string }>;
  active: string | null;
  onChange: (id: string | null) => void;
}

function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.id ?? "__school__"}
          onClick={() => onChange(t.id)}
          className={`shrink-0 px-3 py-1.5 rounded-t-md text-sm font-medium transition-colors ${
            active === t.id
              ? "bg-royal text-white"
              : "text-slate hover:text-foreground hover:bg-background"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StaffPerformancePage({
  viewMode,
  periodId: defaultPeriodId,
  departmentId: propDeptId,
  teacherDepartments = [],
  currentTeacherId,
  periods,
  initialDepartments = [],
}: StaffPerformancePageProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [periodId,     setPeriodId]     = useState(defaultPeriodId);
  const [data,         setData]         = useState<RankingResponse | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // For teacher/hod: which top-level view ("school" | "dept")
  const [view, setView] = useState<"school" | "dept">(propDeptId ? "school" : "school");

  // For teacher with multiple depts: which dept is selected
  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    teacherDepartments[0]?.id ?? propDeptId ?? ""
  );

  // For director: which dept tab is active (null = all school)
  const [activeDeptId, setActiveDeptId] = useState<string | null>(null);

  // Director department list — merges server list + API response
  const [departments, setDepartments] = useState<DeptStub[]>(initialDepartments);

  const hasMultipleDepts = teacherDepartments.length > 1;

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const fetchRanking = useCallback(async (pid: string, scope: "school" | "department", deptId?: string) => {
    if (!pid) return;
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({ periodId: pid });
    if (scope === "department" && deptId) {
      qs.set("scope", "department");
      qs.set("departmentId", deptId);
    } else {
      qs.set("scope", "school");
    }

    try {
      const res = await fetch(`/api/assessments/staff/ranking?${qs}`);
      const d: RankingResponse = await res.json();
      if ("error" in d) {
        setError((d as { error: string }).error);
      } else {
        setData(d);
        if (d.departments.length > 0) setDepartments(d.departments);
      }
    } catch {
      setError("Failed to load ranking data.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Determine what to fetch based on current state
  useEffect(() => {
    if (viewMode === "director") {
      // Director: fetch school or dept scope based on active tab
      fetchRanking(periodId, activeDeptId ? "department" : "school", activeDeptId ?? undefined);
    } else if (viewMode === "teacher" || viewMode === "hod") {
      if (view === "dept") {
        fetchRanking(periodId, "department", selectedDeptId || propDeptId);
      } else {
        fetchRanking(periodId, "school");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId, view, selectedDeptId, activeDeptId, viewMode]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isDirector     = viewMode === "director";
  const isTeacherOrHod = viewMode === "teacher" || viewMode === "hod";

  const activeDeptName =
    departments.find((d) => d.id === activeDeptId)?.name ??
    teacherDepartments.find((d) => d.id === selectedDeptId)?.name ??
    data?.top3[0]?.departmentName ??
    "Department";

  const directorTabs = isDirector
    ? [
        { id: null,  label: "School" },
        ...departments.map((d) => ({ id: d.id, label: d.name })),
      ]
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Controls row ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4">

        {/* Period picker */}
        <div>
          <label className="block text-xs font-medium text-slate mb-1">Period</label>
          <div className="relative">
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              className="appearance-none rounded-lg border border-border bg-card pl-3 pr-8 py-2 text-sm text-foreground focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15 transition-colors"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.term ? `Term ${p.term} — ${p.academicYear}` : `${p.name} — ${p.academicYear}`}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
          </div>
        </div>

        {/* Teacher / HOD: School | My Department toggle */}
        {isTeacherOrHod && propDeptId && (
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            <button
              onClick={() => setView("school")}
              className={`px-4 py-2 transition-colors font-medium ${
                view === "school"
                  ? "bg-royal text-white"
                  : "text-slate hover:bg-background hover:text-foreground"
              }`}
            >
              School
            </button>
            <button
              onClick={() => setView("dept")}
              className={`px-4 py-2 transition-colors font-medium ${
                view === "dept"
                  ? "bg-royal text-white"
                  : "text-slate hover:bg-background hover:text-foreground"
              }`}
            >
              My Department
            </button>
          </div>
        )}

        {/* Multi-dept selector — only shown when viewing dept and has multiple depts */}
        {isTeacherOrHod && view === "dept" && hasMultipleDepts && (
          <div>
            <label className="block text-xs font-medium text-slate mb-1">Department</label>
            <div className="relative">
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="appearance-none rounded-lg border border-border bg-card pl-3 pr-8 py-2 text-sm text-foreground focus:border-royal focus:outline-none focus:ring-2 focus:ring-royal/15 transition-colors"
              >
                {teacherDepartments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate" />
            </div>
          </div>
        )}
      </div>

      {/* ── Director dept tab bar ─────────────────────────────────────────── */}
      {isDirector && directorTabs.length > 1 && (
        <TabBar tabs={directorTabs} active={activeDeptId} onChange={setActiveDeptId} />
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-md bg-danger-bg text-danger text-sm px-3 py-2">{error}</div>
      )}

      {/* ── Skeleton ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-4">
          <div className="h-28 rounded-xl bg-line/40 animate-pulse" />
          <div className="h-48 rounded-xl bg-line/40 animate-pulse" />
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {!loading && data && (
        <div className="space-y-8">

          {/* Recognition note */}
          <p className="text-sm text-slate">
            Rankings recognise consistent mark entry, student improvement, and overall
            performance. Use this as a coaching guide, not a judgment.
          </p>

          {/* ==============================================================
              TEACHER VIEW
              School: School Top Performers → Your Ranking → Full School Ranking
              Dept:   Top Performers This Period → Your Ranking → Full Dept Ranking
          ============================================================== */}
          {viewMode === "teacher" && (
            <div className="space-y-8">

              {/* ── SCHOOL VIEW ── */}
              {view === "school" && (
                <>
                  {/* School top performers */}
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">School Top Performers</h3>
                    <Top3Leaderboard
                      top3={data.top3}
                      highlightTeacherId={currentTeacherId}
                    />
                  </div>

                  {/* Your ranking */}
                  {data.ownRow ? (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">Your Ranking</h3>
                      <OwnRankCard row={data.ownRow} context="school" />
                    </div>
                  ) : (
                    <p className="text-sm text-slate italic">No ranking data for you this period.</p>
                  )}

                  {/* Full school ranking */}
                  {data.fullList.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">Full School Ranking</h3>
                      <StaffRankTable
                        rows={data.fullList}
                        highlightTeacherId={currentTeacherId}
                        showDepartmentColumn={true}
                      />
                    </div>
                  )}
                </>
              )}

              {/* ── DEPT VIEW ── */}
              {view === "dept" && (
                <>
                  {/* Top performers this period */}
                  <div>
                    <DeptTop3Leaderboard
                      top3={data.top3}
                      departmentName={activeDeptName}
                      highlightTeacherId={currentTeacherId}
                    />
                  </div>

                  {/* Your ranking */}
                  {data.ownRow ? (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">Your Ranking</h3>
                      <OwnRankCard row={data.ownRow} context="dept" />
                    </div>
                  ) : (
                    <p className="text-sm text-slate italic">No ranking data for you this period.</p>
                  )}

                  {/* Full department ranking */}
                  {data.fullList.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">
                        Full {activeDeptName} Ranking
                      </h3>
                      <StaffRankTable
                        rows={data.fullList}
                        highlightTeacherId={currentTeacherId}
                        showDepartmentColumn={false}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ==============================================================
              HOD VIEW — same structure as teacher
          ============================================================== */}
          {viewMode === "hod" && (
            <div className="space-y-8">
              {view === "school" ? (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">School Top Performers</h3>
                    <Top3Leaderboard top3={data.top3} highlightTeacherId={currentTeacherId} />
                  </div>
                  {data.ownRow && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">Your Ranking</h3>
                      <OwnRankCard row={data.ownRow} context="school" />
                    </div>
                  )}
                  {data.fullList.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">Full School Ranking</h3>
                      <StaffRankTable
                        rows={data.fullList}
                        highlightTeacherId={currentTeacherId}
                        showDepartmentColumn={true}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <DeptTop3Leaderboard
                    top3={data.top3}
                    departmentName={activeDeptName}
                    highlightTeacherId={currentTeacherId}
                  />
                  {data.ownRow && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">Your Ranking</h3>
                      <OwnRankCard row={data.ownRow} context="dept" />
                    </div>
                  )}
                  {data.fullList.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">
                        Full {activeDeptName} Ranking
                      </h3>
                      <StaffRankTable
                        rows={data.fullList}
                        highlightTeacherId={currentTeacherId}
                        showDepartmentColumn={false}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ==============================================================
              DIRECTOR / PRINCIPAL VIEW
              School tab: School Top Performers → Your Ranking → Full Ranking
              Dept tab:   Top Performers → Full Dept Table + School ref
          ============================================================== */}
          {viewMode === "director" && (
            <div className="space-y-8">
              {!activeDeptId ? (
                /* School tab */
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3">School Top Performers</h3>
                    <Top3Leaderboard top3={data.top3} highlightTeacherId={currentTeacherId} />
                  </div>
                  {data.ownRow && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">Your Ranking</h3>
                      <OwnRankCard row={data.ownRow} context="school" />
                    </div>
                  )}
                  {data.fullList.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">Full School Ranking</h3>
                      <StaffRankTable
                        rows={data.fullList}
                        highlightTeacherId={currentTeacherId}
                        showDepartmentColumn={true}
                      />
                    </div>
                  )}
                </>
              ) : (
                /* Dept tab */
                <>
                  <DeptTop3Leaderboard
                    top3={data.top3}
                    departmentName={activeDeptName}
                    highlightTeacherId={currentTeacherId}
                  />
                  {data.ownRow && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">Your Ranking</h3>
                      <OwnRankCard row={data.ownRow} context="dept" />
                    </div>
                  )}
                  {data.fullList.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3">
                        {activeDeptName} Department Ranking
                      </h3>
                      <StaffRankTable
                        rows={data.fullList}
                        highlightTeacherId={currentTeacherId}
                        showDepartmentColumn={false}
                      />
                    </div>
                  )}

                  {data.schoolTop3 && data.schoolTop3.length > 0 && (
                    <details className="rounded-xl border border-border bg-background/50">
                      <summary className="px-4 py-3 text-sm font-medium text-foreground cursor-pointer select-none">
                        School-wide Top Performers (reference)
                      </summary>
                      <div className="px-4 pb-4 pt-2">
                        <Top3Leaderboard top3={data.schoolTop3} />
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
