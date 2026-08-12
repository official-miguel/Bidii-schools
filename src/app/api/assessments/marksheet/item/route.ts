import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canEnterMarks } from "@/lib/assessment/auth844";

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

  const period: { id: string; frameworkId: string } | null = await db.assessmentPeriod.findFirst({
    where: {
      id: periodId,
      schoolId: user.schoolId!,
      framework: { type: "EIGHT_FOUR_FOUR", isActive: true },
    },
    select: { id: true, frameworkId: true },
  });
  if (!period) {
    return NextResponse.json({ error: "Period not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: { id: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found.", code: "NOT_FOUND" }, { status: 404 });
  }

  const paper: { id: string; maxMarks: number } | null = await db.paper.findFirst({
    where: { id: paperId, subjectId, schoolId: user.schoolId!, frameworkId: period.frameworkId },
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
      frameworkId: period.frameworkId,
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

  return NextResponse.json({ ok: true });
}
