/**
 * GET /api/library/policies/evaluate
 * ?studentId=xxx&copyId=xxx&patronType=DEFAULT
 *
 * Returns a full policy evaluation without committing any borrow.
 * Used by the Circulation Desk UI to show block reasons and warnings
 * before the librarian confirms the action.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { PolicyEngine } from "@/lib/library/policyEngine";

async function guard() { return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY","view")); }

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp          = req.nextUrl.searchParams;
  const studentId   = sp.get("studentId");
  const copyId      = sp.get("copyId");
  const patronType  = sp.get("patronType") ?? "DEFAULT";

  if (!studentId || !copyId)
    return NextResponse.json({ error: "studentId and copyId are required." }, { status: 400 });

  const [card, copy, activeBorrowCount] = await Promise.all([
    prisma.libraryCard.findUnique({ where: { studentId } }),
    prisma.libraryCopy.findFirst({ where: { id: copyId, schoolId: user.schoolId! }, include: { catalogue: { select: { id: true, title: true } } } }),
    prisma.libraryBorrow.count({ where: { card: { studentId }, returnedAt: null } }),
  ]);

  if (!copy) return NextResponse.json({ error: "Copy not found." }, { status: 404 });

  if (!card) {
    const engine  = await PolicyEngine.load(user.schoolId!);
    const policy  = engine.policyFor(patronType);
    const dueAt   = new Date();
    dueAt.setDate(dueAt.getDate() + policy.borrowDays);
    return NextResponse.json({
      allowed: copy.status === "AVAILABLE",
      reasons: copy.status !== "AVAILABLE" ? [`Copy is ${copy.status}`] : [],
      warnings: ["Student does not have a library card yet — one will be created automatically."],
      policy, dueAt, finePaused: false,
    });
  }

  const hasReservation = await prisma.libraryReservation.findFirst({
    where: { catalogueId: copy.catalogueId, studentId, status: { in: ["PENDING","ACTIVE"] }, schoolId: user.schoolId! },
  });

  const engine = await PolicyEngine.load(user.schoolId!);
  const result = engine.evaluateBorrow({
    card: {
      id: card.id, studentId: card.studentId,
      status: card.status, fineBalance: card.fineBalance,
      currentBorrowCount: card.currentBorrowCount, expiresAt: card.expiresAt,
    },
    copy: { status: copy.status, catalogueId: copy.catalogueId, archivedAt: copy.archivedAt },
    patronType,
    activeBorrowCount,
    hasReservationForCopy: !!hasReservation,
  });

  return NextResponse.json({
    ...result,
    dueAt:   result.dueAt.toISOString(),
    card:    { id: card.id, status: card.status, fineBalance: card.fineBalance, currentBorrowCount: card.currentBorrowCount },
    copy:    { id: copy.id, accessionNumber: copy.accessionNumber, status: copy.status, condition: copy.condition, catalogue: copy.catalogue },
  });
}
