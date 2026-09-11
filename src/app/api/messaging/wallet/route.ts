/**
 * GET /api/messaging/wallet
 *
 * Returns the current school's SMS wallet balance.
 * Used by the Composer to show live balance + estimate cost before sending.
 *
 * Returns { unitsRemaining, lowBalanceThreshold } or
 *         { unitsRemaining: 0, lowBalanceThreshold: 50 } if no wallet row exists yet.
 */

import { NextResponse }           from "next/server";
import { requireSchoolPermission } from "@/lib/permissions";
import { prisma }                  from "@/lib/prisma";

export async function GET() {
  const user = await requireSchoolPermission("COMMUNICATION", "manage");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wallet = await prisma.schoolSmsWallet.findUnique({
    where:  { schoolId: user.schoolId! },
    select: { unitsRemaining: true, lowBalanceThreshold: true },
  });

  return NextResponse.json({
    unitsRemaining:      wallet?.unitsRemaining      ?? 0,
    lowBalanceThreshold: wallet?.lowBalanceThreshold ?? 50,
  });
}
