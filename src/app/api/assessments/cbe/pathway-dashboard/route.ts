import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAssessmentActor, canAccessDashboard } from "@/lib/assessment/auth844";
import {
  pathwayScore,
  DEFAULT_PATHWAY_WEIGHT,
} from "@/lib/assessment/gradingCbe";
import { scoreToGrade } from "@/lib/assessment/grading844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * GET /api/assessments/cbe/pathway-dashboard?periodId=&classId=
 *
 * Returns Senior CBE pathway-level analytics:
 * - SBA vs exam score split per subject (class averages)
 * - Subject-track performance (STEM / Social Sciences / Arts & Sports)
 * - Per-student weighted pathway scores across all subjects
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
  // the framework id — fetch all three in parallel.
  const [period, schoolClass, students] = await Promise.all([
    db.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId: user.schoolId!, frameworkId: framework.id },
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
    where: { schoolId: user.schoolId!, applicableForms: { has: schoolClass.form } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, type: true },
  });
  const subjectIds = subjects.map((s) => s.id);

  // rawWeights and papers both only need frameworkId + subjectIds — fetch in parallel.
  const [rawWeights, papers] = await Promise.all([
    db.pathwayWeight.findMany({
      where: { frameworkId: framework.id, subjectId: { in: subjectIds } },
      select: { subjectId: true, sbaWeight: true, examWeight: true, sbaMaxMarks: true, examMaxMarks: true },
    }) as Promise<Array<{ subjectId: string; sbaWeight: number; examWeight: number; sbaMaxMarks: number; examMaxMarks: number }>>,

    db.paper.findMany({
      where: { frameworkId: framework.id, subjectId: { in: subjectIds } },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, maxMarks: true, subjectId: true, sortOrder: true },
    }) as Promise<Array<{ id: string; name: string; maxMarks: number; subjectId: string; sortOrder: number }>>,
  ]);

  const weightMap = new Map(rawWeights.map((w) => [w.subjectId, w]));

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
  // Replaces items.find(i => i.studentId===sid && i.subjectId===subj.id && i.paperId===...) everywhere.
  const itemScoreMap = new Map<string, number | null>();
  for (const item of items) {
    itemScoreMap.set(`${item.studentId}:${item.subjectId}:${item.paperId ?? ""}`, item.numericScore);
  }

  // Pre-resolve sbaId/examId once per subject — avoids recomputing the regex find
  // in both the subjectStats loop and the studentSummaries loop.
  type PathwayWeight = { sbaWeight: number; examWeight: number; sbaMaxMarks: number; examMaxMarks: number };
  type SubjectPaperIds = { sbaId: string | undefined; examId: string | undefined; w: PathwayWeight };
  const subjectPaperIds = new Map<string, SubjectPaperIds>();
  for (const subj of subjects) {
    const sPapers = papersBySubject.get(subj.id) ?? [];
    const sbaId  = (sPapers.find((p) => /sba|school/i.test(p.name))?.id ?? sPapers[0]?.id) as string | undefined;
    const examId = (sPapers.find((p) => /exam|external/i.test(p.name))?.id ?? sPapers[1]?.id) as string | undefined;
    const w = weightMap.get(subj.id) ?? DEFAULT_PATHWAY_WEIGHT;
    subjectPaperIds.set(subj.id, { sbaId, examId, w });
  }

  // ---- Build per-subject pathway stats ----
  type SubjectPathwayStat = {
    subject: { id: string; name: string; code: string };
    classMeanSba:  number | null;
    classMeanExam: number | null;
    classMeanWeighted: number | null;
    sbaWeight:    number;
    examWeight:   number;
    studentCount: number;
  };

  const subjectStats: SubjectPathwayStat[] = subjects.map((subj) => {
    const { sbaId, examId, w } = subjectPaperIds.get(subj.id)!;

    const sbas:  number[] = [];
    const exams: number[] = [];
    const weighted: number[] = [];
    let studentCount = 0;

    for (const sid of studentIds) {
      // O(1) lookup instead of items.find()
      const sbaScore  = itemScoreMap.has(`${sid}:${subj.id}:${sbaId  ?? ""}`) ? itemScoreMap.get(`${sid}:${subj.id}:${sbaId  ?? ""}`) ?? null : null;
      const examScore = itemScoreMap.has(`${sid}:${subj.id}:${examId ?? ""}`) ? itemScoreMap.get(`${sid}:${subj.id}:${examId ?? ""}`) ?? null : null;

      if (sbaScore !== null || examScore !== null) studentCount++;
      if (sbaScore  !== null) sbas.push((sbaScore  / w.sbaMaxMarks)  * 100);
      if (examScore !== null) exams.push((examScore / w.examMaxMarks) * 100);

      const ws = pathwayScore(sbaScore, examScore, w.sbaWeight, w.examWeight, w.sbaMaxMarks, w.examMaxMarks);
      if (ws !== null) weighted.push(ws);
    }

    const avg = (arr: number[]) => arr.length === 0 ? null : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;

    return {
      subject:           { id: subj.id, name: subj.name, code: subj.code },
      classMeanSba:      avg(sbas),
      classMeanExam:     avg(exams),
      classMeanWeighted: avg(weighted),
      sbaWeight:         w.sbaWeight,
      examWeight:        w.examWeight,
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
  // Uses pre-resolved subjectPaperIds and itemScoreMap — O(students × subjects), no find().
  const studentSummaries = students.map((student) => {
    const scores: number[] = [];
    for (const subj of subjects) {
      const { sbaId, examId, w } = subjectPaperIds.get(subj.id)!;
      const sbaScore  = itemScoreMap.has(`${student.id}:${subj.id}:${sbaId  ?? ""}`) ? itemScoreMap.get(`${student.id}:${subj.id}:${sbaId  ?? ""}`) ?? null : null;
      const examScore = itemScoreMap.has(`${student.id}:${subj.id}:${examId ?? ""}`) ? itemScoreMap.get(`${student.id}:${subj.id}:${examId ?? ""}`) ?? null : null;
      const ws = pathwayScore(sbaScore, examScore, w.sbaWeight, w.examWeight, w.sbaMaxMarks, w.examMaxMarks);
      if (ws !== null) scores.push(ws);
    }
    const overall = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    const grade   = overall !== null ? scoreToGrade(overall) : null;
    return { student: { id: student.id, fullName: student.fullName, admissionNumber: student.admissionNumber }, overallWeighted: overall, grade: grade?.grade ?? null, subjectCount: scores.length };
  });

  return NextResponse.json({
    period,
    schoolClass,
    hasData: true,
    subjectStats,
    trackPerformance,
    studentSummaries,
  });
}
