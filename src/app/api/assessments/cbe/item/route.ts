import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor } from "@/lib/assessment/auth844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const bodySchema = z.object({
  periodId:    z.string().min(1),
  studentId:   z.string().min(1),
  subStrandId: z.string().min(1),
  /** null = delete row (convert to Not_Yet_Entered). */
  level:   z.enum(["EE", "ME", "AE", "BE"]).nullable(),
  comment: z.string().nullable().optional(),
});

export async function PUT(req: NextRequest) {
  const raw    = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { periodId, studentId, subStrandId, level, comment } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve learningAreaId from the sub-strand chain for the canEnterMarks check.
  const subStrand = await db.subStrand.findFirst({
    where: { id: subStrandId, schoolId: user.schoolId! },
    select: { strand: { select: { learningAreaId: true } } },
  }) as { strand: { learningAreaId: string } } | null;
  if (!subStrand) {
    return NextResponse.json({ error: "Sub-strand not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const learningAreaId = subStrand.strand.learningAreaId;
  const actor = await resolveAssessmentActor(user, user.schoolId!);

  // Reuse canEnterMarks — the actor check works for CBE scope via learningAreaId
  // roles, but the function signature takes a subjectId. We use the learningAreaId
  // as a proxy here; CBE roles are stored with learningAreaId in AssessmentRole.
  // canEnterMarks returns true for PRINCIPAL/DIRECTOR/EXAM_OFFICER/CLASS_TEACHER
  // unconditionally, which covers the common cases. SUBJECT_TEACHER roles for
  // CBE are scoped to learningAreaId in AssessmentRole, so we check them manually.
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

  // Validate period belongs to school's active CBE framework.
  const period = await db.assessmentPeriod.findFirst({
    where: {
      id: periodId,
      schoolId: user.schoolId!,
      framework: { type: "CBE", isActive: true },
    },
    select: { id: true, frameworkId: true },
  }) as { id: string; frameworkId: string } | null;
  if (!period) {
    return NextResponse.json({ error: "Period not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // Validate student belongs to school.
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const enteredById = actor.teacher?.id ?? null;

  // level === null → delete (Not_Yet_Entered).
  if (level === null) {
    await db.assessmentItem.deleteMany({
      where: { studentId, periodId, subStrandId },
    });
    return NextResponse.json({ ok: true });
  }

  // Upsert on item_substrand unique constraint.
  await db.assessmentItem.upsert({
    where: { item_substrand: { studentId, periodId, subStrandId } },
    create: {
      schoolId: user.schoolId!,
      frameworkId:      period.frameworkId,
      periodId,
      studentId,
      subStrandId,
      learningAreaId,
      resultKind:       "PERFORMANCE_LEVEL",
      performanceLevel: level,
      comment:          comment ?? null,
      enteredById,
    },
    update: {
      performanceLevel: level,
      comment:          comment ?? null,
      enteredById,
    },
  });

  return NextResponse.json({ ok: true });
}
