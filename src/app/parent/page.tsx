import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import Link from "next/link";
import { Award, ShieldAlert, ChevronRight } from "lucide-react";

import DashboardGreeting     from "@/components/parent/dashboard/DashboardGreeting";
import QuickOverviewGrid, { type QuickOverviewData } from "@/components/parent/dashboard/QuickOverviewGrid";
import AttendanceCalendarGrid, { type AttendanceDay } from "@/components/parent/dashboard/AttendanceCalendarGrid";
import TodaysAssignments, { type AssignmentItem } from "@/components/parent/dashboard/TodaysAssignments";
import RecentActivity, { type ActivityItem } from "@/components/parent/dashboard/RecentActivity";
import UpcomingEvents, { type UpcomingEvent } from "@/components/parent/dashboard/UpcomingEvents";

export const dynamic = "force-dynamic";

// ── helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"] as const;

function dueLabelFor(date: Date): { label: string; urgent: boolean } {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due   = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff  = Math.round((+due - +today) / 86_400_000);

  if (diff < 0)  return { label: "Overdue",     urgent: true  };
  if (diff === 0) return { label: "Due today",   urgent: true  };
  if (diff === 1) return { label: "Due tomorrow", urgent: true };
  const dow = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][due.getDay()];
  return { label: `Due ${dow}`, urgent: false };
}

function timeLabel(date: Date): string {
  const now  = new Date();
  const diff = Math.round((+now - +date) / 86_400_000);
  const time = date.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });
  if (diff === 0)  return time;
  if (diff === 1)  return `Yesterday · ${time}`;
  const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][date.getDay()];
  return `${dow} · ${time}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DiaryWithEntry = {
  id:            string;
  diaryEntryId:  string;
  studentId:     string;
  schoolId:      string;
  diaryEntry: {
    id:          string;
    title:       string;
    subject:     { name: string } | null;
    dueDate:     Date | null;
    description: string | null;
  };
};

// ── page ─────────────────────────────────────────────────────────────────────

export default async function ParentDashboard() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "PARENT" && user.role !== "STUDENT")) redirect("/login");

  const schoolId = user.schoolId!;

  // Resolve the parent name to use in the greeting
  const parentRecord = await prisma.parent.findUnique({
    where:  { userId: user.id },
    select: { name: true },
  }).catch(() => null);

  // Derive a greeting name: prefer "Baba/Mama <FirstName>" style from parent record
  const parentName = parentRecord?.name ?? user.email.split("@")[0];

  // ── Find linked students ──────────────────────────────────────────────────
  const students = await prisma.student.findMany({
    where: {
      schoolId,
      archivedAt: null,
      OR: [
        { userId:        user.id },
        { parentContact: user.email },
        { parentLinks:   { some: { parent: { userId: user.id } } } },
      ],
    },
    select: {
      id:             true,
      fullName:       true,
      admissionNumber: true,
      schoolClass:    { select: { name: true } },
    },
    orderBy: { fullName: "asc" },
  });

  const student = students[0] ?? null;
  const studentName = student?.fullName ?? "your child";

  // ── Parallel data fetches ─────────────────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const sevenDaysOut  = new Date(Date.now() + 7 * 86_400_000);

  const [
    recentAttendance,
    pendingDiaryCount,
    upcomingDiary,
    financeAccount,
    recentNotifications,
    recentDiscipline,
    recentAchievements,
    upcomingCalendar,
  ] = student
    ? await Promise.all([
        // Attendance last 30 days
        prisma.attendance.findMany({
          where:   { schoolId, studentId: student.id, date: { gte: thirtyDaysAgo } },
          orderBy: { date: "asc" },
          select:  { date: true, status: true },
        }),

        // Pending diary assignments not yet confirmed
        prisma.diaryRecipient.count({
          where: {
            studentId:    student.id,
            schoolId,
            parentStatus: "PENDING",
            diaryEntry:   { deletedAt: null },
          },
        }).catch(() => 0 as number),

        // Upcoming diary assignments due in the next 7 days
        prisma.diaryRecipient.findMany({
          where: {
            studentId: student.id,
            schoolId,
            diaryEntry: {
              deletedAt: null,
              dueDate:   { gte: new Date(), lte: sevenDaysOut },
            },
          },
          select: {
            id:          true,
            diaryEntryId: true,
            studentId:   true,
            schoolId:    true,
            diaryEntry: {
              select: {
                id:          true,
                title:       true,
                subject:     { select: { name: true } },
                dueDate:     true,
                description: true,
              },
            },
          },
          orderBy: { diaryEntry: { dueDate: "asc" } },
          take: 5,
        }).catch(() => [] as DiaryWithEntry[]) as Promise<DiaryWithEntry[]>,

        // Fees balance
        prisma.studentFinanceAccount.findUnique({
          where:  { studentId: student.id },
          select: { currentBalance: true },
        }).catch(() => null),

        // Recent notifications (last 10) — look up parent record first
        prisma.parent.findUnique({ where: { userId: user.id }, select: { id: true } })
          .then((p) => p
            ? prisma.parentNotification.findMany({
                where:   { schoolId, parentId: p.id },
                orderBy: { createdAt: "desc" },
                take:    10,
                select:  { id: true, title: true, module: true, isRead: true, createdAt: true },
              })
            : []
          )
          .catch(() => [] as { id: string; title: string; module: string; isRead: boolean; createdAt: Date }[]),

        // Discipline records
        prisma.disciplineRecord.findMany({
          where:   { schoolId, studentId: student.id },
          orderBy: { dateOfOffence: "desc" },
          take:    3,
          select:  { id: true, offence: true, dateOfOffence: true, status: true, actionTaken: true },
        }).catch(() => [] as { id: string; offence: string; dateOfOffence: Date; status: string; actionTaken: string | null }[]),

        // Recent achievements
        prisma.achievement.findMany({
          where:   { schoolId, students: { some: { studentId: student.id } } },
          orderBy: { achievementDate: "desc" },
          take:    3,
          select:  { id: true, title: true, category: true, achievementDate: true },
        }).catch(() => [] as { id: string; title: string; category: string; achievementDate: Date }[]),

        // Upcoming calendar events (next 30 days, up to 3)
        getUpcomingCalendarItems(schoolId, { days: 30, limit: 3 }),
      ])
    : [
        [] as { date: Date; status: string }[],
        0,
        [] as DiaryWithEntry[],
        null,
        [] as { id: string; title: string; module: string; isRead: boolean; createdAt: Date }[],
        [] as { id: string; offence: string; dateOfOffence: Date; status: string; actionTaken: string | null }[],
        [] as { id: string; title: string; category: string; achievementDate: Date }[],
        [] as Awaited<ReturnType<typeof getUpcomingCalendarItems>>,
      ];

  // ── Derived stats ─────────────────────────────────────────────────────────

  const present30 = recentAttendance.filter((a) => a.status === "PRESENT").length;
  const absent30  = recentAttendance.filter((a) => a.status === "ABSENT").length;
  const attPct    = recentAttendance.length > 0
    ? Math.round((present30 / recentAttendance.length) * 100)
    : null;

  // Sparkline: last 10 attendance records
  const sparkDays = recentAttendance.slice(-10).map((a) => ({ present: a.status === "PRESENT" }));

  const rawBalance  = Number(financeAccount?.currentBalance ?? 0);
  const owesSchool  = rawBalance < 0;
  const feesDisplay = owesSchool
    ? Math.abs(rawBalance).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : rawBalance > 0
    ? `${rawBalance.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} cr`
    : "0.00";
  const feesLabel = owesSchool ? "Outstanding balance" : rawBalance > 0 ? "In credit" : "Fully paid";

  // ── Quick overview data object ─────────────────────────────────────────────

  const overviewData: QuickOverviewData = {
    attendance: {
      pct:     attPct,
      present: present30,
      absent:  absent30,
      spark:   sparkDays,
      href:    "/parent/attendance",
    },
    academic: {
      grade: null,   // TODO: wire from results when available
      label: "Overall grade",
      href:  "/parent/results",
    },
    assignments: {
      count: pendingDiaryCount,
      label: pendingDiaryCount > 0 ? "Need attention" : "All confirmed",
      href:  "/parent/diary",
    },
    fees: {
      display: feesDisplay,
      label:   feesLabel,
      owed:    owesSchool,
      href:    "/parent/fees",
    },
  };

  // ── Alert cards ───────────────────────────────────────────────────────────

  const alertCards: {
    id: string;
    variant: "fees" | "assignment" | "attendance";
    title: string;
    body: string;
    linkLabel: string;
    linkHref: string;
  }[] = [];

  if (owesSchool) {
    alertCards.push({
      id:        "fees-outstanding",
      variant:   "fees",
      title:     "Fees outstanding",
      body:      `KES ${feesDisplay} is outstanding.`,
      linkLabel: "View fees",
      linkHref:  "/parent/fees",
    });
  }

  if (pendingDiaryCount > 0) {
    alertCards.push({
      id:        "assignments-due",
      variant:   "assignment",
      title:     `${pendingDiaryCount} assignment${pendingDiaryCount !== 1 ? "s" : ""} due soon`,
      body:      upcomingDiary.slice(0, 2).map((r) => {
        const e = r.diaryEntry;
        if (e?.dueDate) {
          const { label } = dueLabelFor(new Date(e.dueDate));
          return `${e.subject?.name ?? "Assignment"} ${label.toLowerCase()}`;
        }
        return e?.subject?.name ?? "Assignment";
      }).join("\n"),
      linkLabel: "View diary",
      linkHref:  "/parent/diary",
    });
  }

  // Attendance card: always show (good or concerning)
  if (attPct != null) {
    const goodAtt = attPct >= 90;
    alertCards.push({
      id:        "attendance-summary",
      variant:   "attendance",
      title:     goodAtt ? "Attendance looks good" : "Attendance needs attention",
      body:      `${studentName} attended ${present30} of the last ${recentAttendance.length} school days.`,
      linkLabel: "View attendance",
      linkHref:  "/parent/attendance",
    });
  }

  // Cap at 3 cards
  const visibleAlerts = alertCards.slice(0, 3);

  // ── Today's assignments ────────────────────────────────────────────────────

  const assignmentItems: AssignmentItem[] = upcomingDiary.map((r) => {
    const e = r.diaryEntry;
    const { label, urgent } = e.dueDate ? dueLabelFor(new Date(e.dueDate)) : { label: "", urgent: false };
    return {
      id:          e.id,
      subject:     e.subject?.name ?? "Assignment",
      description: e.title ?? e.description ?? "",
      dueLabel:    label,
      urgent,
    };
  });

  // ── Recent activity ────────────────────────────────────────────────────────

  // Map notification type to activity type
  type ActivityType =
    | "assignment_posted"
    | "announcement"
    | "attendance_present"
    | "attendance_absent"
    | "exam_result"
    | "notification"
    | "diary"
    | "behaviour";

  function mapType(t: string): ActivityType {
    if (t === "DIARY")        return "assignment_posted";
    if (t === "CALENDAR")     return "announcement";
    if (t === "ATTENDANCE")   return "attendance_present";
    if (t === "FEES")         return "notification";
    if (t === "ACHIEVEMENTS") return "exam_result";
    if (t === "BEHAVIOUR")    return "behaviour";
    return "notification";
  }

  const activityItems: ActivityItem[] = recentNotifications.map((n) => ({
    id:        n.id,
    type:      mapType(n.module),
    title:     n.title,
    timeLabel: timeLabel(new Date(n.createdAt)),
  }));

  // ── Attendance calendar days ───────────────────────────────────────────────

  const calendarDays: AttendanceDay[] = recentAttendance.map((a) => ({
    date:   new Date(a.date),
    status: a.status as AttendanceDay["status"],
  }));

  // ── Upcoming events ────────────────────────────────────────────────────────

  const eventItems: UpcomingEvent[] = upcomingCalendar.map((ev) => {
    const d = new Date(ev.date);
    return {
      id:        ev.id,
      title:     ev.title,
      dateLabel: d.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short", year: "numeric" }),
      day:       d.getDate(),
      month:     MONTHS[d.getMonth()],
    };
  });

  // ── No-student state ───────────────────────────────────────────────────────

  if (!student) {
    return (
      <div className="space-y-6">
        <DashboardGreeting
          parentName={parentName}
          studentName="your child"
          alerts={[]}
        />
        <div className="rounded-2xl bg-white dark:bg-dark-surface border border-line
                        dark:border-dark-border p-8 text-center shadow-xs">
          <p className="text-2xl mb-3">🏫</p>
          <p className="text-base font-semibold text-ink dark:text-dark-text">
            No student linked yet
          </p>
          <p className="text-sm text-slate dark:text-dark-muted mt-2 max-w-sm mx-auto">
            Contact the school office to link your child&apos;s record to your account.
          </p>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Greeting + alert cards */}
      <DashboardGreeting
        parentName={parentName}
        studentName={studentName.split(" ")[0]}
        alerts={visibleAlerts}
      />

      {/* Quick overview — 4 tiles */}
      <section aria-labelledby="overview-heading">
        <div className="flex items-center justify-between mb-3">
          <h2 id="overview-heading" className="text-base font-semibold text-ink dark:text-dark-text">
            Quick overview
          </h2>
          <a href="/parent/attendance" className="text-xs font-medium text-teal hover:underline">
            View all →
          </a>
        </div>
        <QuickOverviewGrid data={overviewData} />
      </section>

      {/* Desktop: two-column layout for assignments + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TodaysAssignments items={assignmentItems} viewHref="/parent/diary" />
        <RecentActivity    items={activityItems}   viewHref="/parent/notifications" />
      </div>

      {/* Attendance calendar grid */}
      {calendarDays.length > 0 && (
        <AttendanceCalendarGrid days={calendarDays} viewHref="/parent/attendance" />
      )}

      {/* Discipline & Achievements — side by side on desktop */}
      {(recentDiscipline.length > 0 || recentAchievements.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Discipline records */}
          {recentDiscipline.length > 0 && (
            <section aria-labelledby="discipline-heading">
              <div className="flex items-center justify-between mb-3">
                <h2 id="discipline-heading" className="text-base font-semibold text-ink dark:text-dark-text">
                  Behaviour &amp; discipline
                </h2>
                <Link href="/parent/behaviour" className="text-xs font-medium text-teal hover:underline">
                  View all →
                </Link>
              </div>
              <div className="rounded-2xl bg-white dark:bg-dark-surface border border-line
                              dark:border-dark-border shadow-xs overflow-hidden divide-y divide-line
                              dark:divide-dark-border">
                {recentDiscipline.map((d) => {
                  const isOpen = d.status === "OPEN";
                  return (
                    <Link
                      key={d.id}
                      href="/parent/behaviour"
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#F9FAFB]
                                 dark:hover:bg-dark-border transition-colors group"
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                                       ${isOpen ? "bg-[#FFF3E8]" : "bg-[#F5F7FA] dark:bg-dark-border"}`}>
                        <ShieldAlert
                          className={`h-4.5 w-4.5 ${isOpen ? "text-[#F79009]" : "text-slate dark:text-dark-muted"}`}
                          strokeWidth={1.8}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink dark:text-dark-text truncate">
                          {d.offence}
                        </p>
                        <p className="text-xs text-slate dark:text-dark-muted">
                          {new Date(d.dateOfOffence).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                          {" · "}
                          <span className={isOpen ? "text-[#F79009] font-medium" : "text-[#17B26A] font-medium"}>
                            {isOpen ? "Open" : "Resolved"}
                          </span>
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate/30 group-hover:text-teal shrink-0 transition-colors" />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Achievements */}
          {recentAchievements.length > 0 && (
            <section aria-labelledby="achievements-heading">
              <div className="flex items-center justify-between mb-3">
                <h2 id="achievements-heading" className="text-base font-semibold text-ink dark:text-dark-text">
                  Recent achievements
                </h2>
                <Link href="/parent/achievements" className="text-xs font-medium text-teal hover:underline">
                  View all →
                </Link>
              </div>
              <div className="rounded-2xl bg-white dark:bg-dark-surface border border-line
                              dark:border-dark-border shadow-xs overflow-hidden divide-y divide-line
                              dark:divide-dark-border">
                {recentAchievements.map((a) => (
                  <Link
                    key={a.id}
                    href="/parent/achievements"
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#F9FAFB]
                               dark:hover:bg-dark-border transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-xl bg-[#EDFAF4] flex items-center justify-center shrink-0">
                      <Award className="h-4.5 w-4.5 text-[#17B26A]" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink dark:text-dark-text truncate">
                        {a.title}
                      </p>
                      <p className="text-xs text-slate dark:text-dark-muted">
                        {a.category}
                        {" · "}
                        {new Date(a.achievementDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate/30 group-hover:text-teal shrink-0 transition-colors" />
                  </Link>
                ))}
              </div>
            </section>
          )}

        </div>
      )}

      {/* Upcoming events */}
      <UpcomingEvents events={eventItems} calendarHref="/parent/calendar" />

    </div>
  );
}
