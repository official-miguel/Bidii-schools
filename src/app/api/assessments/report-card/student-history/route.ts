/**
 * GET /api/assessments/report-card/student-history
 *
 * Returns a student's mean score across all past 8-4-4 periods so the
 * report card can render the "Performance over Time" line chart.
 *
 * Query params:
 *   studentId  – required
 *
 * Response:
 *   { points: Array<{ label: string; score: number | null }> }
 *
 * Points are sorted oldest → newest.  label is human-friendly:
 *   "Form 1 – CAT 1 (2024 Term 1)"
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  subjectScore,
  scoreToGrade,
  meanGrade,
} from "@/lib/assessment/grading844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET(req: NextRequest) {
  const params    = req.nextUrl.searchParams;
  const studentId = params.get("studentId");

  if (!studentId) {
    return NextResponse.json({ error: "studentId is required." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the student (verify ownership + get form).
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId! },
    select: {
      id: true,
      schoolClass: { select: { form: true } },
    },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  // Resolve the active 8-4-4 framework.
  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: "EIGHT_FOUR_FOUR", isActive: true },
    select: { id: true },
  }) as { id: string } | null;

  if (!framework) {
    return NextResponse.json({ points: [] });
  }

  // All periods for this framework, sorted oldest-first.
  const periods = await db.assessmentPeriod.findMany({
    where: { schoolId: user.schoolId!, frameworkId: framework.id },
    orderBy: [{ academicYear: "asc" }, { term: "asc" }, { name: "asc" }],
    select: { id: true, name: true, academicYear: true, term: true },
  }) as Array<{ id: string; name: string; academicYear: string; term: number | null }>;

  if (periods.length === 0) {
    return NextResponse.json({ points: [] });
  }

  const periodIds = periods.map((p) => p.id);

  // All papers for this student's form (so we can compute subject %).
  const subjects = await prisma.subject.findMany({
    where: {
      schoolId: user.schoolId!,
      applicableForms: { has: student.schoolClass.form },
    },
    select: { id: true },
  });
  const subjectIds = subjects.map((s) => s.id);

  const papers = await db.paper.findMany({
    where: {
      schoolId: user.schoolId!,
      frameworkId: framework.id,
      subjectId: { in: subjectIds },
    },
    select: { id: true, maxMarks: true, subjectId: true },
  }) as Array<{ id: string; maxMarks: number; subjectId: string }>;

  const papersBySubject = new Map<string, typeof papers>();
  for (const p of papers) {
    const arr = papersBySubject.get(p.subjectId) ?? [];
    arr.push(p);
    papersBySubject.set(p.subjectId, arr);
  }

  // All assessment items for this student across all periods in one query.
  const allItems = await db.assessmentItem.findMany({
    where: {
      schoolId: user.schoolId!,
      studentId,
      periodId: { in: periodIds },
      resultKind: "NUMERIC",
    },
    select: { periodId: true, paperId: true, numericScore: true },
  }) as Array<{ periodId: string; paperId: string | null; numericScore: number | null }>;

  // Group items by periodId for quick lookup.
  const itemsByPeriod = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const arr = itemsByPeriod.get(item.periodId) ?? [];
    arr.push(item);
    itemsByPeriod.set(item.periodId, arr);
  }

  // Build one point per period.
  const points = periods.map((period) => {
    const items = itemsByPeriod.get(period.id) ?? [];

    // Compute subject scores, then mean grade points.
    const subjectPoints: (number | null)[] = subjects.map((subj) => {
      const sPapers = papersBySubject.get(subj.id) ?? [];
      if (sPapers.length === 0) return null;
      const scores = sPapers.map((p) => {
        const item = items.find((i) => i.paperId === p.id);
        return item ? (item.numericScore ?? null) : null;
      });
      const pct = subjectScore(scores, sPapers.map((p) => p.maxMarks));
      return pct !== null ? scoreToGrade(pct).points : null;
    });

    const mg   = meanGrade(subjectPoints);
    const score = mg !== null
      // Convert mean grade points (1–12) back to approximate % for the chart
      // using the same band midpoints so the scale matches the image.
      ? Math.round((mg.meanPoints / 12) * 100)
      : null;

    // Format label like: "Form 1 – CAT 1 (2024 Term 1)"
    const termPart = period.term ? ` Term ${period.term}` : "";
    const label    = `${period.name} (${period.academicYear}${termPart})`;

    return { label, score };
  });

  return NextResponse.json({ points });
}
