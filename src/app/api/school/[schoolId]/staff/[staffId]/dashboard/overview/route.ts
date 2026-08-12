/**
 * GET /api/school/[schoolId]/staff/[staffId]/dashboard/overview
 *
 * Unified dashboard data endpoint. Queries all active roles (derived + assigned)
 * for the requesting user, executes role-specific aggregation queries in
 * parallel, and returns a unified data structure where each section is
 * populated only if that role is currently active.
 *
 * Response shape:
 * {
 *   principalStats?,
 *   deputyStats?,
 *   hodStats?,
 *   classTeacherStats?,
 *   subjectTeacherStats?,
 *   libraryStats?,
 *   dormMasterStats?,
 *   calendarItems,
 *   schoolModules: { hasBoarding, hasLibrary },
 * }
 *
 * Security: school_id is ALWAYS derived from the authenticated session token —
 * never from query params. The [schoolId] path param is validated against
 * the session to prevent cross-school access.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getEffectivePermissions } from "@/lib/permissions";
import { computeDerivedRoles } from "@/lib/derivedRoles";
import { getUpcomingCalendarItems } from "@/lib/calendarUpcoming";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { schoolId: string; staffId: string } }
) {
  // ── Auth: school_id always from session, never from URL ──────────────────
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Validate schoolId param matches session — prevent cross-school access
  if (params.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const schoolId = user.schoolId!;
  const today = new Date();

  // ── School module availability ───────────────────────────────────────────
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { boardingType: true, name: true },
  });

  const hasBoarding = school?.boardingType !== "DAY_ONLY";

  const [libSettingsCount, libBooksCount] = await Promise.all([
    prisma.librarySettings.count({ where: { schoolId } }).catch(() => 0),
    prisma.libraryBook.count({ where: { schoolId } }).catch(() => 0),
  ]);
  const hasLibrary = libSettingsCount > 0 || libBooksCount > 0;

  // ── Role detection ───────────────────────────────────────────────────────
  const isPrincipal = user.role === "PRINCIPAL";
  const isTeacher = user.role === "TEACHER";
  const isAdminStaff = user.role === "ADMIN_STAFF";

  // Assigned role names (for admin staff)
  let assignedRoleNames: string[] = [];
  if (isAdminStaff) {
    const rows = await prisma.userStaffRole.findMany({
      where: { userId: user.id },
      include: { staffRole: { select: { name: true } } },
    });
    assignedRoleNames = rows.map((r) => r.staffRole.name);
    if (assignedRoleNames.length === 0 && user.staffRoleId) {
      const sr = await prisma.staffRole.findUnique({
        where: { id: user.staffRoleId },
        select: { name: true },
      });
      if (sr) assignedRoleNames = [sr.name];
    }
  }

  const lowerRoles = assignedRoleNames.map((n) => n.toLowerCase());
  const isDeputy = lowerRoles.some((n) => n.includes("deputy"));
  const isAssignedLibrarian = lowerRoles.some((n) => n.includes("librarian"));
  const isAssignedBoardingMatron = lowerRoles.some(
    (n) => n.includes("matron") || (n.includes("boarding master") && !n.includes("dorm"))
  );

  // Derived roles (only for users with a Teacher record)
  let derived = {
    subjectTeacher: null as Awaited<ReturnType<typeof computeDerivedRoles>>["subjectTeacher"],
    classTeacher: null as Awaited<ReturnType<typeof computeDerivedRoles>>["classTeacher"],
    headOfDept: null as Awaited<ReturnType<typeof computeDerivedRoles>>["headOfDept"],
    dormMaster: null as Awaited<ReturnType<typeof computeDerivedRoles>>["dormMaster"],
    activeKinds: new Set<string>(),
  };

  if (isTeacher || isAdminStaff) {
    try {
      derived = await computeDerivedRoles(user.id, schoolId);
    } catch {
      // Non-fatal — user may not have a teacher record
    }
  }

  // Permissions for admin staff module-level checks
  const perms = (isAdminStaff || isTeacher)
    ? await getEffectivePermissions(user)
    : {};

  // ── Parallel data fetches ────────────────────────────────────────────────
  const results = await Promise.allSettled([
    // [0] Principal / Deputy stats
    (isPrincipal || isDeputy) ? fetchSchoolOverview(schoolId, today) : Promise.resolve(null),

    // [1] HOD stats
    derived.headOfDept
      ? fetchHODStats(schoolId, derived.headOfDept.departmentId)
      : Promise.resolve(null),

    // [2] Class teacher stats
    derived.classTeacher
      ? fetchClassTeacherStats(schoolId, derived.classTeacher.classId, today)
      : Promise.resolve(null),

    // [3] Subject teacher stats
    (isTeacher || derived.subjectTeacher != null)
      ? fetchSubjectTeacherStats(schoolId, user.id, today)
      : Promise.resolve(null),

    // [4] Library stats — only if school has library AND user is librarian
    (hasLibrary && (isAssignedLibrarian || isPrincipal || isDeputy || (perms as Record<string, {canView?: boolean}>)?.LIBRARY?.canView))
      ? fetchLibraryStats(schoolId, today)
      : Promise.resolve(null),

    // [5] Dorm master stats
    (hasBoarding && (derived.dormMaster != null || isAssignedBoardingMatron || isPrincipal || isDeputy))
      ? fetchDormStats(schoolId, derived.dormMaster?.dorms.map((d) => d.id), isAssignedBoardingMatron || isPrincipal || isDeputy)
      : Promise.resolve(null),

    // [6] Upcoming calendar
    getUpcomingCalendarItems(schoolId, { days: 14, limit: 8 }).catch(() => []),

    // [7] Assessment periods for any teacher
    (isTeacher || isAdminStaff || isPrincipal)
      ? prisma.assessmentPeriod.findMany({
          where: { schoolId, isCurrent: true },
          select: { id: true, name: true, closingDate: true, openingDate: true },
          take: 5,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const unwrap = <T>(r: PromiseSettledResult<T>): T | null =>
    r.status === "fulfilled" ? r.value : null;

  const schoolOverview      = unwrap(results[0]);
  const hodStats            = unwrap(results[1]);
  const classTeacherStats   = unwrap(results[2]);
  const subjectTeacherStats = unwrap(results[3]);
  const libraryStats        = unwrap(results[4]);
  const dormStats           = unwrap(results[5]);
  const calendarItems       = unwrap(results[6]) ?? [];
  const assessmentPeriods   = unwrap(results[7]) ?? [];

  // ── Build response ───────────────────────────────────────────────────────
  return NextResponse.json({
    ...(isPrincipal && schoolOverview ? { principalStats: { ...schoolOverview, isDeputy: false } } : {}),
    ...(isDeputy && schoolOverview    ? { deputyStats:    { ...schoolOverview, isDeputy: true  } } : {}),
    ...(hodStats           ? { hodStats:            { ...hodStats,          derived: derived.headOfDept } } : {}),
    ...(classTeacherStats  ? { classTeacherStats:   { ...classTeacherStats, derived: derived.classTeacher } } : {}),
    ...(subjectTeacherStats? { subjectTeacherStats: { ...subjectTeacherStats, derived: derived.subjectTeacher } } : {}),
    ...(libraryStats       ? { libraryStats } : {}),
    ...(dormStats          ? { dormMasterStats:     { ...dormStats, derived: derived.dormMaster, isSchoolWide: isAssignedBoardingMatron || isPrincipal } } : {}),
    calendarItems,
    assessmentPeriods,
    schoolModules: { hasBoarding, hasLibrary },
    roleContext: {
      isPrincipal,
      isDeputy,
      isTeacher,
      isAdminStaff,
      assignedRoleNames,
      derivedKinds: [...derived.activeKinds],
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation helpers — each returns a typed payload or throws (caught above)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSchoolOverview(schoolId: string, today: Date) {
  const [
    totalStudents,
    totalTeachers,
    totalClasses,
    totalDepts,
    unresolvedDiscipline,
    classesNoTeacher,
    classesNoTimetable,
    todayAbsences,
    timetableConflicts,
  ] = await Promise.all([
    prisma.student.count({ where: { schoolId, archivedAt: null } }),
    prisma.teacher.count({ where: { schoolId, archivedAt: null } }),
    prisma.schoolClass.count({ where: { schoolId } }),
    prisma.department.count({ where: { schoolId } }),
    prisma.disciplineRecord.count({
      where: { schoolId, status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } },
    }),
    prisma.schoolClass.count({ where: { schoolId, classTeacherId: null } }),
    prisma.schoolClass.count({
      where: { schoolId, timetableSlots: { none: {} } },
    }),
    prisma.attendance.count({ where: { schoolId, date: today, status: "ABSENT" } }),
    prisma.timetableSlot.groupBy({
      by: ["teacherId", "dayOfWeek", "period"],
      where: { schoolId },
      _count: { id: true },
      having: { id: { _count: { gt: 1 } } },
    }).catch(() => [] as unknown[]),
  ]);

  return {
    totalStudents,
    totalTeachers,
    totalClasses,
    totalDepts,
    unresolvedDiscipline,
    classesNoTeacher,
    classesNoTimetable,
    todayAbsences,
    timetableConflicts: timetableConflicts.length,
  };
}

async function fetchHODStats(schoolId: string, departmentId: string) {
  const [deptTeachers, deptSubjects, deptClasses, marksEntered] = await Promise.all([
    prisma.teacher.count({ where: { schoolId, primaryDepartmentId: departmentId, archivedAt: null } }),
    prisma.subject.count({ where: { schoolId, departmentId } }),
    prisma.schoolClass.findMany({
      where: { schoolId, subjectTeachers: { some: { subject: { departmentId } } } },
      select: { id: true, name: true, form: true },
      orderBy: [{ form: "asc" }, { name: "asc" }],
    }),
    prisma.assessmentItem.count({
      where: { schoolId, subject: { departmentId } },
    }).catch(() => 0),
  ]);

  return { deptTeachers, deptSubjects, deptClasses, marksEntered };
}

async function fetchClassTeacherStats(schoolId: string, classId: string, today: Date) {
  const [
    totalStudents,
    todayPresent,
    todayAbsent,
    openDiscipline,
    classData,
    recentAbsentees,
  ] = await Promise.all([
    prisma.student.count({ where: { schoolId, classId, archivedAt: null } }),
    prisma.attendance.count({ where: { schoolId, classId, date: today, status: "PRESENT" } }),
    prisma.attendance.count({ where: { schoolId, classId, date: today, status: "ABSENT" } }),
    prisma.disciplineRecord.count({
      where: { schoolId, status: { in: ["OPEN", "UNDER_REVIEW"] }, student: { classId } },
    }),
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
      where: {
        schoolId, classId, status: "ABSENT",
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
    ).catch(() => [] as { id: string; fullName: string }[]),
  ]);

  return { totalStudents, todayPresent, todayAbsent, openDiscipline, classData, recentAbsentees };
}

async function fetchSubjectTeacherStats(schoolId: string, userId: string, today: Date) {
  const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;

  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: {
      id: true,
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
    subjects: teacher.teacherSubjects.map((ts) => ts.subject),
    todaySlots: teacher.timetableSlots,
    todayAbsences,
  };
}

async function fetchLibraryStats(schoolId: string, today: Date) {
  const [totalBooks, booksOut, overdueCount, finesAgg, studentsWithFines] = await Promise.all([
    prisma.libraryBook.count({ where: { schoolId } }).catch(() => 0),
    prisma.libraryBorrow.count({ where: { schoolId, returnedAt: null } }),
    prisma.libraryBorrow.count({ where: { schoolId, returnedAt: null, dueAt: { lt: today } } }),
    prisma.libraryCard.aggregate({ where: { schoolId }, _sum: { fineBalance: true } }),
    prisma.libraryCard.count({ where: { schoolId, fineBalance: { gt: 0 } } }),
  ]);

  return {
    totalBooks,
    booksOut,
    overdueCount,
    finesOutstanding: Number(finesAgg._sum.fineBalance ?? 0),
    studentsWithFines,
  };
}

async function fetchDormStats(
  schoolId: string,
  dormIds: string[] | undefined,
  schoolWide: boolean
) {
  const whereClause = schoolWide || !dormIds?.length
    ? { schoolId }
    : { schoolId, id: { in: dormIds } };

  const [dorms, occupiedBeds, openDiscipline] = await Promise.all([
    prisma.dormitory.findMany({
      where: whereClause,
      select: {
        id: true, name: true, totalCapacity: true, genderPolicy: true, status: true,
        _count: { select: { beds: true } },
      },
    }).catch(() => []),
    prisma.allocationRecord.count({
      where: {
        schoolId,
        ...(dormIds?.length && !schoolWide ? { dormId: { in: dormIds } } : {}),
        status: "CURRENT",
      },
    }).catch(() => 0),
    prisma.disciplineRecord.count({
      where: { schoolId, status: { in: ["OPEN", "UNDER_REVIEW"] } },
    }).catch(() => 0),
  ]);

  const totalCapacity = dorms.reduce((s, d) => s + (d.totalCapacity ?? 0), 0);
  const occupancyPct = totalCapacity > 0 ? Math.round((occupiedBeds / totalCapacity) * 100) : 0;

  return { dorms, occupiedBeds, totalCapacity, occupancyPct, openDiscipline };
}
