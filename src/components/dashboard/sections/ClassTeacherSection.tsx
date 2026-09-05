import Link from "next/link";
import { Users, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import CountdownTimer from "@/components/dashboard/CountdownTimer";
import type { ClassTeacherRole } from "@/lib/derivedRoles";

interface AssessmentPeriod {
  id: string; name: string; closingDate?: Date | string | null;
}

interface Props {
  rolePrefix:       string;
  derived:          ClassTeacherRole | null;
  totalStudents:    number;
  todayPresent:     number;
  todayAbsent:      number;
  openDiscipline:   number;
  recentAbsentees:  { id: string; fullName: string }[];
  activePeriods:    AssessmentPeriod[];
}

export default function ClassTeacherSection({
  rolePrefix, derived, totalStudents, todayPresent, todayAbsent,
  openDiscipline, recentAbsentees, activePeriods,
}: Props) {
  if (!derived) return null;

  const attendancePct = totalStudents > 0
    ? Math.round((todayPresent / totalStudents) * 100)
    : null;

  return (
    <section aria-labelledby="class-teacher-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-1 w-5 rounded-full bg-teal shrink-0" aria-hidden="true" />
        <h2
          id="class-teacher-heading"
          className="text-sm font-semibold text-slate uppercase tracking-wide dark:text-dark-muted"
        >
          Class Teacher — {derived.className}
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Students"        value={totalStudents}  href={`/${rolePrefix}/students`}   icon={Users}         color="teal" />
        <StatCard label="Present today"   value={todayPresent}   href={`/${rolePrefix}/attendance`} icon={CheckCircle}   color="success"
                  badge={attendancePct != null ? `${attendancePct}%` : undefined} badgeColor="success" />
        <StatCard label="Absent today"    value={todayAbsent}    href={`/${rolePrefix}/attendance`} icon={AlertTriangle} color={todayAbsent > 3 ? "warn" : "teal"} />
        <StatCard label="Open discipline" value={openDiscipline} href={`/${rolePrefix}/records`}   icon={TrendingUp}    color={openDiscipline > 0 ? "warn" : "success"} />
      </div>

      {recentAbsentees.length > 0 && (
        <div className="bg-warn-bg border border-warn/20 rounded-xl p-3 sm:p-4">
          <p className="text-sm font-semibold text-warn mb-2">Frequent absentees (last 14 days)</p>
          <div className="flex flex-wrap gap-2">
            {recentAbsentees.map((s) => (
              <Link key={s.id} href={`/${rolePrefix}/students/${s.id}`}
                className="text-xs bg-white border border-warn/30 text-ink px-2 py-1.5 rounded-lg
                           hover:bg-warn-bg/60 transition-colors dark:bg-dark-surface dark:text-dark-text
                           min-h-[36px] flex items-center">
                {s.fullName}
              </Link>
            ))}
          </div>
        </div>
      )}

      {activePeriods.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-4 sm:p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">Assessment deadlines</p>
          <ul className="space-y-2">
            {activePeriods.map((ap) => (
              <li key={ap.id} className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 text-sm">
                <span className="text-ink dark:text-dark-text min-w-0 xs:truncate xs:pr-2">{ap.name}</span>
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
