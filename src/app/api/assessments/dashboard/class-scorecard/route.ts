import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
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
 * GET /api/assessments/dashboard/class-scorecard
 *
 * Per-student × per-subject score breakdown for a single class or entire form.
 *
 * Query params:
 *   periodId  — required
 *   classId   — a single class  (mutually exclusive with form)
 *   form      — any registered form number, all streams  (mutually exclusive with classId)
 */
export async function GET(req: NextRequest) {
  try {
    return await scorecardHandler(req);
  } catch (err) {
    console.error("[class-scorecard] unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

async function scorecardHandler(req: NextRequest) {
  const params    = req.nextUrl.searchParams;
  const periodId  = params.get("periodId");
  const classId   = params.get("classId") ?? undefined;
  const formParam = params.get("form");
  const form      = formParam ? parseInt(formParam, 10) : undefined;

  if (!periodId)
    return NextResponse.json({ error: "periodId is required." }, { status: 400 });
  if (!classId && form === undefined)
    return NextResponse.json({ error: "classId or form is required." }, { status: 400 });
  if (form !== undefined && isNaN(form))
    return NextResponse.json({ error: "form must be a number." }, { status: 400 });

  // ── Batch 1: auth + period — run concurrently ─────────────────────────────
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [actor, period] = await Promise.all([
    resolveAssessmentActor(user, user.schoolId!),
    db.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId: user.schoolId! },
      select: { id: true, frameworkId: true },
    }),
  ]);

  if (!canAccessDashboard(actor))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!period)
    return NextResponse.json({ error: "Period not found." }, { status: 404 });

  // ── Resolve scope: single class or whole form ─────────────────────────────
  let resolvedForm: number;
  let scopeLabel: string;

  if (classId) {
    const schoolClass = await prisma.schoolClass.findFirst({
      where: { id: classId, schoolId: user.schoolId! },
      select: { id: true, name: true, form: true },
    });
    if (!schoolClass)
      return NextResponse.json({ error: "Class not found." }, { status: 404 });
    resolvedForm = schoolClass.form;
    scopeLabel   = schoolClass.name;
  } else {
    resolvedForm = form!;
    scopeLabel   = `Form ${form}`;
  }

  // ── Batch 2: classes + rankingConfig — run concurrently ───────────────────
  const classWhere: Record<string, unknown> = {
    schoolId: user.schoolId!,
    form: resolvedForm,
  };
  if (classId) classWhere.id = classId;

  const [classes, rankingConfig] = await Promise.all([
    prisma.schoolClass.findMany({
      where: classWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.rankingConfig.findUnique({
      where: { schoolId: user.schoolId! },
      select: { meanFlagThreshold: true },
    }),
  ]);

  if (classes.length === 0)
    return NextResponse.json({
      scopeLabel, subjects: [], rows: [], meanFlagThreshold: null, multiClass: false,
    });

  const classIds     = classes.map((c) => c.id);
  const classNameMap = new Map(classes.map((c) => [c.id, c.name]));

  // ── Batch 3: students + subjects + papers — run concurrently ─────────────
  const [students, coreSubjects, papers] = await Promise.all([
    prisma.student.findMany({
      where: { classId: { in: classIds }, schoolId: user.schoolId! },
      orderBy: [{ classId: "asc" }, { fullName: "asc" }],
      select: { id: true, fullName: true, admissionNumber: true, classId: true },
    }),
    prisma.subject.findMany({
      where: { schoolId: user.schoolId!, applicableForms: { has: resolvedForm } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    db.paper.findMany({
      where: { schoolId: user.schoolId!, frameworkId: period.frameworkId },
      select: { id: true, subjectId: true, maxMarks: true },
    }),
  ]);

  if (students.length === 0)
    return NextResponse.json({
      scopeLabel, subjects: [], rows: [], meanFlagThreshold: null, multiClass: false,
    });

  const studentIds = students.map((s) => s.id);

  // ── Batch 4: assessment items + electives — run concurrently ─────────────
  const [items, electiveRows] = await Promise.all([
    db.assessmentItem.findMany({
      where: {
        studentId:  { in: studentIds },
        periodId,
        schoolId: user.schoolId!,
        resultKind: "NUMERIC",
      },
      select: { studentId: true, subjectId: true, paperId: true, numericScore: true },
    }),
    prisma.studentElective.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, subjectId: true },
    }),
  ]);

  // ── Build lookup maps ─────────────────────────────────────────────────────
  const papersBySubject = new Map<string, Array<{ id: string; maxMarks: number }>>();
  const subjectByPaper  = new Map<string, string>();
  for (const p of papers) {
    const arr = papersBySubject.get(p.subjectId) ?? [];
    arr.push({ id: p.id, maxMarks: p.maxMarks });
    papersBySubject.set(p.subjectId, arr);
    subjectByPaper.set(p.id, p.subjectId);
  }

  const electivesByStudent = new Map<string, Set<string>>();
  const electiveSubjectIds = new Set<string>();
  for (const row of electiveRows) {
    const set = electivesByStudent.get(row.studentId) ?? new Set<string>();
    set.add(row.subjectId);
    electivesByStudent.set(row.studentId, set);
    electiveSubjectIds.add(row.subjectId);
  }

  // Fetch elective subject details only if needed (avoids an extra round-trip
  // for schools that don't use electives).
  const electiveSubjects = electiveSubjectIds.size > 0
    ? await prisma.subject.findMany({
        where: { id: { in: [...electiveSubjectIds] }, schoolId: user.schoolId! },
        orderBy: { name: "asc" },
        select: { id: true, name: true, code: true },
      })
    : [];

  const coreIds = new Set(coreSubjects.map((s) => s.id));
  const allSubjects = [
    ...coreSubjects,
    ...electiveSubjects.filter((s) => !coreIds.has(s.id)),
  ];

  function studentSubjectSet(sid: string): Set<string> {
    return new Set([...coreIds, ...(electivesByStudent.get(sid) ?? new Set<string>())]);
  }

  const scoreByStudentPaper   = new Map<string, number>();
  const scoreByStudentSubject = new Map<string, number>();
  for (const item of items) {
    if (item.paperId && item.numericScore !== null) {
      scoreByStudentPaper.set(`${item.studentId}:${item.paperId}`, item.numericScore);
    } else if (!item.paperId && item.subjectId && item.numericScore !== null) {
      scoreByStudentSubject.set(`${item.studentId}:${item.subjectId}`, item.numericScore);
    }
  }

  // Only show subjects that have at least one score in this scope.
  const subjectHasData = new Set<string>();
  for (const item of items) {
    if (item.numericScore === null) continue;
    if (item.subjectId) subjectHasData.add(item.subjectId);
    if (item.paperId) {
      const sid = subjectByPaper.get(item.paperId);
      if (sid) subjectHasData.add(sid);
    }
  }
  const activeSubjects = allSubjects.filter((s) => subjectHasData.has(s.id));

  // ── Build rows ────────────────────────────────────────────────────────────
  type SubjectCell = { pct: number | null; grade: KcseGrade | null; points: number | null };
  type StudentRow  = {
    admissionNumber: string;
    fullName: string;
    className: string;
    subjects: SubjectCell[];
    meanPoints: number | null;
    meanGrade: KcseGrade | null;
  };

  const rows: StudentRow[] = students.map((student) => {
    const thisSubjects = studentSubjectSet(student.id);

    const subjectCells: SubjectCell[] = activeSubjects.map((s) => {
      if (!thisSubjects.has(s.id)) return { pct: null, grade: null, points: null };

      const subjectPapers = papersBySubject.get(s.id) ?? [];
      let pct: number | null = null;
      if (subjectPapers.length === 0) {
        const score = scoreByStudentSubject.get(`${student.id}:${s.id}`);
        if (score !== undefined) pct = score;
      } else {
        const ps = subjectPapers.map((p) => {
          const v = scoreByStudentPaper.get(`${student.id}:${p.id}`);
          return v !== undefined ? v : null;
        });
        pct = subjectScore(ps, subjectPapers.map((p) => p.maxMarks));
      }
      if (pct === null) return { pct: null, grade: null, points: null };
      const { grade, points } = scoreToGrade(pct);
      return { pct: Math.round(pct * 100) / 100, grade: grade as KcseGrade, points };
    });

    const pts = subjectCells
      .filter((_, i) => thisSubjects.has(activeSubjects[i].id))
      .map((c) => c.points);
    const mg = meanGrade(pts);

    return {
      admissionNumber: student.admissionNumber,
      fullName:        student.fullName,
      className:       classNameMap.get(student.classId) ?? "—",
      subjects:        subjectCells,
      meanPoints:      mg ? Math.round(mg.meanPoints * 100) / 100 : null,
      meanGrade:       mg ? (pointsToGrade(mg.meanPoints) as KcseGrade) : null,
    };
  });

  // Sort: highest mean points first, unscored students last.
  rows.sort((a, b) => {
    if (a.meanPoints === null && b.meanPoints === null) return 0;
    if (a.meanPoints === null) return 1;
    if (b.meanPoints === null) return -1;
    return b.meanPoints - a.meanPoints;
  });

  return NextResponse.json({
    scopeLabel,
    subjects:           activeSubjects.map((s) => ({ id: s.id, name: s.name, code: s.code })),
    meanFlagThreshold:  rankingConfig?.meanFlagThreshold ?? null,
    multiClass:         classIds.length > 1,
    rows,
  });
}
