import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, hashPassword, getCurrentUser, requireSchoolRole } from "@/lib/auth";
import { requirePermission, getTeacherEffectivePermissions, requireSchoolPermission } from "@/lib/permissions";
import { sendWelcomeEmail } from "@/lib/email";

export async function GET() {
  // PRINCIPAL always sees the full directory.
  // ADMIN_STAFF users whose role grants at least view access to the Staff module see full data.
  // TEACHER with STAFF.canView (via assigned role) sees full data.
  // Plain Subject Teacher (TEACHER with no STAFF.canView) sees trimmed data.
  const principalUser = await requireSchoolRole("PRINCIPAL");
  if (principalUser) {
    const teachers = await prisma.teacher.findMany({
      where: { schoolId: principalUser.schoolId!, archivedAt: null },
      orderBy: { fullName: "asc" },
      include: {
        primaryDepartment: { select: { id: true, name: true } },
        classTeacherOf: { select: { id: true, name: true } },
        teacherSubjects: { include: { subject: { select: { id: true, name: true, code: true } } } },
        user: { select: { email: true, isActive: true, role: true, mustChangePassword: true, staffRole: { select: { id: true, name: true } } } },
      },
    });
    return NextResponse.json(teachers);
  }

  const staffUser = await requireSchoolPermission("STAFF", "view");
  if (staffUser && staffUser.role === "ADMIN_STAFF") {
    const teachers = await prisma.teacher.findMany({
      where: { schoolId: staffUser.schoolId, archivedAt: null },
      orderBy: { fullName: "asc" },
      include: {
        primaryDepartment: { select: { id: true, name: true } },
        classTeacherOf: { select: { id: true, name: true } },
        teacherSubjects: { include: { subject: { select: { id: true, name: true, code: true } } } },
        user: { select: { email: true, isActive: true, role: true, mustChangePassword: true, staffRole: { select: { id: true, name: true } } } },
      },
    });
    return NextResponse.json(teachers);
  }

  // Check if the caller is a TEACHER
  const user = await getCurrentUser();
  if (user && user.role === "TEACHER") {
    const perms = await getTeacherEffectivePermissions(user);
    if (perms.STAFF?.canView) {
      // Teacher with STAFF.canView via assigned role — full list
      const teachers = await prisma.teacher.findMany({
        where: { schoolId: user.schoolId!, archivedAt: null },
        orderBy: { fullName: "asc" },
        include: {
          primaryDepartment: { select: { id: true, name: true } },
          classTeacherOf: { select: { id: true, name: true } },
          teacherSubjects: { include: { subject: { select: { id: true, name: true, code: true } } } },
          user: { select: { email: true, isActive: true, role: true, mustChangePassword: true, staffRole: { select: { id: true, name: true } } } },
        },
      });
      return NextResponse.json(teachers);
    }
    // Plain Subject Teacher — trimmed list (id, fullName, designation, primaryDepartment.name, staffId)
    const teachers = await prisma.teacher.findMany({
      where: { schoolId: user.schoolId!, archivedAt: null },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        designation: true,
        staffId: true,
        primaryDepartment: { select: { name: true } },
      },
    });
    return NextResponse.json(teachers);
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/// Highest numeric staff ID in the school (non-numeric ones are kept as-is
/// but don't advance the sequence, matching the admission-number behaviour).
async function maxStaffId(schoolId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ max: bigint | null }[]>`
    SELECT MAX(CAST("staffId" AS BIGINT)) as max FROM "Teacher"
    WHERE "schoolId" = ${schoolId} AND "staffId" ~ '^[0-9]+$'`;
  return rows[0]?.max === null || rows[0]?.max === undefined ? null : Number(rows[0].max);
}

const createSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the staff member's full name."),
    staffId: z.string().trim().optional().or(z.literal("")),
    startingStaffId: z.coerce.number().int().positive().optional(),
    email: z.string().trim().email("Enter a valid email."),
    phone: z.string().trim().optional().or(z.literal("")),
    primaryDepartmentId: z.string().nullable().optional(),
    todEligible: z.boolean().default(true),
    subjectIds: z.array(z.string()).default([]),
    createLogin: z.boolean().default(true),
    staffRoleId: z.string().nullable().optional(),
  })
  .refine((d) => !(d.staffRoleId && d.subjectIds.length > 0), {
    message: "Subjects can only be assigned to teaching staff.",
    path: ["subjectIds"],
  });

// ---------------------------------------------------------------------------
// POST /api/staff — register a new staff member
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("STAFF", "create"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { schoolId } = user;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  if (data.createLogin && !data.email) {
    return NextResponse.json(
      { error: "An email is required to create login credentials." },
      { status: 400 }
    );
  }

  // For teaching staff, derive primaryDepartmentId from their first subject's department.
  // The explicit value from the payload is used as a fallback only for non-teaching staff.
  if (!data.staffRoleId && data.subjectIds.length > 0) {
    const firstSubject = await prisma.subject.findFirst({
      where: { id: { in: data.subjectIds }, schoolId },
      select: { departmentId: true },
      orderBy: { name: "asc" },
    });
    if (firstSubject?.departmentId) {
      data.primaryDepartmentId = firstSubject.departmentId;
    }
  }

  if (data.primaryDepartmentId) {
    const department = await prisma.department.findFirst({
      where: { id: data.primaryDepartmentId, schoolId },
    });
    if (!department) {
      return NextResponse.json({ error: "Choose a valid department." }, { status: 400 });
    }
  }

  if (data.subjectIds.length > 0) {
    const count = await prisma.subject.count({
      where: { id: { in: data.subjectIds }, schoolId },
    });
    if (count !== data.subjectIds.length) {
      return NextResponse.json({ error: "Choose valid subjects." }, { status: 400 });
    }
  }

  let staffRole: { id: string; name: string } | null = null;
  if (data.staffRoleId) {
    staffRole = await prisma.staffRole.findFirst({
      where: { id: data.staffRoleId, schoolId },
      select: { id: true, name: true },
    });
    if (!staffRole) {
      return NextResponse.json({ error: "Choose a valid staff role." }, { status: 400 });
    }
  }

  // Pre-check: if login creation is requested, ensure the email isn't already taken
  // within this school. The User unique constraint is compound (schoolId + email).
  if (data.createLogin && data.email) {
    const existingUser = await prisma.user.findUnique({
      where: { schoolId_email: { schoolId, email: data.email } },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with that email already exists. Use a different email address." },
        { status: 409 }
      );
    }
  }

  // Fetch school name and slug — name for the welcome email, slug is the initial password.
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { name: true, slug: true },
  });
  const schoolName = school?.name ?? "Your School";
  const schoolSlug = school?.slug ?? "";

  // ---------------------------------------------------------------------------
  // Helper: fire-and-forget welcome email after successful creation
  // ---------------------------------------------------------------------------
  async function maybeSendWelcome(email: string, fullName: string) {
    if (!email) return;
    sendWelcomeEmail({
      schoolId,
      schoolName,
      recipientEmail: email,
      recipientName: fullName,
      // The school slug is the initial password — tell the teacher what to use.
      temporaryPassword: `@${schoolSlug}`,
    }).catch(() => {
      // Non-fatal — the info is also shown in the UI
    });
  }

  // ---------------------------------------------------------------------------
  // Explicit staffId branch (non-auto-increment)
  // ---------------------------------------------------------------------------
  const explicitId = data.staffId?.trim() || null;

  if (explicitId) {
    try {
      const teacher = await prisma.$transaction(async (tx) => {
        let userId: string | null = null;
        if (data.createLogin && data.email && schoolSlug) {
          const authUser = await tx.user.create({
            data: {
              schoolId,
              email: data.email,
              // Initial password = school slug (bcrypt-hashed).
              // mustChangePassword forces a reset on first login.
              passwordHash: await hashPassword(schoolSlug),
              role: staffRole ? "ADMIN_STAFF" : "TEACHER",
              staffRoleId: staffRole?.id ?? null,
              mustChangePassword: true,
            },
          });
          userId = authUser.id;
        }
        return tx.teacher.create({
          data: {
            schoolId,
            fullName: data.fullName,
            staffId: explicitId,
            email: data.email || null,
            phone: data.phone || null,
            primaryDepartmentId: data.primaryDepartmentId || null,
            todEligible: data.todEligible,
            userId,
            teacherSubjects: { create: data.subjectIds.map((subjectId) => ({ subjectId })) },
          },
          include: {
            teacherSubjects: true,
            user: { select: { role: true, staffRole: { select: { id: true, name: true } } } },
          },
        });
      });

      // Send welcome email asynchronously (non-blocking)
      if (data.email) {
        await maybeSendWelcome(data.email, data.fullName);
      }

      return NextResponse.json({ teacher }, { status: 201 });
    } catch (e) {
      const err = e as { code?: string; meta?: { target?: string[] } };
      if (err.code === "P2002") {
        const target = err.meta?.target ?? [];
        const fields = Array.isArray(target) ? target.join(", ") : String(target);
        if (fields.includes("email")) {
          return NextResponse.json(
            { error: "An account with that email already exists. Use a different email address." },
            { status: 409 }
          );
        }
        if (fields.includes("staffId")) {
          return NextResponse.json(
            { error: "That staff ID is already in use. Choose a different one." },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: `A record with those details already exists (${fields}).` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Couldn't register staff member." }, { status: 500 });
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-generate staff ID: try recycled IDs first, then increment.
  // ---------------------------------------------------------------------------
  for (let attempt = 0; attempt < 5; attempt++) {
    // 1. Check for a recycled staff ID (smallest available)
    const recycledRows = await prisma.$queryRaw<{ id: string; staffId: string }[]>`
      SELECT "id", "staffId" FROM "RecycledStaffId"
      WHERE "schoolId" = ${schoolId}
        AND "staffId" ~ '^[0-9]+$'
      ORDER BY CAST("staffId" AS BIGINT) ASC
      LIMIT 1`;

    let nextIdStr: string;
    let recycledRowId: string | null = null;

    if (recycledRows.length > 0) {
      nextIdStr     = recycledRows[0].staffId;
      recycledRowId = recycledRows[0].id;
    } else {
      const current = await maxStaffId(schoolId);
      if (current === null) {
        if (!data.startingStaffId) {
          return NextResponse.json(
            { error: "First staff member — provide a starting staff ID number." },
            { status: 400 }
          );
        }
        nextIdStr = String(data.startingStaffId);
      } else {
        nextIdStr = String(current + 1);
      }
    }

    try {
      const teacher = await prisma.$transaction(async (tx) => {
        if (recycledRowId) {
          await tx.recycledStaffId.delete({ where: { id: recycledRowId } });
        }

        let userId: string | null = null;
        if (data.createLogin && data.email && schoolSlug) {
          const authUser = await tx.user.create({
            data: {
              schoolId,
              email: data.email,
              // Initial password = school slug (bcrypt-hashed).
              // mustChangePassword forces a reset on first login.
              passwordHash: await hashPassword(schoolSlug),
              role: staffRole ? "ADMIN_STAFF" : "TEACHER",
              staffRoleId: staffRole?.id ?? null,
              mustChangePassword: true,
            },
          });
          userId = authUser.id;
        }
        return tx.teacher.create({
          data: {
            schoolId,
            fullName: data.fullName,
            staffId: nextIdStr,
            email: data.email || null,
            phone: data.phone || null,
            primaryDepartmentId: data.primaryDepartmentId || null,
            todEligible: data.todEligible,
            userId,
            teacherSubjects: { create: data.subjectIds.map((subjectId) => ({ subjectId })) },
          },
          include: {
            teacherSubjects: true,
            user: { select: { role: true, staffRole: { select: { id: true, name: true } } } },
          },
        });
      });

      // Send welcome email asynchronously (non-blocking)
      if (data.email) {
        await maybeSendWelcome(data.email, data.fullName);
      }

      return NextResponse.json({ teacher }, { status: 201 });
    } catch (e) {
      const err = e as { code?: string; meta?: { target?: string[] } };
      if (err.code === "P2002") {
        const target = err.meta?.target ?? [];
        const fields = Array.isArray(target) ? target.join(", ") : String(target);
        // staffId collision — retry with the next available ID
        if (fields.includes("staffId")) continue;
        if (fields.includes("email")) {
          return NextResponse.json(
            { error: "An account with that email already exists. Use a different email address." },
            { status: 409 }
          );
        }
        return NextResponse.json(
          { error: `A record with those details already exists (${fields}).` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Couldn't register staff member." }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: "Couldn't register staff member — please retry." },
    { status: 409 }
  );
}
