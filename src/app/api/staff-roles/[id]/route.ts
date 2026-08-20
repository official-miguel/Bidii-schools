import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Module } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { logPermissionAudit } from "@/lib/permissions";

const permSchema = z.object({
  module:       z.string().min(1),
  canView:      z.boolean().default(false),
  canCreate:    z.boolean().default(false),
  canEdit:      z.boolean().default(false),
  canDelete:    z.boolean().default(false),
  canApprove:   z.boolean().default(false),
  canExport:    z.boolean().default(false),
  canPrint:     z.boolean().default(false),
  canManage:    z.boolean().default(false),
  canConfigure: z.boolean().default(false),
  canAIAccess:  z.boolean().default(false),
});

const updateSchema = z.object({
  name:        z.string().trim().min(2).optional(),
  description: z.string().trim().optional().or(z.literal("")),
  permissions: z.array(permSchema).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  const { permissions, ...rest } = parsed.data;

  const existing = await prisma.staffRole.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    include: { permissions: true },
  });
  if (!existing) return NextResponse.json({ error: "Role not found." }, { status: 404 });

  try {
    const role = await prisma.$transaction(async (tx) => {
      if (permissions !== undefined) {
        await tx.rolePermission.deleteMany({ where: { staffRoleId: params.id } });
        const rows = permissions.filter((p) => p.canView || p.canManage || p.canCreate || p.canEdit);
        if (rows.length > 0) {
          await tx.rolePermission.createMany({
            data: rows.map((p) => ({
              staffRoleId:  params.id,
              // Double-cast: Module enum in generated client may lag behind schema migrations.
              // The DB enum is always authoritative; Prisma passes this string through as-is.
              module:       p.module as unknown as Module,
              canView:      p.canView || p.canManage,
              canCreate:    p.canCreate || p.canManage,
              canEdit:      p.canEdit  || p.canManage,
              canDelete:    p.canDelete || p.canManage,
              canApprove:   p.canApprove,
              canExport:    p.canExport || p.canManage,
              canPrint:     p.canPrint  || p.canManage,
              canManage:    p.canManage,
              canConfigure: p.canConfigure,
              canAIAccess:  p.canAIAccess,
            })),
          });
        }
      }
      return tx.staffRole.update({
        where: { id: params.id },
        data:  { ...rest, description: rest.description === "" ? null : rest.description },
        include: { permissions: true },
      });
    });

    // Snapshot before/after for audit
    const before = Object.fromEntries(existing.permissions.map((p) => [p.module, { canView: p.canView, canManage: p.canManage }]));
    const after  = permissions ? Object.fromEntries(permissions.map((p) => [p.module, p])) : undefined;

    await logPermissionAudit({
      schoolId: user.schoolId!,
      performedById: user.id,
      staffRoleId:   params.id,
      action:        "ROLE_UPDATED",
      changes:       { name: rest.name, before, after },
    });

    return NextResponse.json(role);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "A role with that name already exists." }, { status: 409 });
    console.error("[STAFF-ROLES PATCH]", e);
    return NextResponse.json({ error: "Couldn't update role." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await prisma.staffRole.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    include: { _count: { select: { users: true } }, userRoles: { select: { userId: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Role not found." }, { status: 404 });

  const totalUsers = existing._count.users + existing.userRoles.length;
  if (totalUsers > 0)
    return NextResponse.json({ error: `${totalUsers} staff member(s) still have this role. Reassign them first.` }, { status: 409 });

  await prisma.staffRole.delete({ where: { id: params.id } });

  await logPermissionAudit({
    schoolId: user.schoolId!,
    performedById: user.id,
    staffRoleId:   params.id,
    action:        "ROLE_DELETED",
    changes:       { name: existing.name },
  });

  return NextResponse.json({ ok: true });
}
