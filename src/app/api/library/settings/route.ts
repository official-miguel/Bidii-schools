/**
 * GET /api/library/settings   — read library settings
 * PUT /api/library/settings   — upsert library settings
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function guard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"))
  );
}

const DEFAULT_SETTINGS = {
  maxBooksPerStudent:  3,
  maxBorrowDays:       14,
  finePerDay:          5.0,
  maxRenewals:         1,
  identificationMethod:"MANUAL",
  barcodeEnabled:      false,
  eligibleFromForm:    null,
  cardValidityDays:    null,
  overdueAlertDays:    7,
};

export async function GET() {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await prisma.librarySettings.findUnique({
    where: { schoolId: user.schoolId },
  });

  return NextResponse.json(settings ?? { ...DEFAULT_SETTINGS, updatedAt: null });
}

const updateSchema = z.object({
  maxBooksPerStudent:  z.coerce.number().int().min(1).max(20),
  maxBorrowDays:       z.coerce.number().int().min(1).max(365),
  finePerDay:          z.coerce.number().min(0).max(10_000),
  maxRenewals:         z.coerce.number().int().min(0).max(10).optional(),
  identificationMethod:z.enum(["MANUAL", "QR_CAMERA", "QR_HARDWARE"]).optional(),
  barcodeEnabled:      z.boolean().optional(),
  eligibleFromForm:    z.coerce.number().int().min(1).max(8).optional().nullable(),
  cardValidityDays:    z.coerce.number().int().min(1).max(3650).optional().nullable(),
  overdueAlertDays:    z.coerce.number().int().min(1).max(365).optional(),
});

export async function PUT(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );

  const d = parsed.data;
  const settings = await prisma.librarySettings.upsert({
    where:  { schoolId: user.schoolId },
    create: { schoolId: user.schoolId, ...d, identificationMethod: (d.identificationMethod ?? "MANUAL") as never },
    update: {
      maxBooksPerStudent:   d.maxBooksPerStudent,
      maxBorrowDays:        d.maxBorrowDays,
      finePerDay:           d.finePerDay,
      ...(d.maxRenewals         !== undefined && { maxRenewals:         d.maxRenewals }),
      ...(d.identificationMethod !== undefined && { identificationMethod: d.identificationMethod as never }),
      ...(d.barcodeEnabled      !== undefined && { barcodeEnabled:      d.barcodeEnabled }),
      ...(d.eligibleFromForm    !== undefined && { eligibleFromForm:    d.eligibleFromForm }),
      ...(d.cardValidityDays    !== undefined && { cardValidityDays:    d.cardValidityDays }),
      ...(d.overdueAlertDays    !== undefined && { overdueAlertDays:    d.overdueAlertDays }),
    },
  });

  return NextResponse.json(settings);
}
