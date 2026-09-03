/**
 * GET /api/parent/diary
 *
 * Returns DiaryEntry records targeting the authenticated parent's active
 * child's class, plus a badge count for upcoming assignments/homework.
 *
 * Query params:
 *   studentId  — optional; defaults to the parent's first linked student
 *
 * Requirements: 4.1, 4.2, 4.3
 */

import { NextRequest, NextResponse } from "next/server";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 1. Auth guard
  const parent = await requireParent();
  if (!parent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(parent.userId)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // 2. Resolve studentId — use query param or fall back to first linked student
  let studentId = req.nextUrl.searchParams.get("studentId");

  if (!studentId) {
    // Fall back to the first linked student (ordered by ParentStudent.createdAt)
    const first = parent.students[0];
    if (!first) {
      return NextResponse.json({ entries: [], badgeCount: 0 });
    }
    studentId = first.studentId;
  }

  // 3. Ownership check — 403 without revealing whether the student exists
  if (!ownsStudent(parent, studentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Find the student's classId
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { classId: true },
  });

  if (!student || !student.classId) {
    return NextResponse.json({ entries: [], badgeCount: 0 });
  }

  // 5. Query diary entries targeting the student's class
  const entries = await prisma.diaryEntry.findMany({
    where: {
      schoolId:  parent.schoolId,
      deletedAt: null,
      targets:   { some: { classId: student.classId } },
    },
    include: {
      subject:    { select: { name: true } },
      recipients: {
        where:  { studentId },
        take:   1,
        select: { status: true },
      },
      teacher: { select: { fullName: true } },
    },
    orderBy: [
      { dueDate: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
  });

  // 6. Badge count — ASSIGNMENT or HOMEWORK entries due within the next 7 days
  const today     = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days   = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  in7Days.setHours(23, 59, 59, 999);

  const badgeCount = entries.filter(
    (e) =>
      (e.entryType === "ASSIGNMENT" || e.entryType === "HOMEWORK") &&
      e.dueDate !== null &&
      e.dueDate >= today &&
      e.dueDate <= in7Days,
  ).length;

  // 7. Return entries and badge count
  return NextResponse.json({ entries, badgeCount });
}
