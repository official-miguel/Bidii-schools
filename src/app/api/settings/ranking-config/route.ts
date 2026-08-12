import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const DEFAULT = {
  improvementWeight: 0.4,
  completionWeight: 0.3,
  absoluteWeight: 0.3,
  meanFlagThreshold: null as number | null,
};

/**
 * GET /api/settings/ranking-config
 * Guard: canAccessDashboard (HOD/Director/Principal). HTTP 403 for teachers/parents.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canAccessDashboard(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await db.rankingConfig.findUnique({
    where: { schoolId: user.schoolId! },
    select: {
      improvementWeight: true,
      completionWeight:  true,
      absoluteWeight:    true,
      meanFlagThreshold: true,
      updatedAt:         true,
    },
  }) as {
    improvementWeight: number;
    completionWeight:  number;
    absoluteWeight:    number;
    meanFlagThreshold: number | null;
    updatedAt:         Date;
  } | null;

  if (!row) {
    return NextResponse.json({ ...DEFAULT, updatedAt: null });
  }

  return NextResponse.json({
    improvementWeight: row.improvementWeight,
    completionWeight:  row.completionWeight,
    absoluteWeight:    row.absoluteWeight,
    meanFlagThreshold: row.meanFlagThreshold,
    updatedAt:         row.updatedAt,
  });
}

/**
 * PUT /api/settings/ranking-config
 * Body: { improvementWeight, completionWeight, absoluteWeight, meanFlagThreshold? }
 * Guard: HOD or Director/Principal. HTTP 403 for SUBJECT_TEACHER, CLASS_TEACHER, PARENT_VIEWER.
 * Validation: weights must sum to 1.0 ± 0.001 → HTTP 422 if not.
 *             meanFlagThreshold must be >= 0 if provided.
 */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);

  // Only HOD, Exam Officer, Director, or Principal may edit weights.
  const canEdit =
    actor.isPrincipal ||
    actor.roles.some((r) =>
      ["HOD", "EXAM_OFFICER", "DIRECTOR"].includes(r.role)
    );
  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { improvementWeight, completionWeight, absoluteWeight, meanFlagThreshold } = body ?? {};

  if (
    typeof improvementWeight !== "number" ||
    typeof completionWeight  !== "number" ||
    typeof absoluteWeight    !== "number"
  ) {
    return NextResponse.json(
      { error: "improvementWeight, completionWeight, and absoluteWeight are required numbers." },
      { status: 400 }
    );
  }

  const sum = improvementWeight + completionWeight + absoluteWeight;
  if (Math.abs(sum - 1.0) > 0.001) {
    return NextResponse.json(
      { error: `Weights must sum to 1.0 (current sum: ${sum.toFixed(4)}).` },
      { status: 422 }
    );
  }

  // meanFlagThreshold: null clears it; a number must be >= 0.
  const threshold: number | null =
    meanFlagThreshold === null || meanFlagThreshold === undefined
      ? null
      : Number(meanFlagThreshold);

  if (threshold !== null && (isNaN(threshold) || threshold < 0)) {
    return NextResponse.json(
      { error: "meanFlagThreshold must be a non-negative number or null." },
      { status: 422 }
    );
  }

  const row = await db.rankingConfig.upsert({
    where:  { schoolId: user.schoolId! },
    create: {
      schoolId: user.schoolId!,
      improvementWeight,
      completionWeight,
      absoluteWeight,
      meanFlagThreshold: threshold,
    },
    update: {
      improvementWeight,
      completionWeight,
      absoluteWeight,
      meanFlagThreshold: threshold,
    },
    select: {
      improvementWeight: true,
      completionWeight:  true,
      absoluteWeight:    true,
      meanFlagThreshold: true,
      updatedAt:         true,
    },
  });

  return NextResponse.json(row);
}
