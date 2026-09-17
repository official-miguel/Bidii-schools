/**
 * Super-admin accounts — platform owner only.
 *
 *   GET  — list every super admin
 *   POST — create a new one
 *
 * An ordinary super admin can run the rest of the console but cannot reach
 * this route: only the owner may mint new super admins, which is why every
 * handler here guards with requireSuperAdminOwner() rather than
 * requireSuperAdmin().
 */

import { NextRequest, NextResponse } from "next/server";
import { z }                         from "zod";
import { prisma }                    from "@/lib/prisma";
import { hashPassword }              from "@/lib/auth";
import { requireSuperAdminOwner, logAudit } from "@/lib/super-admin";

const listSelect = {
  id:              true,
  email:           true,
  isActive:        true,
  isPlatformOwner: true,
  createdAt:       true,
  updatedAt:       true,
} as const;

export async function GET() {
  const owner = await requireSuperAdminOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admins = await prisma.user.findMany({
    where:   { role: "SUPER_ADMIN" },
    select:  listSelect,
    orderBy: [{ isPlatformOwner: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ admins, currentUserId: owner.id });
}

const createSchema = z.object({
  email:    z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(req: NextRequest) {
  const owner = await requireSuperAdminOwner();
  if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // Super admins have no schoolId, so the (schoolId, email) unique index does
  // not cover them — check explicitly instead of relying on a P2002.
  const existing = await prisma.user.findFirst({
    where:  { email, schoolId: null },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "A super admin with that email already exists." }, { status: 409 });
  }

  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash:       await hashPassword(password),
      role:               "SUPER_ADMIN",
      schoolId:           null,
      // The new admin picks their own password on first login; ownership is
      // never granted here — there is exactly one owner.
      mustChangePassword: true,
      isPlatformOwner:    false,
    },
    select: listSelect,
  });

  await logAudit(owner.id, "SUPER_ADMIN_CREATED", "user", admin.id, { email });

  return NextResponse.json({ admin }, { status: 201 });
}
