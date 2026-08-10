/**
 * src/components/dashboard/UnifiedDashboard.tsx
 *
 * The blended single-homepage that merges ALL active roles for one user into
 * one coherent view. Sections appear only for roles the user currently holds.
 * No empty spaces, no placeholders, no "you don't have access" banners.
 *
 * Data flow:
 *   1. Caller (page.tsx) passes the User record.
 *   2. This component resolves derived roles + assigned roles in parallel.
 *   3. Each section receives only its own data slice.
 *   4. Sections with no active role are simply not rendered.
 *
 * Scope-precedence rule:
 *   - If a user is assigned Matron (school-wide) AND derived DormMaster of one
 *     dorm, the isSchoolWide=true flag is passed; the DormMasterSection renders
 *     the school-wide view only.
 *   - If assigned Principal or Deputy, the SchoolOverviewSection absorbs HOD
 *     and DormMaster derived sections to avoid redundant stacking.
 */

import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeDerivedRoles } from "@/lib/derivedRoles";
import { getEffectivePermissions, getAssignedRoleNames } from "@/lib/permissions";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import UpcomingCalendarWidget from "@/components/UpcomingCalendarWidget";
import QuickLinkGrid, { type QuickLink } from "@/components/dashboard/QuickLinkGrid";
import AlertBanner, { type AlertItem } from "@/components/dashboard/AlertBanner";
import SchoolOverviewSection from "@/components/dashboard/sections/SchoolOverviewSection";
import SubjectTeacherSection from "@/components/dashboard/sections/SubjectTeacherSection";
import ClassTeacherSection   from "@/components/dashboard/sections/ClassTeacherSection";
import HODSection            from "@/components/dashboard/sections/HODSection";
import LibrarianSection      from "@/components/dashboard/sections/LibrarianSection";
import DormMasterSection     from "@/components/dashboard/sections/DormMasterSection";

interface Props {
  user:       User;
  rolePrefix: string; // "teacher" | "staff" | "principal"
}

export default async function UnifiedDashboard({ user, rolePrefix }: Props) {
  const schoolId = user.schoolId;
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

  const lowerRoles = assignedRoleNames.map((n) => n.toLowerCase());
  const isDeputy   = lowerRoles.some((n) => n.includes("deputy"));
  const isAssignedLibrarian = lowerRoles.some((n) => n.includes("librarian"));
  const isAssignedMatron    = lowerRoles.some((n) => n.includes("matron") || (n.includes("boarding") && !n.includes("dorm")));

  // Scope precedence: Principal/Deputy absorbs all derived roles into one view
  const showSchoolOverview = isPrincipal || isDeputy;
  // HOD section: show unless subsumed by school-wide overview
  const showHOD  = !showSchoolOverview && derived.headOfDept != null;
  // Class teacher section
  const showClassTeacher = derived.classTeacher != null;
  // Subject teacher: show for all teachers; suppress if showSchoolOverview already covers everything
  const showSubjectTeacher = !showSchoolOverview && derived.subjectTeacher != null;

  // Boarding: show if school has boarding AND user has any boarding role
  const hasBoarding = school?.boardingType !== "DAY_ONLY";
  const showDorm = hasBoarding && (
    derived.dormMaster != null || isAssignedMatron || isPrincipal || isDeputy
  );
  // Assigned Matron scope supersedes derived DormMaster scope
  const dormIsSchoolWide = isAssignedMatron || showSchoolOverview;

  // Library
  const [libBooksCount, libSettingsCount] = await Promise.all([
    prisma.libraryBook.count({ where: { schoolId } }).catch(() => 0),
    prisma.librarySettings.count({ where: { schoolId } }).catch(() => 0),
  ]);
  const hasLibrary = libSettingsCount > 0 || libBooksCount > 0;
  const showLibrary = hasLibrary && (
    isAssignedLibrarian || isPrincipal || isDeputy ||
    (perms as Record<string, { canView?: boolean }>)?.LIBRARY?.canView
  );

  // Teacher record for display name
  const teacherRecord = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: { fullName: true },
  }).catch(() => null);

  const displayName = teacherRecord?.fullName ?? user.email;

  // ── Parallel data fetch based on visible sections ────────────────────────
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

    // [6] Assessment periods (all teacher-type users)
    (!showSchoolOverview || isTeacher)
      ? prisma.assessmentPeriod.findMany({
          where: { schoolId, isCurrent: true },
          select: { id: true, name: true, closingDate: true },
          take: 5,
        }).catch(() => [])
      : Promise.resolve([]),

    // [7] Calendar
    getUpcomingCalendarItems(schoolId, { days: 14, limit: 8 }).catch(() => []),
  ]);

  const unwrap = <T,>(r: PromiseSettledResult<T>): T | null =>
    r.status === "fulfilled" ? r.value : null;

  const schoolOverview      = unwrap(results[0]);
  const hodData             = unwrap(results[1]);
  const classTeacherData    = unwrap(results[2]);
  const subjectTeacherData  = unwrap(results[3]);
  const libraryData         = unwrap(results[4]);
  const dormData            = unwrap(results[5]);
  const assessmentPeriods   = (unwrap(results[6]) ?? []) as { id: string; name: string; closingDate?: Date | null }[];
  const calendarItems       = (unwrap(results[7]) ?? []) as Parameters<typeof UpcomingCalendarWidget>[0]["items"];

  // ── Quick links — derived from visible sections ──────────────────────────
  const quickLinks: QuickLink[] = [];

  if (isPrincipal) {
    quickLinks.push(
      { label: "Students",        href: `/${rolePrefix}/students`,      icon: "Users"           },
      { label: "Staff",           href: `/${rolePrefix}/staff`,          icon: "GraduationCap"   },
      { label: "Attendance",      href: `/${rolePrefix}/attendance`,     icon: "ClipboardCheck"  },
      { label: "Send message",    href: `/${rolePrefix}/communication`,  icon: "MessageSquare"   },
      { label: "Permissions",     href: `/${rolePrefix}/staff-roles`,    icon: "Shield"          },
      { label: "Reports",         href: `/${rolePrefix}/reports`,        icon: "BarChart2"       },
    );
  } else {
    if (showHOD || derived.headOfDept)
      quickLinks.push({ label: "Enter marks", href: `/${rolePrefix}/assessments`, icon: "ClipboardCheck" });
    if (showClassTeacher)
      quickLinks.push({ label: "Take attendance", href: `/${rolePrefix}/attendance`, icon: "ClipboardList" });
    if (showSubjectTeacher && !showHOD)
      quickLinks.push({ label: "My timetable", href: `/${rolePrefix}/timetable`, icon: "CalendarDays" });
    if (showLibrary)
      quickLinks.push({ label: "Issue book", href: `/${rolePrefix}/library/issue`, icon: "BookOpen" });
    if (showDorm)
      quickLinks.push({ label: "View dorms", href: `/${rolePrefix}/accommodation`, icon: "Home" });
    if (showClassTeacher)
      quickLinks.push({ label: "Message parents", href: `/${rolePrefix}/communication`, icon: "MessageSquare" });
    quickLinks.push({ label: "Calendar", href: `/${rolePrefix}/calendar`, icon: "CalendarDays" });
  }

  // ── Setup incomplete banner (principal only) ─────────────────────────────
  const setupAlerts: AlertItem[] = [];
  if (isPrincipal && schoolOverview && schoolOverview.totalDepts === 0) {
    setupAlerts.push({ id: "setup", type: "info", message: "Finish setting up your school — start with departments and subjects." });
  }

  const calendarHref = `/${rolePrefix}/calendar`;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-ink dark:text-dark-text">
          {isPrincipal ? "Overview" : `Welcome, ${displayName}`}
        </h1>
        <p className="text-slate text-sm mt-1 dark:text-dark-muted">
          {today.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {assignedRoleNames.length > 0 && (
            <span className="ml-2 text-slate/60">
              · {assignedRoleNames.slice(0, 2).join(" & ")}{assignedRoleNames.length > 2 ? " +more" : ""}
            </span>
          )}
        </p>
      </div>

      {setupAlerts.length > 0 && <AlertBanner alerts={setupAlerts} />}

      {/* ── School Overview (Principal / Deputy) ─────────────────────────── */}
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

      {/* ── HOD Section ──────────────────────────────────────────────────── */}
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

      {/* ── Class Teacher Section ─────────────────────────────────────────── */}
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

      {/* ── Subject Teacher Section ───────────────────────────────────────── */}
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

      {/* ── Library Section ───────────────────────────────────────────────── */}
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

      {/* ── Boarding / Dorm Section ───────────────────────────────────────── */}
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

      {/* ── Quick actions & Calendar ─────────────────────────────────────── */}
      {quickLinks.length > 0 && (
        <QuickLinkGrid links={quickLinks} title="Quick actions" />
      )}

      <UpcomingCalendarWidget items={calendarItems} calendarHref={calendarHref} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Data fetchers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSchoolOverview(schoolId: string, today: Date) {
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
    prisma.attendance.count({ where: { schoolId, date: today, status: "ABSENT" } }),
    prisma.timetableSlot.groupBy({
      by: ["teacherId", "dayOfWeek", "period"],
      where: { schoolId },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    }).catch(() => []),
  ]);
  return { totalStudents, totalTeachers, totalClasses, totalDepts, unresolvedDiscipline, classesNoTeacher, classesNoTimetable, todayAbsences, timetableConflicts: conflicts.length };
}

async function fetchHODData(schoolId: string, departmentId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  const [deptTeachers, deptSubjectsCount, deptClasses] = await Promise.all([
    prisma.teacher.count({ where: { schoolId, primaryDepartmentId: departmentId, archivedAt: null } }),
    prisma.subject.count({ where: { schoolId, departmentId } }),
    prisma.schoolClass.findMany({
      where: { schoolId, subjectTeachers: { some: { subject: { departmentId } } } },
      select: { id: true, name: true, form: true },
      orderBy: [{ form: "asc" }, { name: "asc" }],
    }),
  ]);

  // ── Period-scoped marks stats ─────────────────────────────────────────────
  // Both marksEntered and totalMarksExpected must be for the same current
  // period so that entered can never exceed expected.
  let marksEntered = 0;
  let totalMarksExpected = 0;

  try {
    // 1. Resolve current framework + current period
    const currentFramework = await db.assessmentFramework.findFirst({
      where: { schoolId, isActive: true, type: "EIGHT_FOUR_FOUR" },
      select: { id: true },
    }) as { id: string } | null;

    if (currentFramework) {
      const currentPeriod = await db.assessmentPeriod.findFirst({
        where: { schoolId, frameworkId: currentFramework.id, isCurrent: true },
        select: { id: true },
      }) as { id: string } | null;

      // 2. Dept subjects and their paper counts for this framework
      const deptSubjectList = await prisma.subject.findMany({
        where: { schoolId, departmentId },
        select: { id: true },
      });
      const deptSubjectIds = deptSubjectList.map((s) => s.id);

      if (deptSubjectIds.length > 0) {
        const paperCounts = await db.paper.groupBy({
          by: ["subjectId"],
          where: { schoolId, frameworkId: currentFramework.id, subjectId: { in: deptSubjectIds } },
          _count: { id: true },
        }) as Array<{ subjectId: string; _count: { id: number } }>;

        const papersPerSubject = new Map(
          paperCounts.map((r) => [r.subjectId, r._count.id])
        );

        // 3. Class-subject assignments in this dept (scoped to this school)
        const assignments = await db.classSubjectTeacher.findMany({
          where: {
            subjectId: { in: deptSubjectIds },
            schoolClass: { schoolId },
          },
          select: { classId: true, subjectId: true },
        }) as Array<{ classId: string; subjectId: string }>;

        if (assignments.length > 0) {
          const classIds = [...new Set(assignments.map((a) => a.classId))];

          // 4. Student counts per class (non-archived)
          const studentCounts = await prisma.student.groupBy({
            by: ["classId"],
            where: { schoolId, classId: { in: classIds }, archivedAt: null },
            _count: { id: true },
          });
          const studentsPerClass = new Map(studentCounts.map((r) => [r.classId, r._count.id]));

          // 5. totalMarksExpected = Σ students × papers per (class, subject) pair
          for (const { classId, subjectId } of assignments) {
            const students = studentsPerClass.get(classId) ?? 0;
            const papers   = papersPerSubject.get(subjectId) ?? 1;
            totalMarksExpected += students * papers;
          }

          // 6. marksEntered = distinct (studentId, paperId) entries for current period
          if (currentPeriod) {
            marksEntered = await prisma.assessmentItem.count({
              where: {
                schoolId,
                periodId:  currentPeriod.id,
                subjectId: { in: deptSubjectIds },
                student:   { classId: { in: classIds } },
              },
            }).catch(() => 0);
          }
        }
      }
    }
  } catch { /* non-critical — both fall back to 0 */ }

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
        subjectTeachers: { select: { subject: { select: { name: true } }, teacher: { select: { fullName: true } } } },
      },
    }),
    prisma.attendance.groupBy({
      by: ["studentId"],
      where: { schoolId, classId, status: "ABSENT", date: { gte: new Date(Date.now() - 14 * 86400000) } },
      _count: { id: true },
      having: { id: { _count: { gte: 3 } } },
    }).then((rows) => rows.length > 0
      ? prisma.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, select: { id: true, fullName: true } })
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
    ? await prisma.attendance.count({ where: { schoolId, classId: { in: taughtClassIds }, date: today, status: "ABSENT" } }).catch(() => 0)
    : 0;
  return { subjects: teacher.teacherSubjects.map((ts) => ts.subject), todaySlots: teacher.timetableSlots, todayAbsences };
}

async function fetchLibraryData(schoolId: string, today: Date) {
  const [totalBooks, booksOut, overdueCount, finesAgg, studentsWithFines] = await Promise.all([
    prisma.libraryBook.count({ where: { schoolId } }).catch(() => 0),
    prisma.libraryBorrow.count({ where: { schoolId, returnedAt: null } }),
    prisma.libraryBorrow.count({ where: { schoolId, returnedAt: null, dueAt: { lt: today } } }),
    prisma.libraryCard.aggregate({ where: { schoolId }, _sum: { fineBalance: true } }),
    prisma.libraryCard.count({ where: { schoolId, fineBalance: { gt: 0 } } }),
  ]);
  return { totalBooks, booksOut, overdueCount, finesOutstanding: Number(finesAgg._sum.fineBalance ?? 0), studentsWithFines };
}

async function fetchDormData(schoolId: string, dormIds: string[] | undefined) {
  const whereClause = dormIds?.length ? { schoolId, id: { in: dormIds } } : { schoolId };
  const [dorms, occupiedBeds, openDiscipline] = await Promise.all([
    prisma.dormitory.findMany({
      where: whereClause,
      select: { id: true, name: true, totalCapacity: true, genderPolicy: true, status: true, _count: { select: { beds: true } } },
    }).catch(() => []),
    prisma.allocationRecord.count({ where: { schoolId, ...(dormIds?.length ? { dormId: { in: dormIds } } : {}), status: "CURRENT" } }).catch(() => 0),
    prisma.disciplineRecord.count({ where: { schoolId, status: { in: ["OPEN", "UNDER_REVIEW"] } } }).catch(() => 0),
  ]);
  const totalCapacity = dorms.reduce((s, d) => s + (d.totalCapacity ?? 0), 0);
  const occupancyPct = totalCapacity > 0 ? Math.round((occupiedBeds / totalCapacity) * 100) : 0;
  return { dorms, occupiedBeds, totalCapacity, occupancyPct, openDiscipline };
}
