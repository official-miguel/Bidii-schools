/**
 * POST /api/library/circulate/return
 *
 * Handles all return types:
 *   NORMAL            — book returned in same/better condition
 *   DAMAGED           — book returned damaged; fine calculated on damage rate
 *   LOST              — book declared lost; replacement fee charged
 *   REPLACEMENT_RECEIVED — lost book replaced by student; fine cleared
 *   OVERRIDE          — manual override with mandatory reason
 *
 * Every return writes a LibraryFineAudit row and a LibraryCirculationEvent.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";
import { PolicyEngine, computeFine } from "@/lib/library/policyEngine";
import { recordCirculationEvent, recordFineAudit } from "@/lib/library/circulationEvents";

async function manageGuard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"));
}

const schema = z.object({
  borrowId:        z.string().min(1),
  returnType:      z.enum(["NORMAL","DAMAGED","LOST","REPLACEMENT_RECEIVED","OVERRIDE"]).default("NORMAL"),
  returnCondition: z.enum(["EXCELLENT","GOOD","FAIR","DAMAGED","LOST"]).optional(),
  notes:           z.string().trim().optional(),
  overrideReason:  z.string().trim().optional(),
  patronType:      z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const { borrowId, returnType, returnCondition, notes, overrideReason, patronType } = parsed.data;

  // ── Load borrow ──────────────────────────────────────────────────────────
  const borrow = await prisma.libraryBorrow.findFirst({
    where: { id: borrowId, schoolId: user.schoolId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  if (!borrow)          return NextResponse.json({ error: "Borrow record not found." }, { status: 404 });
  if (borrow.returnedAt) return NextResponse.json({ error: "Book already returned." }, { status: 409 });

  if (returnType === "OVERRIDE" && !overrideReason?.trim())
    return NextResponse.json({ error: "Override reason is required." }, { status: 400 });

  // ── Policy engine ────────────────────────────────────────────────────────
  const engine      = await PolicyEngine.load(user.schoolId);
  const policy      = engine.policyFor(patronType ?? "DEFAULT");
  const finePaused  = engine.isFinePaused(borrow.card.studentId);
  const now         = new Date();

  // ── Compute overdue fine ─────────────────────────────────────────────────
  const fineEndDate   = borrow.fineStoppedAt ?? now;
  let overdueFine     = finePaused ? 0 : computeFine({ dueAt: borrow.dueAt, endDate: fineEndDate, policy });

  // ── Compute special fines ────────────────────────────────────────────────
  let specialFine = 0;
  const costPerCopy = (borrow.copy as { catalogue?: { costPerCopy?: number | null } } | null)?.catalogue?.costPerCopy ?? 0;

  if (returnType === "LOST") {
    specialFine = costPerCopy > 0
      ? costPerCopy * policy.lostBookMultiplier
      : policy.lostBookFixedFee;
    overdueFine = 0; // No overdue fine on lost books
  } else if (returnType === "DAMAGED") {
    specialFine = finePaused ? 0 : costPerCopy * policy.damagedBookFineRate;
  } else if (returnType === "REPLACEMENT_RECEIVED") {
    overdueFine = 0;
    specialFine = 0;
  }

  const totalFine = overdueFine + specialFine;

  // ── New copy status ──────────────────────────────────────────────────────
  let newCopyStatus: "AVAILABLE" | "ARCHIVED" = "AVAILABLE";
  let newCopyCondition = returnCondition ?? borrow.copy?.condition ?? "GOOD";
  if (returnType === "LOST") {
    newCopyStatus    = "ARCHIVED";
    newCopyCondition = "LOST";
  } else if (returnType === "DAMAGED") {
    newCopyCondition = "DAMAGED";
  }

  // ── Transaction ──────────────────────────────────────────────────────────
  const [updatedBorrow, updatedCard] = await prisma.$transaction(async (tx) => {
    const ub = await tx.libraryBorrow.update({
      where: { id: borrowId },
      data: {
        returnedAt:     now,
        fineAmount:     totalFine,
        returnType:     returnType,
        returnCondition: newCopyCondition,
        notes:          notes ?? null,
        isOverride:     returnType === "OVERRIDE",
        overrideReason: overrideReason ?? null,
        overrideById:   returnType === "OVERRIDE" ? user.id : null,
      },
    });

    if (borrow.copyId) {
      await tx.libraryCopy.update({
        where: { id: borrow.copyId },
        data: {
          status:    newCopyStatus as never,
          condition: newCopyCondition as never,
          ...(newCopyStatus === "ARCHIVED" && {
            archivedAt:    now,
            archiveReason: returnType === "LOST" ? "LOST" : "DAMAGED_BEYOND_REPAIR",
          }),
        },
      });
    }

    const uc = await tx.libraryCard.update({
      where: { id: borrow.cardId },
      data: {
        currentBorrowCount: { decrement: 1 },
        fineBalance:        { increment: totalFine },
      },
    });

    return [ub, uc];
  });

  // ── Fine audit ───────────────────────────────────────────────────────────
  if (totalFine > 0) {
    await recordFineAudit({
      schoolId:      user.schoolId,
      cardId:        borrow.cardId,
      borrowId:      borrowId,
      eventType:     "CHARGE",
      amount:        totalFine,
      balanceAfter:  updatedCard.fineBalance,
      reason:        returnType === "LOST" ? "Lost book replacement fee" : returnType === "DAMAGED" ? "Damaged book fine" : "Overdue fine",
      performedById: user.id,
    });
  }

  // ── Circulation event ────────────────────────────────────────────────────
  await recordCirculationEvent({
    schoolId:      user.schoolId,
    eventType:     returnType === "LOST" ? "LOST_REPORTED" : returnType === "REPLACEMENT_RECEIVED" ? "REPLACEMENT_RECEIVED" : "RETURNED",
    copyId:        borrow.copyId,
    catalogueId:   (borrow.copy as { catalogueId?: string } | null)?.catalogueId ?? null,
    borrowId,
    studentId:     borrow.card.studentId,
    performedById: user.id,
    payload: { returnType, returnCondition: newCopyCondition, overdueFine, specialFine, totalFine, finePaused },
  });

  // ── Check if a waiting reservation should be allocated ──────────────────
  if (newCopyStatus === "AVAILABLE" && borrow.copyId) {
    const catalogueId = (borrow.copy as { catalogueId?: string } | null)?.catalogueId;
    if (catalogueId) {
      const nextWaiting = await prisma.libraryReservation.findFirst({
        where: { catalogueId, schoolId: user.schoolId, status: "PENDING", reservationType: "INDIVIDUAL" },
        orderBy: [{ queuePosition: "asc" }, { createdAt: "asc" }],
      });
      if (nextWaiting) {
        await prisma.libraryReservation.update({
          where: { id: nextWaiting.id },
          data:  { status: "ACTIVE", allocatedCopyId: borrow.copyId },
        });
        await prisma.libraryCopy.update({
          where: { id: borrow.copyId! },
          data:  { status: "RESERVED" },
        });
        emitSSE(user.schoolId, "libraryBorrow.returned", { reservationActivated: true, reservationId: nextWaiting.id });
      }
    }
  }

  emitSSE(user.schoolId, "libraryBorrow.returned", updatedBorrow);
  emitSSE(user.schoolId, "libraryCard.updated",   updatedCard);

  return NextResponse.json({
    borrow:      updatedBorrow,
    card:        updatedCard,
    overdueFine, specialFine, totalFine,
    finePaused,
    returnType,
    newCopyStatus,
    newCopyCondition,
  });
}
