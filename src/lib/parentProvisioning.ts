/**
 * Parent account provisioning.
 *
 * Students carry their guardian as two plain fields (Student.parentName /
 * Student.parentContact), but the parent portal needs a real Parent row with a
 * User behind it. Nothing used to create those rows, so a guardian could be on
 * file for a student and still have no account to sign in with.
 *
 * syncParentForStudent bridges the two: whenever a student's guardian details
 * are saved, the matching Parent + User + ParentStudent link is created (or
 * re-pointed if the phone number changed).
 *
 * The account is created with no password hash and mustChangePassword = true —
 * the parent's first login is their child's admission number (see
 * /api/auth/login), after which the force-change modal makes them set a
 * personal one.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Phone numbers are typed by hand at a school office, so "0725 801550" and
 * " 0725801550" are the same guardian. Login matches on the stored value, so
 * everything is stored stripped of spaces and punctuation.
 */
export function normalizeParentPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s()\-.]/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Creates/links the Parent account for one student's guardian.
 *
 * Non-fatal by design: student registration must not fail because parent
 * provisioning did. Callers may ignore the result.
 */
export async function syncParentForStudent(
  opts: {
    studentId:     string;
    schoolId:      string;
    parentName:    string | null | undefined;
    parentContact: string | null | undefined;
  },
  db: Db = prisma
): Promise<{ parentId: string } | null> {
  const phone = normalizeParentPhone(opts.parentContact);

  // No contact on file → drop any link created from a previous contact, so a
  // cleared guardian number does not leave the old parent with portal access.
  if (!phone) {
    await db.parentStudent.deleteMany({ where: { studentId: opts.studentId } });
    return null;
  }

  const name = opts.parentName?.trim() || "Parent";

  let parent = await db.parent.findUnique({
    where:  { schoolId_phone: { schoolId: opts.schoolId, phone } },
    select: { id: true },
  });

  if (!parent) {
    const user = await db.user.create({
      data: {
        email:              `parent_${phone}@bidii.internal`,
        passwordHash:       null,
        role:               "PARENT",
        mustChangePassword: true,
        isActive:           true,
        schoolId:           opts.schoolId,
      },
      select: { id: true },
    });

    parent = await db.parent.create({
      data: { userId: user.id, name, phone, schoolId: opts.schoolId },
      select: { id: true },
    });
  }

  // Re-point the student at this guardian — covers an edited phone number,
  // where the student was previously linked to a different Parent row.
  await db.parentStudent.deleteMany({
    where: { studentId: opts.studentId, parentId: { not: parent.id } },
  });

  const existingLinks = await db.parentStudent.count({ where: { studentId: opts.studentId } });
  await db.parentStudent.upsert({
    where:  { parentId_studentId: { parentId: parent.id, studentId: opts.studentId } },
    update: {},
    create: { parentId: parent.id, studentId: opts.studentId, isPrimary: existingLinks === 0 },
  });

  return { parentId: parent.id };
}
