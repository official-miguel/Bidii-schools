import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import { subjectScore } from "@/lib/assessment/grading844";
import { resolveCbeGrade } from "@/lib/assessment/gradingScale";
import { subjectFormWhere } from "@/lib/assessment/subjectScope";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * GET /api/assessments/cbe/pathway-dashboard?periodId=&classId=
 *
 * Returns Senior CBE pathway-level analytics:
 * - Class mean % per subject
 * - Subject-track performance (STEM / Social Sciences / Arts & Sports)
 * - Per-student overall score across all subjects, graded on the CBE scale
 *
 * Entry is now identical to 8-4-4 — one score per paper, any number of
 * papers per subject — so this reads AssessmentItems the same generic way
 * the 8-4-4 dashboard does (sum of scores weighted by each paper's max
 * marks). There is no more fixed SBA+exam pairing to assume.
 */
export async function GET(req: NextRequest) {
  const params   = req.nextUrl.searchParams;
  const periodId = params.get("periodId");
  const classId  = params.get("classId");

  if (!periodId || !classId) {
    return NextResponse.json({ error: "periodId and classId are required." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveAssessmentActor(user, user.schoolId!);
  if (!canAccessDashboard(actor)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Resolve Senior CBE framework.
  const framework = await db.assessmentFramework.findFirst({
    where: { schoolId: user.schoolId!, type: "CBE", isActive: true },
    select: { id: true },
  }) as { id: string } | null;
  if (!framework) {
    return NextResponse.json({ error: "No active CBE framework found." }, { status: 404 });
  }

  // period, schoolClass, and students are all independent once we have
  // the framework id — fetch all three in parallel. Periods are shared
  // across every framework now, so no frameworkId filter here.
  const [period, schoolClass, students] = await Promise.all([
    db.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId: user.schoolId! },
      select: { id: true, name: true, academicYear: true, term: true },
    }) as Promise<{ id: string; name: string; academicYear: string; term: number | null } | null>,

    prisma.schoolClass.findFirst({
      where: { id: classId, schoolId: user.schoolId! },
      select: { id: true, name: true, form: true },
    }),

    prisma.student.findMany({
      where: { classId, schoolId: user.schoolId! },
      orderBy: { admissionNumber: "asc" },
      select: { id: true, fullName: true, admissionNumber: true },
    }),
  ]);

  if (!period) {
    return NextResponse.json({ error: "Period not found." }, { status: 404 });
  }
  if (!schoolClass) {
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  }
  if (students.length === 0) {
    return NextResponse.json({ period, schoolClass, hasData: false });
  }

  const studentIds = students.map((s) => s.id);

  // Fetch subjects applicable to this class's form.
  const subjects = await prisma.subject.findMany({
    where: { schoolId: user.schoolId!, ...subjectFormWhere(schoolClass.form) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, type: true },
  });
  const subjectIds = subjects.map((s) => s.id);

  const papers = await db.paper.findMany({
    where: { frameworkId: framework.id, subjectId: { in: subjectIds } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, maxMarks: true, subjectId: true, sortOrder: true },
  }) as Array<{ id: string; name: string; maxMarks: number; subjectId: string; sortOrder: number }>;

  const papersBySubject = new Map<string, typeof papers>();
  for (const p of papers) {
    const arr = papersBySubject.get(p.subjectId) ?? [];
    arr.push(p);
    papersBySubject.set(p.subjectId, arr);
  }

  // Fetch numeric items for these students/period.
  const items = await db.assessmentItem.findMany({
    where: {
      periodId,
      studentId: { in: studentIds },
      schoolId: user.schoolId!,
      resultKind: "NUMERIC",
      subjectId: { in: subjectIds },
    },
    select: { studentId: true, subjectId: true, paperId: true, numericScore: true },
  }) as Array<{ studentId: string; subjectId: string | null; paperId: string | null; numericScore: number | null }>;

  if (items.length === 0) {
    return NextResponse.json({ period, schoolClass, hasData: false });
  }

  // Build O(1) lookup: "studentId:subjectId:paperId" → numericScore.
  const itemScoreMap = new Map<string, number | null>();
  for (const item of items) {
    itemScoreMap.set(`${item.studentId}:${item.subjectId}:${item.paperId ?? ""}`, item.numericScore);
  }

  /** A student's percentage for a subject, across however many papers it has. */
  function studentSubjectPct(studentId: string, subjectId: string): number | null {
    const sPapers = papersBySubject.get(subjectId) ?? [];
    if (sPapers.length === 0) return null;
    const scores   = sPapers.map((p) => itemScoreMap.get(`${studentId}:${subjectId}:${p.id}`) ?? null);
    const maxMarks = sPapers.map((p) => p.maxMarks);
    return subjectScore(scores, maxMarks);
  }

  // ---- Build per-subject class stats ----
  type SubjectPathwayStat = {
    subject: { id: string; name: string; code: string };
    classMeanWeighted: number | null;
    studentCount: number;
  };

  const subjectStats: SubjectPathwayStat[] = subjects.map((subj) => {
    const pcts: number[] = [];
    let studentCount = 0;

    for (const sid of studentIds) {
      const pct = studentSubjectPct(sid, subj.id);
      if (pct !== null) { pcts.push(pct); studentCount++; }
    }

    const mean = pcts.length === 0 ? null : Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10;

    return {
      subject:           { id: subj.id, name: subj.name, code: subj.code },
      classMeanWeighted: mean,
      studentCount,
    };
  });

  // ---- Subject-track grouping (STEM / Social Sciences / Arts & Sports / Other) ----
  function classifyTrack(name: string, code: string): string {
    const n = (name + " " + code).toLowerCase();
    if (/math|science|biology|chemistry|physics|computer|ict|engineering|tech/.test(n)) return "STEM";
    if (/history|geography|economics|business|social|civics|government|religion|cre|ire/.test(n)) return "Social Sciences";
    if (/art|music|drama|sports|pe|physical|craft|home\s*science|french|german|arabic|swahili|english\s*lit/.test(n)) return "Arts & Sports";
    return "Other";
  }

  const trackMap = new Map<string, typeof subjectStats>();
  for (const stat of subjectStats) {
    const track = classifyTrack(stat.subject.name, stat.subject.code);
    const arr = trackMap.get(track) ?? [];
    arr.push(stat);
    trackMap.set(track, arr);
  }

  const trackPerformance = Array.from(trackMap.entries()).map(([track, stats]) => {
    const scores = stats.map((s) => s.classMeanWeighted).filter((v): v is number => v !== null);
    const mean   = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    return { track, subjectCount: stats.length, classMeanWeighted: mean };
  }).sort((a, b) => (b.classMeanWeighted ?? 0) - (a.classMeanWeighted ?? 0));

  // ---- Per-student summary row ----
  const studentSummaries = await Promise.all(students.map(async (student) => {
    const scores: number[] = [];
    for (const subj of subjects) {
      const pct = studentSubjectPct(student.id, subj.id);
      if (pct !== null) scores.push(pct);
    }
    const overall = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    // Resolve grade from school's active scale (falls back to govt default).
    const gradeResult = overall !== null ? await resolveCbeGrade(user.schoolId!, overall, 100) : null;
    return {
      student:       { id: student.id, fullName: student.fullName, admissionNumber: student.admissionNumber },
      overallWeighted: overall,
      grade:         gradeResult?.bandName ?? null,
      subjectCount:  scores.length,
    };
  }));

  return NextResponse.json({
    period,
    schoolClass,
    hasData: true,
    subjectStats,
    trackPerformance,
    studentSummaries,
  });
}
