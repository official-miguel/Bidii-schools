/**
 * POST /api/staff/[id]/provision-login
 *
 * Creates a login account (User row) for a Teacher who has no userId — i.e.
 * teachers that were imported via CSV and therefore have no login credentials.
 *
 * Body: { email: string, role?: "TEACHER" | "ADMIN_STAFF", staffRoleId?: string }
 *
 * The initial password is set to the school slug (bcrypt-hashed) and
 * mustChangePassword is true — the same flow as manually registered staff.
 *
 * Only a PRINCIPAL or ADMIN_STAFF with STAFF.canCreate may call this.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  role: z.enum(["TEACHER", "ADMIN_STAFF"]).default("TEACHER"),
  staffRoleId: z.string().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth: principal or staff with STAFF.canCreate
  const caller =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("STAFF", "create"));
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const schoolId = caller.schoolId!;

  // Parse body
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const { email, role, staffRoleId } = parsed.data;

  // Load the teacher — must belong to this school and have NO userId
  const teacher = await prisma.teacher.findFirst({
    where: { id: params.id, schoolId },
    select: { id: true, fullName: true, userId: true },
  });

  if (!teacher) {
    return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
  }
  if (teacher.userId) {
    return NextResponse.json(
      { error: "This staff member already has a login account." },
      { status: 409 }
    );
  }

  // Check email isn't already taken in this school
  const existing = await prisma.user.findUnique({
    where: { schoolId_email: { schoolId, email } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists in this school." },
      { status: 409 }
    );
  }

  // Validate staffRoleId if provided
  if (staffRoleId) {
    const roleExists = await prisma.staffRole.findFirst({
      where: { id: staffRoleId, schoolId },
      select: { id: true },
    });
    if (!roleExists) {
      return NextResponse.json({ error: "Invalid staff role." }, { status: 400 });
    }
  }

  // Get school slug — used as the initial password
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { slug: true, name: true },
  });
  if (!school) {
    return NextResponse.json({ error: "School not found." }, { status: 500 });
  }

  try {
    // Create User + link to Teacher in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          schoolId,
          email,
          passwordHash: await hashPassword(school.slug),
          role: role,
          staffRoleId: staffRoleId ?? null,
          mustChangePassword: true,
        },
        select: { id: true, email: true, role: true, mustChangePassword: true },
      });

      await tx.teacher.update({
        where: { id: teacher.id },
        data:  { userId: newUser.id, email },
      });

      return newUser;
    });

    return NextResponse.json({
      success: true,
      user: result,
      message: `Login created. Initial password is the school username.`,
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }
    console.error("[PROVISION-LOGIN]", err);
    return NextResponse.json({ error: "Failed to create login account." }, { status: 500 });
  }
}
