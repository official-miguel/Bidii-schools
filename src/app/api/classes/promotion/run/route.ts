import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSchoolRole } from "@/lib/auth";
import { emitSSE } from "@/lib/sse";

// ---------------------------------------------------------------------------
// POST /api/classes/promotion/run
//
// Executes the year-end promotion in a single atomic $transaction.
// Principal-only — no permission-based fallback (spec §5).
//
// Body:
//   academicYear         — the academic year being closed, e.g. 2025
//   confirmedDoubleRun?  — set true to proceed when a prior run exists this year
// ---------------------------------------------------------------------------

const runSchema = z.object({
  academicYear:         z.number().int().min(2000).max(2100),
  confirmedDoubleRun:   z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const user = await requireSchoolRole("PRINCIPAL");
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = runSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { academicYear, confirmedDoubleRun } = parsed.data;
  const schoolId = user.schoolId;
  const now      = new Date();

  // ── Double-run guard (§5c) ──────────────────────────────────────────────
  const existingRun = await prisma.auditLog.findFirst({
    where: { schoolId, action: "YEAR_PROMOTION_RUN" },
    orderBy: { performedAt: "desc" },
    select: { detail: true, performedAt: true },
  });
  if (existingRun) {
    const detail = existingRun.detail as Record<string, unknown>;
    if (detail.academicYear === academicYear && !confirmedDoubleRun) {
      return NextResponse.json(
        {
          error:       "double_run_warning",
          message:     `A promotion was already run for ${academicYear} on ${existingRun.performedAt.toISOString()}. Pass confirmedDoubleRun: true to proceed.`,
          performedAt: existingRun.performedAt.toISOString(),
        },
        { status: 409 }
      );
    }
  }

  // ── Load all classes with their config ─────────────────────────────────
  const classes = await prisma.schoolClass.findMany({
    where: { schoolId },
    select: {
      id: true,
      name: true,
      stageName: true,
      promotesToClassId: true,
      confirmedTerminal: true,
      skipStageConfirmed: true,
      resetTeachersOnPromotion: true,
    },
  });

  // ── Pre-flight: validate all classes are resolved ──────────────────────
  const unresolved = classes.filter(
    (c) => !c.promotesToClassId && !c.confirmedTerminal
  );
  if (unresolved.length > 0) {
    return NextResponse.json(
      {
        error:   "unresolved_classes",
        message: `${unresolved.length} class(es) have no promotion configuration. Resolve them first.`,
        classes: unresolved.map((c) => ({ id: c.id, name: c.name })),
      },
      { status: 422 }
    );
  }

  // Unconfirmed skip-stage warnings also block the run.
  const unconfirmedSkips = classes.filter(
    (c) => c.promotesToClassId && !c.skipStageConfirmed
  );
  if (unconfirmedSkips.length > 0) {
    return NextResponse.json(
      {
        error:   "unconfirmed_skip_warnings",
        message: `${unconfirmedSkips.length} class(es) have unconfirmed skip-stage warnings. Acknowledge them first.`,
        classes: unconfirmedSkips.map((c) => ({ id: c.id, name: c.name })),
      },
      { status: 422 }
    );
  }

  // ── Load active students ─────────────────────────────────────────────
  const activeStudents = await prisma.student.findMany({
    where: { schoolId, archivedAt: null },
    select: { id: true, classId: true, admissionNumber: true, fullName: true },
  });

  // Build a map: classId → class config.
  const classMap = new Map(classes.map((c) => [c.id, c]));

  // Classify each student.
  const toPromote:  { studentId: string; targetClassId: string }[] = [];
  const toGraduate: { studentId: string }[] = [];

  const byClassOutcome: Record<
    string,
    { classId: string; className: string; outcome: string; studentCount: number }
  > = {};

  for (const student of activeStudents) {
    const cls = classMap.get(student.classId);
    if (!cls) {
      // Student is in a class not found in this school — shouldn't happen
      // but guard defensively.
      continue;
    }

    if (cls.promotesToClassId) {
      toPromote.push({ studentId: student.id, targetClassId: cls.promotesToClassId });
      const key = cls.id;
      if (!byClassOutcome[key]) {
        byClassOutcome[key] = { classId: cls.id, className: cls.name, outcome: "promote", studentCount: 0 };
      }
      byClassOutcome[key].studentCount++;
    } else if (cls.confirmedTerminal) {
      toGraduate.push({ studentId: student.id });
      const key = cls.id;
      if (!byClassOutcome[key]) {
        byClassOutcome[key] = { classId: cls.id, className: cls.name, outcome: "graduate", studentCount: 0 };
      }
      byClassOutcome[key].studentCount++;
    } else {
      // Unreachable due to pre-flight above, but guard the transaction.
      return NextResponse.json(
        {
          error:   "internal_unresolved",
          message: `Class "${cls.name}" has no promotion config. Aborting.`,
        },
        { status: 500 }
      );
    }
  }

  // ── Classes that need teacher resets ────────────────────────────────
  // Only classes that ARE promotion TARGETS and have resetTeachersOnPromotion=true.
  const targetClassIdsWithReset = new Set(
    classes
      .filter((c) => c.promotesToClassId && c.resetTeachersOnPromotion === false)
      .map((c) => c.id)
  );
  // Actually we want: for each class that IS a TARGET, check if that target
  // has resetTeachersOnPromotion set. Re-derive from the class map.
  const targetIdsNeedingReset = new Set<string>();
  for (const cls of classes) {
    if (cls.promotesToClassId) {
      const targetCls = classMap.get(cls.promotesToClassId);
      if (targetCls?.resetTeachersOnPromotion) {
        targetIdsNeedingReset.add(cls.promotesToClassId);
      }
    }
  }
  void targetClassIdsWithReset; // suppress unused warning — replaced above

  // ── Atomic transaction ────────────────────────────────────────────────
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Promote students (move to new class).
      for (const { studentId, targetClassId } of toPromote) {
        await tx.student.update({
          where: { id: studentId },
          data:  { classId: targetClassId },
        });
      }

      // 2. Graduate students (archive with GRADUATION type).
      if (toGraduate.length > 0) {
        await tx.student.updateMany({
          where: { id: { in: toGraduate.map((s) => s.studentId) } },
          data: {
            archivedAt:   now,
            archiveType:  "GRADUATION",
            archivedById: user.id,
          },
        });
      }

      // 3. Reset teacher assignments for flagged target classes.
      for (const targetId of targetIdsNeedingReset) {
        await tx.classSubjectTeacher.deleteMany({ where: { classId: targetId } });
        await tx.classElectiveGroupTeacher.deleteMany({ where: { classId: targetId } });
      }

      // 4. Write audit log.
      await tx.auditLog.create({
        data: {
          schoolId,
          action:        "YEAR_PROMOTION_RUN",
          performedById: user.id,
          performedAt:   now,
          detail: {
            academicYear,
            promotedCount:  toPromote.length,
            graduatedCount: toGraduate.length,
            byClass:        Object.values(byClassOutcome),
          },
        },
      });
    });
  } catch (err) {
    console.error("Promotion run failed:", err);
    return NextResponse.json(
      { error: "Promotion failed. The transaction was rolled back — no changes were made." },
      { status: 500 }
    );
  }

  // ── Notify live listeners ─────────────────────────────────────────────
  emitSSE(schoolId, "promotion.run", {
    academicYear,
    promotedCount:  toPromote.length,
    graduatedCount: toGraduate.length,
  });

  return NextResponse.json({
    ok:             true,
    academicYear,
    promotedCount:  toPromote.length,
    graduatedCount: toGraduate.length,
    byClass:        Object.values(byClassOutcome),
  });
}
