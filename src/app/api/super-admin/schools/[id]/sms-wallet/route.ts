/**
 * GET  /api/super-admin/schools/[id]/sms-wallet
 *   Returns SchoolSmsWallet + recent transactions (paginated).
 *
 * POST /api/super-admin/schools/[id]/sms-wallet
 *   Allocates units (TOPUP). Atomically increments balance + inserts ledger row.
 */

import { NextRequest, NextResponse }       from "next/server";
import { z }                               from "zod";
import { prisma }                          from "@/lib/prisma";
import { requireSuperAdmin, logAudit }     from "@/lib/super-admin";

const PAGE_SIZE = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));

  const wallet = await prisma.schoolSmsWallet.findUnique({
    where: { schoolId: params.id },
  });

  const [transactions, total] = await Promise.all([
    prisma.smsWalletTransaction.findMany({
      where:   { schoolId: params.id },
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * PAGE_SIZE,
      take:    PAGE_SIZE,
    }),
    prisma.smsWalletTransaction.count({ where: { schoolId: params.id } }),
  ]);

  return NextResponse.json({
    wallet: wallet ?? {
      schoolId:               params.id,
      unitsRemaining:         0,
      unitsLifetimeAllocated: 0,
      lowBalanceThreshold:    50,
    },
    transactions,
    total,
    page,
    pageSize: PAGE_SIZE,
  });
}

const topupSchema = z.object({
  units: z.number().int().positive("Units must be a positive integer."),
  note:  z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireSuperAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body   = await req.json().catch(() => null);
  const parsed = topupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { units, note } = parsed.data;

  // Verify school exists
  const school = await prisma.school.findUnique({
    where:  { id: params.id },
    select: { id: true },
  });
  if (!school) return NextResponse.json({ error: "School not found." }, { status: 404 });

  const wallet = await prisma.$transaction(async (tx) => {
    // Upsert wallet row (creates it on first top-up if it didn't exist yet)
    const updated = await tx.schoolSmsWallet.upsert({
      where:  { schoolId: params.id },
      create: {
        schoolId:               params.id,
        unitsRemaining:         units,
        unitsLifetimeAllocated: units,
        lowBalanceThreshold:    50,
      },
      update: {
        unitsRemaining:         { increment: units },
        unitsLifetimeAllocated: { increment: units },
      },
      select: { unitsRemaining: true, unitsLifetimeAllocated: true, lowBalanceThreshold: true },
    });

    // Append-only ledger row
    await tx.smsWalletTransaction.create({
      data: {
        schoolId:          params.id,
        type:              "TOPUP",
        units,
        reason:            "admin_topup",
        reference:         note ?? null,
        balanceAfter:      updated.unitsRemaining,
        performedByUserId: user.id,
      },
    });

    return updated;
  });

  await logAudit(user.id, "SMS_WALLET_TOPUP", "school", params.id, { units, note });

  return NextResponse.json({ wallet });
}
