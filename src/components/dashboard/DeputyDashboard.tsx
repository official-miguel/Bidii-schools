import Link from "next/link";
import {
  Users, GraduationCap, BookOpen, AlertTriangle,
  CheckCircle, Clock,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import UpcomingCalendarWidget from "@/components/UpcomingCalendarWidget";
import StatCard from "@/components/dashboard/StatCard";
import AlertBanner, { type AlertItem } from "@/components/dashboard/AlertBanner";
import QuickLinkGrid, { type QuickLink } from "@/components/dashboard/QuickLinkGrid";
import type { User } from "@prisma/client";

interface Props { user: User }

export default async function DeputyDashboard({ user }: Props) {
  const schoolId = user.schoolId!;
  const today    = new Date();

  const [
    totalStudents,
    totalTeachers,
    totalClasses,
    ,
    classesWithTimetable,
    pendingStudentAdmissions,
    todayAbsences,
    upcomingCalendar,
    timetableConflicts,
    todayTOD,
    ,
  ] = await Promise.all([
    prisma.student.count({ where: { schoolId, archivedAt: null } }),
    prisma.teacher.count({ where: { schoolId, archivedAt: null } }),
    prisma.schoolClass.count({ where: { schoolId } }),
    // Classes that have a class teacher assigned
    prisma.schoolClass.count({ where: { schoolId, classTeacherId: { not: null } } }),
    // Classes with at least one timetable slot
    prisma.schoolClass.findMany({
      where: { schoolId },
      select: { id: true, name: true, form: true, _count: { select: { timetableSlots: true } } },
    }),
    // Students added in last 7 days (pending onboarding)
    prisma.student.count({
      where: { schoolId, archivedAt: null, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    }),
    // Today's absences across all classes
    prisma.attendance.count({ where: { schoolId, date: today, status: "ABSENT" } }),
    getUpcomingCalendarItems(schoolId, { days: 14, limit: 6 }),
    // Timetable double-booking: teacher assigned two classes same slot
    prisma.timetableSlot.groupBy({
      by: ["teacherId", "dayOfWeek", "period"],
      where: { schoolId },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    }).catch(() => [] as { teacherId: string; dayOfWeek: number; period: number; _count: { id: number } }[]),
    // Teacher on duty today
    prisma.timetableSlot.findMany({
      where: { schoolId, dayOfWeek: today.getDay() === 0 ? 6 : today.getDay() - 1 },
      select: { teacher: { select: { fullName: true } } },
      take: 1,
    }).catch(() => []),
    // Calendar events past their closing date with no resolution
    prisma.calendarEvent.count({
      where: { schoolId, closingDate: { lt: today }, type: "EXAM" },
    }).catch(() => 0),
  ]);

  const classesNoTimetable = classesWithTimetable.filter((c) => c._count.timetableSlots === 0);
  const classesNoTeacher   = await prisma.schoolClass.findMany({
    where: { schoolId, classTeacherId: null },
    select: { id: true, name: true },
  });

  const alerts: AlertItem[] = [];
  if (classesNoTeacher.length > 0)
    alerts.push({ id: "ct", type: "danger", href: "/staff/classes", message: `${classesNoTeacher.length} class${classesNoTeacher.length > 1 ? "es" : ""} without a class teacher: ${classesNoTeacher.slice(0,3).map(c=>c.name).join(", ")}${classesNoTeacher.length > 3 ? " …" : ""}.` });
  if (classesNoTimetable.length > 0)
    alerts.push({ id: "tt", type: "danger", href: "/staff/timetable", message: `${classesNoTimetable.length} class${classesNoTimetable.length > 1 ? "es" : ""} have no timetable slots.` });
  if (todayAbsences > 10)
    alerts.push({ id: "abs", type: "warn", href: "/staff/attendance", message: `${todayAbsences} student absences recorded today — higher than usual.` });

  const quickLinks: QuickLink[] = [
    { label: "Manage classes",   href: "/staff/classes",     icon: "BookOpen" },
    { label: "Timetable",        href: "/staff/timetable",   icon: "CalendarDays" },
    { label: "Manage students",  href: "/staff/students",    icon: "Users" },
    { label: "Staff directory",  href: "/staff/directory",   icon: "GraduationCap" },
    { label: "TOD roster",       href: "/staff/tod",         icon: "Clipboard" },
    { label: "Attendance",       href: "/staff/attendance",  icon: "ClipboardCheck" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">Deputy Principal — Overview</h1>
        <p className="text-slate text-sm mt-1 dark:text-dark-muted">
          {today.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <AlertBanner alerts={alerts} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Students"    value={totalStudents} href="/staff/students"   icon={Users}         color="teal" />
        <StatCard label="Staff"       value={totalTeachers} href="/staff/directory"  icon={GraduationCap} color="teal" />
        <StatCard label="Classes"     value={totalClasses}  href="/staff/classes"    icon={BookOpen}      color="teal" />
        <StatCard
          label="No class teacher"
          value={classesNoTeacher.length}
          href="/staff/classes"
          icon={AlertTriangle}
          color={classesNoTeacher.length > 0 ? "danger" : "success"}
          badge={classesNoTeacher.length > 0 ? "Action needed" : "All assigned"}
          badgeColor={classesNoTeacher.length > 0 ? "danger" : "success"}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Today absences"    value={todayAbsences}          href="/staff/attendance" icon={CheckCircle} color={todayAbsences > 10 ? "warn" : "teal"} />
        <StatCard label="No timetable"      value={classesNoTimetable.length} href="/staff/timetable" icon={Clock}     color={classesNoTimetable.length > 0 ? "danger" : "success"} />
        <StatCard label="Conflicts"         value={timetableConflicts.length} href="/staff/timetable" icon={AlertTriangle} color={timetableConflicts.length > 0 ? "warn" : "success"} />
        <StatCard label="New this week"     value={pendingStudentAdmissions}  href="/staff/students"  icon={Users}     color="info" sub="students admitted" />
      </div>

      {todayTOD.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-4 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <p className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted mb-1">Teacher on duty today</p>
          <p className="text-sm font-medium text-ink dark:text-dark-text">{todayTOD[0].teacher.fullName}</p>
        </div>
      )}

      <QuickLinkGrid links={quickLinks} title="Quick actions" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UpcomingCalendarWidget items={upcomingCalendar} calendarHref="/staff/calendar" />

        {/* Classes needing attention */}
        {(classesNoTeacher.length > 0 || classesNoTimetable.length > 0) && (
          <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
            <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">Classes needing attention</p>
            <div className="space-y-2">
              {classesNoTeacher.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink dark:text-dark-text">{c.name}</span>
                  <span className="text-xs bg-danger-bg text-danger px-2 py-0.5 rounded-full">No class teacher</span>
                </div>
              ))}
              {classesNoTimetable.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink dark:text-dark-text">{c.name}</span>
                  <span className="text-xs bg-warn-bg text-warn px-2 py-0.5 rounded-full">No timetable</span>
                </div>
              ))}
            </div>
            <Link href="/staff/classes" className="mt-3 inline-block text-xs text-teal hover:underline">
              View all classes →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
