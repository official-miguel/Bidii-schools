/**
 * GET  /api/library/policies  — list all policies for this school
 * POST /api/library/policies  — create or upsert a patron-type policy
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function guard() { return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","view")); }
async function manageGuard() { return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","manage")); }

export async function GET(_req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const policies = await prisma.libraryPolicy.findMany({
    where: { schoolId: user.schoolId! },
    orderBy: { patronType: "asc" },
  });
  return NextResponse.json(policies);
}

const schema = z.object({
  patronType:          z.enum(["DEFAULT","STUDENT","TEACHER","BOARDING","DAY_SCHOLAR","JUNIOR","SENIOR"]),
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

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const d = parsed.data;
  const data = {
    label:               d.label               ?? null,
    maxBooksAllowed:     d.maxBooksAllowed      ?? 3,
    borrowDays:          d.borrowDays           ?? 14,
    gracePeriodDays:     d.gracePeriodDays      ?? 0,
    finePerDay:          d.finePerDay           ?? 5,
    countWeekends:       d.countWeekends        ?? true,
    countHolidays:       d.countHolidays        ?? false,
    maxRenewals:         d.maxRenewals          ?? 1,
    fineBlockThreshold:  d.fineBlockThreshold   ?? 0,
    lostBookMultiplier:  d.lostBookMultiplier   ?? 1,
    lostBookFixedFee:    d.lostBookFixedFee     ?? 500,
    damagedBookFineRate: d.damagedBookFineRate  ?? 0.3,
    reservationsAllowed: d.reservationsAllowed  ?? true,
    isActive:            d.isActive             ?? true,
  };

  const policy = await prisma.libraryPolicy.upsert({
    where: { schoolId_patronType: { schoolId: user.schoolId!, patronType: d.patronType as never } },
    create: { schoolId: user.schoolId!, patronType: d.patronType as never, ...data },
    update: data,
  });

  return NextResponse.json(policy, { status: 201 });
}
