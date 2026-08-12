import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import {
  subjectScore,
  scoreToGrade,
  meanGrade,
  pointsToGrade,
  type KcseGrade,
} from "@/lib/assessment/grading844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * GET /api/assessments/dashboard/grade-students
 *
 * Returns the list of students whose overall mean grade matches `grade`,
 * computed under the same filters as the main dashboard endpoint.
 *
 * Query params (all optional except periodId and grade):
 *   periodId  — required
 *   grade     — required  e.g. "A", "B+", "C"
 *   classId   — optional, single class filter
 *   subjectId — optional, filter by subject
 *   form      — optional, filter by form (1–4)
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const periodId  = params.get("periodId");
  const grade     = params.get("grade") as KcseGrade | null;
  const classId   = params.get("classId")  ?? undefined;
  const subjectId = params.get("subjectId") ?? undefined;
  const formParam = params.get("form");
  const form = formParam ? parseInt(formParam, 10) : undefined;

  if (!periodId) {
    return NextResponse.json({ error: "periodId is required." }, { status: 400 });
  }
  if (!grade) {
    return NextResponse.json({ error: "grade is required." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canAccessDashboard(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ---- period + framework ----
  const period = await db.assessmentPeriod.findFirst({
    where: {
      id: periodId,
      schoolId: user.schoolId!,
      framework: { type: "EIGHT_FOUR_FOUR", isActive: true },
    },
    select: { id: true, frameworkId: true },
  });
  if (!period) return NextResponse.json({ error: "Period not found." }, { status: 404 });

  // ---- classes ----
  const classWhere: Record<string, unknown> = { schoolId: user.schoolId! };
  if (classId) classWhere.id = classId;
  if (form !== undefined && !isNaN(form)) classWhere.form = form;

  const classes = await prisma.schoolClass.findMany({
    where: classWhere,
    select: { id: true, name: true },
  });
  const classIds = classes.map((c) => c.id);
  if (classIds.length === 0) return NextResponse.json({ students: [] });

  // ---- students ----
  const students = await prisma.student.findMany({
    where: { classId: { in: classIds }, schoolId: user.schoolId! },
    select: { id: true, fullName: true, admissionNumber: true, classId: true },
  });
  if (students.length === 0) return NextResponse.json({ students: [] });
  const studentIds = students.map((s) => s.id);

  // ---- papers ----
  const papersWhere: Record<string, unknown> = {
    schoolId: user.schoolId!,
    frameworkId: period.frameworkId,
  };
  if (subjectId) papersWhere.subjectId = subjectId;
  const papers: Array<{ id: string; subjectId: string; maxMarks: number }> =
    await db.paper.findMany({
      where: papersWhere,
      select: { id: true, subjectId: true, maxMarks: true },
    });

  // ---- subjects ----
  const subjectsWhere: Record<string, unknown> = { schoolId: user.schoolId! };
  if (subjectId) subjectsWhere.id = subjectId;
  const subjects = await prisma.subject.findMany({
    where: subjectsWhere,
    select: { id: true },
  });

  // ---- assessment items ----
  const itemsWhere: Record<string, unknown> = {
    studentId: { in: studentIds },
    periodId,
    schoolId: user.schoolId!,
    resultKind: "NUMERIC",
  };
  if (subjectId) itemsWhere.subjectId = subjectId;
  const items: Array<{ studentId: string; subjectId: string | null; paperId: string | null; numericScore: number | null }> =
    await db.assessmentItem.findMany({
      where: itemsWhere,
      select: { studentId: true, subjectId: true, paperId: true, numericScore: true },
    });

  // ---- compute mean points per student (same logic as dashboard route) ----
  const papersBySubject = new Map<string, Array<{ id: string; maxMarks: number }>>();
  for (const p of papers) {
    const arr = papersBySubject.get(p.subjectId) ?? [];
    arr.push({ id: p.id, maxMarks: p.maxMarks });
    papersBySubject.set(p.subjectId, arr);
  }

  const scoreByStudentPaper = new Map<string, number>();
  for (const item of items) {
    if (item.paperId && item.numericScore !== null) {
      scoreByStudentPaper.set(`${item.studentId}:${item.paperId}`, item.numericScore);
    }
  }

  const classMap = new Map(classes.map((c) => [c.id, c.name]));

  type ResultRow = {
    admissionNumber: string;
    fullName: string;
    className: string;
    meanPoints: number;
    meanGradeLabel: KcseGrade;
  };

  const matched: ResultRow[] = [];

  for (const student of students) {
    const pts = subjects.map((s) => {
      const subjectPapers = papersBySubject.get(s.id) ?? [];
      let pct: number | null = null;
      if (subjectPapers.length === 0) {
        const item = items.find(
          (i) => i.studentId === student.id && i.subjectId === s.id && !i.paperId
        );
        if (item && item.numericScore !== null) pct = item.numericScore;
      } else {
        const ps = subjectPapers.map((p) => {
          const key = `${student.id}:${p.id}`;
          return scoreByStudentPaper.has(key) ? scoreByStudentPaper.get(key)! : null;
        });
        pct = subjectScore(ps, subjectPapers.map((p) => p.maxMarks));
      }
      return pct !== null ? scoreToGrade(pct).points : null;
    });

    const mg = meanGrade(pts);
    if (!mg) continue;

    const studentGrade = pointsToGrade(mg.meanPoints) as KcseGrade;
    if (studentGrade !== grade) continue;

    matched.push({
      admissionNumber: student.admissionNumber,
      fullName: student.fullName,
      className: classMap.get(student.classId) ?? "—",
      meanPoints: Math.round(mg.meanPoints * 100) / 100,
      meanGradeLabel: studentGrade,
    });
  }

  // Sort by mean points descending
  matched.sort((a, b) => b.meanPoints - a.meanPoints);

  return NextResponse.json({ grade, students: matched });
}
