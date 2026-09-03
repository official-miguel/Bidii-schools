/**
 * GET /api/parent/behaviour
 *
 * Returns DisciplineRecord rows for the authenticated parent's active child
 * where isVisibleToParent = true, ordered by dateOfOffence descending.
 *
 * Query params:
 *   studentId  — required; must belong to the authenticated parent
 *
 * Requirements: 8.1, 8.2
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

  // 2. Resolve studentId
  let studentId = req.nextUrl.searchParams.get("studentId");

  if (!studentId) {
    const first = parent.students[0];
    if (!first) {
      return NextResponse.json({ records: [] });
    }
    studentId = first.studentId;
  }

  // 3. Ownership check — 403 without revealing whether the student exists
  if (!ownsStudent(parent, studentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Query discipline records visible to parents only
  const records = await prisma.disciplineRecord.findMany({
    where: {
      studentId,
      isVisibleToParent: true,
    },
    orderBy: { dateOfOffence: "desc" },
    select: {
      id: true,
      offence: true,
      description: true,
      actionTaken: true,
      resolution: true,
      dateOfOffence: true,
      status: true,
    },
  });

  return NextResponse.json({ records });
}
