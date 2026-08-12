/**
 * src/lib/soma-ai/permissions.ts
 *
 * Resolves the data-access scope for a Soma AI request based on the
 * authenticated user's role. Every intelligence resolver calls this first
 * so privacy boundaries are enforced in a single, auditable place.
 *
 * Scope contract:
 *
 *   PRINCIPAL  → isAdmin=true, unrestricted access to all school data
 *   ADMIN_STAFF→ isAdmin=true for modules their role grants; scoped classIds
 *                are all school classes (staff can see all classes they have
 *                module permission for — individual staff don't teach)
 *   TEACHER    → classIds = classes they are assigned to teach
 *                teacherId = their Teacher row id
 *                studentIds = all students in those classes
 *   PARENT     → studentIds = only children linked via userId or parentContact
 *   STUDENT    → studentIds = [their own student row only]
 *
 * If a user tries to access data outside their scope, resolveUserScope()
 * returns an empty array for the relevant dimension. Callers must treat
 * an empty array as "no access" rather than "all records".
 */

import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEffectivePermissions } from "@/lib/permissions";
import type { Module } from "@prisma/client";

export interface UserScope {
  userId: string;
  schoolId: string;
  role: string;
  /** True when the user can see all school-wide records */
  isAdmin: boolean;
  /** Student ids this user is authorised to access. Empty = no student access. */
  studentIds: string[];
  /** Class ids this user is authorised to see. Empty = no class access. */
  classIds: string[];
  /** Teacher row id (only set for TEACHER role) */
  teacherId: string | null;
  /** RBAC module grants (only for ADMIN_STAFF) */
  moduleGrants: Partial<Record<Module, { canView: boolean; canManage: boolean }>>;
  /** Human-readable display name for the user in audit/error messages */
  displayName: string;
}

/** Denial token returned instead of actual data */
export const PERMISSION_DENIED = "__PERMISSION_DENIED__" as const;
export type PermissionDenied = typeof PERMISSION_DENIED;

export async function resolveUserScope(user: User): Promise<UserScope> {
  const base = {
    userId: user.id,
    schoolId: user.schoolId!,
    role: user.role,
    moduleGrants: {} as UserScope["moduleGrants"],
    displayName: user.email,
  };

  // ── Principal — full access ─────────────────────────────────────────────
  if (user.role === "PRINCIPAL") {
    const allClasses = await prisma.schoolClass.findMany({
      where: { schoolId: user.schoolId! },
      select: { id: true },
    });
    const allStudents = await prisma.student.findMany({
      where: { schoolId: user.schoolId!, archivedAt: null },
      select: { id: true },
    });
    return {
      ...base,
      isAdmin: true,
      classIds: allClasses.map((c) => c.id),
      studentIds: allStudents.map((s) => s.id),
      teacherId: null,
    };
  }

  // ── Admin Staff — RBAC-scoped ───────────────────────────────────────────
  if (user.role === "ADMIN_STAFF") {
    const moduleGrants = await getEffectivePermissions(user);
    const allClasses = await prisma.schoolClass.findMany({
      where: { schoolId: user.schoolId! },
      select: { id: true },
    });
    const allStudents = await prisma.student.findMany({
      where: { schoolId: user.schoolId!, archivedAt: null },
      select: { id: true },
    });
    return {
      ...base,
      isAdmin: true,
      moduleGrants,
      classIds: allClasses.map((c) => c.id),
      studentIds: allStudents.map((s) => s.id),
      teacherId: null,
    };
  }

  // ── Teacher — own classes only ──────────────────────────────────────────
  if (user.role === "TEACHER") {
    const teacher = await prisma.teacher.findUnique({
      where: { userId: user.id },
      select: { id: true, fullName: true },
    });

    if (!teacher) {
      return {
        ...base,
        isAdmin: false,
        classIds: [],
        studentIds: [],
        teacherId: null,
        displayName: user.email,
      };
    }

    // Classes this teacher teaches (via ClassSubjectTeacher)
    const assignments = await prisma.classSubjectTeacher.findMany({
      where: { teacherId: teacher.id },
      select: { classId: true },
    });
    const classIds = [...new Set(assignments.map((a) => a.classId))];

    // Students in those classes
    const students = classIds.length > 0
      ? await prisma.student.findMany({
          where: { classId: { in: classIds }, archivedAt: null },
          select: { id: true },
        })
      : [];

    return {
      ...base,
      isAdmin: false,
      classIds,
      studentIds: students.map((s) => s.id),
      teacherId: teacher.id,
      displayName: teacher.fullName ?? user.email,
    };
  }

  // ── Parent — only own children ──────────────────────────────────────────
  if (user.role === "PARENT") {
    const children = await prisma.student.findMany({
      where: {
        schoolId: user.schoolId!,
        archivedAt: null,
        OR: [
          { userId: user.id },
          { parentContact: user.email },
        ],
      },
      select: { id: true, classId: true, fullName: true },
    });

    return {
      ...base,
      isAdmin: false,
      classIds: children.map((c) => c.classId),
      studentIds: children.map((c) => c.id),
      teacherId: null,
      displayName: user.email,
    };
  }

  // ── Student — own record only ───────────────────────────────────────────
  if (user.role === "STUDENT") {
    const student = await prisma.student.findFirst({
      where: {
        schoolId: user.schoolId!,
        userId: user.id,
        archivedAt: null,
      },
      select: { id: true, classId: true, fullName: true },
    });

    if (!student) {
      return {
        ...base,
        isAdmin: false,
        classIds: [],
        studentIds: [],
        teacherId: null,
      };
    }

    return {
      ...base,
      isAdmin: false,
      classIds: [student.classId],
      studentIds: [student.id],
      teacherId: null,
      displayName: student.fullName ?? user.email,
    };
  }

  // Fallback — deny everything
  return {
    ...base,
    isAdmin: false,
    classIds: [],
    studentIds: [],
    teacherId: null,
  };
}

/** Check if a user can access a specific student id given their scope */
export function canAccessStudent(scope: UserScope, studentId: string): boolean {
  if (scope.isAdmin) return true;
  return scope.studentIds.includes(studentId);
}

/** Check if a user can access a specific class given their scope */
export function canAccessClass(scope: UserScope, classId: string): boolean {
  if (scope.isAdmin) return true;
  return scope.classIds.includes(classId);
}

/** Check if an admin-staff user has a module permission */
export function hasModuleAccess(
  scope: UserScope,
  module: Module,
  action: "view" | "manage" = "view"
): boolean {
  if (scope.isAdmin && scope.role === "PRINCIPAL") return true;
  if (scope.role === "ADMIN_STAFF") {
    const grant = scope.moduleGrants[module];
    if (!grant) return false;
    if (action === "view") return grant.canView || grant.canManage;
    return grant.canManage;
  }
  return false;
}

/** Build a polite denial message that doesn't confirm or deny restricted data exists */
export function buildDenialMessage(requestedScope: string): string {
  return `I'm not able to access ${requestedScope} with your current permissions. If you believe this is an error, please contact your school administrator.`;
}
