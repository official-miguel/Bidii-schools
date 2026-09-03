/**
 * GET /api/parent/attendance?studentId=<id>
 *
 * Returns attendance records and summary stats for a parent's child for the
 * current academic term (or the last 90 days when no active term exists).
 *
 * Requirements: 6.1, 6.3, 6.5
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

  // 2. Resolve studentId — fall back to first linked child if not provided
  let studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) {
    const first = parent.students[0];
    if (!first) {
      return NextResponse.json({ records: [], stats: null });
    }
    studentId = first.studentId;
  } else if (!ownsStudent(parent, studentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Determine term date range
  //    Try to find the currently active term for the school; fall back to last 90 days.
  const schoolId = parent.schoolId;
  const now = new Date();

  let termStart: Date;

  const activeTerm = await prisma.term.findFirst({
    where: { schoolId, isActive: true },
    orderBy: { createdAt: "desc" },
    select: { startDate: true },
  });

  if (activeTerm?.startDate) {
    termStart = activeTerm.startDate;
  } else {
    // No active term configuration — use last 90 days
    termStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }

  // 4. Query attendance records for the student from term start
  const records = await prisma.attendance.findMany({
    where: {
      studentId,
      date: { gte: termStart },
    },
    orderBy: { date: "desc" },
    select: { date: true, status: true },
  });

  // 5. Empty state
  if (records.length === 0) {
    return NextResponse.json({ records: [], stats: null });
  }

  // 6. Compute stats
  const totalPresent = records.filter((r) => r.status === "PRESENT").length;
  const totalAbsent  = records.filter((r) => r.status === "ABSENT").length;
  const total        = totalPresent + totalAbsent;
  const percentage   = total > 0 ? Math.round((totalPresent / total) * 100) : 0;

  return NextResponse.json({
    records: records.map((r) => ({
      date:   r.date.toISOString(),
      status: r.status,
    })),
    stats: { totalPresent, totalAbsent, percentage },
  });
}
