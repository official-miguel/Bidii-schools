import Link from "next/link";
import { Users, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import UpcomingCalendarWidget from "@/components/UpcomingCalendarWidget";
import StatCard from "@/components/dashboard/StatCard";
import AlertBanner, { type AlertItem } from "@/components/dashboard/AlertBanner";
import QuickLinkGrid, { type QuickLink } from "@/components/dashboard/QuickLinkGrid";
import CountdownTimer from "@/components/dashboard/CountdownTimer";
import type { User } from "@prisma/client";

interface Props { user: User; rolePrefix: string }

export default async function ClassTeacherDashboard({ user, rolePrefix }: Props) {
  const schoolId = user.schoolId!;
  const today    = new Date();

  const teacher = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      id: true, fullName: true,
      classTeacherOf: {
        select: {
          id: true, name: true, form: true,
          _count: { select: { students: true } },
          subjectTeachers: {
            select: {
              subject: { select: { id: true, name: true, code: true } },
              teacher: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });

  const assignedClass = teacher?.classTeacherOf ?? null;

  const [
    todayPresent,
    todayAbsent,
    openDiscipline,
    activePeriods,
    upcomingCalendar,
    recentAbsences,
  ] = await Promise.all([
    assignedClass
      ? prisma.attendance.count({ where: { schoolId, classId: assignedClass.id, date: today, status: "PRESENT" } })
      : Promise.resolve(0),
    assignedClass
      ? prisma.attendance.count({ where: { schoolId, classId: assignedClass.id, date: today, status: "ABSENT" } })
      : Promise.resolve(0),
    assignedClass
      ? prisma.disciplineRecord.count({
          where: { schoolId, status: { in: ["OPEN", "UNDER_REVIEW"] }, student: { classId: assignedClass.id } },
        })
      : Promise.resolve(0),
    prisma.assessmentPeriod.findMany({
      where: { schoolId, isCurrent: true },
      select: { id: true, name: true, closingDate: true },
      take: 3,
    }).catch(() => [] as { id: string; name: string; closingDate?: Date | null }[]),
    getUpcomingCalendarItems(schoolId, { days: 14, limit: 5 }),
    assignedClass
      ? prisma.attendance.groupBy({
          by: ["studentId"],
          where: {
            schoolId, classId: assignedClass.id, status: "ABSENT",
            date: { gte: new Date(Date.now() - 14 * 86400000) },
          },
          _count: { id: true },
          having: { id: { _count: { gte: 3 } } },
        }).then((rows) =>
          rows.length > 0
            ? prisma.student.findMany({
                where: { id: { in: rows.map((r) => r.studentId) } },
                select: { id: true, fullName: true },
              })
            : Promise.resolve([] as { id: string; fullName: string }[])
        )
      : Promise.resolve([] as { id: string; fullName: string }[]),
  ]);

  const totalStudents = assignedClass?._count.students ?? 0;
  const attendancePct = totalStudents > 0 ? Math.round((todayPresent / totalStudents) * 100) : null;

  const alerts: AlertItem[] = [];
  if (!assignedClass)
    alerts.push({ id: "nc", type: "info", message: "You haven't been assigned as a class teacher yet." });
  if (openDiscipline > 0)
    alerts.push({ id: "disc", type: "warn", href: `/${rolePrefix}/records`,
      message: `${openDiscipline} open discipline case${openDiscipline > 1 ? "s" : ""} in your class.` });
  if (recentAbsences.length > 0)
    alerts.push({ id: "abs", type: "warn",
      message: `${recentAbsences.length} student${recentAbsences.length > 1 ? "s" : ""} with 3+ absences in the last 14 days.` });

  const quickLinks: QuickLink[] = [
    { label: "Take attendance",   href: `/${rolePrefix}/attendance`,    icon: "ClipboardCheck" },
    { label: "Class marks",       href: `/${rolePrefix}/assessments`,   icon: "BookOpen" },
    { label: "Report cards",      href: `/${rolePrefix}/reports`,       icon: "FileText" },
    { label: "Message parents",   href: `/${rolePrefix}/communication`, icon: "MessageSquare" },
    { label: "Discipline",        href: `/${rolePrefix}/records`,       icon: "AlertTriangle" },
    { label: "Achievements",      href: `/${rolePrefix}/achievements`,  icon: "Award" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">
          {assignedClass ? `Class Teacher — ${assignedClass.name}` : "Class Teacher"}
        </h1>
        <p className="text-slate text-sm mt-1 dark:text-dark-muted">
          {teacher?.fullName} · {today.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <AlertBanner alerts={alerts} />

      {assignedClass && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total students"  value={totalStudents}  href={`/${rolePrefix}/students`}   icon={Users}         color="teal" />
            <StatCard label="Present today"   value={todayPresent}   href={`/${rolePrefix}/attendance`} icon={CheckCircle}   color="success"
                      badge={attendancePct != null ? `${attendancePct}%` : undefined} badgeColor="success" />
            <StatCard label="Absent today"    value={todayAbsent}    href={`/${rolePrefix}/attendance`} icon={AlertTriangle} color={todayAbsent > 3 ? "warn" : "teal"} />
            <StatCard label="Open discipline" value={openDiscipline} href={`/${rolePrefix}/records`}   icon={TrendingUp}    color={openDiscipline > 0 ? "warn" : "success"} />
          </div>

          {/* Subjects & teachers */}
          <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-ink dark:text-dark-text">Subjects in {assignedClass.name}</p>
              <span className="text-xs text-slate dark:text-dark-muted">{assignedClass.subjectTeachers.length} subjects</span>
            </div>
            <div className="space-y-1.5">
              {assignedClass.subjectTeachers.slice(0, 8).map((st, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-ink dark:text-dark-text">{st.subject.name}</span>
                  <span className="text-xs text-slate dark:text-dark-muted">{st.teacher.fullName}</span>
                </div>
              ))}
              {assignedClass.subjectTeachers.length > 8 && (
                <p className="text-xs text-teal mt-1">+{assignedClass.subjectTeachers.length - 8} more subjects</p>
              )}
            </div>
          </div>

          {/* Frequent absentees */}
          {recentAbsences.length > 0 && (
            <div className="bg-warn-bg border border-warn/20 rounded-xl p-5">
              <p className="text-sm font-semibold text-warn mb-2">Frequent absentees (last 14 days)</p>
              <div className="flex flex-wrap gap-2">
                {recentAbsences.map((s) => (
                  <Link key={s.id} href={`/${rolePrefix}/students/${s.id}`}
                    className="text-xs bg-white border border-warn/30 text-ink px-2 py-1 rounded-lg
                               hover:bg-warn-bg/60 transition-colors dark:bg-dark-surface dark:text-dark-text">
                    {s.fullName}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Assessment deadlines */}
          {activePeriods.length > 0 && (
            <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
              <p className="text-sm font-semibold text-ink dark:text-dark-text mb-3">Assessment deadlines</p>
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
            </div>
          )}
        </>
      )}

      <QuickLinkGrid links={quickLinks} title="Quick actions" />
      <UpcomingCalendarWidget items={upcomingCalendar} calendarHref={`/${rolePrefix}/calendar`} />
    </div>
  );
}
