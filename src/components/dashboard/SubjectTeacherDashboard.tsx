import Link from "next/link";
import { BookOpen, ClipboardCheck, Clock, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import UpcomingCalendarWidget from "@/components/UpcomingCalendarWidget";
import StatCard from "@/components/dashboard/StatCard";
import QuickLinkGrid, { type QuickLink } from "@/components/dashboard/QuickLinkGrid";
import CountdownTimer from "@/components/dashboard/CountdownTimer";
import type { User } from "@prisma/client";

interface Props { user: User }

export default async function SubjectTeacherDashboard({ user }: Props) {
  const schoolId = user.schoolId!;
  const today    = new Date();
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1; // 0=Mon

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      id: true, fullName: true,
      teacherSubjects: { select: { subject: { select: { id: true, name: true, code: true } } } },
      timetableSlots: {
        where: { dayOfWeek },
        orderBy: { period: "asc" },
        select: {
          id: true, period: true, room: true,
          subject:     { select: { name: true } },
          schoolClass: { select: { id: true, name: true, _count: { select: { students: true } } } },
        },
      },
      classTeacherOf: { select: { id: true } },
    },
  });

  if (!teacher) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">Welcome</h1>
        <p className="text-slate dark:text-dark-muted text-sm">
          Your account isn&apos;t linked to a staff record yet. Ask the principal to link you from the Staff panel.
        </p>
      </div>
    );
  }

  const taughtClassIds = [
    ...new Set(teacher.timetableSlots.map((s) => s.schoolClass.id)),
  ];

  const [activePeriods, todayAbsences, upcomingCalendar] = await Promise.all([
    prisma.assessmentPeriod.findMany({
      where: { schoolId, isCurrent: true },
      select: { id: true, name: true, closingDate: true },
      take: 4,
    }).catch(() => [] as { id: string; name: string; closingDate?: Date | null }[]),
    taughtClassIds.length > 0
      ? prisma.attendance.count({
          where: { schoolId, classId: { in: taughtClassIds }, date: today, status: "ABSENT" },
        })
      : Promise.resolve(0),
    getUpcomingCalendarItems(schoolId, { days: 14, limit: 6 }),
  ]);

  const quickLinks: QuickLink[] = [
    { label: "Enter marks",       href: "/teacher/assessments", icon: "ClipboardCheck" },
    { label: "Take attendance",   href: "/teacher/attendance",  icon: "ClipboardList" },
    { label: "My timetable",      href: "/teacher/timetable",   icon: "CalendarDays" },
    { label: "Calendar",          href: "/teacher/calendar",    icon: "Calendar" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">
          Welcome, {teacher.fullName}
        </h1>
        <p className="text-slate text-sm mt-1 dark:text-dark-muted">
          {today.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Subjects"      value={teacher.teacherSubjects.length}  href="/teacher/assessments" icon={BookOpen}       color="teal" />
        <StatCard label="Classes today" value={teacher.timetableSlots.length}   href="/teacher/timetable"   icon={Clock}         color="teal" />
        <StatCard label="Absent today"  value={todayAbsences}                   href="/teacher/attendance"  icon={ClipboardCheck} color={todayAbsences > 3 ? "warn" : "teal"} />
        <StatCard label="Active periods" value={activePeriods.length}           href="/teacher/assessments" icon={Users}         color={activePeriods.length > 0 ? "success" : "info"} />
      </div>

      {/* Today's lessons */}
      {teacher.timetableSlots.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">Today&apos;s lessons</p>
          <div className="space-y-2">
            {teacher.timetableSlots.map((slot) => (
              <div key={slot.id} className="flex items-center justify-between text-sm p-2.5 rounded-lg bg-teal-50 dark:bg-teal/5">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-md bg-teal text-white text-xs font-semibold flex items-center justify-center shrink-0">
                    P{slot.period}
                  </span>
                  <div>
                    <p className="text-ink font-medium dark:text-dark-text">{slot.subject.name}</p>
                    <p className="text-xs text-slate dark:text-dark-muted">
                      {slot.schoolClass.name} · {slot.schoolClass._count.students} students
                      {slot.room ? ` · ${slot.room}` : ""}
                    </p>
                  </div>
                </div>
                <Link href={`/teacher/attendance?classId=${slot.schoolClass.id}`}
                  className="text-xs text-teal hover:underline shrink-0">
                  Attendance →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {teacher.timetableSlots.length === 0 && (
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <p className="text-sm text-slate dark:text-dark-muted">No lessons scheduled for today.</p>
          <Link href="/teacher/timetable" className="text-xs text-teal hover:underline mt-2 inline-block">View full timetable →</Link>
        </div>
      )}

      {/* Subjects list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">Your subjects</p>
          {teacher.teacherSubjects.length === 0
            ? <p className="text-sm text-slate dark:text-dark-muted">No subjects assigned yet.</p>
            : (
              <ul className="space-y-1.5">
                {teacher.teacherSubjects.map((ts) => (
                  <li key={ts.subject.id} className="text-sm text-ink dark:text-dark-text">
                    {ts.subject.name}
                    <span className="text-slate/60 dark:text-dark-muted/60 ml-1.5">({ts.subject.code})</span>
                  </li>
                ))}
              </ul>
            )}
        </div>

        {/* Assessment deadlines */}
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Assessment deadlines</p>
            <Link href="/teacher/assessments" className="text-xs text-teal hover:underline">Enter marks</Link>
          </div>
          {activePeriods.length === 0
            ? <p className="text-sm text-slate dark:text-dark-muted">No active assessment periods.</p>
            : (
              <ul className="space-y-2">
                {activePeriods.map((ap) => (
                  <li key={ap.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink dark:text-dark-text truncate">{ap.name}</span>
                    {ap.closingDate
                      ? <CountdownTimer deadline={ap.closingDate.toISOString()} label="Due" />
                      : <span className="text-xs text-slate dark:text-dark-muted">No deadline</span>
                    }
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>

      <QuickLinkGrid links={quickLinks} title="Quick actions" />
      <UpcomingCalendarWidget items={upcomingCalendar} calendarHref="/teacher/calendar" />
    </div>
  );
}
