/**
 * Server-only service logic for building report card data.
 * Shared by the single-student and class-wide API routes.
 */

import { prisma } from "@/lib/prisma";
import {
  subjectScore,
  scoreToGrade,
  meanGrade,
  denseRank,
  type KcseGrade,
} from "@/lib/assessment/grading844";
import { resolveActiveFramework } from "@/lib/assessment/resolveFramework";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export interface PaperResult {
  paper: { id: string; name: string; maxMarks: number };
  score: number | null;
}

export interface SubjectResult {
  subject: { id: string; name: string; code: string };
  papers: PaperResult[];
  subjectScore: number | null;
  grade: KcseGrade | null;
  points: number | null;
}

export interface ReportCardData {
  student: { id: string; fullName: string; admissionNumber: string };
  schoolClass: { id: string; name: string; form: number };
  period: { id: string; name: string; academicYear: string; term: number | null };
  school: { name: string };
  subjects: SubjectResult[];
  summary: {
    totalPoints: number | null;
    meanGrade: KcseGrade | null;
    meanPoints: number | null;
    position: number | null;
    classSize: number;
  };
}

type PaperDbRow = { id: string; name: string; maxMarks: number; sortOrder: number; subjectId: string };
type ItemDbRow  = { studentId: string; paperId: string | null; subjectId: string | null; numericScore: number | null };

/**
 * Build a Map<studentId, Map<paperId, numericScore>> from a flat items array.
 * O(n) construction; O(1) lookup thereafter — replaces repeated allItems.filter/find calls.
 */
function buildScoreIndex(items: ItemDbRow[]): Map<string, Map<string, number | null>> {
  const index = new Map<string, Map<string, number | null>>();
  for (const item of items) {
    if (!item.paperId) continue;
    let paperMap = index.get(item.studentId);
    if (!paperMap) {
      paperMap = new Map();
      index.set(item.studentId, paperMap);
    }
    paperMap.set(item.paperId, item.numericScore);
  }
  return index;
}

/**
 * Compute a student's total grade points using a pre-built score index.
 * O(subjects × papers) — no linear scan over allItems.
 */
function computeStudentTotalPoints(
  studentId: string,
  subjects: Array<{ id: string }>,
  papersBySubject: Map<string, Array<{ id: string; maxMarks: number }>>,
  scoreIndex: Map<string, Map<string, number | null>>
): number | null {
  const studentScores = scoreIndex.get(studentId);
  let total = 0;
  let hasAny = false;
  for (const s of subjects) {
    const sPapers = papersBySubject.get(s.id) ?? [];
    if (sPapers.length === 0) continue;
    const ps = sPapers.map((p) => {
      if (!studentScores?.has(p.id)) return null;
      return studentScores.get(p.id) ?? null;
    });
    const pct = subjectScore(ps, sPapers.map((p) => p.maxMarks));
    if (pct !== null) { total += scoreToGrade(pct).points; hasAny = true; }
  }
  return hasAny ? total : null;
}

export async function buildReportCard(
  studentId: string,
  periodId: string,
  schoolId: string
): Promise<ReportCardData | null> {
  // Gate: verify the student exists and get their classId before anything else.
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true, fullName: true, admissionNumber: true, classId: true, schoolClass: { select: { id: true, name: true, form: true } } },
  });
  if (!student) return null;

  // All five remaining lookups are independent — run in parallel.
  const [period, school, subjects, classmateIds, activeFramework] = await Promise.all([
    db.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId },
      select: { id: true, name: true, academicYear: true, term: true },
    }) as Promise<{ id: string; name: string; academicYear: string; term: number | null } | null>,

    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),

    prisma.subject.findMany({
      where: { schoolId, applicableForms: { has: student.schoolClass.form } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),

    prisma.student.findMany({
      where: { classId: student.classId, schoolId },
      select: { id: true },
    }).then((rows) => rows.map((s) => s.id)),

    resolveActiveFramework(schoolId, "EIGHT_FOUR_FOUR"),
  ]);

  if (!period || !activeFramework) return null;

  const subjectIds = subjects.map((s) => s.id);

  const papers: PaperDbRow[] = await db.paper.findMany({
    where: { schoolId, frameworkId: activeFramework.id, subjectId: { in: subjectIds } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, maxMarks: true, sortOrder: true, subjectId: true },
  });

  const allItems: ItemDbRow[] = await db.assessmentItem.findMany({
    where: { periodId, studentId: { in: classmateIds }, schoolId, resultKind: "NUMERIC" },
    select: { studentId: true, paperId: true, subjectId: true, numericScore: true },
  });

  const papersBySubject = new Map<string, PaperDbRow[]>();
  for (const p of papers) {
    const arr = papersBySubject.get(p.subjectId) ?? [];
    arr.push(p);
    papersBySubject.set(p.subjectId, arr);
  }

  // Build score index once — O(allItems); all subsequent lookups are O(1).
  const scoreIndex = buildScoreIndex(allItems);

  const classmatePoints = new Map<string, number | null>();
  for (const cid of classmateIds) {
    classmatePoints.set(cid, computeStudentTotalPoints(cid, subjects, papersBySubject, scoreIndex));
  }

  const ranks = denseRank(classmateIds.map((id) => classmatePoints.get(id) ?? null));
  const positionMap = new Map<string, number | null>();
  classmateIds.forEach((id, i) => positionMap.set(id, ranks[i]));

  // O(1) lookup per paper using the shared index — no filter pass.
  const studentScoreMap = scoreIndex.get(studentId) ?? new Map<string, number | null>();

  const subjectResults: SubjectResult[] = subjects.map((s) => {
    const sPapers = papersBySubject.get(s.id) ?? [];
    const paperResults: PaperResult[] = sPapers.map((p) => ({
      paper: { id: p.id, name: p.name, maxMarks: p.maxMarks },
      score: studentScoreMap.has(p.id) ? (studentScoreMap.get(p.id) ?? null) : null,
    }));
    const ps = sPapers.map((p) => studentScoreMap.has(p.id) ? (studentScoreMap.get(p.id) ?? null) : null);
    const pct = sPapers.length > 0 ? subjectScore(ps, sPapers.map((p) => p.maxMarks)) : null;
    const gr = pct !== null ? scoreToGrade(pct) : null;
    return { subject: s, papers: paperResults, subjectScore: pct !== null ? Math.round(pct * 100) / 100 : null, grade: gr?.grade ?? null, points: gr?.points ?? null };
  });

  const totalPoints = classmatePoints.get(studentId) ?? null;
  const mg = meanGrade(subjectResults.map((r) => r.points));
  const rankedCount = classmateIds.filter((id) => classmatePoints.get(id) !== null).length;

  return {
    student: { id: student.id, fullName: student.fullName, admissionNumber: student.admissionNumber },
    schoolClass: student.schoolClass,
    period: { id: period.id, name: period.name, academicYear: period.academicYear, term: period.term },
    school: { name: school?.name ?? "" },
    subjects: subjectResults,
    summary: { totalPoints, meanGrade: mg?.grade ?? null, meanPoints: mg?.meanPoints ?? null, position: positionMap.get(studentId) ?? null, classSize: rankedCount },
  };
}

export async function buildClassReportCards(
  classId: string,
  periodId: string,
  schoolId: string
): Promise<{
  schoolClass: { id: string; name: string; form: number };
  period: { id: string; name: string; academicYear: string; term: number | null };
  school: { name: string };
  students: ReportCardData[];
} | null> {
  // Gate: must verify class exists before knowing the form for subject filtering.
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, name: true, form: true },
  });
  if (!schoolClass) return null;

  // All five remaining lookups are independent — run in parallel.
  const [period, school, students, activeFramework] = await Promise.all([
    db.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId },
      select: { id: true, name: true, academicYear: true, term: true },
    }) as Promise<{ id: string; name: string; academicYear: string; term: number | null } | null>,

    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }),

    prisma.student.findMany({
      where: { classId, schoolId },
      orderBy: { admissionNumber: "asc" },
      select: { id: true, fullName: true, admissionNumber: true },
    }),

    resolveActiveFramework(schoolId, "EIGHT_FOUR_FOUR"),
  ]);

  if (!period || !activeFramework) return null;

  const studentIds = students.map((s) => s.id);

  // subjects and papers: subjects must resolve first (papers needs subjectIds),
  // but both are independent of the students/school queries above.
  const subjects = await prisma.subject.findMany({
    where: { schoolId, applicableForms: { has: schoolClass.form } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  const subjectIds = subjects.map((s) => s.id);

  const allPapers: PaperDbRow[] = await db.paper.findMany({
    where: { schoolId, frameworkId: activeFramework.id, subjectId: { in: subjectIds } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, maxMarks: true, sortOrder: true, subjectId: true },
  });

  const allItems: ItemDbRow[] = await db.assessmentItem.findMany({
    where: { periodId, studentId: { in: studentIds }, schoolId, resultKind: "NUMERIC" },
    select: { studentId: true, paperId: true, subjectId: true, numericScore: true },
  });

  const papersBySubject = new Map<string, PaperDbRow[]>();
  for (const p of allPapers) {
    const arr = papersBySubject.get(p.subjectId) ?? [];
    arr.push(p);
    papersBySubject.set(p.subjectId, arr);
  }

  // Build score index once — O(allItems).
  // scoreIndex: studentId → (paperId → numericScore)
  const scoreIndex = buildScoreIndex(allItems);

  const totalPointsMap = new Map<string, number | null>();
  for (const student of students) {
    totalPointsMap.set(student.id, computeStudentTotalPoints(student.id, subjects, papersBySubject, scoreIndex));
  }

  const ranks = denseRank(students.map((s) => totalPointsMap.get(s.id) ?? null));
  const positionMap = new Map<string, number | null>();
  students.forEach((s, i) => positionMap.set(s.id, ranks[i]));
  const rankedCount = students.filter((s) => totalPointsMap.get(s.id) !== null).length;

  const periodInfo = { id: period.id, name: period.name, academicYear: period.academicYear, term: period.term };
  const schoolInfo = { name: school?.name ?? "" };

  const cardData: ReportCardData[] = students.map((student) => {
    // O(1) per paper — no allItems scan per student.
    const studentScoreMap = scoreIndex.get(student.id) ?? new Map<string, number | null>();

    const subjectResults: SubjectResult[] = subjects.map((s) => {
      const sPapers = papersBySubject.get(s.id) ?? [];
      const paperResults: PaperResult[] = sPapers.map((p) => ({
        paper: { id: p.id, name: p.name, maxMarks: p.maxMarks },
        score: studentScoreMap.has(p.id) ? (studentScoreMap.get(p.id) ?? null) : null,
      }));
      const ps = sPapers.map((p) => studentScoreMap.has(p.id) ? (studentScoreMap.get(p.id) ?? null) : null);
      const pct = sPapers.length > 0 ? subjectScore(ps, sPapers.map((p) => p.maxMarks)) : null;
      const gr = pct !== null ? scoreToGrade(pct) : null;
      return { subject: s, papers: paperResults, subjectScore: pct !== null ? Math.round(pct * 100) / 100 : null, grade: gr?.grade ?? null, points: gr?.points ?? null };
    });

    const mg = meanGrade(subjectResults.map((r) => r.points));
    return {
      student: { id: student.id, fullName: student.fullName, admissionNumber: student.admissionNumber },
      schoolClass,
      period: periodInfo,
      school: schoolInfo,
      subjects: subjectResults,
      summary: { totalPoints: totalPointsMap.get(student.id) ?? null, meanGrade: mg?.grade ?? null, meanPoints: mg?.meanPoints ?? null, position: positionMap.get(student.id) ?? null, classSize: rankedCount },
    };
  });

  cardData.sort((a, b) => {
    const pa = a.summary.position, pb = b.summary.position;
    if (pa !== null && pb !== null) return pa - pb;
    if (pa !== null) return -1;
    if (pb !== null) return 1;
    return a.student.admissionNumber.localeCompare(b.student.admissionNumber);
  });

  return {
    schoolClass,
    period: periodInfo,
    school: schoolInfo,
    students: cardData,
  };
}
