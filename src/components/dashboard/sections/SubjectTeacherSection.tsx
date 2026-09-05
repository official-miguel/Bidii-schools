import Link from "next/link";
import { BookOpen, Clock, ClipboardCheck, Users } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import CountdownTimer from "@/components/dashboard/CountdownTimer";
import type { SubjectTeacherRole } from "@/lib/derivedRoles";

interface TodaySlot {
  id: string; period: number; room: string | null;
  subject: { name: string };
  schoolClass: { id: string; name: string; _count: { students: number } };
}

interface AssessmentPeriod {
  id: string; name: string; closingDate?: Date | string | null;
}

interface Props {
  rolePrefix: string;
  derived:    SubjectTeacherRole | null;
  subjects:   { id: string; name: string; code: string }[];
  todaySlots: TodaySlot[];
  todayAbsences: number;
  activePeriods: AssessmentPeriod[];
}

export default function SubjectTeacherSection({
  rolePrefix, derived: _derived, subjects, todaySlots, todayAbsences, activePeriods,
}: Props) {
  const subjectCount = subjects.length;

  return (
    <section aria-labelledby="subject-teacher-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-1 w-5 rounded-full bg-teal shrink-0" aria-hidden="true" />
        <h2
          id="subject-teacher-heading"
          className="text-sm font-semibold text-slate uppercase tracking-wide dark:text-dark-muted"
        >
          Subject Teacher
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="My subjects"    value={subjectCount}     href={`/${rolePrefix}/assessments`} icon={BookOpen}       color="teal" />
        <StatCard label="Classes today"  value={todaySlots.length} href={`/${rolePrefix}/timetable`}  icon={Clock}         color="teal" />
        <StatCard label="Absent today"   value={todayAbsences}    href={`/${rolePrefix}/attendance`}  icon={ClipboardCheck} color={todayAbsences > 3 ? "warn" : "teal"} />
        <StatCard label="Active periods" value={activePeriods.length} href={`/${rolePrefix}/assessments`} icon={Users} color={activePeriods.length > 0 ? "success" : "info"} />
      </div>

      {todaySlots.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-4 sm:p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">Today&apos;s lessons</p>
          <div className="space-y-2">
            {todaySlots.map((slot) => (
              <div key={slot.id} className="flex items-start sm:items-center justify-between gap-2 text-sm p-2.5 rounded-lg bg-teal-50 dark:bg-teal/5">
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <span className="w-7 h-7 rounded-md bg-teal text-white text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                    P{slot.period}
                  </span>
                  <div className="min-w-0">
                    <p className="text-ink font-medium dark:text-dark-text truncate">{slot.subject.name}</p>
                    <p className="text-xs text-slate dark:text-dark-muted">
                      {slot.schoolClass.name} · {slot.schoolClass._count.students} students
                      {slot.room ? ` · ${slot.room}` : ""}
                    </p>
                  </div>
                </div>
                <Link href={`/${rolePrefix}/attendance?classId=${slot.schoolClass.id}`}
                  className="text-xs text-teal hover:underline shrink-0 min-h-[32px] flex items-center">Attendance →</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card border border-line rounded-xl p-4 sm:p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">Your subjects</p>
          {subjects.length === 0
            ? <p className="text-sm text-slate dark:text-dark-muted">No subjects assigned yet.</p>
            : (
              <ul className="space-y-1.5">
                {subjects.map((s) => (
                  <li key={s.id} className="text-sm text-ink dark:text-dark-text">
                    {s.name}
                    <span className="text-slate/60 dark:text-dark-muted/60 ml-1.5">({s.code})</span>
                  </li>
                ))}
              </ul>
            )}
        </div>

        {activePeriods.length > 0 && (
          <div className="bg-card border border-line rounded-xl p-4 sm:p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-ink dark:text-dark-text">Assessment deadlines</p>
              <Link href={`/${rolePrefix}/assessments`} className="text-xs text-teal hover:underline">Enter marks</Link>
            </div>
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
      </div>
    </section>
  );
}
