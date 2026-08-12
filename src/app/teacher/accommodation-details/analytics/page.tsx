"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart2, BedDouble,
  AlertTriangle, Award, Shield, Calendar,
  RefreshCw, ChevronRight, Star, Flame,
  BookOpen,
} from "lucide-react";
import { PageHeader, ErrorBanner } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Risk { type: string; message: string; severity: "high" | "medium" | "low"; }

interface DormAnalytics {
  id: string; name: string; genderPolicy: string; status: string;
  boardingMasterName: string | null;
  capacity: number; occupied: number; available: number; occupancyPct: number;
  attendance: {
    pct: number | null; present: number; absent: number; total: number;
    byMonth: Record<string, { present: number; absent: number }>;
  };
  discipline: {
    total: number; open: number; resolved: number; casesPer10Students: number;
  };
  academic: {
    avgScore: number | null; minScore: number | null; maxScore: number | null;
    sampleSize: number;
  };
  inspection: { score: number | null; rating: string | null; date: string } | null;
  movement: { byMonth: Record<string, { in: number; out: number }> };
  risks: Risk[];
}

// ── Visual helpers ────────────────────────────────────────────────────────────

const RISK_COLOR: Record<string, string> = {
  high:   "bg-danger/10 border-danger/20 text-danger",
  medium: "bg-warn/10 border-warn/20 text-warn",
  low:    "bg-slate/10 border-line text-slate",
};

const RATING_COLOR: Record<string, string> = {
  EXCELLENT:         "text-success bg-success/10 border-success/20",
  GOOD:              "text-teal bg-teal/10 border-teal/20",
  SATISFACTORY:      "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20",
  NEEDS_IMPROVEMENT: "text-warn bg-warn-bg/50 border-warn/20",
  POOR:              "text-danger bg-danger/10 border-danger/20",
};

function MiniBar({ value, max, color = "bg-teal" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-line dark:bg-dark-border overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ScoreRing({ score, size = 52 }: { score: number | null; size?: number }) {
  if (score === null)
    return (
      <div
        className="rounded-full bg-line dark:bg-dark-border flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-xs text-slate">—</span>
      </div>
    );
  const color = score >= 80 ? "text-success" : score >= 60 ? "text-amber-500" : "text-danger";
  const ring  = score >= 80 ? "border-success/40" : score >= 60 ? "border-amber-400/40" : "border-danger/40";
  return (
    <div
      className={`rounded-full border-2 flex flex-col items-center justify-center ${ring}`}
      style={{ width: size, height: size }}
    >
      <span className={`text-sm font-bold tabular-nums leading-none ${color}`}>{Math.round(score)}</span>
      <span className="text-[9px] text-slate dark:text-dark-muted">avg</span>
    </div>
  );
}

function Sparkline({ data, color = "bg-teal" }: { data: number[]; color?: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${color} opacity-70`}
          style={{ height: `${Math.max((v / max) * 100, 4)}%` }}
        />
      ))}
    </div>
  );
}

// ── DormAnalyticsCard ─────────────────────────────────────────────────────────

function DormAnalyticsCard({ dorm, rank }: { dorm: DormAnalytics; rank?: number }) {
  const [expanded, setExpanded] = useState(false);

  const occupancyColor = dorm.occupancyPct >= 95 ? "bg-danger" : dorm.occupancyPct >= 80 ? "bg-warn" : "bg-teal";
  const attendanceColor = !dorm.attendance.pct ? "text-slate"
    : dorm.attendance.pct >= 90 ? "text-success"
    : dorm.attendance.pct >= 75 ? "text-warn"
    : "text-danger";
  const academicColor = !dorm.academic.avgScore ? "text-slate"
    : dorm.academic.avgScore >= 70 ? "text-success"
    : dorm.academic.avgScore >= 50 ? "text-warn"
    : "text-danger";

  const monthlyAttendance = Object.entries(dorm.attendance.byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([, v]) =>
      v.present + v.absent > 0 ? Math.round((v.present / (v.present + v.absent)) * 100) : 0
    );

  return (
    <div
      className={`rounded-xl border bg-card dark:bg-dark-surface transition-all ${
        dorm.risks.some((r) => r.severity === "high")
          ? "border-danger/30 dark:border-danger/20"
          : "border-line dark:border-dark-border"
      }`}
    >
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {rank && (
                <span
                  className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold ${
                    rank === 1 ? "bg-amber-400 text-white"
                    : rank === 2 ? "bg-slate-400 text-white"
                    : rank === 3 ? "bg-amber-600 text-white"
                    : "bg-slate-100 text-slate dark:bg-dark-border"
                  }`}
                >
                  {rank}
                </span>
              )}
              <Link
                href={`/teacher/accommodation-details/dormitories/${dorm.id}`}
                className="text-sm font-semibold text-ink hover:text-teal transition-colors dark:text-dark-text dark:hover:text-teal truncate"
              >
                {dorm.name}
              </Link>
            </div>
            {dorm.boardingMasterName && (
              <p className="text-xs text-slate dark:text-dark-muted mt-0.5">{dorm.boardingMasterName}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold tabular-nums text-ink dark:text-dark-text">{dorm.occupancyPct}%</p>
            <p className="text-[10px] text-slate dark:text-dark-muted">{dorm.occupied}/{dorm.capacity}</p>
          </div>
        </div>

        <div className="w-full h-1.5 rounded-full bg-line dark:bg-dark-border overflow-hidden mb-3">
          <div className={`h-full rounded-full ${occupancyColor}`}
            style={{ width: `${Math.min(dorm.occupancyPct, 100)}%` }} />
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className={`text-sm font-bold tabular-nums ${attendanceColor}`}>
              {dorm.attendance.pct !== null ? `${dorm.attendance.pct}%` : "—"}
            </p>
            <p className="text-[9px] text-slate dark:text-dark-muted uppercase tracking-wide">Attend.</p>
          </div>
          <div>
            <p className={`text-sm font-bold tabular-nums ${academicColor}`}>
              {dorm.academic.avgScore !== null ? `${dorm.academic.avgScore}` : "—"}
            </p>
            <p className="text-[9px] text-slate dark:text-dark-muted uppercase tracking-wide">Acad.</p>
          </div>
          <div>
            <p className={`text-sm font-bold tabular-nums ${dorm.discipline.open > 3 ? "text-danger" : dorm.discipline.open > 0 ? "text-warn" : "text-success"}`}>
              {dorm.discipline.open}
            </p>
            <p className="text-[9px] text-slate dark:text-dark-muted uppercase tracking-wide">Indiscipline</p>
          </div>
          <div>
            {dorm.inspection ? (
              <p className={`text-sm font-bold tabular-nums ${dorm.inspection.score !== null && dorm.inspection.score >= 70 ? "text-success" : "text-warn"}`}>
                {dorm.inspection.score !== null ? `${Math.round(dorm.inspection.score)}` : "—"}
              </p>
            ) : <p className="text-sm font-bold text-slate">—</p>}
            <p className="text-[9px] text-slate dark:text-dark-muted uppercase tracking-wide">Insp.</p>
          </div>
        </div>
      </div>

      {dorm.risks.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {dorm.risks.map((r, i) => (
            <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${RISK_COLOR[r.severity]}`}>
              <AlertTriangle className="h-2.5 w-2.5" /> {r.message}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-2.5 border-t border-line dark:border-dark-border text-xs text-slate hover:text-teal hover:bg-teal/5 transition-colors rounded-b-xl"
      >
        <span>{expanded ? "Hide details" : "Show details"}</span>
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-line dark:border-dark-border px-4 py-4 space-y-4 bg-paper/50 dark:bg-dark-bg/30 rounded-b-xl">
          <div>
            <p className="text-xs font-semibold text-ink dark:text-dark-text mb-1.5">Attendance trend (6 months)</p>
            {monthlyAttendance.length > 0
              ? <Sparkline data={monthlyAttendance} color={dorm.attendance.pct && dorm.attendance.pct >= 80 ? "bg-teal" : "bg-warn"} />
              : <p className="text-xs text-slate dark:text-dark-muted">No data</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-ink dark:text-dark-text mb-1.5">Academic performance</p>
            {dorm.academic.avgScore !== null ? (
              <div className="flex items-center gap-3">
                <ScoreRing score={dorm.academic.avgScore} />
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[10px] text-slate dark:text-dark-muted">
                    <span>Min: {dorm.academic.minScore}</span>
                    <span>Avg: {dorm.academic.avgScore}</span>
                    <span>Max: {dorm.academic.maxScore}</span>
                  </div>
                  <MiniBar value={dorm.academic.avgScore} max={100}
                    color={dorm.academic.avgScore >= 70 ? "bg-success" : dorm.academic.avgScore >= 50 ? "bg-amber-400" : "bg-danger"} />
                </div>
              </div>
            ) : <p className="text-xs text-slate dark:text-dark-muted">No assessment data in period</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-ink dark:text-dark-text mb-1.5">Indiscipline cases</p>
            <div className="flex gap-4 text-xs">
              <span className="text-slate dark:text-dark-muted">Total: <strong className="text-ink dark:text-dark-text">{dorm.discipline.total}</strong></span>
              <span className="text-slate dark:text-dark-muted">Open: <strong className={dorm.discipline.open > 0 ? "text-warn" : "text-success"}>{dorm.discipline.open}</strong></span>
              <span className="text-slate dark:text-dark-muted">Resolved: <strong className="text-success">{dorm.discipline.resolved}</strong></span>
            </div>
          </div>
          {dorm.inspection && (
            <div>
              <p className="text-xs font-semibold text-ink dark:text-dark-text mb-1.5">Last inspection</p>
              <div className="flex items-center gap-3">
                {dorm.inspection.rating && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${RATING_COLOR[dorm.inspection.rating] ?? ""}`}>
                    {dorm.inspection.rating.replace("_", " ")}
                  </span>
                )}
                {dorm.inspection.score !== null && (
                  <span className="text-xs text-ink dark:text-dark-text font-semibold">
                    {Math.round(dorm.inspection.score)}/100
                  </span>
                )}
                <span className="text-xs text-slate dark:text-dark-muted">
                  {new Date(dorm.inspection.date).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}
          <Link
            href={`/teacher/accommodation-details/dormitories/${dorm.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-teal font-medium hover:underline"
          >
            View dorm positions <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Analytics inner (needs useSearchParams, must be inside Suspense) ──────────

function AnalyticsInner() {
  const searchParams = useSearchParams();
  const focusDormId = searchParams.get("dormId");

  const [data,       setData]       = useState<DormAnalytics[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [months,     setMonths]     = useState("6");
  const [sortBy,     setSortBy]     = useState<"occupancy" | "attendance" | "academic" | "discipline" | "inspection">("occupancy");
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState("");

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const url = focusDormId
        ? `/api/accommodation/analytics?months=${months}&dormId=${focusDormId}`
        : `/api/accommodation/analytics?months=${months}`;
      const res = await fetch(url);
      if (!res.ok) { setError("Failed to load analytics."); return; }
      setData(await res.json());
    } catch { setError("Network error."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [months, focusDormId]);

  useEffect(() => { load(); }, [load]);

  const filtered = data.filter((d) => !search || d.name.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "occupancy")  return b.occupancyPct - a.occupancyPct;
    if (sortBy === "attendance") return (b.attendance.pct ?? -1) - (a.attendance.pct ?? -1);
    if (sortBy === "academic")   return (b.academic.avgScore ?? -1) - (a.academic.avgScore ?? -1);
    if (sortBy === "discipline") return a.discipline.open - b.discipline.open;
    if (sortBy === "inspection") return (b.inspection?.score ?? -1) - (a.inspection?.score ?? -1);
    return 0;
  });

  const withAttendance = data.filter((d) => d.attendance.pct !== null);
  const withAcademic   = data.filter((d) => d.academic.avgScore !== null);
  const withInspection = data.filter((d) => d.inspection !== null && d.inspection.score !== null);
  const bestAttendance  = [...withAttendance].sort((a, b) => (b.attendance.pct ?? 0) - (a.attendance.pct ?? 0))[0];
  const bestAcademic    = [...withAcademic].sort((a, b) => (b.academic.avgScore ?? 0) - (a.academic.avgScore ?? 0))[0];
  const bestDiscipline  = [...data].sort((a, b) => a.discipline.open - b.discipline.open)[0];
  const bestInspection  = [...withInspection].sort((a, b) => (b.inspection?.score ?? 0) - (a.inspection?.score ?? 0))[0];
  const highestOccupancy = [...data].sort((a, b) => b.occupancyPct - a.occupancyPct)[0];

  const allRisks     = data.flatMap((d) => d.risks.map((r) => ({ ...r, dormName: d.name })));
  const highRisks    = allRisks.filter((r) => r.severity === "high");
  const totalOpen    = data.reduce((s, d) => s + d.discipline.open, 0);
  const avgAttendance = withAttendance.length > 0
    ? Math.round(withAttendance.reduce((s, d) => s + (d.attendance.pct ?? 0), 0) / withAttendance.length) : null;
  const avgAcademic = withAcademic.length > 0
    ? Math.round(withAcademic.reduce((s, d) => s + (d.academic.avgScore ?? 0), 0) / withAcademic.length) : null;
  const totalOccupied  = data.reduce((s, d) => s + d.occupied, 0);
  const totalCapacity  = data.reduce((s, d) => s + d.capacity, 0);
  const overallOccupancy = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  if (loading) {
    return (
      <div className="space-y-4 mt-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-line/40 dark:bg-dark-border/40 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-52 rounded-xl bg-line/40 dark:bg-dark-border/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={focusDormId && data[0] ? `${data[0].name} — Analytics` : "Dorm Analytics"}
        description="Cross-module performance — academic, attendance, discipline, inspection, and occupancy."
        action={
          <div className="flex items-center gap-2">
            <select
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="text-sm border border-line rounded-lg px-3 py-2 bg-white dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
            >
              {[["3","3 months"],["6","6 months"],["12","12 months"],["24","24 months"]].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-line bg-white text-slate hover:text-ink hover:bg-paper disabled:opacity-50 transition-all dark:bg-dark-surface dark:border-dark-border"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}

      {data.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <BarChart2 className="h-10 w-10 text-slate/50" />
          <p className="text-ink font-medium dark:text-dark-text">No analytics data yet</p>
        </div>
      )}

      {data.length > 0 && (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Overall occupancy", value: `${overallOccupancy}%`, sub: `${totalOccupied}/${totalCapacity} spaces`,       icon: BedDouble, color: overallOccupancy >= 90 ? "text-warn" : "text-teal", bg: "bg-teal/10" },
              { label: "Avg. attendance",   value: avgAttendance !== null ? `${avgAttendance}%` : "—", sub: `across ${withAttendance.length} dorms`, icon: Calendar, color: avgAttendance && avgAttendance >= 80 ? "text-success" : "text-warn", bg: "bg-success/10" },
              { label: "Avg. academic",     value: avgAcademic !== null ? `${avgAcademic}` : "—",      sub: `${withAcademic.length} dorms with data`, icon: BookOpen,  color: avgAcademic && avgAcademic >= 60 ? "text-teal" : "text-warn", bg: "bg-teal/10" },
              { label: "Open indiscipline", value: `${totalOpen}`,                                     sub: "cases across all dorms",                icon: Shield,   color: totalOpen > 5 ? "text-danger" : totalOpen > 0 ? "text-warn" : "text-success", bg: totalOpen > 5 ? "bg-danger/10" : "bg-success/10" },
            ].map(({ label, value, sub, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-xl border border-line bg-card p-4 dark:bg-dark-surface dark:border-dark-border">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
                    <p className="text-sm text-slate mt-0.5 dark:text-dark-muted">{label}</p>
                    <p className="text-xs text-slate/60 dark:text-dark-muted/60">{sub}</p>
                  </div>
                  <div className={`rounded-lg p-2 shrink-0 ${bg}`}><Icon className={`h-5 w-5 ${color}`} /></div>
                </div>
              </div>
            ))}
          </div>

          {/* Risk indicators */}
          {highRisks.length > 0 && (
            <div className="mb-6 rounded-xl border border-danger/20 bg-danger/5 dark:bg-danger/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
                <p className="text-sm font-semibold text-danger">
                  {highRisks.length} high-priority risk indicator{highRisks.length !== 1 ? "s" : ""} detected
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {highRisks.map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-danger/10 text-danger border border-danger/20">
                    <strong>{r.dormName}:</strong> {r.message}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Achievements */}
          {!focusDormId && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-ink dark:text-dark-text mb-3 flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-500" /> Achievements &amp; Rankings
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                {bestAttendance && (
                  <div className="rounded-xl border border-success/30 bg-success/5 text-success p-4 flex items-start gap-3 dark:bg-success/10">
                    <Calendar className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Best attendance</p>
                      <p className="text-sm font-bold truncate mt-0.5">{bestAttendance.name}</p>
                      <p className="text-xs opacity-80">{bestAttendance.attendance.pct}% attendance rate</p>
                    </div>
                  </div>
                )}
                {bestAcademic && (
                  <div className="rounded-xl border border-teal/30 bg-teal/5 text-teal p-4 flex items-start gap-3 dark:bg-teal/10">
                    <BookOpen className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Top academic</p>
                      <p className="text-sm font-bold truncate mt-0.5">{bestAcademic.name}</p>
                      <p className="text-xs opacity-80">Avg score {bestAcademic.academic.avgScore}</p>
                    </div>
                  </div>
                )}
                {bestDiscipline && bestDiscipline.discipline.open === 0 && (
                  <div className="rounded-xl border border-blue-300 bg-blue-50 text-blue-700 p-4 flex items-start gap-3 dark:bg-blue-900/20 dark:text-blue-300">
                    <Shield className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Best conduct</p>
                      <p className="text-sm font-bold truncate mt-0.5">{bestDiscipline.name}</p>
                      <p className="text-xs opacity-80">Zero indiscipline cases</p>
                    </div>
                  </div>
                )}
                {bestInspection && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-700 p-4 flex items-start gap-3 dark:bg-amber-900/20 dark:text-amber-300">
                    <Star className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Cleanest dorm</p>
                      <p className="text-sm font-bold truncate mt-0.5">{bestInspection.name}</p>
                      <p className="text-xs opacity-80">Score {Math.round(bestInspection.inspection?.score ?? 0)}/100</p>
                    </div>
                  </div>
                )}
                {highestOccupancy && highestOccupancy.occupancyPct >= 90 && (
                  <div className="rounded-xl border border-orange-300 bg-orange-50 text-orange-700 p-4 flex items-start gap-3 dark:bg-orange-900/20 dark:text-orange-300">
                    <Flame className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Highest demand</p>
                      <p className="text-sm font-bold truncate mt-0.5">{highestOccupancy.name}</p>
                      <p className="text-xs opacity-80">{highestOccupancy.occupancyPct}% full</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dorm cards */}
          <div className="flex items-center justify-between mb-3 gap-4">
            <h2 className="text-sm font-semibold text-ink dark:text-dark-text">
              {focusDormId ? "Dormitory Analytics" : "All Dormitories"}
            </h2>
            <div className="flex items-center gap-2">
              {!focusDormId && (
                <input
                  type="text"
                  placeholder="Filter dorms..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="px-3 py-2 border border-line rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal/20 dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
                />
              )}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="text-xs border border-line rounded-lg px-2.5 py-2 bg-white dark:bg-dark-surface dark:border-dark-border dark:text-dark-text"
              >
                <option value="occupancy">Sort: Occupancy</option>
                <option value="attendance">Sort: Attendance</option>
                <option value="academic">Sort: Academic</option>
                <option value="discipline">Sort: Indiscipline (fewest)</option>
                <option value="inspection">Sort: Inspection</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sorted.map((dorm, i) => (
              <DormAnalyticsCard key={dorm.id} dorm={dorm} rank={!focusDormId ? i + 1 : undefined} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default function TeacherAccommodationAnalyticsPage() {
  return (
    <div>
      <Suspense fallback={
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-line/40 dark:bg-dark-border/40 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-52 rounded-xl bg-line/40 dark:bg-dark-border/40 animate-pulse" />
            ))}
          </div>
        </div>
      }>
        <AnalyticsInner />
      </Suspense>
    </div>
  );
}
