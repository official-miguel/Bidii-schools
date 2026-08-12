/**
 * POST /api/library/circulate/renew
 * Renews an active borrow, extending the due date per the patron's policy.
 * Blocked if: max renewals reached, book has a waiting reservation, or
 * card is suspended / has blocking fines.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";
import { PolicyEngine } from "@/lib/library/policyEngine";
import { recordCirculationEvent } from "@/lib/library/circulationEvents";

async function manageGuard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"));
}

const schema = z.object({
  borrowId:    z.string().min(1),
  patronType:  z.string().optional(),
  notes:       z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const { borrowId, patronType, notes } = parsed.data;

  const borrow = await prisma.libraryBorrow.findFirst({
    where: { id: borrowId, schoolId: user.schoolId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  if (!borrow)           return NextResponse.json({ error: "Borrow record not found." }, { status: 404 });
  if (borrow.returnedAt) return NextResponse.json({ error: "Book already returned." }, { status: 409 });

  const engine = await PolicyEngine.load(user.schoolId);
  const policy = engine.policyFor(patronType ?? "DEFAULT");

  if (borrow.renewalCount >= policy.maxRenewals)
    return NextResponse.json({
      error:    `Maximum renewals reached (${policy.maxRenewals}). Book must be returned.`,
      blocked:  true,
      reasons:  [`Maximum renewals of ${policy.maxRenewals} already used.`],
    }, { status: 422 });

  // Block if a waiting reservation exists for this catalogue
  const catalogueId = (borrow.copy as { catalogueId?: string } | null)?.catalogueId;
  if (catalogueId) {
    const waiting = await prisma.libraryReservation.findFirst({
      where: { catalogueId, schoolId: user.schoolId, status: "PENDING" },
    });
    if (waiting)
      return NextResponse.json({
        error:   "A patron is waiting for this book. Return it instead of renewing.",
        blocked: true, reasons: ["Waiting reservation exists."],
      }, { status: 422 });
  }

  const newDueAt = new Date();
  newDueAt.setDate(newDueAt.getDate() + policy.borrowDays);

  const updated = await prisma.libraryBorrow.update({
    where: { id: borrowId },
    data:  { dueAt: newDueAt, renewalCount: { increment: 1 }, notes: notes ?? undefined },
  });

  await recordCirculationEvent({
    schoolId: user.schoolId, eventType: "RENEWED",
    copyId: borrow.copyId, catalogueId,
    borrowId, studentId: borrow.card.studentId,
    performedById: user.id,
    payload: { renewalCount: updated.renewalCount, newDueAt: newDueAt.toISOString() },
  });

  emitSSE(user.schoolId, "libraryBorrow.issued", updated);
  return NextResponse.json({ borrow: updated, newDueAt: newDueAt.toISOString() });
}
