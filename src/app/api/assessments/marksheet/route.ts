import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canViewMarksheet } from "@/lib/assessment/auth844";
import type { FrameworkType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const periodId = params.get("periodId");
  const classId = params.get("classId");
  const subjectId = params.get("subjectId");

  if (!periodId || !classId || !subjectId) {
    return NextResponse.json(
      { error: "periodId, classId, and subjectId are required." },
      { status: 400 }
    );
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canViewMarksheet(actor, subjectId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Resolve the class first — we need its frameworkType to scope the
  // period and papers queries to the correct framework.
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId: user.schoolId! },
    select: { id: true, name: true, form: true, frameworkType: true },
  });
  if (!schoolClass) return NextResponse.json({ error: "Class not found." }, { status: 404 });

  const classFrameworkType = schoolClass.frameworkType as FrameworkType;

  // Periods are shared across every framework now — only Papers are still
  // framework-scoped, resolved from the CLASS's own frameworkType, never
  // from the period (which no longer carries one).
  const [period, subject, students, activeFramework] = await Promise.all([
    prisma.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId: user.schoolId! },
      select: { id: true, name: true, academicYear: true, term: true },
    }),
    prisma.subject.findFirst({
      where: { id: subjectId, schoolId: user.schoolId! },
      select: { id: true, name: true, code: true },
    }),
    prisma.student.findMany({
      where: { classId, schoolId: user.schoolId! },
      orderBy: { admissionNumber: "asc" },
      select: { id: true, fullName: true, admissionNumber: true },
    }),
    prisma.assessmentFramework.findFirst({
      where: { schoolId: user.schoolId!, type: classFrameworkType, isActive: true },
      select: { id: true },
    }),
  ]);

  if (!period) return NextResponse.json({ error: "Period not found." }, { status: 404 });
  if (!subject) return NextResponse.json({ error: "Subject not found." }, { status: 404 });
  if (!activeFramework) return NextResponse.json({ error: "No active framework configured for this class." }, { status: 404 });

  const papers: Array<{ id: string; name: string; maxMarks: number; sortOrder: number }> =
    await prisma.paper.findMany({
      where: {
        subjectId,
        schoolId: user.schoolId!,
        frameworkId: activeFramework.id,
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, maxMarks: true, sortOrder: true },
    });

  // The client uses period.frameworkId purely to scope Paper-related actions
  // (Add Paper, department formulas) — attach the class's own active
  // framework here rather than changing every client call site, even though
  // the period itself is no longer framework-specific.
  const periodWithFramework = { ...period, frameworkId: activeFramework.id };

  if (students.length === 0) {
    return NextResponse.json({ period: periodWithFramework, subject, schoolClass, papers, rows: [] });
  }

  const studentIds = students.map((s) => s.id);
  const paperIds = papers.map((p) => p.id);

  const items: Array<{ studentId: string; paperId: string | null; numericScore: number | null }> =
    await prisma.assessmentItem.findMany({
      where: {
        studentId: { in: studentIds },
        periodId,
        paperId: { in: paperIds },
        schoolId: user.schoolId!,
      },
      select: { studentId: true, paperId: true, numericScore: true },
    });

  const scoreMap = new Map<string, number | null>();
  for (const item of items) {
    if (item.paperId) {
      scoreMap.set(`${item.studentId}:${item.paperId}`, item.numericScore ?? null);
    }
  }

  const rows = students.map((student) => {
    const scores: Record<string, number | null> = {};
    for (const paper of papers) {
      const key = `${student.id}:${paper.id}`;
      scores[paper.id] = scoreMap.has(key) ? (scoreMap.get(key) as number | null) : null;
    }
    return { student, scores };
  });

  return NextResponse.json({ period: periodWithFramework, subject, schoolClass, papers, rows });
}
