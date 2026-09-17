import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canEnterMarks } from "@/lib/assessment/auth844";
import { resolveActiveFramework } from "@/lib/assessment/resolveFramework";
import { runExamCompletionCheck } from "@/lib/notifications/examCompletion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const bodySchema = z.object({
  periodId: z.string().min(1),
  studentId: z.string().min(1),
  subjectId: z.string().min(1),
  paperId: z.string().min(1),
  score: z.number().nullable(),
});

export async function PUT(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const { periodId, studentId, subjectId, paperId, score } = parsed.data;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canEnterMarks(actor, subjectId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const period: { id: string } | null = await db.assessmentPeriod.findFirst({
    where: { id: periodId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!period) {
    return NextResponse.json({ error: "Period not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: { id: true, classId: true, schoolClass: { select: { frameworkType: true } } },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  // The top-level check above is subject-wide; a teacher assigned this
  // subject via the timetable in one class is not automatically authorized
  // to enter marks for a different class's student in the same subject.
  if (!canEnterMarks(actor, subjectId, student.classId)) {
    return NextResponse.json({ error: "You are not authorized to enter marks for this student's class." }, { status: 403 });
  }

  // Papers are still scoped by framework — resolved from the student's own
  // class, since the period itself is now shared across every framework.
  const activeFramework = await resolveActiveFramework(user.schoolId!, student.schoolClass.frameworkType);
  if (!activeFramework) {
    return NextResponse.json({ error: "No active framework configured for this class.", code: "NOT_FOUND" }, { status: 404 });
  }

  const paper: { id: string; maxMarks: number } | null = await db.paper.findFirst({
    where: { id: paperId, subjectId, schoolId: user.schoolId!, frameworkId: activeFramework.id },
    select: { id: true, maxMarks: true },
  });
  if (!paper) {
    return NextResponse.json(
      { error: "Paper not found or does not belong to the subject.", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  if (score === null) {
    await db.assessmentItem.deleteMany({ where: { studentId, periodId, paperId } });
    return NextResponse.json({ ok: true });
  }

  if (score < 0 || score > paper.maxMarks) {
    return NextResponse.json(
      { error: `Score must be between 0 and ${paper.maxMarks}.`, code: "VALIDATION_ERROR" },
      { status: 422 }
    );
  }

  const enteredById = actor.teacher?.id ?? null;

  await db.assessmentItem.upsert({
    where: { item_paper: { studentId, periodId, paperId } },
    create: {
      schoolId: user.schoolId!,
      frameworkId: activeFramework.id,
      periodId,
      studentId,
      paperId,
      subjectId,
      resultKind: "NUMERIC",
      numericScore: score,
      enteredById,
    },
    update: { numericScore: score, enteredById },
  });

  // This may have been the last outstanding mark for the period — see
  // runExamCompletionCheck, which is a cheap no-op when it wasn't.
  void runExamCompletionCheck(user.schoolId!, periodId);

  return NextResponse.json({ ok: true });
}
