/**
 * POST /api/library/circulate/return
 *
 * Handles all return types:
 *   NORMAL            — book returned in good condition; copy → AVAILABLE
 *   DAMAGED           — book returned damaged; copy → UNDER_REPAIR, fine calculated
 *   LOST              — book declared lost; replacement fee charged; copy → ARCHIVED
 *   REPLACEMENT_RECEIVED — lost book replaced by student; fine cleared
 *   OVERRIDE          — manual override with mandatory reason
 *
 * Every return writes a LibraryFineAudit row and a LibraryCirculationEvent.
 * On NORMAL/REPLACEMENT_RECEIVED returns, checks for waiting reservations
 * and auto-assigns the copy to the next PENDING INDIVIDUAL patron if found.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { emitSSE } from "@/lib/sse";
import { PolicyEngine, computeFine } from "@/lib/library/policyEngine";
import { recordCirculationEvent, recordFineAudit } from "@/lib/library/circulationEvents";
import { loadBorrowWithRelations } from "@/lib/library/borrowHelper";

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

  // ── Load borrow with all required relations ──────────────────────────────
  const borrow = await loadBorrowWithRelations(borrowId, user.schoolId!);
  if (!borrow)           return NextResponse.json({ error: "Borrow record not found." }, { status: 404 });
  if (borrow.returnedAt) return NextResponse.json({ error: "Book already returned." }, { status: 409 });
  if (!borrow.copy)      return NextResponse.json({ error: "Copy data unavailable for this borrow." }, { status: 422 });
  if (!borrow.card)      return NextResponse.json({ error: "Card data unavailable for this borrow." }, { status: 422 });

  if (returnType === "OVERRIDE" && !overrideReason?.trim())
    return NextResponse.json({ error: "Override reason is required." }, { status: 400 });

  // ── Policy engine ────────────────────────────────────────────────────────
  const engine     = await PolicyEngine.load(user.schoolId!);
  const policy     = engine.policyFor(patronType ?? "DEFAULT");
  const finePaused = engine.isFinePaused(borrow.card.studentId);
  const now        = new Date();

  // ── Compute overdue fine ─────────────────────────────────────────────────
  const fineEndDate = borrow.fineStoppedAt ?? now;
  let overdueFine   = finePaused ? 0 : computeFine({ dueAt: borrow.dueAt, endDate: fineEndDate, policy });

  // ── Compute special fines ────────────────────────────────────────────────
  let specialFine = 0;
  const costPerCopy = borrow.copy.catalogue?.costPerCopy ?? 0;

  if (returnType === "LOST") {
    specialFine = costPerCopy > 0
      ? costPerCopy * policy.lostBookMultiplier
      : policy.lostBookFixedFee;
    overdueFine = 0;
  } else if (returnType === "DAMAGED") {
    specialFine = finePaused ? 0 : costPerCopy * policy.damagedBookFineRate;
  } else if (returnType === "REPLACEMENT_RECEIVED") {
    overdueFine = 0;
    specialFine = 0;
  }

  const totalFine = overdueFine + specialFine;

  // ── Determine new copy status ─────────────────────────────────────────────
  // NORMAL / REPLACEMENT_RECEIVED / OVERRIDE → AVAILABLE (may become RESERVED after auto-assign)
  // DAMAGED → UNDER_REPAIR (never enters reservation queue)
  // LOST    → ARCHIVED
  type CopyStatus = "AVAILABLE" | "UNDER_REPAIR" | "ARCHIVED";
  let newCopyStatus: CopyStatus = "AVAILABLE";
  let newCopyCondition = returnCondition ?? (borrow.copy.condition as string) ?? "GOOD";

  if (returnType === "LOST") {
    newCopyStatus    = "ARCHIVED";
    newCopyCondition = "LOST";
  } else if (returnType === "DAMAGED") {
    newCopyStatus    = "UNDER_REPAIR";
    newCopyCondition = "DAMAGED";
  }

  // ── Capture for post-transaction SSE ─────────────────────────────────────
  let activatedReservationId: string | null = null;
  let activatedStudentId: string | null = null;
  let activatedStudentName: string | null = null;

  // ── Transaction ───────────────────────────────────────────────────────────
  const [updatedBorrow, updatedCard] = await prisma.$transaction(async (tx) => {
    const ub = await tx.libraryBorrow.update({
      where: { id: borrowId },
      data: {
        returnedAt:      now,
        fineAmount:      totalFine,
        returnType:      returnType,
        returnCondition: newCopyCondition,
        notes:           notes ?? null,
        isOverride:      returnType === "OVERRIDE",
        overrideReason:  overrideReason ?? null,
        overrideById:    returnType === "OVERRIDE" ? user.id : null,
      },
    });

    await tx.libraryCopy.update({
      where: { id: borrow.copy!.id },
      data: {
        status:    newCopyStatus as never,
        condition: newCopyCondition as never,
        ...(newCopyStatus === "ARCHIVED" && {
          archivedAt:    now,
          archiveReason: returnType === "LOST" ? "LOST" : "DAMAGED_BEYOND_REPAIR",
        }),
      },
    });

    const uc = await tx.libraryCard.update({
      where: { id: borrow.card!.id },
      data: {
        currentBorrowCount: { decrement: 1 },
        fineBalance:        { increment: totalFine },
      },
    });

    // ── Auto-assign next reservation (only for AVAILABLE copies) ──────────
    if (newCopyStatus === "AVAILABLE") {
      const catalogueId = borrow.copy!.catalogueId;
      const next = await tx.libraryReservation.findFirst({
        where: {
          catalogueId,
          schoolId:        user.schoolId!,
          status:          "PENDING",
          reservationType: "INDIVIDUAL",
        },
        orderBy: [
          { queuePosition: { sort: "asc", nulls: "last" } },
          { createdAt: "asc" },
        ],
      });

      if (next) {
        await tx.libraryReservation.update({
          where: { id: next.id },
          data:  { status: "ACTIVE", allocatedCopyId: borrow.copy!.id },
        });
        await tx.libraryCopy.update({
          where: { id: borrow.copy!.id },
          data:  { status: "RESERVED" },
        });
        activatedReservationId = next.id;
        activatedStudentId     = next.studentId;
      }
    }

    return [ub, uc] as const;
  });

  // ── Fetch student name for SSE payload (outside transaction) ─────────────
  if (activatedStudentId) {
    const st = await prisma.student.findUnique({
      where:  { id: activatedStudentId },
      select: { fullName: true },
    });
    activatedStudentName = st?.fullName ?? null;
  }

  // ── Fine audit ────────────────────────────────────────────────────────────
  if (totalFine > 0) {
    await recordFineAudit({
      schoolId:      user.schoolId!,
      cardId:        borrow.card.id,
      borrowId,
      eventType:     "CHARGE",
      amount:        totalFine,
      balanceAfter:  updatedCard.fineBalance,
      reason:
        returnType === "LOST"    ? "Lost book replacement fee" :
        returnType === "DAMAGED" ? "Damaged book fine"         : "Overdue fine",
      performedById: user.id,
    });
  }

  // ── Circulation event ─────────────────────────────────────────────────────
  await recordCirculationEvent({
    schoolId:      user.schoolId!,
    eventType:
      returnType === "LOST"                 ? "LOST_REPORTED"         :
      returnType === "REPLACEMENT_RECEIVED" ? "REPLACEMENT_RECEIVED"  : "RETURNED",
    copyId:        borrow.copy.id,
    catalogueId:   borrow.copy.catalogueId ?? null,
    borrowId,
    studentId:     borrow.card.studentId,
    performedById: user.id,
    payload: { returnType, returnCondition: newCopyCondition, overdueFine, specialFine, totalFine, finePaused },
  });

  // ── Post-transaction SSE ──────────────────────────────────────────────────
  if (activatedReservationId) {
    emitSSE(user.schoolId!, "libraryReservation.activated", {
      reservationId: activatedReservationId,
      studentId:     activatedStudentId,
      catalogueId:   borrow.copy.catalogueId,
      copyId:        borrow.copy.id,
      title:         borrow.copy.catalogue?.title ?? "",
      studentName:   activatedStudentName,
    });
  }

  emitSSE(user.schoolId!, "libraryBorrow.returned", updatedBorrow);
  emitSSE(user.schoolId!, "libraryCard.updated",    updatedCard);

  return NextResponse.json({
    borrow:          updatedBorrow,
    card:            updatedCard,
    overdueFine,
    specialFine,
    totalFine,
    finePaused,
    returnType,
    newCopyStatus:   activatedReservationId ? "RESERVED" : newCopyStatus,
    newCopyCondition,
    // Enriched response fields (Req 10.1, 10.2, 10.3)
    catalogueTitle:  borrow.copy.catalogue?.title  ?? "",
    accessionNumber: borrow.copy.accessionNumber,
    studentName:     borrow.card.student?.fullName ?? "",
  });
}
