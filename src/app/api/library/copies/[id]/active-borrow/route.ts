/**
 * GET /api/library/copies/[id]/active-borrow
 *
 * Returns the active (non-returned) borrow for a copy.
 * Used by the mobile Scan tab and Circulation Desk to identify
 * which student currently holds a borrowed copy.
 *
 * Response: { borrowId, studentId, studentName, dueAt, fineAmount? }
 * 404 if no active borrow exists for this copy.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";

async function guard() {
  return (
    (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "view"))
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const copy = await prisma.libraryCopy.findFirst({
    where: { id: params.id, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!copy) return NextResponse.json({ error: "Copy not found." }, { status: 404 });

  const borrow = await prisma.libraryBorrow.findFirst({
    where: { copyId: params.id, schoolId: user.schoolId!, returnedAt: null },
    orderBy: { borrowedAt: "desc" },
    select: {
      id:         true,
      dueAt:      true,
      fineAmount: true,
      card: {
        select: {
          studentId: true,
          student: {
            select: { id: true, fullName: true, admissionNumber: true },
          },
        },
      },
    },
  });

  if (!borrow) {
    return NextResponse.json({ error: "No active borrow found for this copy." }, { status: 404 });
  }

  return NextResponse.json({
    borrowId:    borrow.id,
    studentId:   borrow.card.studentId,
    studentName: borrow.card.student?.fullName ?? "Unknown",
    dueAt:       borrow.dueAt.toISOString(),
    fineAmount:  borrow.fineAmount ?? 0,
  });
}
