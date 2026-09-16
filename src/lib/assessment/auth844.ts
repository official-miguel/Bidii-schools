/**
 * Server-only assessment auth utility for the 8-4-4 framework.
 * Import only inside Server Components and API route handlers.
 *
 * NOTE: AssessmentRole and AssessmentRoleType come from @prisma/client only
 * after `prisma generate` has been run against the current schema. Until then
 * we define compatible inline types so the file compiles cleanly.
 */

import { prisma } from "@/lib/prisma";
import type { User, Module } from "@prisma/client";

// ---------------------------------------------------------------------------
// Inline types that mirror the Prisma-generated ones.
// Replace with imports from "@prisma/client" once `prisma generate` succeeds.
// ---------------------------------------------------------------------------

type AssessmentRoleType =
  | "SUBJECT_TEACHER"
  | "CLASS_TEACHER"
  | "HOD"
  | "EXAM_OFFICER"
  | "DIRECTOR"
  | "PARENT_VIEWER";

interface AssessmentRoleRow {
  id: string;
  role: AssessmentRoleType;
  subjectId: string | null;
  learningAreaId: string | null;
  competencyUnitId: string | null;
  frameworkId: string;
  teacherId: string;
  schoolId: string;
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface AssessmentActor {
  user: User;
  /** Minimal teacher shape — only fields we actually read. */
  teacher: { id: string } | null;
  roles: AssessmentRoleRow[];
  isPrincipal: boolean;
  /** classId that this teacher is the class teacher of (null if none). */
  classTeacherOfId: string | null;
  adminCanView: boolean;
  adminCanManage: boolean;
  /**
   * Subject IDs assigned to this teacher via the timetable (ClassSubjectTeacher
   * + ClassElectiveGroupTeacher). Used as a fallback when no explicit
   * AssessmentRole rows have been configured for the teacher.
   */
  assignedSubjectIds: Set<string>;
  /**
   * The specific (classId, subjectId) pairs backing assignedSubjectIds, keyed
   * as `${classId}::${subjectId}`. A teacher assigned a subject in one class
   * is NOT automatically authorized to enter marks for a different class —
   * this is what canEnterMarks checks against when a classId is supplied.
   */
  assignedClassSubjectPairs: Set<string>;
}

// ---------------------------------------------------------------------------
// resolveAssessmentActor
// ---------------------------------------------------------------------------

export async function resolveAssessmentActor(
  user: User,
  schoolId: string
): Promise<AssessmentActor> {
  // For ADMIN_STAFF, check module permissions.
  let adminCanView = false;
  let adminCanManage = false;
  if (user.role === "ADMIN_STAFF" && user.staffRoleId) {
    const perm = await prisma.rolePermission.findUnique({
      where: {
        staffRoleId_module: {
          staffRoleId: user.staffRoleId,
          module: "ASSESSMENTS" as Module,
        },
      },
    });
    adminCanView = perm?.canView ?? false;
    adminCanManage = perm?.canManage ?? false;
  }

  // Fetch the teacher row (minimal select — only what we need).
  const teacherRow = await prisma.teacher.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      classTeacherOf: { select: { id: true } },
      subjectAssignments: { select: { subjectId: true, classId: true } },
      classElectiveGroupTeachers: { select: { subjectId: true, classId: true } },
    },
  });

  const classTeacherOfId = teacherRow?.classTeacherOf?.id ?? null;

  // Build the set of subjects this teacher is assigned to via the timetable.
  // This is used as a fallback when no explicit AssessmentRole rows exist.
  const assignedSubjectIds = new Set<string>([
    ...(teacherRow?.subjectAssignments.map((a) => a.subjectId) ?? []),
    ...(teacherRow?.classElectiveGroupTeachers.map((a) => a.subjectId) ?? []),
  ]);

  // The (classId, subjectId) pairs backing the set above — a subject teacher
  // assigned to teach Biology in Form 2 East should not be able to enter
  // marks for Biology in a class they were never assigned.
  const assignedClassSubjectPairs = new Set<string>([
    ...(teacherRow?.subjectAssignments.map((a) => `${a.classId}::${a.subjectId}`) ?? []),
    ...(teacherRow?.classElectiveGroupTeachers.map((a) => `${a.classId}::${a.subjectId}`) ?? []),
  ]);

  // Fetch assessment roles for this teacher across ALL frameworks in this school.
  // Roles are not tied to a specific academic year — a HOD/subject teacher
  // assignment remains valid even after a new framework is created for a new year.
  const roles: AssessmentRoleRow[] = teacherRow
    ? await (prisma as any).assessmentRole.findMany({ // eslint-disable-line @typescript-eslint/no-explicit-any
        where: { teacherId: teacherRow.id, schoolId },
      }) as AssessmentRoleRow[]
    : [];

  return {
    user,
    teacher: teacherRow ? { id: teacherRow.id } : null,
    roles,
    isPrincipal: user.role === "PRINCIPAL",
    classTeacherOfId,
    adminCanView,
    adminCanManage,
    assignedSubjectIds,
    assignedClassSubjectPairs,
  };
}

// ---------------------------------------------------------------------------
// Role-check helpers
// ---------------------------------------------------------------------------

function hasRole(actor: AssessmentActor, ...types: AssessmentRoleType[]): boolean {
  return actor.roles.some((r) => types.includes(r.role));
}

function hasRoleForSubject(
  actor: AssessmentActor,
  role: AssessmentRoleType,
  subjectId: string
): boolean {
  return actor.roles.some(
    (r) => r.role === role && (r.subjectId === subjectId || r.subjectId === null)
  );
}

// ---------------------------------------------------------------------------
// Public guard functions
// ---------------------------------------------------------------------------

/**
 * @param classId The class the marks are being entered for. When supplied,
 *   the timetable fallback (assignedSubjectIds) is scoped to only the
 *   classes this teacher is actually assigned that subject in — being the
 *   Biology teacher for Form 2 East does not authorize entering Biology
 *   marks for Form 3 West. Omit only for subject-wide operations that are
 *   not tied to a specific class (e.g. defining a paper for a subject).
 */
export function canEnterMarks(actor: AssessmentActor, subjectId: string, classId?: string): boolean {
  if (actor.user.role === "ADMIN_STAFF") return actor.adminCanManage;
  if (actor.isPrincipal) return true;
  if (hasRole(actor, "DIRECTOR", "EXAM_OFFICER")) return true;
  if (actor.classTeacherOfId !== null && hasRole(actor, "CLASS_TEACHER")) return true;
  if (hasRoleForSubject(actor, "SUBJECT_TEACHER", subjectId)) return true;
  // Fallback: teacher assigned via timetable (ClassSubjectTeacher / elective group)
  if (classId) {
    if (actor.assignedClassSubjectPairs.has(`${classId}::${subjectId}`)) return true;
  } else if (actor.assignedSubjectIds.has(subjectId)) {
    return true;
  }
  return false;
}

export function canViewMarksheet(actor: AssessmentActor, subjectId?: string): boolean {
  if (actor.user.role === "ADMIN_STAFF") return actor.adminCanView || actor.adminCanManage;
  if (actor.isPrincipal) return true;
  if (hasRole(actor, "DIRECTOR", "EXAM_OFFICER")) return true;
  if (actor.classTeacherOfId !== null && hasRole(actor, "CLASS_TEACHER")) return true;
  if (subjectId && hasRoleForSubject(actor, "SUBJECT_TEACHER", subjectId)) return true;
  if (subjectId) {
    const isHodForSubject = actor.roles.some(
      (r) => r.role === "HOD" && (r.subjectId === subjectId || r.subjectId === null)
    );
    if (isHodForSubject) return true;
    // Fallback: teacher assigned via timetable (ClassSubjectTeacher / elective group)
    if (actor.assignedSubjectIds.has(subjectId)) return true;
  } else {
    if (hasRole(actor, "HOD")) return true;
    // Fallback: any timetable assignment qualifies for the no-subjectId check
    if (actor.assignedSubjectIds.size > 0) return true;
  }
  return false;
}

export function canAccessDashboard(actor: AssessmentActor): boolean {
  if (actor.user.role === "ADMIN_STAFF") return actor.adminCanView || actor.adminCanManage;
  if (actor.isPrincipal) return true;
  if (hasRole(actor, "DIRECTOR", "EXAM_OFFICER", "HOD")) return true;
  // Teachers can access dashboard analytics for their assigned classes/subjects.
  if (actor.teacher !== null) return true;
  return false;
}

export function canGenerateReportCard(actor: AssessmentActor, classId: string): boolean {
  if (actor.user.role === "ADMIN_STAFF") return actor.adminCanView || actor.adminCanManage;
  if (actor.isPrincipal) return true;
  if (hasRole(actor, "DIRECTOR", "EXAM_OFFICER")) return true;
  if (actor.classTeacherOfId === classId && hasRole(actor, "CLASS_TEACHER")) return true;
  return false;
}

export function canReadPeriods(actor: AssessmentActor): boolean {
  // Any authenticated user may read the period list — it contains no sensitive
  // mark data and is needed to populate filter bars for all roles.
  // Principals are always permitted; for other roles we still require some
  // form of assessment access (own role, admin permission, or class-teacher
  // assignment) so that completely unrelated staff accounts are excluded.
  if (actor.isPrincipal) return true;
  if (actor.user.role === "ADMIN_STAFF") return actor.adminCanView || actor.adminCanManage;
  // Teachers: permit if they have any assessment role, are a class teacher,
  // or the school has no 8-4-4 framework yet (roles array will be empty but
  // the teacher is legitimately using a CBE framework).
  if (actor.teacher !== null) return true;
  return canViewMarksheet(actor) || canAccessDashboard(actor);
}
