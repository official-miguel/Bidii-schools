/**
 * ClassTeacherSection (redesigned)
 *
 * Matches the mockup:
 *   1. Tappable banner row: "Class Teacher — Grade 12 A ›"
 *   2. 4-column mini-stat grid: Students | Present Today | Absent Today | Open Discipline
 *      Sub-labels: "Total students" | "0%" | "0%" | "No cases"
 *   3. Frequent-absentees warning chip row (unchanged — only shown when data exists)
 *   4. Assessment deadlines card (unchanged — only shown when periods exist)
 */

import Link from "next/link";
import { Users, CheckCircle2, AlertTriangle, ShieldAlert, ChevronRight } from "lucide-react";
import DashboardMiniStat from "@/components/dashboard/DashboardMiniStat";
import CountdownTimer from "@/components/dashboard/CountdownTimer";
import type { ClassTeacherRole } from "@/lib/derivedRoles";

interface AssessmentPeriod {
  id: string; name: string; closingDate?: Date | string | null;
}

interface Props {
  rolePrefix:      string;
  derived:         ClassTeacherRole | null;
  totalStudents:   number;
  todayPresent:    number;
  todayAbsent:     number;
  openDiscipline:  number;
  recentAbsentees: { id: string; fullName: string }[];
  activePeriods:   AssessmentPeriod[];
}

export default function ClassTeacherSection({
  rolePrefix, derived, totalStudents, todayPresent, todayAbsent,
  openDiscipline, recentAbsentees, activePeriods,
}: Props) {
  if (!derived) return null;

  const attendancePct = totalStudents > 0
    ? Math.round((todayPresent / totalStudents) * 100)
    : null;

  const absentPct = totalStudents > 0
    ? Math.round((todayAbsent / totalStudents) * 100)
    : null;

  return (
    <section aria-labelledby="class-teacher-heading" className="space-y-3">
      {/* ── 1. Banner row ─────────────────────────────────────────────── */}
      <Link
        href={`/${rolePrefix}/students`}
        id="class-teacher-heading"
        className="flex items-center justify-between gap-3
                   bg-card border border-line rounded-xl px-4 py-3.5 shadow-xs
                   hover:border-teal/40 hover:shadow-sm transition-all group
                   dark:bg-dark-surface dark:border-dark-border"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-teal" strokeWidth={1.8} />
          </div>
          <span className="text-sm font-semibold text-ink dark:text-dark-text truncate">
            Class Teacher — {derived.className}
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-slate/40 group-hover:text-teal transition-colors shrink-0" />
      </Link>

      {/* ── 2. 4-col stat grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        <DashboardMiniStat
          label="Students"
          value={totalStudents}
          sub="Total students"
          icon={Users}
          color="teal"
          href={`/${rolePrefix}/students`}
        />
        <DashboardMiniStat
          label="Present Today"
          value={todayPresent}
          sub={attendancePct != null ? `${attendancePct}%` : "—"}
          badge={attendancePct != null ? `${attendancePct}%` : undefined}
          badgeColor="success"
          icon={CheckCircle2}
          color="success"
          href={`/${rolePrefix}/attendance`}
        />
        <DashboardMiniStat
          label="Absent Today"
          value={todayAbsent}
          sub={absentPct != null ? `${absentPct}%` : "—"}
          badge={absentPct != null ? `${absentPct}%` : undefined}
          badgeColor={todayAbsent > 3 ? "warn" : "success"}
          icon={AlertTriangle}
          color={todayAbsent > 3 ? "warn" : "teal"}
          href={`/${rolePrefix}/attendance`}
        />
        <DashboardMiniStat
          label="Open Discipline"
          value={openDiscipline}
          sub={openDiscipline > 0 ? `${openDiscipline} open` : "No cases"}
          icon={ShieldAlert}
          color={openDiscipline > 0 ? "warn" : "success"}
          href={`/${rolePrefix}/records`}
        />
      </div>

      {/* ── 3. Frequent absentees ──────────────────────────────────────── */}
      {recentAbsentees.length > 0 && (
        <div className="bg-warn-bg border border-warn/20 rounded-xl p-3 sm:p-4">
          <p className="text-xs font-semibold text-warn mb-2">
            Frequent absentees — last 14 days
          </p>
          <div className="flex flex-wrap gap-2">
            {recentAbsentees.map((s) => (
              <Link
                key={s.id}
                href={`/${rolePrefix}/students/${s.id}`}
                className="text-xs bg-white border border-warn/30 text-ink px-2.5 py-1.5 rounded-lg
                           hover:bg-warn-bg/60 transition-colors dark:bg-dark-surface dark:text-dark-text
                           min-h-[34px] flex items-center"
              >
                {s.fullName}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. Assessment deadlines ────────────────────────────────────── */}
      {activePeriods.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-4 shadow-xs
                        dark:bg-dark-surface dark:border-dark-border">
          <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">
            Assessment deadlines
          </p>
          <ul className="space-y-2">
            {activePeriods.map((ap) => (
              <li key={ap.id}
                  className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 text-sm">
                <span className="text-ink dark:text-dark-text min-w-0 xs:truncate xs:pr-2">
                  {ap.name}
                </span>
                <span className="shrink-0">
                  {ap.closingDate
                    ? <CountdownTimer deadline={new Date(ap.closingDate).toISOString()} label="Due" />
                    : <span className="text-xs text-slate dark:text-dark-muted">No deadline</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
