/**
 * Data migration: seed Parent, ParentStudent, and User rows from legacy
 * Student.parentContact / Student.parentName fields.
 *
 * Run AFTER `prisma migrate deploy`:
 *   npx tsx scripts/migrate-parent-contacts.ts
 *
 * This script is fully idempotent â€” it uses upsert / findFirst patterns so it
 * can be re-run safely without creating duplicate rows.  The legacy
 * Student.parentContact and Student.parentName columns are NOT removed.
 *
 * Requirements: 1.7
 */

import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs"; async function hashPassword(p: string) { return bcrypt.hash(p, 12); }

async function run(): Promise<void> {
  console.log("Starting parent-contact migrationâ€¦");

  // Fetch all active (non-archived) students that have a phone number recorded.
  const students = await prisma.student.findMany({
    where: {
      parentContact: { not: null },
      archivedAt: null,
    },
    select: {
      id: true,
      schoolId: true,
      fullName: true,
      parentName: true,
      parentContact: true,
      admissionNumber: true,
    },
  });

  console.log(`Found ${students.length} students with parentContact to migrate.`);

  let created = 0;
  let skipped = 0;

  for (const student of students) {
    // Type narrowed above by the `not: null` filter, but TypeScript doesn't
    // narrow `select` projections â€” assert here to satisfy strict mode.
    const phone = student.parentContact!;
    const internalEmail = `parent_${phone}@bidii.internal`;

    // â”€â”€ Step 1: Upsert the User account â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Look up by the deterministic internal email so the operation is
    // idempotent when multiple students share the same parent phone number.
    let user = await prisma.user.findFirst({
      where: {
        schoolId: student.schoolId,
        email: internalEmail,
      },
    });

    if (!user) {
      // First time we encounter this phone in this school â€” create the account.
      // The initial password is the student's admission number; the parent is
      // forced to change it on first login (mustChangePassword = true).
      const passwordHash = await hashPassword(student.admissionNumber);

      user = await prisma.user.create({
        data: {
          schoolId: student.schoolId,
          email: internalEmail,
          passwordHash,
          role: "PARENT",
          mustChangePassword: true,
          isActive: true,
        },
      });

      created++;
    } else {
      skipped++;
    }

    // â”€â”€ Step 2: Upsert the Parent record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Uniqueness key: userId (one Parent per User account).
    let parent = await prisma.parent.findUnique({
      where: { userId: user.id },
    });

    if (!parent) {
      parent = await prisma.parent.create({
        data: {
          userId: user.id,
          name: student.parentName ?? "Parent",
          phone,
          schoolId: student.schoolId,
        },
      });
    }

    // â”€â”€ Step 3: Upsert the ParentStudent link â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Composite PK [parentId, studentId] makes this naturally idempotent.
    await prisma.parentStudent.upsert({
      where: {
        parentId_studentId: {
          parentId: parent.id,
          studentId: student.id,
        },
      },
      create: {
        parentId: parent.id,
        studentId: student.id,
        isPrimary: true,
      },
      update: {
        // No-op update â€” we only want to create if missing.
      },
    });
  }

  console.log(
    `Migration complete. Users created: ${created}, already existed: ${skipped}.`
  );
  console.log(
    "Student.parentContact and Student.parentName columns have been preserved."
  );
}

run()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

