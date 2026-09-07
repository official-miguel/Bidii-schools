/**
 * POST /api/library/fines/resume
 *
 * Resumes a previously paused fine clock for a student.
 * Deactivates the STUDENT-scoped LibraryFinePause row(s) for this student.
 *
 * Body: { studentId }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { requireSchoolPermission } from "@/lib/permissions";
import { recordFineAudit } from "@/lib/library/circulationEvents";

async function manageGuard() {
  return (await requireSchoolRole("PRINCIPAL")) ??
    (await requireSchoolPermission("LIBRARY", "manage"));
}

const schema = z.object({
  studentId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const user = await manageGuard();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const { studentId } = parsed.data;

  // Verify the student belongs to this school
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!student)
    return NextResponse.json({ error: "Student not found." }, { status: 404 });

  // Deactivate all active STUDENT-scoped pauses for this student
  const updated = await prisma.libraryFinePause.updateMany({
    where: {
      schoolId:  user.schoolId!,
      studentId,
      scope:     "STUDENT",
      isActive:  true,
    },
    data: { isActive: false, endDate: new Date() },
  });

  if (updated.count === 0)
    return NextResponse.json({ error: "No active fine pause found for this student." }, { status: 404 });

  // Find the card and record audit event
  const card = await prisma.libraryCard.findFirst({
    where: { studentId, schoolId: user.schoolId! },
    select: { id: true, fineBalance: true },
  });

  if (card) {
    await recordFineAudit({
      schoolId:      user.schoolId!,
      cardId:        card.id,
      eventType:     "PAUSE_REMOVED",
      amount:        0,
      balanceAfter:  card.fineBalance,
      reason:        "Fine clock resumed by librarian",
      performedById: user.id,
    });
  }

  return NextResponse.json({ ok: true, pausesDeactivated: updated.count });
}