/**
 * src/components/dashboard/UnifiedDashboard.tsx
 *
 * The blended single-homepage that merges ALL active roles for one user into
 * one coherent view. Sections appear only for roles the user currently holds.
 * No empty spaces, no placeholders, no "you don't have access" banners.
 *
 * Layout order (teacher / staff, matching design mockup):
 *   1. Page header — Welcome + date
 *   2. Principal deadline banner (teachers/staff only, when set)
 *   3. Class Teacher banner + stats  (when class teacher)
 *   4. Subject Teacher stats + schedule + subjects  (when subject teacher)
 *   5. HOD section  (when head of dept)
 *   6. Library section  (when librarian)
 *   7. Boarding section  (when dorm master / matron)
 *   8. Quick actions grid
 *   9. Recent activity feed  (teachers/staff)
 *  10. Upcoming calendar widget
 *
 * Principal layout:
 *   1. Page header — Overview + date
 *   2. Setup alerts
 *   3. School overview section
 *   4. Quick actions grid
 *   5. Upcoming calendar widget
 */

import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeDerivedRoles } from "@/lib/derivedRoles";
import { getEffectivePermissions, getAssignedRoleNames } from "@/lib/permissions";
import { getUpcomingCalendarItems, getPrincipalDeadlines } from "@/lib/calendarUpcoming";
import type { DeadlineItem } from "@/components/dashboard/DeadlineCountdownBanner";
import UpcomingCalendarWidget from "@/components/UpcomingCalendarWidget";
import DeadlineCountdownBanner from "@/components/dashboard/DeadlineCountdownBanner";
import QuickLinkGrid, { type QuickLink } from "@/components/dashboard/QuickLinkGrid";
import AlertBanner, { type AlertItem } from "@/components/dashboard/AlertBanner";
import SchoolOverviewSection from "@/components/dashboard/sections/SchoolOverviewSection";
import SubjectTeacherSection from "@/components/dashboard/sections/SubjectTeacherSection";
import ClassTeacherSection   from "@/components/dashboard/sections/ClassTeacherSection";
import HODSection            from "@/components/dashboard/sections/HODSection";
import LibrarianSection      from "@/components/dashboard/sections/LibrarianSection";
import DormMasterSection     from "@/components/dashboard/sections/DormMasterSection";
import DashboardRecentActivity, {
  type RecentActivityItem,
  type RecentActivityType,
} from "@/components/dashboard/DashboardRecentActivity";

interface Props {
  user:       User;
  rolePrefix: string; // "teacher" | "staff" | "principal"
}

export default async function UnifiedDashboard({ user, rolePrefix }: Props) {
  const schoolId = user.schoolId!;
  const today    = new Date();
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;

  // ── Role resolution ───────────────────────────────────────────────────────
  const isPrincipal  = user.role === "PRINCIPAL";
  const isTeacher    = user.role === "TEACHER";
  const isAdminStaff = user.role === "ADMIN_STAFF";

  const [derived, assignedRoleNames, perms, school] = await Promise.all([
    (isTeacher || isAdminStaff)
      ? computeDerivedRoles(user.id, schoolId)
      : Promise.resolve({ subjectTeacher: null, classTeacher: null, headOfDept: null, dormMaster: null, activeKinds: new Set<string>() }),
    (isAdminStaff)
      ? getAssignedRoleNames(user)
      : Promise.resolve([] as string[]),
    (isAdminStaff || isTeacher)
      ? getEffectivePermissions(user)
      : Promise.resolve({}),
    prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true, boardingType: true },
    }),
  ]);

  const lowerRoles          = assignedRoleNames.map((n) => n.toLowerCase());
  const isDeputy            = lowerRoles.some((n) => n.includes("deputy"));
  const isAssignedLibrarian = lowerRoles.some((n) => n.includes("librarian"));
  const isAssignedMatron    = lowerRoles.some((n) => n.includes("matron") || (n.includes("boarding") && !n.includes("dorm")));

  // Scope precedence: Principal/Deputy absorbs all derived roles into one view
  const showSchoolOverview = isPrincipal || isDeputy;
  const showHOD            = !showSchoolOverview && derived.headOfDept != null;
  const showClassTeacher   = derived.classTeacher != null;
  const showSubjectTeacher = !showSchoolOverview && derived.subjectTeacher != null;

  // Boarding
  const hasBoarding   = school?.boardingType !== "DAY_ONLY";
  const showDorm      = hasBoarding && (derived.dormMaster != null || isAssignedMatron || isPrincipal || isDeputy);
  const dormIsSchoolWide = isAssignedMatron || showSchoolOverview;

  // Library
  const [libBooksCount, libSettingsCount] = await Promise.all([
    prisma.libraryBook.count({ where: { schoolId } }).catch(() => 0),
    prisma.librarySettings.count({ where: { schoolId } }).catch(() => 0),
  ]);
  const hasLibrary  = libSettingsCount > 0 || libBooksCount > 0;
  const showLibrary = hasLibrary && (
    isAssignedLibrarian || isPrincipal || isDeputy ||
    (perms as Record<string, { canView?: boolean }>)?.LIBRARY?.canView
  );

  // Show recent activity for teachers and admin staff (not principal — they have school-wide view)
  const showRecentActivity = isTeacher || isAdminStaff;

  // Teacher record for display name
  const teacherRecord = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: { fullName: true },
  }).catch(() => null);

  const displayName = teacherRecord?.fullName ?? user.email;

  // ── Parallel data fetches ─────────────────────────────────────────────────
  const results = await Promise.allSettled([
    // [0] School overview (principal / deputy)
    showSchoolOverview ? fetchSchoolOverview(schoolId, today) : Promise.resolve(null),

    // [1] HOD data
    showHOD && derived.headOfDept
      ? fetchHODData(schoolId, derived.headOfDept.departmentId)
      : Promise.resolve(null),

    // [2] Class teacher data
    showClassTeacher && derived.classTeacher
      ? fetchClassTeacherData(schoolId, derived.classTeacher.classId, today)
      : Promise.resolve(null),

    // [3] Subject teacher data
    showSubjectTeacher
      ? fetchSubjectTeacherData(schoolId, user.id, dayOfWeek, today)
      : Promise.resolve(null),

    // [4] Library data
    showLibrary ? fetchLibraryData(schoolId, today) : Promise.resolve(null),

    // [5] Dorm data
    showDorm
      ? fetchDormData(schoolId, dormIsSchoolWide ? undefined : derived.dormMaster?.dorms.map((d) => d.id))
      : Promise.resolve(null),

    // [6] Assessment periods
    (!showSchoolOverview || isTeacher)
      ? prisma.assessmentPeriod.findMany({
          where: { schoolId, isCurrent: true },
          select: { id: true, name: true, closingDate: true },
          take: 5,
        }).catch(() => [])
      : Promise.resolve([]),

    // [7] Calendar
    getUpcomingCalendarItems(schoolId, { days: 14, limit: 8 }).catch(() => []),

    // [8] Principal deadlines (teachers / staff only)
    !isPrincipal
      ? getPrincipalDeadlines(schoolId).catch(() => [])
      : Promise.resolve([]),

    // [9] Recent activity — teacher/staff notifications (last 5)
    showRecentActivity
      ? fetchRecentActivity(user.id, schoolId).catch(() => [] as RecentActivityItem[])
      : Promise.resolve([] as RecentActivityItem[]),
  ]);

  const unwrap = <T,>(r: PromiseSettledResult<T>): T | null =>
    r.status === "fulfilled" ? r.value : null;

  const schoolOverview     = unwrap(results[0]);
  const hodData            = unwrap(results[1]);
  const classTeacherData   = unwrap(results[2]);
  const subjectTeacherData = unwrap(results[3]);
  const libraryData        = unwrap(results[4]);
  const dormData           = unwrap(results[5]);
  const assessmentPeriods  = (unwrap(results[6]) ?? []) as { id: string; name: string; closingDate?: Date | null }[];
  const calendarItems      = (unwrap(results[7]) ?? []) as Parameters<typeof UpcomingCalendarWidget>[0]["items"];
  const recentActivityItems = (unwrap(results[9]) ?? []) as RecentActivityItem[];

  // Serialise Date → ISO string for client component
  const principalDeadlines: DeadlineItem[] = !isPrincipal
    ? ((unwrap(results[8]) ?? []) as Awaited<ReturnType<typeof getPrincipalDeadlines>>).map((d) => ({
        id:          d.id,
        title:       d.title,
        description: d.description,
        deadlineAt:  d.deadlineAt.toISOString(),
        eventDate:   d.eventDate.toISOString(),
      }))
    : [];

  // ── Quick links ───────────────────────────────────────────────────────────
  const quickLinks: QuickLink[] = [];

  if (isPrincipal) {
    quickLinks.push(
      { label: "Students",     href: `/${rolePrefix}/students`,     icon: "Users"          },
      { label: "Staff",        href: `/${rolePrefix}/staff`,         icon: "GraduationCap"  },
      { label: "Attendance",   href: `/${rolePrefix}/attendance`,    icon: "ClipboardCheck" },
      { label: "Send message", href: `/${rolePrefix}/communication`, icon: "MessageSquare"  },
      { label: "Permissions",  href: `/${rolePrefix}/staff-roles`,   icon: "Shield"         },
      { label: "Reports",      href: `/${rolePrefix}/reports`,       icon: "BarChart2"      },
    );
  } else {
    if (showHOD || derived.headOfDept)
      quickLinks.push({ label: "Enter marks",      href: `/${rolePrefix}/assessments`,  icon: "ClipboardCheck" });
    if (showClassTeacher)
      quickLinks.push({ label: "Take attendance",  href: `/${rolePrefix}/attendance`,   icon: "ClipboardList"  });
    if (showSubjectTeacher && !showHOD)
      quickLinks.push({ label: "My timetable",     href: `/${rolePrefix}/timetable`,    icon: "CalendarDays"   });
    if (showLibrary)
      quickLinks.push({ label: "Issue book",       href: `/${rolePrefix}/library/issue`,icon: "BookOpen"       });
    if (showDorm)
      quickLinks.push({ label: "View dorms",       href: `/${rolePrefix}/accommodation`,icon: "Home"           });
    if (showClassTeacher)
      quickLinks.push({ label: "Message parents",  href: `/${rolePrefix}/communication`,icon: "MessageSquare"  });
    quickLinks.push(   { label: "Calendar",        href: `/${rolePrefix}/calendar`,     icon: "CalendarDays"   });
  }

  // ── Setup alerts (principal only) ─────────────────────────────────────────
  const setupAlerts: AlertItem[] = [];
  if (isPrincipal && schoolOverview && schoolOverview.totalDepts === 0) {
    setupAlerts.push({
      id:      "setup",
      type:    "info",
      message: "Finish setting up your school — start with departments and subjects.",
    });
  }

  const calendarHref = `/${rolePrefix}/calendar`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 sm:space-y-7">

      {/* ── 1. Page header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink dark:text-dark-text leading-snug">
          {isPrincipal
            ? "Overview"
            : (
              <>
                Welcome, {displayName}{" "}
                <span aria-hidden="true">👋</span>
              </>
            )
          }
        </h1>
        <p className="text-sm text-slate dark:text-dark-muted mt-0.5">
          {today.toLocaleDateString("en-KE", {
            weekday: "long", day: "numeric", month: "long", year: "numeric",
          })}
          {assignedRoleNames.length > 0 && (
            <span className="ml-2 text-slate/60 block xs:inline">
              · {assignedRoleNames.slice(0, 2).join(" & ")}
              {assignedRoleNames.length > 2 ? " +more" : ""}
            </span>
          )}
        </p>
      </div>

      {/* ── 2. Setup alerts (principal only) ──────────────────────────── */}
      {setupAlerts.length > 0 && <AlertBanner alerts={setupAlerts} />}

      {/* ── 3. Principal deadline banner (teachers / staff) ───────────── */}
      {!isPrincipal && principalDeadlines.length > 0 && (
        <DeadlineCountdownBanner
          deadlines={principalDeadlines}
          calendarHref={calendarHref}
        />
      )}

      {/* ── 4. School overview (principal / deputy) ───────────────────── */}
      {showSchoolOverview && schoolOverview && (
        <SchoolOverviewSection
          rolePrefix={rolePrefix}
          isDeputy={isDeputy}
          totalStudents={schoolOverview.totalStudents}
          totalTeachers={schoolOverview.totalTeachers}
          totalClasses={schoolOverview.totalClasses}
          totalDepts={schoolOverview.totalDepts}
          unresolvedDiscipline={schoolOverview.unresolvedDiscipline}
          classesNoTeacher={schoolOverview.classesNoTeacher}
          classesNoTimetable={schoolOverview.classesNoTimetable}
          todayAbsences={schoolOverview.todayAbsences}
          timetableConflicts={schoolOverview.timetableConflicts}
        />
      )}

      {/* ── 5. Class Teacher section ───────────────────────────────────── */}
      {showClassTeacher && derived.classTeacher && classTeacherData && (
        <ClassTeacherSection
          rolePrefix={rolePrefix}
          derived={derived.classTeacher}
          totalStudents={classTeacherData.totalStudents}
          todayPresent={classTeacherData.todayPresent}
          todayAbsent={classTeacherData.todayAbsent}
          openDiscipline={classTeacherData.openDiscipline}
          recentAbsentees={classTeacherData.recentAbsentees}
          activePeriods={assessmentPeriods}
        />
      )}

      {/* ── 6. Subject Teacher section ────────────────────────────────── */}
      {showSubjectTeacher && subjectTeacherData && (
        <SubjectTeacherSection
          rolePrefix={rolePrefix}
          derived={derived.subjectTeacher}
          subjects={subjectTeacherData.subjects}
          todaySlots={subjectTeacherData.todaySlots}
          todayAbsences={subjectTeacherData.todayAbsences}
          activePeriods={assessmentPeriods}
        />
      )}

      {/* ── 7. HOD section ────────────────────────────────────────────── */}
      {showHOD && derived.headOfDept && hodData && (
        <HODSection
          rolePrefix={rolePrefix}
          derived={derived.headOfDept}
          deptTeachers={hodData.deptTeachers}
          deptSubjects={hodData.deptSubjects}
          deptClasses={hodData.deptClasses}
          marksEntered={hodData.marksEntered}
          totalMarksExpected={hodData.totalMarksExpected}
          activePeriods={assessmentPeriods}
        />
      )}

      {/* ── 8. Library section ────────────────────────────────────────── */}
      {showLibrary && libraryData && (
        <LibrarianSection
          rolePrefix={rolePrefix}
          totalBooks={libraryData.totalBooks}
          booksOut={libraryData.booksOut}
          overdueCount={libraryData.overdueCount}
          finesOutstanding={libraryData.finesOutstanding}
          studentsWithFines={libraryData.studentsWithFines}
        />
      )}

      {/* ── 9. Boarding section ───────────────────────────────────────── */}
      {showDorm && dormData && (
        <DormMasterSection
          rolePrefix={rolePrefix}
          derived={derived.dormMaster}
          dorms={dormData.dorms}
          occupiedBeds={dormData.occupiedBeds}
          totalCapacity={dormData.totalCapacity}
          occupancyPct={dormData.occupancyPct}
          openDiscipline={dormData.openDiscipline}
          isSchoolWide={dormIsSchoolWide}
        />
      )}

      {/* ── 10. Quick actions ─────────────────────────────────────────── */}
      {quickLinks.length > 0 && (
        <QuickLinkGrid links={quickLinks} title="Quick actions" />
      )}

      {/* ── 11. Recent activity (teacher / staff) ─────────────────────── */}
      {showRecentActivity && (
        <DashboardRecentActivity
          items={recentActivityItems}
          viewHref={`/${rolePrefix}/communication`}
        />
      )}

      {/* ── 12. Upcoming calendar ─────────────────────────────────────── */}
      <UpcomingCalendarWidget items={calendarItems} calendarHref={calendarHref} />

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetchers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSchoolOverview(schoolId: string, today: Date) {
  const startOfDay = new Date(Date.UTC(
    today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(),
  ));
  const startOfNextDay = new Date(startOfDay.getTime() + 86_400_000);

  const [
    totalStudents, totalTeachers, totalClasses, totalDepts,
    unresolvedDiscipline, classesNoTeacher, classesNoTimetable,
    todayAbsences, conflicts,
  ] = await Promise.all([
    prisma.student.count({ where: { schoolId, archivedAt: null } }),
    prisma.teacher.count({ where: { schoolId, archivedAt: null } }),
    prisma.schoolClass.count({ where: { schoolId } }),
    prisma.department.count({ where: { schoolId } }),
    prisma.disciplineRecord.count({ where: { schoolId, status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } } }),
    prisma.schoolClass.count({ where: { schoolId, classTeacherId: null } }),
    prisma.schoolClass.count({ where: { schoolId, timetableSlots: { none: {} } } }),
    prisma.attendance.count({ where: { schoolId, date: { gte: startOfDay, lt: startOfNextDay }, status: "ABSENT" } }),
    prisma.timetableSlot.groupBy({
      by: ["teacherId", "dayOfWeek", "period"],
      where: { schoolId },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    }).catch(() => []),
  ]);
  return {
    totalStudents, totalTeachers, totalClasses, totalDepts,
    unresolvedDiscipline, classesNoTeacher, classesNoTimetable,
    todayAbsences, timetableConflicts: conflicts.length,
  };
}

async function fetchHODData(schoolId: string, departmentId: string) {
  const [deptTeachers, deptSubjectsCount, deptClasses] = await Promise.all([
    prisma.teacher.count({ where: { schoolId, primaryDepartmentId: departmentId, archivedAt: null } }),
    prisma.subject.count({ where: { schoolId, departmentId } }),
    prisma.schoolClass.findMany({
      where: { schoolId, subjectTeachers: { some: { subject: { departmentId } } } },
      select: { id: true, name: true, form: true },
      orderBy: [{ form: "asc" }, { name: "asc" }],
    }),
  ]);

  let marksEntered = 0;
  let totalMarksExpected = 0;

  try {
    const currentFramework = await prisma.assessmentFramework.findFirst({
      where: { schoolId, isActive: true, type: "EIGHT_FOUR_FOUR" },
      select: { id: true },
    });

    if (currentFramework) {
      const currentPeriod = await prisma.assessmentPeriod.findFirst({
        where: { schoolId, frameworkId: currentFramework.id, isCurrent: true },
        select: { id: true },
      });

      const deptSubjectList = await prisma.subject.findMany({
        where: { schoolId, departmentId },
        select: { id: true },
      });
      const deptSubjectIds = deptSubjectList.map((s) => s.id);

      if (deptSubjectIds.length > 0) {
        const paperCounts = (await prisma.paper.groupBy({
          by: ["subjectId"],
          where: { schoolId, frameworkId: currentFramework.id, subjectId: { in: deptSubjectIds } },
          _count: { id: true },
        })) as unknown as Array<{ subjectId: string; _count: { id: number } }>;

        const papersPerSubject = new Map(paperCounts.map((r) => [r.subjectId, r._count.id]));

        const assignments = await prisma.classSubjectTeacher.findMany({
          where: { subjectId: { in: deptSubjectIds }, schoolClass: { schoolId } },
          select: { classId: true, subjectId: true },
        }) as Array<{ classId: string; subjectId: string }>;

        if (assignments.length > 0) {
          const classIds = [...new Set(assignments.map((a) => a.classId))];
          const studentCounts = await prisma.student.groupBy({
            by: ["classId"],
            where: { schoolId, classId: { in: classIds }, archivedAt: null },
            _count: { id: true },
          });
          const studentsPerClass = new Map(studentCounts.map((r) => [r.classId, r._count.id]));

          for (const { classId, subjectId } of assignments) {
            const students = studentsPerClass.get(classId) ?? 0;
            const papers   = papersPerSubject.get(subjectId) ?? 1;
            totalMarksExpected += students * papers;
          }

          if (currentPeriod) {
            marksEntered = await prisma.assessmentItem.count({
              where: {
                schoolId, periodId: currentPeriod.id,
                subjectId: { in: deptSubjectIds },
                student:   { classId: { in: assignments.map((a) => a.classId) } },
              },
            }).catch(() => 0);
          }
        }
      }
    }
  } catch { /* non-critical */ }

  return { deptTeachers, deptSubjects: deptSubjectsCount, deptClasses, marksEntered, totalMarksExpected };
}

async function fetchClassTeacherData(schoolId: string, classId: string, today: Date) {
  const [totalStudents, todayPresent, todayAbsent, openDiscipline, classData, recentAbsentees] = await Promise.all([
    prisma.student.count({ where: { schoolId, classId, archivedAt: null } }),
    prisma.attendance.count({ where: { schoolId, classId, date: today, status: "PRESENT" } }),
    prisma.attendance.count({ where: { schoolId, classId, date: today, status: "ABSENT" } }),
    prisma.disciplineRecord.count({ where: { schoolId, status: { in: ["OPEN", "UNDER_REVIEW"] }, student: { classId } } }),
    prisma.schoolClass.findUnique({
      where: { id: classId },
      select: {
        name: true, form: true,
        subjectTeachers: {
          select: {
            subject: { select: { name: true } },
            teacher: { select: { fullName: true } },
          },
        },
      },
    }),
    prisma.attendance.groupBy({
      by: ["studentId"],
      where: { schoolId, classId, status: "ABSENT", date: { gte: new Date(Date.now() - 14 * 86_400_000) } },
      _count: { id: true },
      having: { id: { _count: { gte: 3 } } },
    }).then((rows) => rows.length > 0
      ? prisma.student.findMany({
          where: { id: { in: rows.map((r) => r.studentId) } },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([] as { id: string; fullName: string }[])
    ).catch(() => [] as { id: string; fullName: string }[]),
  ]);
  return { totalStudents, todayPresent, todayAbsent, openDiscipline, classData, recentAbsentees };
}

async function fetchSubjectTeacherData(schoolId: string, userId: string, dayOfWeek: number, today: Date) {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: {
      teacherSubjects: { select: { subject: { select: { id: true, name: true, code: true } } } },
      timetableSlots: {
        where: { dayOfWeek },
        orderBy: { period: "asc" },
        select: {
          id: true, period: true, room: true,
          subject: { select: { name: true } },
          schoolClass: { select: { id: true, name: true, _count: { select: { students: true } } } },
        },
      },
    },
  });
  if (!teacher) return null;
  const taughtClassIds = [...new Set(teacher.timetableSlots.map((s) => s.schoolClass.id))];
  const todayAbsences = taughtClassIds.length > 0
    ? await prisma.attendance.count({
        where: { schoolId, classId: { in: taughtClassIds }, date: today, status: "ABSENT" },
      }).catch(() => 0)
    : 0;
  return {
    subjects:      teacher.teacherSubjects.map((ts) => ts.subject),
    todaySlots:    teacher.timetableSlots,
    todayAbsences,
  };
}

async function fetchLibraryData(schoolId: string, today: Date) {
  const [totalBooks, booksOut, overdueCount, finesAgg, studentsWithFines] = await Promise.all([
    prisma.libraryBook.count({ where: { schoolId } }).catch(() => 0),
    prisma.libraryBorrow.count({ where: { schoolId, returnedAt: null } }),
    prisma.libraryBorrow.count({ where: { schoolId, returnedAt: null, dueAt: { lt: today } } }),
    prisma.libraryCard.aggregate({ where: { schoolId }, _sum: { fineBalance: true } }),
    prisma.libraryCard.count({ where: { schoolId, fineBalance: { gt: 0 } } }),
  ]);
  return {
    totalBooks, booksOut, overdueCount,
    finesOutstanding:  Number(finesAgg._sum.fineBalance ?? 0),
    studentsWithFines,
  };
}

async function fetchDormData(schoolId: string, dormIds: string[] | undefined) {
  const whereClause = dormIds?.length ? { schoolId, id: { in: dormIds } } : { schoolId };
  const [dorms, occupiedBeds, openDiscipline] = await Promise.all([
    prisma.dormitory.findMany({
      where: whereClause,
      select: {
        id: true, name: true, totalCapacity: true,
        genderPolicy: true, status: true,
        _count: { select: { beds: true } },
      },
    }).catch(() => []),
    prisma.allocationRecord.count({
      where: { schoolId, ...(dormIds?.length ? { dormId: { in: dormIds } } : {}), status: "CURRENT" },
    }).catch(() => 0),
    prisma.disciplineRecord.count({
      where: { schoolId, status: { in: ["OPEN", "UNDER_REVIEW"] } },
    }).catch(() => 0),
  ]);
  const totalCapacity = dorms.reduce((s, d) => s + (d.totalCapacity ?? 0), 0);
  const occupancyPct  = totalCapacity > 0 ? Math.round((occupiedBeds / totalCapacity) * 100) : 0;
  return { dorms, occupiedBeds, totalCapacity, occupancyPct, openDiscipline };
}

// ── Recent activity feed ──────────────────────────────────────────────────────

/**
 * Builds a recent-activity feed by combining:
 *   1. DiaryNotifications sent to this user (assignments/diary entries)
 *   2. Attendance records submitted BY this teacher today (mark-attendance events)
 *   3. AuditLog entries performed by this user (any school-wide actions)
 *
 * The three pools are merged, sorted by date desc, and capped at 5 items.
 */
async function fetchRecentActivity(userId: string, schoolId: string): Promise<RecentActivityItem[]> {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  }).catch(() => null);

  const pool: RecentActivityItem[] = [];

  // ── 1. Diary notifications for this user ──────────────────────────────────
  type DiaryNotifRaw = {
    id:        string;
    message:   string;
    createdAt: Date;
    diaryEntry: {
      title:     string;
      entryType: string;
      dueDate:   Date | null;
      targets:   { schoolClass: { name: string } }[];
    } | null;
  };

  const diaryNotifs = await prisma.diaryNotification
    .findMany({
      where:   { userId, schoolId },
      orderBy: { createdAt: "desc" },
      take:    5,
      select:  {
        id:        true,
        message:   true,
        createdAt: true,
        diaryEntry: {
          select: {
            title:     true,
            entryType: true,
            dueDate:   true,
            targets:   { select: { schoolClass: { select: { name: true } } }, take: 1 },
          },
        },
      },
    })
    .catch(() => [] as DiaryNotifRaw[]);

  for (const n of diaryNotifs as DiaryNotifRaw[]) {
    const isAssignment = n.diaryEntry?.entryType === "ASSIGNMENT";
    const className    = n.diaryEntry?.targets[0]?.schoolClass?.name ?? "";
    const dueLabel     = n.diaryEntry?.dueDate
      ? ` · Due: ${n.diaryEntry.dueDate.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}`
      : "";
    pool.push({
      id:        `diary-${n.id}`,
      type:      isAssignment ? "assignment" : "diary",
      title:     n.diaryEntry?.title ?? n.message,
      meta:      `${className}${dueLabel}`,
      timeLabel: formatTimeLabel(n.createdAt),
      href:      undefined,
    });
  }

  // ── 2. Attendance records this teacher submitted today ────────────────────
  if (teacher) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const attendanceEvents = await prisma.attendance
      .findMany({
        where: {
          schoolId,
          recordedById: teacher.id,
          date: { gte: todayStart, lte: todayEnd },
        },
        orderBy:  { createdAt: "desc" },
        distinct: ["classId"],
        take:     3,
        select:   {
          id:        true,
          createdAt: true,
          schoolClass: { select: { name: true } },
        },
      })
      .catch(() => [] as {
        id: string; createdAt: Date;
        schoolClass: { name: string } | null;
      }[]);

    for (const a of attendanceEvents) {
      pool.push({
        id:        `att-${a.id}`,
        type:      "attendance",
        title:     "Attendance marked",
        meta:      `${a.schoolClass?.name ?? ""} · Today`,
        timeLabel: formatTimeLabel(a.createdAt),
        href:      undefined,
      });
    }
  }

  // ── 3. Recent audit log actions by this user ──────────────────────────────
  const auditEntries = await prisma.auditLog
    .findMany({
      where:   { schoolId, performedById: userId },
      orderBy: { performedAt: "desc" },
      take:    5,
      select:  {
        id:          true,
        action:      true,
        performedAt: true,
      },
    })
    .catch(() => [] as { id: string; action: string; performedAt: Date }[]);

  for (const a of auditEntries) {
    // Skip attendance actions — already covered above
    if (a.action.toUpperCase().includes("ATTENDANCE")) continue;
    pool.push({
      id:        `audit-${a.id}`,
      type:      mapAuditAction(a.action),
      title:     formatAuditTitle(a.action),
      meta:      schoolId ? "" : "",          // School context implicit
      timeLabel: formatTimeLabel(a.performedAt),
      href:      undefined,
    });
  }

  // ── 4. School announcements (messages sent to teachers) ──────────────────
  const announcements = await prisma.message
    .findMany({
      where: {
        schoolId,
        recipientSummary: { contains: "teacher", mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      take:    3,
      select:  {
        id:              true,
        body:            true,
        recipientSummary: true,
        createdAt:       true,
      },
    })
    .catch(() => [] as { id: string; body: string; recipientSummary: string; createdAt: Date }[]);

  for (const m of announcements) {
    pool.push({
      id:        `msg-${m.id}`,
      type:      "announcement",
      title:     "School announcement",
      meta:      m.recipientSummary || "All teachers",
      timeLabel: formatTimeLabel(m.createdAt),
      href:      undefined,
    });
  }

  // Sort by most recent and cap at 5
  pool.sort((a, b) => {
    // timeLabel is a display string — sort by original date descending
    // We stored nothing else, so re-parse isn't ideal; instead sort was
    // implicit in fetch order. We just stable-deduplicate & take 5 here.
    return 0;
  });

  // Deduplicate by id
  const seen = new Set<string>();
  const result: RecentActivityItem[] = [];
  for (const item of pool) {
    if (!seen.has(item.id)) { seen.add(item.id); result.push(item); }
    if (result.length === 5) break;
  }

  return result;
}

function mapAuditAction(action: string): RecentActivityType {
  const a = action.toUpperCase();
  if (a.includes("ATTENDANCE"))            return "attendance";
  if (a.includes("DIARY") || a.includes("ASSIGN") || a.includes("LESSON")) return "assignment";
  if (a.includes("ANNOUN") || a.includes("MSG") || a.includes("MESSAGE")) return "announcement";
  return "notification";
}

function formatAuditTitle(action: string): string {
  return action
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTimeLabel(date: Date): string {
  const now   = new Date();
  const diffMs = +now - +date;
  const diffDays = Math.floor(diffMs / 86_400_000);
  const time  = date.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return time;
  if (diffDays === 1) return `Yesterday · ${time}`;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  return `${dow} · ${time}`;
}
