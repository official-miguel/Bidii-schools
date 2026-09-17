/**
 * GET  /api/super-admin/profile — the signed-in owner's own email + phone.
 * PATCH /api/super-admin/profile — update them.
 *
 * Platform owner only — this is their own account, not a school's. Every
 * other role's contact details live on Teacher/Parent; SUPER_ADMIN has
 * neither, hence User.phone existing purely for this.
 */

import { NextRequest, NextResponse }        from "next/server";
import { z }                                from "zod";
import { prisma }                           from "@/lib/prisma";
import { requireSuperAdminOwner, logAudit } from "@/lib/super-admin";
import { toE164Kenya }                      from "@/lib/phone";

export async function GET() {
  const owner = await requireSuperAdminOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    profile: { id: owner.id, email: owner.email, phone: owner.phone },
  });
}

const updateSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z.string().trim().optional().or(z.literal("")),
});

export async function PATCH(req: NextRequest) {
  const owner = await requireSuperAdminOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { email } = parsed.data;

  // Kenyan numbers are stored in the canonical E.164 shape; anything that
  // doesn't look Kenyan is kept as typed rather than rejected outright.
  const rawPhone = parsed.data.phone?.trim() || "";
  const phone = rawPhone ? (toE164Kenya(rawPhone) ?? rawPhone) : null;

  // Super admins have schoolId: null, so the (schoolId, email) unique index
  // doesn't actually enforce anything across them — check by hand, same as
  // the create-admin route.
  if (email !== owner.email) {
    const existing = await prisma.user.findFirst({
      where:  { email, schoolId: null, id: { not: owner.id } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "Another super admin already uses that email." }, { status: 409 });
    }
  }

  const updated = await prisma.user.update({
    where:  { id: owner.id },
    data:   { email, phone },
    select: { id: true, email: true, phone: true },
  });

  await logAudit(owner.id, "OWNER_PROFILE_UPDATED", "user", owner.id, { email, phone });

  return NextResponse.json({ profile: updated });
}
