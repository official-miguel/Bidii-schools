import Link from "next/link";
import { TrendingUp, Users, BookOpen, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import UpcomingCalendarWidget from "@/components/UpcomingCalendarWidget";
import StatCard from "@/components/dashboard/StatCard";
import AlertBanner, { type AlertItem } from "@/components/dashboard/AlertBanner";
import QuickLinkGrid, { type QuickLink } from "@/components/dashboard/QuickLinkGrid";
import CountdownTimer from "@/components/dashboard/CountdownTimer";
import type { User } from "@prisma/client";

interface Props { user: User }

export default async function HODDashboard({ user }: Props) {
  const schoolId = user.schoolId!;
  const today    = new Date();

  // Find teacher record for this user
  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      id: true, fullName: true, primaryDepartmentId: true,
      departmentHeadOf: { select: { id: true, name: true } },
    },
  });

  const deptId = teacher?.departmentHeadOf?.id ?? teacher?.primaryDepartmentId ?? null;

  const [
    deptTeachers,
    deptSubjects,
    activePeriods,
    marksStats,
    deptClasses,
    disciplineInDept,
    upcomingCalendar,
  ] = await Promise.all([
    deptId
      ? prisma.teacher.count({ where: { schoolId, primaryDepartmentId: deptId, archivedAt: null } })
      : Promise.resolve(0),
    deptId
      ? prisma.subject.count({ where: { schoolId, departmentId: deptId } })
      : Promise.resolve(0),
    prisma.assessmentPeriod.findMany({
      where: { schoolId, isCurrent: true },
      select: { id: true, name: true, closingDate: true },
      take: 5,
    }).catch(() => [] as { id: string; name: string; closingDate?: Date | null }[]),
    // Marks entered for current period in this department's subjects
    deptId
      ? prisma.assessmentItem.count({
          where: {
            schoolId,
            subject: { departmentId: deptId },
          },
        }).catch(() => 0)
      : Promise.resolve(0),
    // Classes that have a subject in this department
    deptId
      ? prisma.schoolClass.findMany({
          where: {
            schoolId,
            subjectTeachers: { some: { subject: { departmentId: deptId } } },
          },
          select: { id: true, name: true, form: true },
          orderBy: [{ form: "asc" }, { name: "asc" }],
        }).catch(() => [] as { id: string; name: string; form: number }[])
      : Promise.resolve([] as { id: string; name: string; form: number }[]),
    // Open discipline cases for students in dept's classes
    deptId
      ? prisma.disciplineRecord.count({
          where: {
            schoolId,
            status: { in: ["OPEN", "UNDER_REVIEW"] },
          },
        }).catch(() => 0)
      : Promise.resolve(0),
    getUpcomingCalendarItems(schoolId, { days: 14, limit: 6 }),
  ]);

  const alerts: AlertItem[] = [];
  if (disciplineInDept > 0)
    alerts.push({ id: "disc", type: "warn", message: `${disciplineInDept} open discipline case${disciplineInDept > 1 ? "s" : ""} in your department.`, href: "/staff/records" });
  if (activePeriods.length === 0)
    alerts.push({ id: "ap", type: "info", message: "No active assessment period. Ask the principal or exam officer to open one." });

  const quickLinks: QuickLink[] = [
    { label: "Enter marks",       href: "/staff/assessments",         icon: "ClipboardCheck" },
    { label: "Dept subjects",     href: "/staff/subjects",            icon: "BookOpen" },
    { label: "Department staff",  href: "/staff/directory",           icon: "Users" },
    { label: "View reports",      href: "/staff/reports",             icon: "BarChart2" },
    { label: "Calendar",          href: "/staff/calendar",            icon: "CalendarDays" },
    { label: "Discipline records", href: "/staff/records",            icon: "AlertTriangle" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">
          {teacher?.departmentHeadOf?.name ?? "Department"} — Head of Department
        </h1>
        <p className="text-slate text-sm mt-1 dark:text-dark-muted">
          {teacher?.fullName} · {today.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <AlertBanner alerts={alerts} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Dept teachers"  value={deptTeachers}  href="/staff/directory"   icon={Users}       color="teal" />
        <StatCard label="Dept subjects"  value={deptSubjects}  href="/staff/subjects"    icon={BookOpen}    color="teal" />
        <StatCard label="Dept classes"   value={deptClasses.length} href="/staff/classes" icon={TrendingUp} color="teal" />
        <StatCard label="Marks entered"  value={marksStats}    href="/staff/assessments" icon={Clock}       color={marksStats > 0 ? "success" : "warn"}
                  sub="this period" />
      </div>

      {/* Active assessment periods with countdown */}
      {activePeriods.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Marks submission deadlines</p>
            <Link href="/staff/assessments" className="text-xs text-teal hover:underline">Enter marks</Link>
          </div>
          <ul className="space-y-3">
            {activePeriods.map((ap) => (
              <li key={ap.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink dark:text-dark-text">{ap.name}</span>
                {ap.closingDate
                  ? <CountdownTimer deadline={ap.closingDate.toISOString()} label="Closes" />
                  : <span className="text-xs text-slate dark:text-dark-muted">No deadline set</span>
                }
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Department classes */}
      {deptClasses.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Classes in your department</p>
            <span className="text-xs text-slate dark:text-dark-muted">{deptClasses.length} classes</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {deptClasses.map((c) => (
              <Link
                key={c.id}
                href={`/staff/assessments?classId=${c.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line text-sm
                           hover:border-teal/40 hover:bg-teal-50 transition-colors
                           dark:border-dark-border dark:hover:border-teal/40 dark:hover:bg-teal/5"
              >
                <span className="text-ink dark:text-dark-text">{c.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <QuickLinkGrid links={quickLinks} title="Quick actions" />

      <UpcomingCalendarWidget items={upcomingCalendar} calendarHref="/staff/calendar" />
    </div>
  );
}
