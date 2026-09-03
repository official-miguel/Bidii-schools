/**
 * GET /api/parent/results
 *
 * Returns the authenticated parent's active child's AssessmentItem records
 * grouped by AssessmentPeriod, with computed stats per period.
 *
 * Query params:
 *   studentId  — optional; defaults to the parent's first linked student
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { NextRequest, NextResponse } from "next/server";
import { requireParent, ownsStudent } from "@/lib/parentAuth";
import { checkRateLimit } from "@/lib/rateLimit";
import { prisma } from "@/lib/prisma";
import { computePeriodStats, type PeriodStats } from "@/lib/parentUtils";

export const dynamic = "force-dynamic";

export interface ResultPeriod {
  period: {
    id:           string;
    name:         string;
    academicYear: string;
    term:         number | null;
  };
  items: {
    id:               string;
    resultKind:       string;
    numericScore:     number | null;
    performanceLevel: string | null;
    competencyStatus: string | null;
    comment:          string | null;
    subject:          { name: string } | null;
  }[];
  stats: PeriodStats | null;
}

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
    const first = parent.students[0];
    if (!first) {
      return NextResponse.json([]);
    }
    studentId = first.studentId;
  }

  // Ownership check — 403 without revealing whether the student exists
  if (!ownsStudent(parent, studentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Query all AssessmentPeriod records for the school ordered by
  //    academicYear DESC, term DESC
  const periods = await prisma.assessmentPeriod.findMany({
    where:   { schoolId: parent.schoolId },
    orderBy: [
      { academicYear: "desc" },
      { term: "desc" },
    ],
    select: {
      id:           true,
      name:         true,
      academicYear: true,
      term:         true,
    },
  });

  if (periods.length === 0) {
    return NextResponse.json([]);
  }

  // 4. For each period, query AssessmentItem where studentId = studentId
  //    AND assessmentPeriodId = period.id, include subject { name }
  const periodIds = periods.map((p) => p.id);

  const allItems = await prisma.assessmentItem.findMany({
    where: {
      studentId,
      periodId: { in: periodIds },
    },
    select: {
      id:               true,
      periodId:         true,
      resultKind:       true,
      numericScore:     true,
      performanceLevel: true,
      competencyStatus: true,
      comment:          true,
      subject:          { select: { name: true } },
    },
  });

  // Group items by periodId for O(n) lookup
  const itemsByPeriod = new Map<
    string,
    typeof allItems
  >();
  for (const item of allItems) {
    const bucket = itemsByPeriod.get(item.periodId) ?? [];
    bucket.push(item);
    itemsByPeriod.set(item.periodId, bucket);
  }

  // 5–7. Build the response array: one entry per period
  const result: ResultPeriod[] = periods.map((period) => {
    const items = itemsByPeriod.get(period.id) ?? [];

    // 5. Compute stats per period using computePeriodStats
    const stats = computePeriodStats(items);

    return {
      period: {
        id:           period.id,
        name:         period.name,
        academicYear: period.academicYear,
        term:         period.term,
      },
      // 7. Periods with no items return items: [], stats: null
      items: items.map((item) => ({
        id:               item.id,
        resultKind:       item.resultKind,
        numericScore:     item.numericScore,
        performanceLevel: item.performanceLevel,
        competencyStatus: item.competencyStatus,
        comment:          item.comment,
        subject:          item.subject,
      })),
      stats,
    };
  });

  return NextResponse.json(result);
}
