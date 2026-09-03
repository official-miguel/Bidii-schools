/**
 * GET /api/parent/achievements
 *
 * Returns achievements linked to the authenticated parent's active child
 * where the parent-visibility flag on the Achievement record is true.
 *
 * Query params:
 *   studentId  — required; must belong to the authenticated parent
 *
 * Requirements: 8.3
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
      return NextResponse.json({ achievements: [] });
    }
    studentId = first.studentId;
  }

  // 3. Ownership check — 403 without revealing whether the student exists
  if (!ownsStudent(parent, studentId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Query achievements via AchievementStudent join where isVisibleToParent = true
  const rows = await prisma.achievementStudent.findMany({
    where: {
      studentId,
      achievement: { isVisibleToParent: true },
    },
    include: {
      achievement: {
        select: {
          id: true,
          title: true,
          category: true,
          description: true,
          achievementDate: true,
          awardLevel: true,
        },
      },
    },
    orderBy: { achievement: { achievementDate: "desc" } },
  });

  const achievements = rows.map((r) => r.achievement);

  return NextResponse.json({ achievements });
}
