import { getCurrentUser } from "./auth";
import { prisma } from "./prisma";
import type { Parent, ParentStudent } from "@prisma/client";

/**
 * A `Parent` record with its linked `ParentStudent` rows.
 * Each `ParentStudent` entry includes a nested `student` object that
 * carries only the `id` field — enough for O(1) ownership checks.
 */
export type ParentWithStudents = Parent & {
  students: (ParentStudent & { student: { id: string } })[];
};

/**
 * Server-side guard that returns the authenticated `Parent` record (with
 * linked student IDs) for the current session user, or `null` if:
 *  - there is no active session,
 *  - the session user's role is not `"PARENT"`, or
 *  - no matching `Parent` row exists in the database.
 *
 * Requirement 12.1
 */
export async function requireParent(): Promise<ParentWithStudents | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "PARENT") return null;

  const parent = await prisma.parent.findUnique({
    where: { userId: user.id },
    include: {
      students: {
        select: {
          parentId:  true,
          studentId: true,
          isPrimary: true,
          createdAt: true,
          student:   { select: { id: true } },
        },
      },
    },
  });

  return parent;
}

/**
 * Returns the set of student IDs linked to this parent for O(1) ownership
 * checks. Builds from `ParentStudent.studentId` (the direct FK column).
 */
export function parentStudentIds(parent: ParentWithStudents): Set<string> {
  return new Set(parent.students.map((ps) => ps.studentId));
}

/**
 * Returns `true` if `studentId` belongs to one of the parent's linked
 * students; `false` otherwise.
 *
 * Never reveals whether the student ID exists in the system — callers should
 * respond with HTTP 403 (not 404) when this returns `false`.
 *
 * Requirements 3.4, 12.3, 12.4
 */
export function ownsStudent(
  parent: ParentWithStudents,
  studentId: string
): boolean {
  return parentStudentIds(parent).has(studentId);
}
