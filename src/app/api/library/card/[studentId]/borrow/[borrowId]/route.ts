import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";

async function manageGuard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"))
  );
}

const actionSchema = z.object({
  action: z.enum(["return", "stop_fine", "pay_fine"]),
  /** Only used for pay_fine: amount being paid */
  amount: z.coerce.number().min(0).optional(),
});

/** PATCH /api/library/card/[studentId]/borrow/[borrowId]
 *  Handles three librarian actions on a single borrow row:
 *   - return     : mark book as returned, compute fine, update card.fineBalance
 *   - stop_fine  : freeze the fine counter (fineStoppedAt = now)
 *   - pay_fine   : record a fine payment on the card (reduces fineBalance)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { studentId: string; borrowId: string } }
) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const borrow = await prisma.libraryBorrow.findFirst({
    where: { id: params.borrowId },
    include: { card: true },
  });

  if (!borrow || borrow.card.studentId !== params.studentId || borrow.schoolId !== user.schoolId) {
    return NextResponse.json({ error: "Borrow record not found." }, { status: 404 });
  }

  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message || "Invalid input." },
      { status: 400 }
    );
  }

  const settings = await prisma.librarySettings.findUnique({
    where: { schoolId: user.schoolId },
  });
  const finePerDay = settings?.finePerDay ?? 5.0;

  const { action, amount } = parsed.data;

  if (action === "return") {
    if (borrow.returnedAt) {
      return NextResponse.json({ error: "Book already returned." }, { status: 409 });
    }
    const now = new Date();
    // Fine accrues from dueAt to fineStoppedAt (if set) or now
    const fineEndDate = borrow.fineStoppedAt ?? now;
    const msOverdue = Math.max(0, fineEndDate.getTime() - borrow.dueAt.getTime());
    const daysOverdue = Math.floor(msOverdue / (1000 * 60 * 60 * 24));
    const fine = daysOverdue * finePerDay;

    const [updatedBorrow] = await prisma.$transaction([
      prisma.libraryBorrow.update({
        where: { id: params.borrowId },
        data: { returnedAt: now, fineAmount: fine },
        include: { book: { select: { id: true, title: true, author: true } } },
      }),
      prisma.libraryCard.update({
        where: { id: borrow.cardId },
        data: { fineBalance: { increment: fine } },
      }),
    ]);

    emitSSE(user.schoolId, "libraryBorrow.returned", updatedBorrow);
    // Re-fetch card to emit current fineBalance to all tabs.
    const refreshedCard = await prisma.libraryCard.findUnique({ where: { id: borrow.cardId } });
    if (refreshedCard) emitSSE(user.schoolId, "libraryCard.updated", refreshedCard);

    return NextResponse.json(updatedBorrow);
  }

  if (action === "stop_fine") {
    if (borrow.returnedAt) {
      return NextResponse.json({ error: "Book already returned." }, { status: 409 });
    }
    if (borrow.fineStoppedAt) {
      return NextResponse.json({ error: "Fine already stopped." }, { status: 409 });
    }
    const updated = await prisma.libraryBorrow.update({
      where: { id: params.borrowId },
      data: { fineStoppedAt: new Date() },
      include: { book: { select: { id: true, title: true, author: true } } },
    });
    emitSSE(user.schoolId, "libraryBorrow.returned", updated); // reuse event — client merges the row
    return NextResponse.json(updated);
  }

  if (action === "pay_fine") {
    const payment = amount ?? 0;
    if (payment <= 0) {
      return NextResponse.json({ error: "Payment amount must be greater than 0." }, { status: 400 });
    }
    if (borrow.card.fineBalance <= 0) {
      return NextResponse.json({ error: "No outstanding fine on this card." }, { status: 409 });
    }
    const actualPayment = Math.min(payment, borrow.card.fineBalance);
    const updatedCard = await prisma.libraryCard.update({
      where: { id: borrow.cardId },
      data: {
        fineBalance: { decrement: actualPayment },
        totalFinesPaid: { increment: actualPayment },
      },
    });
    emitSSE(user.schoolId, "libraryCard.updated", updatedCard);
    return NextResponse.json({ ok: true, newBalance: updatedCard.fineBalance, paid: actualPayment });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
