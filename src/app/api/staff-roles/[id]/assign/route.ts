import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { logPermissionAudit } from "@/lib/permissions";

const schema = z.object({
  userId: z.string(),
  assign: z.boolean(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const { userId, assign } = parsed.data;

  const [role, targetUser] = await Promise.all([
    prisma.staffRole.findFirst({ where: { id: params.id, schoolId: user.schoolId } }),
    // Accept both ADMIN_STAFF and TEACHER — teachers can be granted extra
    // module permissions on top of their built-in capabilities.
    prisma.user.findFirst({
      where: { id: userId, schoolId: user.schoolId, role: { in: ["ADMIN_STAFF", "TEACHER"] } },
    }),
  ]);

  if (!role) return NextResponse.json({ error: "Role not found." }, { status: 404 });
  if (!targetUser) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (assign) {
    await prisma.userStaffRole.upsert({
      where: { userId_staffRoleId: { userId, staffRoleId: params.id } },
      create: { userId, staffRoleId: params.id, assignedById: user.id },
      update: {},
    });
    await logPermissionAudit({
      schoolId:      user.schoolId,
      performedById: user.id,
      targetUserId:  userId,
      staffRoleId:   params.id,
      action:        "ROLE_ASSIGNED",
      changes:       { roleName: role.name, userEmail: targetUser.email },
    });
  } else {
    await prisma.userStaffRole.deleteMany({ where: { userId, staffRoleId: params.id } });
    await logPermissionAudit({
      schoolId:      user.schoolId,
      performedById: user.id,
      targetUserId:  userId,
      staffRoleId:   params.id,
      action:        "ROLE_UNASSIGNED",
      changes:       { roleName: role.name, userEmail: targetUser.email },
    });
  }

  return NextResponse.json({ ok: true });
}
