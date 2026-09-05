/**
 * SubjectTeacherSection (redesigned)
 *
 * Matches the mockup:
 *   1. 4-column mini-stat grid: My Subjects | Classes Today | Absent Today | Active Periods
 *      Sub-labels: "Subjects" | "Scheduled" | "From my classes" | "This term"
 *   2. "Today's schedule" section with "View timetable" link
 *      - Empty state: "No classes today" with subtitle
 *      - When slots exist: list of lesson cards (period chip, subject, class, room, attendance link)
 *   3. "My subjects" section with "View all" link
 *      - Each subject: code chip + name + class + Active badge + action shortcuts row
 *        (Lesson plan → diary, Mark attendance, Assignments, Results)
 *   4. Assessment deadlines card (only when periods exist — unchanged)
 */

import Link from "next/link";
import {
  BookOpen, Clock, ClipboardCheck, CalendarCheck,
  ChevronRight, FileText, Users, ClipboardList, BarChart2,
} from "lucide-react";
import DashboardMiniStat from "@/components/dashboard/DashboardMiniStat";
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
  rolePrefix:    string;
  derived:       SubjectTeacherRole | null;
  subjects:      { id: string; name: string; code: string }[];
  todaySlots:    TodaySlot[];
  todayAbsences: number;
  activePeriods: AssessmentPeriod[];
}

/** Subject code abbreviated to ≤3 chars for the chip */
function codeChip(code: string) {
  return code.slice(0, 3).toUpperCase();
}

export default function SubjectTeacherSection({
  rolePrefix, derived: _derived, subjects, todaySlots, todayAbsences, activePeriods,
}: Props) {
  const subjectCount = subjects.length;

  return (
    <section aria-labelledby="subject-teacher-heading" className="space-y-5">

      {/* ── 1. 4-col stat grid ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-1 w-5 rounded-full bg-teal shrink-0" aria-hidden="true" />
          <h2
            id="subject-teacher-heading"
            className="text-sm font-semibold text-slate uppercase tracking-wide
                       dark:text-dark-muted"
          >
            Subject Teacher
          </h2>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <DashboardMiniStat
            label="My Subjects"
            value={subjectCount}
            sub="Subjects"
            icon={BookOpen}
            color="teal"
            href={`/${rolePrefix}/assessments`}
          />
          <DashboardMiniStat
            label="Classes Today"
            value={todaySlots.length}
            sub="Scheduled"
            icon={Clock}
            color="teal"
            href={`/${rolePrefix}/timetable`}
          />
          <DashboardMiniStat
            label="Absent Today"
            value={todayAbsences}
            sub="From my classes"
            icon={ClipboardCheck}
            color={todayAbsences > 3 ? "warn" : "teal"}
            href={`/${rolePrefix}/attendance`}
          />
          <DashboardMiniStat
            label="Active Periods"
            value={activePeriods.length}
            sub="This term"
            icon={CalendarCheck}
            color={activePeriods.length > 0 ? "success" : "info"}
            href={`/${rolePrefix}/assessments`}
          />
        </div>
      </div>

      {/* ── 2. Today's schedule ────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-ink dark:text-dark-text">
            Today&apos;s schedule
          </h2>
          <Link
            href={`/${rolePrefix}/timetable`}
            className="text-xs font-medium text-teal hover:underline"
          >
            View timetable
          </Link>
        </div>

        {todaySlots.length === 0 ? (
          /* Empty state matching mockup */
          <div className="bg-card border border-line rounded-xl px-5 py-6 shadow-xs
                          dark:bg-dark-surface dark:border-dark-border
                          flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal/10 flex items-center justify-center shrink-0">
              <Clock className="h-6 w-6 text-teal/60" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink dark:text-dark-text">
                No classes today
              </p>
              <p className="text-xs text-slate dark:text-dark-muted mt-0.5">
                Enjoy your free time or prepare your lessons.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-line rounded-xl overflow-hidden shadow-xs
                          dark:bg-dark-surface dark:border-dark-border divide-y divide-line
                          dark:divide-dark-border">
            {todaySlots.map((slot) => (
              <div
                key={slot.id}
                className="flex items-center gap-3 px-4 py-3 group"
              >
                {/* Period chip */}
                <span className="w-8 h-8 rounded-lg bg-teal text-white text-xs font-bold
                                  flex items-center justify-center shrink-0">
                  P{slot.period}
                </span>
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink dark:text-dark-text truncate">
                    {slot.subject.name}
                  </p>
                  <p className="text-xs text-slate dark:text-dark-muted">
                    {slot.schoolClass.name}
                    {" · "}{slot.schoolClass._count.students} students
                    {slot.room ? ` · ${slot.room}` : ""}
                  </p>
                </div>
                {/* Attendance shortcut */}
                <Link
                  href={`/${rolePrefix}/attendance?classId=${slot.schoolClass.id}`}
                  className="text-xs text-teal font-medium hover:underline shrink-0
                             min-h-[32px] flex items-center"
                >
                  Attendance →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. My subjects ─────────────────────────────────────────────── */}
      {subjects.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-ink dark:text-dark-text">
              My subjects
            </h2>
            <Link
              href={`/${rolePrefix}/assessments`}
              className="text-xs font-medium text-teal hover:underline"
            >
              View all
            </Link>
          </div>

          <div className="space-y-3">
            {subjects.map((subject) => {
              /* Find any timetable slots for this subject today */
              const subjectSlots = todaySlots.filter(
                (s) => s.subject.name === subject.name
              );
              const firstSlot = subjectSlots[0] ?? null;

              return (
                <div
                  key={subject.id}
                  className="bg-card border border-line rounded-xl shadow-xs
                             dark:bg-dark-surface dark:border-dark-border overflow-hidden"
                >
                  {/* Subject row */}
                  <Link
                    href={`/${rolePrefix}/assessments`}
                    className="flex items-center gap-3 px-4 py-3.5
                               hover:bg-[#F9FAFB] dark:hover:bg-dark-border
                               transition-colors group"
                  >
                    {/* Code chip */}
                    <div className="w-11 h-11 rounded-xl bg-teal flex items-center justify-center shrink-0">
                      <span className="text-white text-[10px] font-bold tracking-wide">
                        {codeChip(subject.code)}
                      </span>
                    </div>
                    {/* Name + class */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink dark:text-dark-text truncate">
                        {subject.name}
                      </p>
                      {firstSlot && (
                        <p className="text-xs text-slate dark:text-dark-muted">
                          {firstSlot.schoolClass.name}
                        </p>
                      )}
                    </div>
                    {/* Active badge */}
                    <span className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full
                                     bg-success-bg text-success border border-success/20">
                      Active
                    </span>
                    <ChevronRight
                      className="h-4 w-4 text-slate/30 group-hover:text-teal
                                  transition-colors shrink-0 ml-1"
                    />
                  </Link>

                  {/* Action shortcuts row */}
                  <div className="grid grid-cols-4 border-t border-line dark:border-dark-border">
                    {[
                      {
                        label: "Lesson plan",
                        href:  `/${rolePrefix}/diary`,
                        Icon:  FileText,
                        color: "text-teal",
                      },
                      {
                        label: "Mark attendance",
                        href:  firstSlot
                          ? `/${rolePrefix}/attendance?classId=${firstSlot.schoolClass.id}`
                          : `/${rolePrefix}/attendance`,
                        Icon:  Users,
                        color: "text-teal",
                      },
                      {
                        label: "Assignments",
                        href:  `/${rolePrefix}/diary`,
                        Icon:  ClipboardList,
                        color: "text-teal",
                      },
                      {
                        label: "Results",
                        href:  `/${rolePrefix}/results`,
                        Icon:  BarChart2,
                        color: "text-teal",
                      },
                    ].map((action, i) => (
                      <Link
                        key={i}
                        href={action.href}
                        className="flex flex-col items-center gap-1.5 py-3 px-1
                                   hover:bg-teal-50 dark:hover:bg-teal/5
                                   transition-colors group/action
                                   border-r border-line dark:border-dark-border last:border-r-0"
                      >
                        <action.Icon
                          className={`h-[18px] w-[18px] ${action.color}
                                      group-hover/action:scale-110 transition-transform`}
                          strokeWidth={1.8}
                        />
                        <span className="text-[9px] font-medium text-slate dark:text-dark-muted
                                         text-center leading-tight group-hover/action:text-teal
                                         transition-colors">
                          {action.label}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 4. Assessment deadlines ────────────────────────────────────── */}
      {activePeriods.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-4 shadow-xs
                        dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">
              Assessment deadlines
            </p>
            <Link href={`/${rolePrefix}/assessments`} className="text-xs text-teal hover:underline">
              Enter marks
            </Link>
          </div>
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
