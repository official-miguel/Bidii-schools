/**
 * GET    /api/library/policies/[id]  — fetch one policy
 * PATCH  /api/library/policies/[id]  — update a policy by ID
 * DELETE /api/library/policies/[id]  — remove a policy
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

type Params = { params: { id: string } };

async function guard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"));
}
async function manageGuard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"));
}

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const policy = await prisma.libraryPolicy.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!policy) return NextResponse.json({ error: "Policy not found." }, { status: 404 });
  return NextResponse.json(policy);
}

const patchSchema = z.object({
  label:               z.string().trim().optional(),
  maxBooksAllowed:     z.coerce.number().int().min(1).max(50).optional(),
  borrowDays:          z.coerce.number().int().min(1).max(365).optional(),
  gracePeriodDays:     z.coerce.number().int().min(0).max(30).optional(),
  finePerDay:          z.coerce.number().min(0).max(10000).optional(),
  countWeekends:       z.boolean().optional(),
  countHolidays:       z.boolean().optional(),
  maxRenewals:         z.coerce.number().int().min(0).max(20).optional(),
  fineBlockThreshold:  z.coerce.number().min(0).optional(),
  lostBookMultiplier:  z.coerce.number().min(0).optional(),
  lostBookFixedFee:    z.coerce.number().min(0).optional(),
  damagedBookFineRate: z.coerce.number().min(0).max(5).optional(),
  reservationsAllowed: z.boolean().optional(),
  isActive:            z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const policy = await prisma.libraryPolicy.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!policy) return NextResponse.json({ error: "Policy not found." }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  // Build sparse update (only provided fields)
  const data: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.label               !== undefined) data.label               = d.label;
  if (d.maxBooksAllowed     !== undefined) data.maxBooksAllowed     = d.maxBooksAllowed;
  if (d.borrowDays          !== undefined) data.borrowDays          = d.borrowDays;
  if (d.gracePeriodDays     !== undefined) data.gracePeriodDays     = d.gracePeriodDays;
  if (d.finePerDay          !== undefined) data.finePerDay          = d.finePerDay;
  if (d.countWeekends       !== undefined) data.countWeekends       = d.countWeekends;
  if (d.countHolidays       !== undefined) data.countHolidays       = d.countHolidays;
  if (d.maxRenewals         !== undefined) data.maxRenewals         = d.maxRenewals;
  if (d.fineBlockThreshold  !== undefined) data.fineBlockThreshold  = d.fineBlockThreshold;
  if (d.lostBookMultiplier  !== undefined) data.lostBookMultiplier  = d.lostBookMultiplier;
  if (d.lostBookFixedFee    !== undefined) data.lostBookFixedFee    = d.lostBookFixedFee;
  if (d.damagedBookFineRate !== undefined) data.damagedBookFineRate = d.damagedBookFineRate;
  if (d.reservationsAllowed !== undefined) data.reservationsAllowed = d.reservationsAllowed;
  if (d.isActive            !== undefined) data.isActive            = d.isActive;

  const updated = await prisma.libraryPolicy.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const policy = await prisma.libraryPolicy.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
  });
  if (!policy) return NextResponse.json({ error: "Policy not found." }, { status: 404 });
  await prisma.libraryPolicy.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}