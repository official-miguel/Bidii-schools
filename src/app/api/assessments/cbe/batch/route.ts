import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const batchSchema = z.object({
  subStrandId: z.string().min(1),
  items: z
    .array(
      z.object({
        periodId:  z.string().min(1),
        studentId: z.string().min(1),
        level:     z.enum(["EE", "ME", "AE", "BE"]).nullable(),
        comment:   z.string().nullable().optional(),
      })
    )
    .min(1)
    .max(200),
});

export async function POST(req: NextRequest) {
  const raw    = await req.json().catch(() => null);
  const parsed = batchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { subStrandId, items } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve sub-strand → learningAreaId for access checks.
  const subStrand = await db.subStrand.findFirst({
    where: { id: subStrandId, schoolId: user.schoolId! },
    select: { id: true, strand: { select: { learningAreaId: true } } },
  }) as { id: string; strand: { learningAreaId: string } } | null;
  if (!subStrand) {
    return NextResponse.json({ error: "Sub-strand not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const learningAreaId = subStrand.strand.learningAreaId;
  const actor = await resolveAssessmentActor(user, user.schoolId!);

  const isPrincipalOrBroadRole = actor.isPrincipal ||
    actor.roles.some((r) =>
      r.role === "DIRECTOR" || r.role === "EXAM_OFFICER" ||
      (r.role === "CLASS_TEACHER" && actor.classTeacherOfId !== null)
    );
  const isScopedTeacher = actor.roles.some(
    (r) =>
      (r.role === "SUBJECT_TEACHER" || r.role === "HOD") &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r as any).learningAreaId === learningAreaId
  );
  if (!isPrincipalOrBroadRole && !isScopedTeacher) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate all periodIds in bulk.
  const uniquePeriodIds = [...new Set(items.map((i) => i.periodId))];
  const periods = await db.assessmentPeriod.findMany({
    where: {
      id: { in: uniquePeriodIds },
      schoolId: user.schoolId!,
      framework: { type: "CBE", isActive: true },
    },
    select: { id: true, frameworkId: true },
  }) as Array<{ id: string; frameworkId: string }>;
  const periodMap = new Map(periods.map((p) => [p.id, p]));

  // Validate all studentIds in bulk.
  const uniqueStudentIds = [...new Set(items.map((i) => i.studentId))];
  const students = await prisma.student.findMany({
    where: { id: { in: uniqueStudentIds }, schoolId: user.schoolId! },
    select: { id: true },
  });
  const validStudentIds = new Set(students.map((s) => s.id));

  // Collect all validation errors before writing anything.
  const errors: Array<{ index: number; message: string }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!periodMap.has(item.periodId)) {
      errors.push({ index: i, message: `Period ${item.periodId} not found.` });
    } else if (!validStudentIds.has(item.studentId)) {
      errors.push({ index: i, message: `Student ${item.studentId} not found.` });
    }
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: "VALIDATION_ERROR", items: errors }, { status: 422 });
  }

  const enteredById = actor.teacher?.id ?? null;

  // Single transaction: upsert or delete per item.
  await prisma.$transaction(
    items.map((item) => {
      const period = periodMap.get(item.periodId)!;

      if (item.level === null) {
        return db.assessmentItem.deleteMany({
          where: { studentId: item.studentId, periodId: item.periodId, subStrandId },
        });
      }

      return db.assessmentItem.upsert({
        where: {
          item_substrand: {
            studentId:   item.studentId,
            periodId:    item.periodId,
            subStrandId,
          },
        },
        create: {
          schoolId: user.schoolId!,
          frameworkId:      period.frameworkId,
          periodId:         item.periodId,
          studentId:        item.studentId,
          subStrandId,
          learningAreaId,
          resultKind:       "PERFORMANCE_LEVEL",
          performanceLevel: item.level,
          comment:          item.comment ?? null,
          enteredById,
        },
        update: {
          performanceLevel: item.level,
          comment:          item.comment ?? null,
          enteredById,
        },
      });
    })
  );

  return NextResponse.json({ ok: true, count: items.length });
}
