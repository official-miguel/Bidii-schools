"use client";

/**
 * /teacher/timetable — Personal Weekly Timetable
 *
 * Shows the signed-in teacher their own weekly schedule:
 *   • Full grid view — every period across all active days
 *   • Today's lessons panel — what's on right now / coming up today
 *   • Weekly load stats — total lessons, subjects taught, classes covered
 *   • Special periods shown inline (break, lunch, etc.)
 *   • Keyboard accessible, fully responsive, offline-first via the
 *     existing timetableStore
 *
 * Data is fetched from /api/timetable/v2/teacher-view which resolves
 * the teacher record from the signed-in user automatically.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Calendar, Clock, BookOpen, Users, RefreshCw,
  ChevronLeft, ChevronRight, Info, Zap,
} from "lucide-react";
import ContextNavigation from "@/components/ContextNavigation";
import { PageHeader, EmptyState, ErrorBanner } from "@/components/ui";
import { getTeacherAcademicsNav } from "@/lib/teacherAcademicsNav";

// ── Constants ──────────────────────────────────────────────────────────────
const DAY_FULL  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_SHORT = ["Mon",   "Tue",    "Wed",      "Thu",     "Fri",   "Sat",     "Sun"];
const TODAY_IDX = (() => {
  const d = new Date().getDay(); // 0=Sun
  return d === 0 ? 6 : d - 1;   // convert to Mon=0
})();

// Subject colour palette (cycles)
const SUBJECT_COLORS = [
  { bg: "bg-teal-50",   border: "border-teal-200",   text: "text-teal-800",   dot: "bg-teal-400"   },
  { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-800",   dot: "bg-blue-400"   },
  { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-800", dot: "bg-purple-400" },
  { bg: "bg-emerald-50",border: "border-emerald-200",text: "text-emerald-800",dot: "bg-emerald-400"},
  { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-800",  dot: "bg-amber-400"  },
  { bg: "bg-rose-50",   border: "border-rose-200",   text: "text-rose-800",   dot: "bg-rose-400"   },
  { bg: "bg-cyan-50",   border: "border-cyan-200",   text: "text-cyan-800",   dot: "bg-cyan-400"   },
  { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", dot: "bg-orange-400" },
];

// ── Types ──────────────────────────────────────────────────────────────────
type SlotRow = {
  id: string; classId: string; className: string;
  dayOfWeek: number; period: number;
  subjectId: string; subjectCode: string; subjectName: string;
  room: string | null;
};
type PeriodTime = {
  period: number; startMinutes: number; endMinutes: number; label: string;
};
type SpecialPeriod = {
  type: string; label: string; dayOfWeek: number | null; period: number;
};
type TeacherViewData = {
  teacher: { id: string; fullName: string; staffId: string };
  days: number[];
  periods: PeriodTime[];
  slots: SlotRow[];
  specialPeriods: SpecialPeriod[];
  unavailability: { dayOfWeek: number; period: number }[];
  weeklyLessons: number;
  subjectBreakdown: { code: string; count: number }[];
};

// ── Component ──────────────────────────────────────────────────────────────
export default function TeacherTimetablePage() {
  const [data,    setData]    = useState<TeacherViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [isSubjectTeacher, setIsSubjectTeacher] = useState(false);

  // Mobile day pagination
  const [selectedDay, setSelectedDay] = useState(TODAY_IDX);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [res, meRes] = await Promise.all([
        fetch("/api/timetable/v2/teacher-view"),
        fetch("/api/teacher/me"),
      ]);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to load your timetable.");
      }
      const d: TeacherViewData = await res.json();
      const me = meRes.ok ? await meRes.json() : {};
      setData(d);
      setIsSubjectTeacher(me.isSubjectTeacher ?? false);
      // If today is an active day, show it; otherwise show first active day
      if (d.days.includes(TODAY_IDX)) setSelectedDay(TODAY_IDX);
      else if (d.days.length > 0)     setSelectedDay(d.days[0]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived state ────────────────────────────────────────────────────────

  // Slot lookup: "day-period" → slot
  const slotMap = useMemo(() => {
    const m = new Map<string, SlotRow>();
    data?.slots.forEach((s) => m.set(`${s.dayOfWeek}-${s.period}`, s));
    return m;
  }, [data]);

  // Special period lookup
  const isSpecial = useCallback((day: number, period: number) => {
    if (!data) return false;
    return data.specialPeriods.some(
      (sp) => sp.period === period && (sp.dayOfWeek === null || sp.dayOfWeek === day)
    );
  }, [data]);

  const specialLabel = useCallback((day: number, period: number) => {
    if (!data) return "";
    return data.specialPeriods.find(
      (sp) => sp.period === period && (sp.dayOfWeek === null || sp.dayOfWeek === day)
    )?.label ?? "";
  }, [data]);

  // Subject → stable colour assignment
  const subjectColorMap = useMemo(() => {
    const m = new Map<string, typeof SUBJECT_COLORS[number]>();
    let i = 0;
    data?.subjectBreakdown.forEach(({ code }) => {
      if (!m.has(code)) { m.set(code, SUBJECT_COLORS[i % SUBJECT_COLORS.length]); i++; }
    });
    return m;
  }, [data]);

  function colorFor(subjectCode: string) {
    return subjectColorMap.get(subjectCode) ?? SUBJECT_COLORS[0];
  }

  // Period count for each active day
  const periodsInDay = useMemo(
    () => data?.periods.length ?? 8,
    [data]
  );

  // Today's lessons sorted by period
  const todayLessons = useMemo(() => {
    if (!data) return [];
    return data.slots
      .filter((s) => s.dayOfWeek === selectedDay)
      .sort((a, b) => a.period - b.period);
  }, [data, selectedDay]);

  // Current / next lesson (relative to now, using period start times)
  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const currentLesson = useMemo(() => {
    if (!data || selectedDay !== TODAY_IDX) return null;
    return todayLessons.find((s) => {
      const pt = data.periods.find((p) => p.period === s.period);
      if (!pt) return false;
      return pt.startMinutes <= nowMinutes && nowMinutes < pt.endMinutes;
    }) ?? null;
  }, [todayLessons, data, nowMinutes, selectedDay]);

  const nextLesson = useMemo(() => {
    if (!data || selectedDay !== TODAY_IDX) return null;
    return todayLessons.find((s) => {
      const pt = data.periods.find((p) => p.period === s.period);
      return pt ? pt.startMinutes > nowMinutes : false;
    }) ?? null;
  }, [todayLessons, data, nowMinutes, selectedDay]);

  // Navigate between active days (mobile)
  function prevDay() {
    if (!data) return;
    const idx = data.days.indexOf(selectedDay);
    if (idx > 0) setSelectedDay(data.days[idx - 1]);
  }
  function nextDay() {
    if (!data) return;
    const idx = data.days.indexOf(selectedDay);
    if (idx < data.days.length - 1) setSelectedDay(data.days[idx + 1]);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <ContextNavigation items={getTeacherAcademicsNav(isSubjectTeacher)} />
        <PageHeader title="My Timetable" description="Your weekly schedule." />
        <div className="space-y-3 mt-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-line rounded-xl p-5 animate-pulse h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ContextNavigation items={getTeacherAcademicsNav(isSubjectTeacher)} />
      <PageHeader
        title="My Timetable"
        description={data?.teacher ? `${data.teacher.fullName} · Staff ID ${data.teacher.staffId}` : "Your weekly schedule."}
      />

      <div className="space-y-5">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* ── Not published yet ───────────────────────────────────────── */}
        {!error && data && data.slots.length === 0 && (
          <EmptyState
            icon={<Calendar className="h-8 w-8 text-slate/40" />}
            message="Your timetable hasn't been published yet. Check back after the administrator generates and publishes the schedule."
          />
        )}

        {data && data.slots.length > 0 && (
          <>
            {/* ── Overview strip ───────────────────────────────────────── */}
            <div>
              <h2 className="text-base font-semibold text-ink mb-3">This week at a glance</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatPill icon={<BookOpen className="h-4 w-4" />}
                  label="Lessons / week" value={data.weeklyLessons} />
                <StatPill icon={<Users className="h-4 w-4" />}
                  label="Classes taught"
                  value={new Set(data.slots.map((s) => s.classId)).size} />
                <StatPill icon={<Zap className="h-4 w-4" />}
                  label="Subjects"
                  value={data.subjectBreakdown.length} />
                <StatPill icon={<Clock className="h-4 w-4" />}
                  label="Active days" value={data.days.length} />
              </div>
            </div>

            {/* ── Today / selected-day panel ────────────────────────────── */}
            <div>
              <h2 className="text-base font-semibold text-ink mb-3">Your schedule</h2>
            <div className="bg-white border border-line rounded-xl overflow-hidden">
              {/* Day navigator header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
                <button
                  onClick={prevDay}
                  disabled={data.days.indexOf(selectedDay) === 0}
                  className="p-1.5 rounded-lg text-slate hover:text-teal hover:bg-teal-50 transition-colors disabled:opacity-30"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="flex gap-1 flex-wrap justify-center">
                  {data.days.map((d) => (
                    <button
                      key={d}
                      onClick={() => setSelectedDay(d)}
                      aria-current={d === selectedDay ? "page" : undefined}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                        ${d === selectedDay
                          ? "bg-teal text-white"
                          : d === TODAY_IDX
                            ? "border border-teal/40 text-teal bg-teal-50"
                            : "text-slate hover:bg-paper"
                        }`}
                    >
                      {DAY_SHORT[d]}
                      {d === TODAY_IDX && d !== selectedDay && (
                        <span className="ml-1 w-1.5 h-1.5 rounded-full bg-teal inline-block" />
                      )}
                    </button>
                  ))}
                </div>

                <button
                  onClick={nextDay}
                  disabled={data.days.indexOf(selectedDay) === data.days.length - 1}
                  className="p-1.5 rounded-lg text-slate hover:text-teal hover:bg-teal-50 transition-colors disabled:opacity-30"
                  aria-label="Next day"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Day content */}
              <div className="p-4 space-y-2">
                {selectedDay === TODAY_IDX && (currentLesson || nextLesson) && (
                  <div className="mb-3 space-y-2">
                    {currentLesson && (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-success-bg border border-success/20">
                        <div className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-success uppercase tracking-wide">Now teaching</p>
                          <p className="text-sm font-bold text-ink truncate">
                            {currentLesson.subjectName} — {currentLesson.className}
                          </p>
                          {currentLesson.room && (
                            <p className="text-xs text-slate">{currentLesson.room}</p>
                          )}
                        </div>
                        <span className="ml-auto text-xs text-slate shrink-0">
                          P{currentLesson.period}
                        </span>
                      </div>
                    )}
                    {nextLesson && !currentLesson && (
                      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-info-bg border border-info/20">
                        <Clock className="h-4 w-4 text-info shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-info uppercase tracking-wide">Up next</p>
                          <p className="text-sm font-bold text-ink truncate">
                            {nextLesson.subjectName} — {nextLesson.className}
                          </p>
                        </div>
                        <span className="ml-auto text-xs text-slate shrink-0">
                          {data.periods.find((p) => p.period === nextLesson.period)?.label ?? `P${nextLesson.period}`}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Slot list for selected day */}
                {Array.from({ length: periodsInDay }, (_, i) => i + 1).map((period) => {
                  const slot    = slotMap.get(`${selectedDay}-${period}`);
                  const special = isSpecial(selectedDay, period);
                  const pt      = data.periods.find((p) => p.period === period);
                  const color   = slot ? colorFor(slot.subjectCode) : null;

                  if (special && !slot) {
                    return (
                      <div key={period} className="flex items-center gap-3 px-4 py-2 rounded-lg bg-paper border border-dashed border-line">
                        <span className="text-xs font-medium text-slate w-6 shrink-0">{period}</span>
                        <span className="text-xs text-slate/60 uppercase tracking-wide">{specialLabel(selectedDay, period)}</span>
                        {pt && <span className="ml-auto text-xs text-slate/50">{pt.label}</span>}
                      </div>
                    );
                  }

                  if (!slot) {
                    return (
                      <div key={period} className="flex items-center gap-3 px-4 py-2 rounded-lg bg-paper/50 border border-line/50 min-h-[44px]">
                        <span className="text-xs font-medium text-slate/50 w-6 shrink-0">{period}</span>
                        <span className="flex-1 h-px bg-line/50" />
                        {pt && <span className="text-xs text-slate/40">{pt.label}</span>}
                      </div>
                    );
                  }

                  const isNow = selectedDay === TODAY_IDX && currentLesson?.period === period;

                  return (
                    <div
                      key={period}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all
                        ${isNow ? "ring-2 ring-success/30" : ""}
                        ${color!.bg} ${color!.border}`}
                    >
                      <div className="flex flex-col items-center w-6 shrink-0">
                        <span className={`text-xs font-bold ${color!.text}`}>{period}</span>
                        <div className={`w-1.5 h-1.5 rounded-full mt-1 ${color!.dot}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold leading-tight ${color!.text}`}>
                          {slot.subjectName}
                        </p>
                        <p className="text-xs text-slate/80 mt-0.5 truncate">
                          {slot.className}
                          {slot.room ? ` · ${slot.room}` : ""}
                        </p>
                      </div>
                      {pt && (
                        <span className={`text-xs shrink-0 ${color!.text} opacity-70`}>{pt.label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            </div>{/* end schedule wrapper */}
            {/* ── Full week grid (desktop) ──────────────────────────────── */}
            <div className="hidden lg:block bg-white border border-line rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">Full week</h2>
                <button onClick={load} className="p-1.5 rounded-lg text-slate hover:text-teal transition-colors" title="Refresh">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate uppercase tracking-wide border-b border-r border-line w-20 sticky left-0 bg-slate-50/80 z-10">
                        Period
                      </th>
                      {data.days.map((d) => (
                        <th key={d}
                          className={`px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide border-b border-line
                            ${d === TODAY_IDX ? "text-teal bg-teal-50/60" : "text-slate"}`}>
                          {DAY_FULL[d]}
                          {d === TODAY_IDX && (
                            <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-teal align-middle" />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: periodsInDay }, (_, i) => i + 1).map((period) => {
                      const pt = data.periods.find((p) => p.period === period);
                      return (
                        <tr key={period} className="hover:bg-slate-50/20 transition-colors">
                          <td className="px-3 py-2 border-r border-b border-line sticky left-0 bg-white z-10">
                            <div className="text-xs font-semibold text-ink">{period}</div>
                            {pt && <div className="text-[10px] text-slate/60 mt-0.5">{pt.label}</div>}
                          </td>
                          {data.days.map((day) => {
                            const slot    = slotMap.get(`${day}-${period}`);
                            const special = isSpecial(day, period);
                            const color   = slot ? colorFor(slot.subjectCode) : null;
                            const isNow   = day === TODAY_IDX && currentLesson?.period === period;

                            return (
                              <td key={day} className={`border-b border-line p-1.5
                                ${day === TODAY_IDX ? "bg-teal-50/20" : ""}`}>
                                {special && !slot ? (
                                  <div className="min-h-[52px] rounded-lg bg-paper border border-dashed border-line flex items-center justify-center px-2">
                                    <span className="text-[10px] text-slate/60 uppercase tracking-wide text-center">
                                      {specialLabel(day, period)}
                                    </span>
                                  </div>
                                ) : slot ? (
                                  <div className={`rounded-lg border px-2.5 py-2 min-h-[52px]
                                    ${color!.bg} ${color!.border}
                                    ${isNow ? "ring-1 ring-success/40" : ""}`}>
                                    <p className={`font-bold text-xs leading-tight ${color!.text}`}>
                                      {slot.subjectName}
                                    </p>
                                    <p className={`text-[10px] leading-tight mt-0.5 opacity-70 ${color!.text}`}>
                                      {slot.subjectCode}
                                    </p>
                                    <p className="text-[11px] text-slate/80 mt-0.5 truncate">
                                      {slot.className}
                                    </p>
                                    {slot.room && (
                                      <p className="text-[10px] text-slate/60 mt-0.5 truncate">{slot.room}</p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="min-h-[52px] rounded-lg bg-slate-50/40 border border-dashed border-line/40" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Subject breakdown ─────────────────────────────────────── */}
            {data.subjectBreakdown.length > 0 && (
              <div className="bg-white border border-line rounded-xl p-5">
                <h2 className="text-sm font-semibold text-ink mb-3">Subjects this week</h2>
                <div className="flex flex-wrap gap-2">
                  {data.subjectBreakdown
                    .sort((a, b) => b.count - a.count)
                    .map(({ code, count }) => {
                      const c = colorFor(code);
                      return (
                        <div key={code}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${c.bg} ${c.border} ${c.text}`}>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                          {code}
                          <span className="opacity-60">×{count}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* ── Unavailability reminder ───────────────────────────────── */}
            {data.unavailability.length > 0 && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-warn-bg border border-warn/20 text-xs text-slate">
                <Info className="h-3.5 w-3.5 text-warn shrink-0 mt-0.5" />
                {data.unavailability.length} slot{data.unavailability.length !== 1 ? "s" : ""} marked as unavailable.
                Contact your administrator to update your availability.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Stat pill ──────────────────────────────────────────────────────────────
function StatPill({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="bg-white border border-line rounded-xl px-4 py-3.5 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-ink leading-none">{value}</p>
        <p className="text-[11px] text-slate mt-0.5 leading-snug">{label}</p>
      </div>
    </div>
  );
}
