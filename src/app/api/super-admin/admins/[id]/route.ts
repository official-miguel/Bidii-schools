/**
 * PATCH /api/super-admin/admins/[id] — activate / deactivate a super admin.
 *
 * Platform owner only. Deactivating revokes the account's sessions so the
 * change takes effect immediately rather than whenever their cookie expires.
 * The owner account itself can never be deactivated here — that would leave
 * the platform with no way into Settings.
 */

import { NextRequest, NextResponse } from "next/server";
import { z }                         from "zod";
import { prisma }                    from "@/lib/prisma";
import { requireSuperAdminOwner, logAudit } from "@/lib/super-admin";

const patchSchema = z.object({ isActive: z.boolean() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const owner = await requireSuperAdminOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where:  { id: params.id },
    select: { id: true, email: true, role: true, isPlatformOwner: true },
  });

  if (!target || target.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Super admin not found." }, { status: 404 });
  }
  if (target.isPlatformOwner) {
    return NextResponse.json(
      { error: "The platform owner account cannot be deactivated." },
      { status: 409 }
    );
  }

  const { isActive } = parsed.data;

  const admin = await prisma.user.update({
    where:  { id: params.id },
    data:   { isActive },
    select: {
      id: true, email: true, isActive: true,
      isPlatformOwner: true, createdAt: true, updatedAt: true,
    },
  });

  // Kill live sessions so a deactivated admin is out now, not in seven days.
  if (!isActive) {
    await prisma.session.deleteMany({ where: { userId: params.id } });
  }

  await logAudit(
    owner.id,
    isActive ? "SUPER_ADMIN_REACTIVATED" : "SUPER_ADMIN_DEACTIVATED",
    "user",
    params.id,
    { email: target.email }
  );

  return NextResponse.json({ admin });
}
