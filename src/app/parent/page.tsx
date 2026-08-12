import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import UpcomingCalendarWidget from "@/components/UpcomingCalendarWidget";
import StatCard from "@/components/dashboard/StatCard";
import AlertBanner, { type AlertItem } from "@/components/dashboard/AlertBanner";
import { BookOpen, CheckCircle, AlertTriangle, Award } from "lucide-react";

export default async function ParentDashboard() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "PARENT" && user.role !== "STUDENT")) redirect("/login");

  const schoolId = user.schoolId!;

  // Find the student record(s) linked to this parent/student account.
  // A parent may have multiple children; a student has themselves.
  const students = await prisma.student.findMany({
    where: {
      schoolId,
      archivedAt: null,
      OR: [
        // Direct student login
        { userId: user.id },
        // Parent linked via phone/contact (matching by email if used as contact)
        { parentContact: user.email },
      ],
    },
    select: {
      id: true, fullName: true, admissionNumber: true,
      schoolClass: { select: { name: true, form: true } },
      _count: {
        select: {
          attendances:      true,
          disciplineRecords: true,
          achievements:     true,
        },
      },
    },
    orderBy: { fullName: "asc" },
  });

  if (students.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">Parent Portal</h1>
        <div className="bg-warn-bg border border-warn/20 rounded-xl p-5">
          <p className="text-sm text-warn font-medium">No student records linked to your account.</p>
          <p className="text-sm text-slate mt-1 dark:text-dark-muted">
            Contact the school office to link your child&apos;s record to your account.
          </p>
        </div>
      </div>
    );
  }

  // Use first student as primary; parent can navigate to others
  const primaryStudent = students[0];

  const [
    recentAttendance,
    recentDiscipline,
    recentAchievements,
    libraryCard,
    upcomingCalendar,
  ] = await Promise.all([
    // Last 30 days attendance
    prisma.attendance.findMany({
      where: { schoolId, studentId: primaryStudent.id, date: { gte: new Date(Date.now() - 30 * 86400000) } },
      orderBy: { date: "desc" },
      select: { date: true, status: true },
    }),
    // Shared discipline records
    prisma.disciplineRecord.findMany({
      where: { schoolId, studentId: primaryStudent.id, status: { in: ["OPEN", "RESOLVED"] } },
      orderBy: { dateOfOffence: "desc" },
      take: 3,
      select: { id: true, offence: true, dateOfOffence: true, status: true, actionTaken: true },
    }),
    // Achievements
    prisma.achievement.findMany({
      where: { schoolId, students: { some: { studentId: primaryStudent.id } } },
      orderBy: { achievementDate: "desc" },
      take: 3,
      select: { id: true, title: true, category: true, achievementDate: true },
    }),
    // Library card
    prisma.libraryCard.findUnique({
      where: { studentId: primaryStudent.id },
      select: { fineBalance: true, currentBorrowCount: true, status: true },
    }).catch(() => null),
    getUpcomingCalendarItems(schoolId, { days: 30, limit: 6 }),
  ]);

  const absences30  = recentAttendance.filter((a) => a.status === "ABSENT").length;
  const present30   = recentAttendance.filter((a) => a.status === "PRESENT").length;
  const attPct      = recentAttendance.length > 0 ? Math.round((present30 / recentAttendance.length) * 100) : null;

  const alerts: AlertItem[] = [];
  if (absences30 >= 5)
    alerts.push({ id: "abs", type: "warn", message: `${absences30} absences in the last 30 days. Please contact the school if there are ongoing concerns.` });
  if (libraryCard && libraryCard.fineBalance > 0)
    alerts.push({ id: "fine", type: "info", message: `Outstanding library fine of KES ${libraryCard.fineBalance.toLocaleString()}. Please clear at the library desk.` });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">
          {students.length === 1
            ? primaryStudent.fullName
            : "My Children"}
        </h1>
        <p className="text-slate text-sm mt-1 dark:text-dark-muted">
          {primaryStudent.schoolClass.name} · Adm #{primaryStudent.admissionNumber}
        </p>
      </div>

      {/* Multi-child switcher */}
      {students.length > 1 && (
        <div className="bg-card border border-line rounded-xl p-4 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <p className="text-xs font-semibold text-slate uppercase tracking-wide dark:text-dark-muted mb-2">
            Your children
          </p>
          <div className="flex flex-wrap gap-2">
            {students.map((s, i) => (
              <Link
                key={s.id}
                href={`/parent/student/${s.id}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors
                  ${i === 0
                    ? "border-teal/50 bg-teal/5 text-teal"
                    : "border-line text-slate hover:border-teal/40 hover:bg-teal-50 dark:border-dark-border dark:text-dark-muted dark:hover:border-teal/40"
                  }`}
              >
                <div className="w-6 h-6 rounded-full bg-teal/10 text-teal text-[10px] font-semibold flex items-center justify-center">
                  {s.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium leading-none">{s.fullName.split(" ")[0]}</p>
                  <p className="text-[10px] leading-none opacity-70">{s.schoolClass.name}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <AlertBanner alerts={alerts} />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Attendance (30d)"
          value={attPct != null ? `${attPct}%` : "—"}
          href="/parent/attendance"
          icon={CheckCircle}
          color={attPct != null && attPct < 80 ? "warn" : "success"}
          sub={`${absences30} absence${absences30 !== 1 ? "s" : ""}`}
        />
        <StatCard
          label="Library borrows"
          value={libraryCard?.currentBorrowCount ?? 0}
          href="/parent/library"
          icon={BookOpen}
          color="teal"
          sub={libraryCard && libraryCard.fineBalance > 0 ? `KES ${libraryCard.fineBalance} fine` : "No fines"}
        />
        <StatCard
          label="Discipline"
          value={recentDiscipline.length}
          href="/parent/discipline"
          icon={AlertTriangle}
          color={recentDiscipline.filter((d) => d.status === "OPEN").length > 0 ? "warn" : "success"}
        />
        <StatCard
          label="Achievements"
          value={recentAchievements.length}
          href="/parent/achievements"
          icon={Award}
          color="success"
        />
      </div>

      {/* Attendance history snippet */}
      {recentAttendance.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Attendance — last 30 days</p>
            <Link href="/parent/attendance" className="text-xs text-teal hover:underline">Full history</Link>
          </div>
          {/* Dot calendar */}
          <div className="flex flex-wrap gap-1.5">
            {recentAttendance.slice(0, 30).reverse().map((a, i) => (
              <div
                key={i}
                title={`${new Date(a.date).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })} — ${a.status}`}
                className={`w-6 h-6 rounded-md text-[9px] font-bold flex items-center justify-center
                  ${a.status === "PRESENT" ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}
              >
                {new Date(a.date).getDate()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achievements */}
      {recentAchievements.length > 0 && (
        <div className="bg-card border border-line rounded-xl p-5 shadow-xs dark:bg-dark-surface dark:border-dark-border">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Recent achievements</p>
            <Link href="/parent/achievements" className="text-xs text-teal hover:underline">All achievements</Link>
          </div>
          <div className="space-y-2">
            {recentAchievements.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-success shrink-0" />
                  <span className="text-ink dark:text-dark-text">{a.title}</span>
                </div>
                <span className="text-xs text-slate dark:text-dark-muted shrink-0">
                  {new Date(a.achievementDate).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exam results quick link */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/parent/results"
          className="flex items-center gap-3 p-4 bg-card border border-line rounded-xl shadow-xs
                     hover:border-teal/40 hover:shadow-sm transition-all
                     dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/30">
          <div className="w-10 h-10 rounded-lg bg-teal/10 text-teal flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink dark:text-dark-text">Exam results</p>
            <p className="text-xs text-slate dark:text-dark-muted">View report cards and performance</p>
          </div>
        </Link>
        <Link href="/parent/messages"
          className="flex items-center gap-3 p-4 bg-card border border-line rounded-xl shadow-xs
                     hover:border-teal/40 hover:shadow-sm transition-all
                     dark:bg-dark-surface dark:border-dark-border dark:hover:border-teal/30">
          <div className="w-10 h-10 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink dark:text-dark-text">School messages</p>
            <p className="text-xs text-slate dark:text-dark-muted">Announcements and notifications from the school</p>
          </div>
        </Link>
      </div>

      <UpcomingCalendarWidget items={upcomingCalendar} calendarHref="/parent/calendar" />
    </div>
  );
}
