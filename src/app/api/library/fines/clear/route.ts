/**
 * POST /api/library/fines/clear
 *
 * Permission-controlled fine clearance. Records the responsible user,
 * date/time and mandatory reason in LibraryFineAudit.
 * Only PRINCIPAL or users with LIBRARY manage permission can call this.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";
import { recordFineAudit } from "@/lib/library/circulationEvents";

async function manageGuard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","manage"));
}

const schema = z.object({
  cardId:  z.string().min(1),
  reason:  z.string().trim().min(3, "A reason of at least 3 characters is required."),
  amount:  z.coerce.number().min(0).optional(), // null = clear all
});

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const { cardId, reason, amount } = parsed.data;

  const card = await prisma.libraryCard.findFirst({
    where: { id: cardId, schoolId: user.schoolId! },
  });
  if (!card) return NextResponse.json({ error: "Library card not found." }, { status: 404 });
  if (card.fineBalance <= 0)
    return NextResponse.json({ error: "No outstanding fine to clear." }, { status: 409 });

  const clearAmount  = amount != null ? Math.min(amount, card.fineBalance) : card.fineBalance;
  const balanceAfter = card.fineBalance - clearAmount;

  const updated = await prisma.libraryCard.update({
    where: { id: cardId },
    data: { fineBalance: balanceAfter },
  });

  await recordFineAudit({
    schoolId: user.schoolId!,
    cardId,
    eventType:     "CLEAR",
    amount:        -clearAmount,
    balanceAfter,
    reason,
    performedById: user.id,
  });

  emitSSE(user.schoolId!, "libraryCard.updated", updated);
  return NextResponse.json({ ok: true, cleared: clearAmount, balanceAfter });
}
