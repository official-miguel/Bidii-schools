import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, getCurrentUser, requireSchoolRole } from "@/lib/auth";
import { requirePermission, getTeacherEffectivePermissions, requireSchoolPermission } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// GET /api/staff/[id] — single staff member detail for entity drawers
// ---------------------------------------------------------------------------
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const principalUser = await requireSchoolRole("PRINCIPAL");
  if (principalUser) {
    const teacher = await prisma.teacher.findFirst({
      where: { id: params.id, schoolId: principalUser.schoolId },
      include: {
        primaryDepartment: { select: { id: true, name: true } },
        classTeacherOf: { select: { id: true, name: true } },
        teacherSubjects: {
          include: { subject: { select: { id: true, name: true, code: true } } },
        },
        user: {
          select: {
            id: true,
            email: true,
            isActive: true,
            role: true,
            mustChangePassword: true,
            staffRole: { select: { id: true, name: true } },
            userStaffRoles: {
              select: {
                staffRole: { select: { id: true, name: true, description: true } },
              },
            },
          },
        },
      },
    });
    if (!teacher) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
    return NextResponse.json(teacher);
  }

  const staffUser = await requireSchoolPermission("STAFF", "view");
  if (staffUser && staffUser.role === "ADMIN_STAFF") {
    const teacher = await prisma.teacher.findFirst({
      where: { id: params.id, schoolId: staffUser.schoolId },
      include: {
        primaryDepartment: { select: { id: true, name: true } },
        classTeacherOf: { select: { id: true, name: true } },
        teacherSubjects: {
          include: { subject: { select: { id: true, name: true, code: true } } },
        },
        user: {
          select: {
            id: true,
            email: true,
            isActive: true,
            role: true,
            mustChangePassword: true,
            staffRole: { select: { id: true, name: true } },
            userStaffRoles: {
              select: {
                staffRole: { select: { id: true, name: true, description: true } },
              },
            },
          },
        },
      },
    });
    if (!teacher) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
    return NextResponse.json(teacher);
  }

  // TEACHER: check if they have STAFF.canView via assigned roles
  const user = await getCurrentUser();
  if (user && user.role === "TEACHER") {
    const perms = await getTeacherEffectivePermissions(user);
    if (perms.STAFF?.canView) {
      const teacher = await prisma.teacher.findFirst({
        where: { id: params.id, schoolId: user.schoolId },
        include: {
          primaryDepartment: { select: { id: true, name: true } },
          classTeacherOf: { select: { id: true, name: true } },
          teacherSubjects: {
            include: { subject: { select: { id: true, name: true, code: true } } },
          },
          user: {
            select: {
              id: true,
              email: true,
              isActive: true,
              role: true,
              mustChangePassword: true,
              staffRole: { select: { id: true, name: true } },
              userStaffRoles: {
                select: {
                  staffRole: { select: { id: true, name: true, description: true } },
                },
              },
            },
          },
        },
      });
      if (!teacher) return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
      return NextResponse.json(teacher);
    }
    // Plain subject teacher — 403 for individual record
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const updateSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  primaryDepartmentId: z.string().nullable().optional(),
  todEligible: z.boolean().optional(),
  subjectIds: z.array(z.string()).optional(),
  staffRoleId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user =
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("STAFF", "edit"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }
  const { subjectIds, staffRoleId, ...rest } = parsed.data;

  const existing = await prisma.teacher.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!existing) return NextResponse.json({ error: "Teacher not found." }, { status: 404 });

  if (subjectIds && subjectIds.length > 0) {
    const count = await prisma.subject.count({
      where: { id: { in: subjectIds }, schoolId: user.schoolId },
    });
    if (count !== subjectIds.length) {
      return NextResponse.json({ error: "Choose valid subjects." }, { status: 400 });
    }
  }

  if (staffRoleId) {
    const role = await prisma.staffRole.findFirst({
      where: { id: staffRoleId, schoolId: user.schoolId },
    });
    if (!role) return NextResponse.json({ error: "Choose a valid staff role." }, { status: 400 });
  }

  try {
    const teacher = await prisma.$transaction(async (tx) => {
      if (subjectIds) {
        await tx.teacherSubject.deleteMany({ where: { teacherId: params.id } });
        await tx.teacherSubject.createMany({
          data: subjectIds.map((subjectId) => ({ teacherId: params.id, subjectId })),
          skipDuplicates: true,
        });

        // Auto-derive primaryDepartmentId from the updated subject list.
        // Only applies to teaching staff (no staffRoleId on the teacher record).
        if (subjectIds.length > 0 && !staffRoleId) {
          const firstSubject = await tx.subject.findFirst({
            where: { id: { in: subjectIds }, schoolId: existing.schoolId },
            select: { departmentId: true },
            orderBy: { name: "asc" },
          });
          if (firstSubject?.departmentId) {
            rest.primaryDepartmentId = firstSubject.departmentId;
          }
        }
      }
      if (staffRoleId !== undefined && existing.userId) {
        await tx.user.update({
          where: { id: existing.userId },
          data: { staffRoleId, role: staffRoleId ? "ADMIN_STAFF" : "TEACHER" },
        });
      }
      return tx.teacher.update({
        where: { id: params.id },
        data: {
          ...rest,
          email: rest.email === "" ? null : rest.email,
          phone: rest.phone === "" ? null : rest.phone,
        },
        include: {
          user: { select: { role: true, staffRole: { select: { id: true, name: true } } } },
        },
      });
    });
    return NextResponse.json(teacher);
  } catch {
    return NextResponse.json({ error: "Couldn't update teacher." }, { status: 500 });
  }
}

export async function DELETE() {
  // Hard deletion of staff is permanently disabled.
  // Use POST /api/staff/[id]/archive to archive a staff member — this
  // preserves every associated record and moves the profile to History.
  // The staff ID is released into the recycling pool for reuse.
  return NextResponse.json(
    { error: "Permanent deletion is disabled. Use the Transfer Staff action to archive the staff member instead." },
    { status: 405 }
  );
}
