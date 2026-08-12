/**
 * POST /api/library/circulate/borrow
 *
 * Full policy-engine-validated borrowing endpoint.
 * Replaces the legacy POST /api/library/card/[studentId].
 *
 * Request body:
 *   { studentId, copyId, patronType?, overrideReason? }
 *
 * Policy checks (in order):
 *   1. Card exists and is ACTIVE
 *   2. Card not expired
 *   3. No blocking outstanding fines (unless fine pause active)
 *   4. Borrowing limit not reached
 *   5. Copy is AVAILABLE (or RESERVED for this student)
 *   6. No active borrow for this exact copy on this card
 *
 * On success:
 *   - Creates LibraryBorrow row
 *   - Sets LibraryCopy.status = BORROWED
 *   - Updates LibraryCard.currentBorrowCount + totalBorrowCount
 *   - Fulfils any matching reservation
 *   - Writes LibraryCirculationEvent
 *   - Emits SSE events
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
  studentId:      z.string().min(1),
  copyId:         z.string().min(1),
  patronType:     z.string().optional(),
  /** Present when a librarian overrides a soft block */
  overrideReason: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const { studentId, copyId, patronType, overrideReason } = parsed.data;

  // ── Load student + card ──────────────────────────────────────────────────
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: {
      id: true, fullName: true, admissionNumber: true,
      schoolClass: { select: { name: true, form: true } },
      files: {
        where: { mimeType: { startsWith: "image/" } },
        orderBy: { createdAt: "desc" }, take: 1,
        select: { id: true },
      },
    },
  });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  // Auto-provision card
  const settings = await prisma.librarySettings.findUnique({ where: { schoolId: user.schoolId! } });
  const cardValidityDays = settings?.cardValidityDays ?? null;

  let card = await prisma.libraryCard.findUnique({ where: { studentId } }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!card) {
    const year = new Date().getFullYear();
    const last = await prisma.libraryCard.findFirst({
      where: { schoolId: user.schoolId!, cardNumber: { startsWith: `LIB-${year}-` } },
      orderBy: { createdAt: "desc" }, select: { cardNumber: true },
    });
    let seq = 1;
    if (last?.cardNumber) { const m = last.cardNumber.match(/(\d+)$/); if (m) seq = parseInt(m[1]) + 1; }
    card = await prisma.libraryCard.create({
      data: {
        schoolId: user.schoolId!, studentId,
        cardNumber: `LIB-${year}-${String(seq).padStart(5, "0")}`,
        status: "ACTIVE" as never,
        expiresAt: cardValidityDays ? new Date(Date.now() + cardValidityDays * 86_400_000) : null,
      },
    }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  // ── Load copy ────────────────────────────────────────────────────────────
  const copy = await prisma.libraryCopy.findFirst({
    where: { id: copyId, schoolId: user.schoolId! },
    include: { catalogue: { select: { id: true, title: true, author: true, bookNumber: true, subject: true, form: true } } },
  });
  if (!copy) return NextResponse.json({ error: "Copy not found." }, { status: 404 });

  // ── Active borrows count ─────────────────────────────────────────────────
  const activeBorrowCount = await prisma.libraryBorrow.count({
    where: { cardId: card.id, returnedAt: null },
  });

  // ── Check reservation ────────────────────────────────────────────────────
  const myReservation = await prisma.libraryReservation.findFirst({
    where: {
      catalogueId: copy.catalogueId, studentId,
      status: { in: ["PENDING", "ACTIVE"] },
      schoolId: user.schoolId!,
    },
  });

  // ── Policy evaluation ────────────────────────────────────────────────────
  const engine = await PolicyEngine.load(user.schoolId!);
  const eval_ = engine.evaluateBorrow({
    card: {
      id: card.id, studentId: card.studentId,
      status: card.status, fineBalance: card.fineBalance,
      currentBorrowCount: card.currentBorrowCount,
      expiresAt: card.expiresAt,
    },
    copy: { status: copy.status, catalogueId: copy.catalogueId, archivedAt: copy.archivedAt },
    patronType: patronType ?? "DEFAULT",
    activeBorrowCount,
    hasReservationForCopy: !!myReservation,
  });

  // Hard block — unless override with reason
  if (!eval_.allowed && !overrideReason) {
    return NextResponse.json({
      error:    eval_.reasons[0],
      reasons:  eval_.reasons,
      warnings: eval_.warnings,
      blocked:  true,
    }, { status: 422 });
  }

  // Override must have a reason
  if (!eval_.allowed && overrideReason && !overrideReason.trim()) {
    return NextResponse.json({ error: "Override reason is required." }, { status: 400 });
  }

  // ── Create borrow ────────────────────────────────────────────────────────
  const dueAt = eval_.dueAt;

  const [borrow] = await prisma.$transaction([
    prisma.libraryBorrow.create({
      data: {
        schoolId: user.schoolId!,
        cardId:   card.id,
        copyId,
        dueAt,
        isOverride:    !eval_.allowed,
        overrideReason: overrideReason ?? null,
        overrideById:   !eval_.allowed ? user.id : null,
      },
    }),
    prisma.libraryCopy.update({
      where: { id: copyId },
      data:  { status: "BORROWED" },
    }),
    prisma.libraryCard.update({
      where: { id: card.id },
      data:  { currentBorrowCount: { increment: 1 }, totalBorrowCount: { increment: 1 } },
    }),
  ]);

  // Fulfil reservation if one exists
  if (myReservation) {
    await prisma.libraryReservation.update({
      where: { id: myReservation.id },
      data:  { status: "FULFILLED", fulfilledAt: new Date(), allocatedCopyId: copyId },
    });
  }

  // ── Circulation event ────────────────────────────────────────────────────
  await recordCirculationEvent({
    schoolId: user.schoolId!, eventType: "BORROWED",
    copyId, catalogueId: copy.catalogueId,
    borrowId: borrow.id, studentId,
    performedById: user.id,
    payload: {
      title: copy.catalogue?.title, accession: copy.accessionNumber,
      dueAt: dueAt.toISOString(), isOverride: !eval_.allowed,
      overrideReason, warnings: eval_.warnings,
    },
  });

  emitSSE(user.schoolId!, "libraryBorrow.issued", { ...borrow, catalogue: copy.catalogue });

  return NextResponse.json({
    borrow: { ...borrow, copy, catalogue: copy.catalogue },
    warnings: eval_.warnings,
    dueAt: dueAt.toISOString(),
    isOverride: !eval_.allowed,
  }, { status: 201 });
}
