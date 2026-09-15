/**
 * src/lib/accommodation/genderEligibility.ts
 *
 * Server-side gender guard for dormitory placement.
 *
 * `genderPolicy.ts` holds the pure rules; this file is the database-aware
 * wrapper every write path calls before creating an AllocationRecord, so that
 * manual allocation, transfers, bulk relocation, auto-assignment on
 * registration, and spreadsheet import all enforce the same rule.
 *
 * The rule, restated: in a mixed school every dorm is BOYS_ONLY or GIRLS_ONLY,
 * and a student may only be placed in a dorm matching their recorded gender. A
 * student with no recorded gender cannot be placed automatically — there is no
 * way to confirm eligibility, and guessing is exactly the failure this guard
 * exists to prevent. Single-gender schools need no per-student check, since
 * every enrolled student is the same gender by school policy.
 */

import { prisma } from "@/lib/prisma";
import {
  studentMatchesDormGender,
  genderMismatchReason,
  type GenderPolicy,
} from "./genderPolicy";

export interface GenderCheckFailure {
  studentId:   string;
  studentName: string;
  reason:      string;
}

/**
 * Checks one or more students against a single destination dorm.
 *
 * Returns an empty array when every student may be placed there. Otherwise
 * returns one entry per ineligible student, with a message fit to show a user.
 *
 * Callers should treat a non-empty result as a hard refusal — this is a
 * safeguarding rule, not a warning.
 */
export async function checkStudentsForDorm(
  schoolId:  string,
  studentIds: string[],
  dormId:    string
): Promise<GenderCheckFailure[]> {
  if (studentIds.length === 0) return [];

  const [school, dorm, students] = await Promise.all([
    prisma.school.findUnique({
      where:  { id: schoolId },
      select: { genderPolicy: true },
    }),
    prisma.dormitory.findFirst({
      where:  { id: dormId, schoolId },
      select: { id: true, name: true, genderPolicy: true },
    }),
    prisma.student.findMany({
      where:  { id: { in: studentIds }, schoolId },
      select: { id: true, fullName: true, gender: true },
    }),
  ]);

  // A missing school or dorm is not this guard's error to report — the calling
  // route already validates both and returns its own 404.
  if (!school || !dorm) return [];

  const schoolPolicy = (school.genderPolicy ?? "MIXED") as GenderPolicy;
  const dormPolicy   = (dorm.genderPolicy  ?? "MIXED") as GenderPolicy;

  const failures: GenderCheckFailure[] = [];

  for (const student of students) {
    if (studentMatchesDormGender(schoolPolicy, dormPolicy, student.gender)) continue;

    const detail = student.gender
      ? genderMismatchReason(dormPolicy, student.gender)
      : "Student has no gender recorded, so eligibility cannot be confirmed";

    failures.push({
      studentId:   student.id,
      studentName: student.fullName,
      reason:      `${student.fullName} cannot be placed in ${dorm.name}. ${detail}.`,
    });
  }

  return failures;
}

/**
 * Single-student convenience wrapper. Returns a user-facing message when the
 * placement must be refused, or null when it is allowed.
 */
export async function checkStudentForDorm(
  schoolId:  string,
  studentId: string,
  dormId:    string
): Promise<string | null> {
  const failures = await checkStudentsForDorm(schoolId, [studentId], dormId);
  return failures[0]?.reason ?? null;
}

/**
 * The gender a dorm accepts, for filtering candidate dorms before placement
 * (used by auto-assignment, which picks the dorm rather than being handed one).
 *
 * Returns null in a single-gender school, where every student is eligible for
 * every dorm and no filtering is needed.
 */
export function requiredStudentGenderForDorm(
  schoolPolicy: GenderPolicy,
  dormPolicy:   GenderPolicy
): "MALE" | "FEMALE" | null {
  if (schoolPolicy !== "MIXED") return null;
  if (dormPolicy === "BOYS_ONLY")  return "MALE";
  if (dormPolicy === "GIRLS_ONLY") return "FEMALE";
  return null;
}
