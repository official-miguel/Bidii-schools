/**
 * PATCH /api/parent/diary/[id]/complete
 *
 * Toggles the DiaryRecipient status for the authenticated parent's child
 * between PENDING and COMPLETED.
 *
 * Query param:
 *   studentId — required; used to verify ownership
 *
 * Returns: { status: "PENDING" | "COMPLETED" }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  // Auth
  const parent = await requireParent();
  if (!parent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(parent.userId)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Resolve studentId
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId is required" }, { status: 400 });
  }

  // Ownership check
  if (!ownsStudent(parent, studentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify the diary entry targets the student's class
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { classId: true },
  });

  if (!student?.classId) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const diaryEntry = await prisma.diaryEntry.findFirst({
    where: {
      id:        params.id,
      schoolId:  parent.schoolId,
      deletedAt: null,
      targets:   { some: { classId: student.classId } },
    },
    select: { id: true, entryType: true },
  });

  if (!diaryEntry) {
    return NextResponse.json({ error: "Diary entry not found" }, { status: 404 });
  }

  // Announcements can't be marked complete
  if (diaryEntry.entryType === "ANNOUNCEMENT") {
    return NextResponse.json({ error: "Announcements cannot be marked complete" }, { status: 422 });
  }

  // Find the recipient record and toggle the parent-specific status
  const recipient = await prisma.diaryRecipient.findUnique({
    where: { diaryEntryId_studentId: { diaryEntryId: params.id, studentId } },
    select: { id: true, parentStatus: true },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Recipient record not found" }, { status: 404 });
  }

  const newStatus         = recipient.parentStatus === "COMPLETED" ? "PENDING" : "COMPLETED";
  const parentCompletedAt = newStatus === "COMPLETED" ? new Date() : null;

  await prisma.diaryRecipient.update({
    where: { id: recipient.id },
    data:  { parentStatus: newStatus, parentCompletedAt },
  });

  return NextResponse.json({ status: newStatus });
}
