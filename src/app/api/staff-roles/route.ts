import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Module } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { ensureDefaultStaffRoles, ALL_MODULES, logPermissionAudit } from "@/lib/permissions";

export async function GET() {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDefaultStaffRoles(user.schoolId!);

  const roles = await prisma.staffRole.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: { name: "asc" },
    include: {
      permissions: true,
      _count: { select: { users: true } },
      userRoles: { select: { userId: true } },
    },
  });
  return NextResponse.json(roles);
}

const permSchema = z.object({
  module:      z.enum(ALL_MODULES as [string, ...string[]]),
  canView:     z.boolean().default(false),
  canCreate:   z.boolean().default(false),
  canEdit:     z.boolean().default(false),
  canDelete:   z.boolean().default(false),
  canApprove:  z.boolean().default(false),
  canExport:   z.boolean().default(false),
  canPrint:    z.boolean().default(false),
  canManage:   z.boolean().default(false),
  canConfigure:z.boolean().default(false),
  canAIAccess: z.boolean().default(false),
});

const createSchema = z.object({
  name:        z.string().trim().min(2, "Name must be at least 2 characters."),
  description: z.string().trim().optional().or(z.literal("")),
  permissions: z.array(permSchema).default([]),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });

  const { name, description, permissions } = parsed.data;

  try {
    const role = await prisma.staffRole.create({
      data: {
        schoolId: user.schoolId!,
        name,
        description: description || null,
        permissions: {
          create: permissions
            .filter((p) => p.canView || p.canManage || p.canCreate || p.canEdit)
            .map((p) => ({
              module: p.module as Module,
              canView: p.canView,
              canCreate: p.canCreate ?? false,
              canEdit: p.canEdit ?? false,
              canDelete: p.canDelete ?? false,
              canApprove: p.canApprove ?? false,
              canExport: p.canExport ?? false,
              canPrint: p.canPrint ?? false,
              canManage: p.canManage,
              canConfigure: p.canConfigure ?? false,
              canAIAccess: p.canAIAccess ?? false,
            })),
        },
      },
      include: { permissions: true },
    });

    await logPermissionAudit({
      schoolId: user.schoolId!,
      performedById: user.id,
      staffRoleId:   role.id,
      action:        "ROLE_CREATED",
      changes:       { name, description, permissionCount: permissions.length },
    });

    return NextResponse.json(role, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "A role with that name already exists." }, { status: 409 });
    return NextResponse.json({ error: "Couldn't create role." }, { status: 500 });
  }
}
