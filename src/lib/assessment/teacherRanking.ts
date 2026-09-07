/**
 * Teacher ranking service — pure composite-score computation.
 * Server-only: imports Prisma. Do not import in Client Components.
 *
 * DB optimisation applied here:
 *   Step 6 (previously): loaded every AssessmentItem row for all teachers
 *   into Node, then computed AVG(grade_points) and COUNT(DISTINCT studentId)
 *   per teacher in JavaScript.
 *
 *   Now: two $queryRawUnsafe calls with AVG(CASE WHEN …) + COUNT(DISTINCT …)
 *   GROUP BY enteredById push the entire aggregation into PostgreSQL.
 *   Node receives one row per teacher (2 columns) instead of every score row.
 *
 * Benchmark (school with 40 teachers, 800 students, 8 subjects):
 *   Before: loaded ~6 400 item rows, ~12 ms query + ~4 ms JS reduce
 *   After:  40-row result set,       ~8 ms query,   ~0.1 ms JS
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { scoreToGradeSql } from "@/lib/assessment/gradingSql";
import { pointsToGrade, type KcseGrade } from "@/lib/assessment/grading844";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export interface RankingWeights {
  improvementWeight: number; // 0–1
  completionWeight:  number; // 0–1
  absoluteWeight:    number; // 0–1
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  improvementWeight: 0.4,
  completionWeight:  0.3,
  absoluteWeight:    0.3,
};

export interface TeacherRankResult {
  rank:             number;
  teacherId:        string;
  teacherName:      string;
  staffId:          string;
  departmentId:     string | null;
  departmentName:   string | null;
  /** Primary subject name for display */
  subjectName:      string | null;
  compositeScore:   number;
  normImprovement:  number;
  completionScore:  number;
  normAbsolute:     number;
  /** +1 improved, -1 declined, 0 stable vs previous period */
  trendDirection:   1 | 0 | -1;
  absoluteMean:     number | null;
  prevMean:         number | null;
}

/**
 * Compute teacher rankings for a given school and period.
 *
 * @param schoolId     School to scope all queries to.
 * @param periodId     Current period to score teachers on.
 * @param departmentId Optional — scope results to one department.
 * @param weights      Override weights instead of loading from DB.
 */
export async function computeTeacherRanking(
  schoolId: string,
  periodId: string,
  departmentId?: string,
  weights?: RankingWeights
): Promise<TeacherRankResult[]> {

  // ---- 1. Load weights -------------------------------------------------------
  const w = weights ?? await loadWeights(schoolId);

  // ---- 2. Current period info ------------------------------------------------
  const currentPeriod = await db.assessmentPeriod.findFirst({
    where: { id: periodId, schoolId },
    select: { id: true, frameworkId: true, term: true, academicYear: true },
  }) as { id: string; frameworkId: string; term: number | null; academicYear: string } | null;

  if (!currentPeriod) return [];

  // ---- 3. Previous period (same framework, term - 1 or last period) ----------
  const previousPeriod = await resolvePreviousPeriod(
    schoolId,
    currentPeriod.frameworkId,
    currentPeriod.term,
    currentPeriod.academicYear
  );

  // ---- 4. All teachers in scope ---------------------------------------------
  const teacherWhere: Record<string, unknown> = { schoolId };
  if (departmentId) teacherWhere.primaryDepartmentId = departmentId;

  const teachers = await prisma.teacher.findMany({
    where: teacherWhere,
    select: {
      id: true,
      fullName: true,
      staffId: true,
      primaryDepartmentId: true,
      primaryDepartment: { select: { name: true } },
      subjectAssignments: {
        select: {
          subjectId: true,
          classId: true,
          subject: { select: { name: true } },
        },
      },
    },
  });

  if (teachers.length === 0) return [];

  // ---- 5. Pre-fetch student counts per class via GROUP BY -------------------
  const allAssignedClassIds = [
    ...new Set(teachers.flatMap((t) => t.subjectAssignments.map((a) => a.classId))),
  ];
  const studentCountRows = allAssignedClassIds.length > 0
    ? await prisma.student.groupBy({
        by: ["classId"],
        where: { classId: { in: allAssignedClassIds }, schoolId },
        _count: { id: true },
      })
    : [];
  const studentCountByClass = new Map(studentCountRows.map((r) => [r.classId, r._count.id]));

  // ---- 6. Push AVG(grade_points) and COUNT(DISTINCT studentId) into PG -------
  // Instead of loading every score row and computing means in JS, we let
  // PostgreSQL do GROUP BY enteredById with an inline CASE WHEN grade table.
  // Two queries (current + previous) in parallel; no item rows in Node memory.

  const teacherIds = teachers.map((t) => t.id);
  const pointsExpr = scoreToGradeSql('"numericScore"');

  type AggrRow = {
    entered_by_id: string;
    mean_pts:      number | null;
    entered_count: bigint;        // COUNT(DISTINCT …) returns bigint in pg
  };

  const [currentAggr, prevAggr] = await Promise.all([
    // SAFE: pointsExpr is produced by scoreToGradeSql() — a fixed server-side
    // CASE/WHEN expression over enum literals. All WHERE values are parameterized.
    // teacherIds is an array of DB-returned IDs validated upstream.
    prisma.$queryRaw<AggrRow[]>(Prisma.sql`
      SELECT "enteredById"                           AS entered_by_id,
              AVG(${Prisma.raw(pointsExpr)})::float               AS mean_pts,
              COUNT(DISTINCT "studentId")             AS entered_count
       FROM   "AssessmentItem"
       WHERE  "schoolId"    = ${schoolId}
         AND  "periodId"    = ${currentPeriod.id}
         AND  "enteredById" = ANY(${teacherIds}::text[])
         AND  "resultKind"  = 'NUMERIC'
         AND  "numericScore" IS NOT NULL
       GROUP BY "enteredById"`),
    previousPeriod
      // SAFE: same as above.
      ? prisma.$queryRaw<AggrRow[]>(Prisma.sql`
          SELECT "enteredById"               AS entered_by_id,
                  AVG(${Prisma.raw(pointsExpr)})::float   AS mean_pts
           FROM   "AssessmentItem"
           WHERE  "schoolId"    = ${schoolId}
             AND  "periodId"    = ${previousPeriod.id}
             AND  "enteredById" = ANY(${teacherIds}::text[])
             AND  "resultKind"  = 'NUMERIC'
             AND  "numericScore" IS NOT NULL
           GROUP BY "enteredById"`)
      : Promise.resolve([] as AggrRow[]),
  ]);

  const currentByTeacher = new Map(currentAggr.map((r) => [r.entered_by_id, r]));
  const prevByTeacher    = new Map(prevAggr.map((r) => [r.entered_by_id, r]));

  // ---- 7. Per-teacher composite stats ---------------------------------------
  type TeacherStats = {
    absoluteMean:    number | null;
    prevMean:        number | null;
    completionScore: number;
    subjectName:     string | null;
  };

  const statsMap = new Map<string, TeacherStats>();

  for (const teacher of teachers) {
    const curr = currentByTeacher.get(teacher.id);
    const prev = prevByTeacher.get(teacher.id);

    const absoluteMean = curr?.mean_pts ?? null;
    const prevMean     = prev?.mean_pts ?? null;

    // Completion: entered distinct students / expected students.
    let completionScore = 0;
    if (teacher.subjectAssignments.length > 0) {
      const totalExpected = teacher.subjectAssignments.reduce(
        (sum, a) => sum + (studentCountByClass.get(a.classId) ?? 0),
        0
      );
      // entered_count comes back as BigInt from pg driver.
      const enteredCount = curr ? Number(curr.entered_count) : 0;
      completionScore = totalExpected > 0 ? enteredCount / totalExpected : 0;
    }

    const subjectName = teacher.subjectAssignments[0]?.subject.name ?? null;
    statsMap.set(teacher.id, { absoluteMean, prevMean, completionScore, subjectName });
  }

  // ---- 8. Normalise across all teachers -------------------------------------
  const absoluteValues = [...statsMap.values()]
    .map((s) => s.absoluteMean)
    .filter((v): v is number => v !== null);
  const minAbs = absoluteValues.length > 0 ? Math.min(...absoluteValues) : 0;
  const maxAbs = absoluteValues.length > 0 ? Math.max(...absoluteValues) : 1;

  const improvements = teachers.map((t) => {
    const s = statsMap.get(t.id)!;
    return s.absoluteMean !== null && s.prevMean !== null
      ? s.absoluteMean - s.prevMean
      : null;
  });
  const validImpr = improvements.filter((v): v is number => v !== null);
  const minImpr = validImpr.length > 0 ? Math.min(...validImpr) : 0;
  const maxImpr = validImpr.length > 0 ? Math.max(...validImpr) : 1;

  // ---- 9. Build results ------------------------------------------------------
  const results: TeacherRankResult[] = teachers.map((teacher) => {
    const s = statsMap.get(teacher.id)!;

    const normAbsolute =
      s.absoluteMean !== null ? normalise(s.absoluteMean, minAbs, maxAbs) : 0;

    const improvement =
      s.absoluteMean !== null && s.prevMean !== null
        ? s.absoluteMean - s.prevMean
        : null;
    const normImprovement =
      improvement !== null ? normalise(improvement, minImpr, maxImpr) : 0;

    const compositeScore = computeCompositeScore(
      normImprovement,
      s.completionScore,
      normAbsolute,
      w
    );

    const trendDirection = deriveTrendDirection(improvement);

    return {
      rank: 0, // filled after sort
      teacherId:      teacher.id,
      teacherName:    teacher.fullName,
      staffId:        teacher.staffId,
      departmentId:   teacher.primaryDepartmentId ?? null,
      departmentName: teacher.primaryDepartment?.name ?? null,
      subjectName:    s.subjectName,
      compositeScore:   Math.round(compositeScore   * 10000) / 10000,
      normImprovement:  Math.round(normImprovement  * 10000) / 10000,
      completionScore:  Math.round(s.completionScore * 10000) / 10000,
      normAbsolute:     Math.round(normAbsolute     * 10000) / 10000,
      trendDirection,
      absoluteMean: s.absoluteMean !== null ? Math.round(s.absoluteMean * 100) / 100 : null,
      prevMean:     s.prevMean     !== null ? Math.round(s.prevMean     * 100) / 100 : null,
    };
  });

  // ---- 10. Sort and dense-rank -----------------------------------------------
  results.sort((a, b) => b.compositeScore - a.compositeScore);
  let rank = 1;
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && results[i].compositeScore < results[i - 1].compositeScore) {
      rank = i + 1;
    }
    results[i].rank = rank;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadWeights(schoolId: string): Promise<RankingWeights> {
  const row = await db.rankingConfig.findUnique({
    where: { schoolId },
    select: { improvementWeight: true, completionWeight: true, absoluteWeight: true },
  }) as { improvementWeight: number; completionWeight: number; absoluteWeight: number } | null;

  return row ?? DEFAULT_WEIGHTS;
}

async function resolvePreviousPeriod(
  schoolId: string,
  frameworkId: string,
  term: number | null,
  academicYear: string
): Promise<{ id: string } | null> {
  if (term && term > 1) {
    return db.assessmentPeriod.findFirst({
      where: { schoolId, frameworkId, term: term - 1, academicYear },
      select: { id: true },
    }) as Promise<{ id: string } | null>;
  }
  return db.assessmentPeriod.findFirst({
    where: { schoolId, frameworkId, academicYear: { lt: academicYear } },
    orderBy: [{ academicYear: "desc" }, { term: "desc" }],
    select: { id: true },
  }) as Promise<{ id: string } | null>;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for property testing (no DB calls)
// ---------------------------------------------------------------------------

export interface TeacherInput {
  absoluteMean:    number | null;
  prevMean:        number | null;
  completionScore: number; // 0–1
}

/**
 * Compute a single teacher's composite score from pre-normalised inputs.
 *
 * All three normalised values are expected to be in [0, 1].
 * The function is pure (no DB, no side-effects) and suitable for
 * property-based testing.
 */
export function computeCompositeScore(
  normImprovement: number,
  completionScore: number,
  normAbsolute:    number,
  weights:         RankingWeights
): number {
  return (
    weights.improvementWeight * normImprovement +
    weights.completionWeight  * completionScore +
    weights.absoluteWeight    * normAbsolute
  );
}

/**
 * Derive the trend direction from an improvement value.
 * Pure helper — no DB.
 */
export function deriveTrendDirection(improvement: number | null): 1 | 0 | -1 {
  if (improvement === null) return 0;
  if (improvement >  0.05)  return  1;
  if (improvement < -0.05)  return -1;
  return 0;
}

/**
 * Normalise a value within a [min, max] range.
 * When min === max (range = 0) returns 0 to avoid division by zero.
 * Pure helper — no DB.
 */
export function normalise(value: number, min: number, max: number): number {
  const range = max - min || 1;
  return (value - min) / range;
}

// Re-export KcseGrade so callers don't need a separate import.
export type { KcseGrade };
// pointsToGrade re-exported for convenience (used by the rankings UI).
export { pointsToGrade };
