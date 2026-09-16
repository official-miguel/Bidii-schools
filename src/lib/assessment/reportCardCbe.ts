/**
 * Server-only service logic for building CBE report card data.
 * Shared by the CBE report-card API route and the print page.
 *
 * Key design constraints (from spec):
 *  - Junior CBE: NO numeric mean, NO class rank. Results expressed as
 *    performance levels (EE/ME/AE/BE) per strand/sub-strand only.
 *  - Senior CBE: weighted pathway score (SBA + exam) per subject, plus an
 *    overall pathway summary. Still no class rank.
 */

import { prisma } from "@/lib/prisma";
import { type PerformanceLevel } from "@/lib/assessment/gradingCbe";
import { resolveCbeGrade } from "@/lib/assessment/gradingScale";
import { resolveActiveFramework } from "@/lib/assessment/resolveFramework";
import { subjectScore } from "@/lib/assessment/grading844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type CbeReportKind = "JUNIOR" | "SENIOR";

// ---- Junior CBE ----

export interface JuniorSubStrandResult {
  subStrand: { id: string; name: string };
  level: PerformanceLevel | null;
  comment: string | null;
}

export interface JuniorStrandResult {
  strand: { id: string; name: string };
  subStrands: JuniorSubStrandResult[];
  /** Modal level — most common level across sub-strands in this strand.
   *  Null when no entries exist. Never a numeric mean. */
  summaryLevel: PerformanceLevel | null;
}

export interface JuniorLearningAreaResult {
  learningArea: { id: string; name: string };
  strands: JuniorStrandResult[];
  /** Modal level across all sub-strands in this learning area. */
  summaryLevel: PerformanceLevel | null;
}

export interface JuniorReportCardData {
  kind: "JUNIOR";
  student: { id: string; fullName: string; admissionNumber: string };
  schoolClass: { id: string; name: string; form: number };
  period: { id: string; name: string; academicYear: string; term: number | null };
  school: { name: string };
  learningAreas: JuniorLearningAreaResult[];
  /** AI-drafted narrative (populated later by the AI layer — empty string when
   *  no AI key is configured, so the print page can show a placeholder). */
  narrativeSummary: string;
  /** Counts of each level across ALL sub-strands for this student. */
  levelTotals: Record<PerformanceLevel, number>;
  /** Total sub-strands assessed (with a level entered). */
  assessedCount: number;
  /** Total sub-strands in the framework. */
  totalSubStrands: number;
}

// ---- Senior CBE ----

export interface SeniorSubjectResult {
  subject: { id: string; name: string; code: string };
  /** Combined percentage (0–100) across however many papers this subject
   * has — entry is identical to 8-4-4, so there is no fixed SBA/exam split
   * to report separately any more. Null if no papers have a score yet. */
  weightedScore: number | null;
  /** Indicative grade band derived from weightedScore, from the school's
   * CBE grading scale (e.g. "EE1", "ME2"). */
  indicativeGrade: string | null;
}

export interface SeniorReportCardData {
  kind: "SENIOR";
  student: { id: string; fullName: string; admissionNumber: string };
  schoolClass: { id: string; name: string; form: number };
  period: { id: string; name: string; academicYear: string; term: number | null };
  school: { name: string };
  subjects: SeniorSubjectResult[];
  /** Mean of all non-null weightedScores. Displayed as a summary, not a rank. */
  overallWeightedMean: number | null;
  /** No class position/rank for CBE. */
  narrativeSummary: string;
}

export type CbeReportCardData = JuniorReportCardData | SeniorReportCardData;

// ---------------------------------------------------------------------------
// Helper: modal level (most common non-null level)
// ---------------------------------------------------------------------------

function modalLevel(levels: (PerformanceLevel | null)[]): PerformanceLevel | null {
  const valid = levels.filter((l): l is PerformanceLevel => l !== null);
  if (valid.length === 0) return null;
  const counts = { EE: 0, ME: 0, AE: 0, BE: 0 } as Record<PerformanceLevel, number>;
  for (const l of valid) counts[l]++;
  return (Object.entries(counts) as [PerformanceLevel, number][])
    .sort((a, b) => b[1] - a[1])[0][0];
}

// ---------------------------------------------------------------------------
// buildJuniorReportCard
// ---------------------------------------------------------------------------

export async function buildJuniorReportCard(
  studentId: string,
  periodId: string,
  schoolId: string
): Promise<JuniorReportCardData | null> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true, fullName: true, admissionNumber: true, classId: true,
      schoolClass: { select: { id: true, name: true, form: true } },
    },
  });
  if (!student) return null;

  const [period, cbeFramework] = await Promise.all([
    db.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId },
      select: { id: true, name: true, academicYear: true, term: true },
    }) as Promise<{ id: string; name: string; academicYear: string; term: number | null } | null>,
    resolveActiveFramework(schoolId, "CBE"),
  ]);
  if (!period || !cbeFramework) return null;

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });

  // Fetch the full CBE hierarchy scoped to this framework.
  const learningAreas = await db.learningArea.findMany({
    where: { frameworkId: cbeFramework.id, schoolId },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true,
      strands: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, name: true, sortOrder: true,
          subStrands: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, sortOrder: true },
          },
        },
      },
    },
  }) as Array<{
    id: string; name: string;
    strands: Array<{
      id: string; name: string; sortOrder: number;
      subStrands: Array<{ id: string; name: string; sortOrder: number }>;
    }>;
  }>;

  // Collect all sub-strand ids so we can fetch items in one query.
  const allSubStrandIds = learningAreas.flatMap((la) =>
    la.strands.flatMap((s) => s.subStrands.map((ss) => ss.id))
  );

  const items = await db.assessmentItem.findMany({
    where: {
      periodId,
      studentId,
      schoolId,
      resultKind: "PERFORMANCE_LEVEL",
      subStrandId: { in: allSubStrandIds },
    },
    select: {
      subStrandId: true,
      performanceLevel: true,
      comment: true,
    },
  }) as Array<{ subStrandId: string; performanceLevel: PerformanceLevel | null; comment: string | null }>;

  const itemMap = new Map(items.map((i) => [i.subStrandId, i]));

  // Build the hierarchy result.
  const levelTotals: Record<PerformanceLevel, number> = { EE: 0, ME: 0, AE: 0, BE: 0 };
  let assessedCount = 0;
  let totalSubStrands = 0;

  const areaResults: JuniorLearningAreaResult[] = learningAreas.map((la) => {
    const strandResults: JuniorStrandResult[] = la.strands.map((strand) => {
      const ssResults: JuniorSubStrandResult[] = strand.subStrands.map((ss) => {
        totalSubStrands++;
        const item = itemMap.get(ss.id);
        const level = item?.performanceLevel ?? null;
        if (level) { levelTotals[level]++; assessedCount++; }
        return { subStrand: { id: ss.id, name: ss.name }, level, comment: item?.comment ?? null };
      });
      const strandLevels = ssResults.map((r) => r.level);
      return {
        strand: { id: strand.id, name: strand.name },
        subStrands: ssResults,
        summaryLevel: modalLevel(strandLevels),
      };
    });
    const areaLevels = strandResults.flatMap((s) => s.subStrands.map((ss) => ss.level));
    return {
      learningArea: { id: la.id, name: la.name },
      strands: strandResults,
      summaryLevel: modalLevel(areaLevels),
    };
  });

  return {
    kind: "JUNIOR",
    student: { id: student.id, fullName: student.fullName, admissionNumber: student.admissionNumber },
    schoolClass: student.schoolClass,
    period: { id: period.id, name: period.name, academicYear: period.academicYear, term: period.term },
    school: { name: school?.name ?? "" },
    learningAreas: areaResults,
    narrativeSummary: "",    // populated by AI layer when available
    levelTotals,
    assessedCount,
    totalSubStrands,
  };
}

// ---------------------------------------------------------------------------
// buildSeniorReportCard
// ---------------------------------------------------------------------------

export async function buildSeniorReportCard(
  studentId: string,
  periodId: string,
  schoolId: string
): Promise<SeniorReportCardData | null> {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true, fullName: true, admissionNumber: true, classId: true,
      schoolClass: { select: { id: true, name: true, form: true } },
    },
  });
  if (!student) return null;

  const [period, cbeFramework] = await Promise.all([
    db.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId },
      select: { id: true, name: true, academicYear: true, term: true },
    }) as Promise<{ id: string; name: string; academicYear: string; term: number | null } | null>,
    resolveActiveFramework(schoolId, "CBE"),
  ]);
  if (!period || !cbeFramework) return null;

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });

  const subjects = await prisma.subject.findMany({
    where: { schoolId, applicableForms: { has: student.schoolClass.form } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  // Entry is identical to 8-4-4 — any number of generically-named papers
  // per subject, no fixed SBA/exam pairing.
  const papers = await db.paper.findMany({
    where: { frameworkId: cbeFramework.id, subjectId: { in: subjects.map((s) => s.id) } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, maxMarks: true, subjectId: true },
  }) as Array<{ id: string; maxMarks: number; subjectId: string }>;

  const papersBySubject = new Map<string, typeof papers>();
  for (const p of papers) {
    const arr = papersBySubject.get(p.subjectId) ?? [];
    arr.push(p);
    papersBySubject.set(p.subjectId, arr);
  }

  const items = await db.assessmentItem.findMany({
    where: { periodId, studentId, schoolId, resultKind: "NUMERIC" },
    select: { subjectId: true, paperId: true, numericScore: true },
  }) as Array<{ subjectId: string | null; paperId: string | null; numericScore: number | null }>;
  const itemScoreMap = new Map(items.map((i) => [i.paperId ?? "", i.numericScore]));

  const subjectResults: SeniorSubjectResult[] = await Promise.all(subjects.map(async (subj) => {
    const sPapers = papersBySubject.get(subj.id) ?? [];
    const scores   = sPapers.map((p) => itemScoreMap.get(p.id) ?? null);
    const maxMarks = sPapers.map((p) => p.maxMarks);
    const pct = subjectScore(scores, maxMarks);

    // Resolve grade from the school's active CBE scale (falls back to govt default).
    const gradeResult = pct !== null ? await resolveCbeGrade(schoolId, pct, 100) : null;

    return {
      subject:         { id: subj.id, name: subj.name, code: subj.code },
      weightedScore:   pct !== null ? Math.round(pct * 10) / 10 : null,
      indicativeGrade: gradeResult?.bandName ?? null,
    };
  }));

  const scores = subjectResults.map((r) => r.weightedScore).filter((v): v is number => v !== null);
  const overallMean = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

  return {
    kind: "SENIOR",
    student: { id: student.id, fullName: student.fullName, admissionNumber: student.admissionNumber },
    schoolClass: student.schoolClass,
    period: { id: period.id, name: period.name, academicYear: period.academicYear, term: period.term },
    school: { name: school?.name ?? "" },
    subjects: subjectResults,
    overallWeightedMean: overallMean,
    narrativeSummary: "",
  };
}

// ---------------------------------------------------------------------------
// buildCbeReportCard — auto-selects junior vs senior
// Heuristic: if the framework has LearningAreas → Junior CBE (performance levels);
// if it has Papers → Senior CBE (numeric pathway scores).
// ---------------------------------------------------------------------------

export async function buildCbeReportCard(
  studentId: string,
  periodId: string,
  schoolId: string
): Promise<CbeReportCardData | null> {
  // Determine which branch to use from the framework's content.
  const [period, cbeFramework] = await Promise.all([
    db.assessmentPeriod.findFirst({ where: { id: periodId, schoolId }, select: { id: true } }),
    resolveActiveFramework(schoolId, "CBE"),
  ]);
  if (!period || !cbeFramework) return null;

  const [laCount, paperCount] = await Promise.all([
    db.learningArea.count({ where: { frameworkId: cbeFramework.id } }),
    db.paper.count({ where: { frameworkId: cbeFramework.id } }),
  ]);

  // Prefer Junior (performance-level) when learning areas exist.
  if (laCount > 0) return buildJuniorReportCard(studentId, periodId, schoolId);
  if (paperCount > 0) return buildSeniorReportCard(studentId, periodId, schoolId);
  // Fall back to junior (empty result is better than null).
  return buildJuniorReportCard(studentId, periodId, schoolId);
}

// ---------------------------------------------------------------------------
// buildCbeClassReportCards
// ---------------------------------------------------------------------------

export async function buildCbeClassReportCards(
  classId: string,
  periodId: string,
  schoolId: string
): Promise<{
  schoolClass: { id: string; name: string; form: number };
  period: { id: string; name: string; academicYear: string; term: number | null };
  school: { name: string };
  kind: CbeReportKind;
  students: CbeReportCardData[];
} | null> {
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, schoolId },
    select: { id: true, name: true, form: true },
  });
  if (!schoolClass) return null;

  const [period, cbeFramework] = await Promise.all([
    db.assessmentPeriod.findFirst({
      where: { id: periodId, schoolId },
      select: { id: true, name: true, academicYear: true, term: true },
    }) as Promise<{ id: string; name: string; academicYear: string; term: number | null } | null>,
    resolveActiveFramework(schoolId, "CBE"),
  ]);
  if (!period || !cbeFramework) return null;

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });

  const students = await prisma.student.findMany({
    where: { classId, schoolId },
    orderBy: { admissionNumber: "asc" },
    select: { id: true },
  });

  const [laCount] = await Promise.all([
    db.learningArea.count({ where: { frameworkId: cbeFramework.id } }),
  ]);
  const kind: CbeReportKind = laCount > 0 ? "JUNIOR" : "SENIOR";

  const cards = await Promise.all(
    students.map((s) => buildCbeReportCard(s.id, periodId, schoolId))
  );

  return {
    schoolClass,
    period: { id: period.id, name: period.name, academicYear: period.academicYear, term: period.term },
    school: { name: school?.name ?? "" },
    kind,
    students: cards.filter((c): c is CbeReportCardData => c !== null),
  };
}
