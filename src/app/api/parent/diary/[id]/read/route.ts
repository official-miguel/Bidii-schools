/**
 * PATCH /api/parent/diary/[id]/read
 *
 * Marks the DiaryNotification for the given DiaryEntry as read for the
 * authenticated parent's userId.
 *
 * Body or query param:
 *   studentId  — required; used to verify ownership and resolve the child's classId
 *
 * Requirements: 4.4
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
  // 1. Auth guard
  const parent = await requireParent();
  if (!parent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(parent.userId)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // 2. Resolve studentId from body or query param
  let studentId: string | null = null;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = await req.json();
      studentId = body?.studentId ?? null;
    } catch {
      // ignore parse errors — fall through to query param
    }
  }

  if (!studentId) {
    studentId = req.nextUrl.searchParams.get("studentId");
  }

  if (!studentId) {
    return NextResponse.json(
      { error: "studentId is required" },
      { status: 400 },
    );
  }

  // Ownership check — 403 without revealing whether the student exists
  if (!ownsStudent(parent, studentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Verify the diary entry exists and targets the student's class
  const student = await prisma.student.findUnique({
    where:  { id: studentId },
    select: { classId: true },
  });

  if (!student || !student.classId) {
    return NextResponse.json({ error: "Student or class not found" }, { status: 404 });
  }

  const diaryEntry = await prisma.diaryEntry.findFirst({
    where: {
      id:        params.id,
      schoolId:  parent.schoolId,
      deletedAt: null,
      targets:   { some: { classId: student.classId } },
    },
    select: { id: true },
  });

  if (!diaryEntry) {
    return NextResponse.json({ error: "Diary entry not found" }, { status: 404 });
  }

  // 4. Mark the DiaryNotification as read for this parent's userId
  await prisma.diaryNotification.updateMany({
    where: {
      diaryEntryId: params.id,
      userId:       parent.userId,
    },
    data: {
      isRead: true,
    },
  });

  // 5. Return success
  return NextResponse.json({ ok: true });
}
