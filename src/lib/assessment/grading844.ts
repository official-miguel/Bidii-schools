/**
 * Pure KCSE 8-4-4 grading functions.
 * No Prisma or server-only imports — safe to use in both Server and Client
 * Components.
 */

export type KcseGrade =
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C'
  | 'C-'
  | 'D+'
  | 'D'
  | 'D-'
  | 'E';

export interface GradeResult {
  grade: KcseGrade;
  /** Integer 1–12 */
  points: number;
}

/**
 * Bands ordered from highest to lowest.
 * Each entry: [lowerBound (inclusive), grade, points]
 */
const GRADE_BANDS: Array<[number, KcseGrade, number]> = [
  [75, 'A',  12],
  [70, 'A-', 11],
  [65, 'B+', 10],
  [60, 'B',   9],
  [55, 'B-',  8],
  [50, 'C+',  7],
  [45, 'C',   6],
  [40, 'C-',  5],
  [35, 'D+',  4],
  [30, 'D',   3],
  [25, 'D-',  2],
  [ 0, 'E',   1],
];

/**
 * Map a 0–100 percentage to a KCSE grade and points.
 * Clamps values below 0 to E and above 100 to A.
 */
export function scoreToGrade(percentage: number): GradeResult {
  const clamped = Math.max(0, Math.min(100, percentage));
  for (const [lower, grade, points] of GRADE_BANDS) {
    if (clamped >= lower) {
      return { grade, points };
    }
  }
  // Fallback — mathematically unreachable given the 0 lower bound above.
  return { grade: 'E', points: 1 };
}

/**
 * Compute the subject score (0–100 percentage) from one or two papers.
 *
 * - Single paper: `(score / maxMarks) * 100`
 * - Two papers:   `(s1 * m1 + s2 * m2) / (m1 + m2) * 100` (weighted average)
 *
 * Returns null if ANY required paper score is null (Not_Entered).
 * A score of exactly 0 is a valid Genuine_Zero and IS included.
 *
 * @param paperScores  Parallel array of raw scores (null = Not_Entered).
 * @param paperMaxMarks Parallel array of maximum marks for each paper.
 */
export function subjectScore(
  paperScores: (number | null)[],
  paperMaxMarks: number[]
): number | null {
  if (paperScores.length === 0 || paperScores.length !== paperMaxMarks.length) {
    return null;
  }

  // Any null score means we cannot compute a subject score.
  for (const s of paperScores) {
    if (s === null) return null;
  }

  const totalWeightedScore = (paperScores as number[]).reduce(
    (sum, score, i) => sum + score * paperMaxMarks[i],
    0
  );
  const totalMaxMarks = paperMaxMarks.reduce((sum, m) => sum + m, 0);

  if (totalMaxMarks === 0) return null;

  return (totalWeightedScore / totalMaxMarks) * 100;
}

/**
 * Compute a student's mean grade from an array of per-subject grade points.
 *
 * - Null entries (Not_Entered / uncomputable subjects) are excluded.
 * - Returns null if there are no valid subject grades.
 * - `meanPoints` is rounded to 2 decimal places.
 */
export function meanGrade(
  subjectPoints: (number | null)[]
): { meanPoints: number; grade: KcseGrade } | null {
  const valid = subjectPoints.filter((p): p is number => p !== null);
  if (valid.length === 0) return null;

  const avg = valid.reduce((sum, p) => sum + p, 0) / valid.length;
  const meanPoints = Math.round(avg * 100) / 100;

  // Map meanPoints (1–12 scale) directly to a grade letter via pointsToGrade.
  return { meanPoints, grade: pointsToGrade(meanPoints) };
}

/**
 * Map a mean points value (1–12, possibly fractional) back to a KCSE grade
 * letter by finding the closest band.
 */
export function pointsToGrade(meanPoints: number): KcseGrade {
  // Iterate bands from highest to lowest; return the first one whose integer
  // points value is ≤ meanPoints (round-half-up semantics as per KCSE).
  for (const [, grade, points] of GRADE_BANDS) {
    if (meanPoints >= points - 0.5) {
      return grade;
    }
  }
  return 'E';
}

/**
 * Dense-rank an array of numeric scores (descending).
 * Null scores receive a null rank (unranked).
 * Ties share the same rank; the next distinct rank is incremented by 1.
 *
 * Example: [10, 10, 8, null] → [1, 1, 2, null]
 */
export function denseRank(scores: (number | null)[]): (number | null)[] {
  // Build sorted list of unique non-null scores descending.
  const unique = Array.from(new Set(scores.filter((s): s is number => s !== null))).sort(
    (a, b) => b - a
  );
  const rankMap = new Map<number, number>();
  unique.forEach((score, i) => rankMap.set(score, i + 1));

  return scores.map((s) => (s === null ? null : (rankMap.get(s) ?? null)));
}

/**
 * Grade band colour helper — returns Tailwind class strings for a given grade.
 * Used by both MarksheetGrid and DashboardCharts.
 */
export function gradeColour(grade: KcseGrade): { bg: string; text: string } {
  if (grade === 'A' || grade === 'A-') {
    return { bg: 'bg-green-100', text: 'text-green-800' };
  }
  if (grade === 'B+' || grade === 'B' || grade === 'B-') {
    return { bg: 'bg-blue-100', text: 'text-blue-800' };
  }
  if (grade === 'C+' || grade === 'C' || grade === 'C-') {
    return { bg: 'bg-amber-100', text: 'text-amber-800' };
  }
  if (grade === 'D+' || grade === 'D' || grade === 'D-') {
    return { bg: 'bg-orange-100', text: 'text-orange-800' };
  }
  // E
  return { bg: 'bg-red-100', text: 'text-red-800' };
}

/**
 * Grade band hex colour — same semantic mapping as gradeColour() but returns
 * a CSS hex string suitable for use in Recharts fill/stroke props.
 */
export function gradeColourHex(grade: KcseGrade): string {
  if (grade === 'A' || grade === 'A-') return '#16a34a'; // green-600
  if (grade === 'B+' || grade === 'B' || grade === 'B-') return '#2563eb'; // blue-600
  if (grade === 'C+' || grade === 'C' || grade === 'C-') return '#d97706'; // amber-600
  if (grade === 'D+' || grade === 'D' || grade === 'D-') return '#ea580c'; // orange-600
  return '#dc2626'; // red-600 — E
}

/**
 * Convenience: map mean grade points (1–12, possibly fractional) directly to
 * Tailwind colour classes. Combines pointsToGrade + gradeColour.
 */
export function pointsToColour(pts: number | null): { bg: string; text: string } {
  if (pts === null) return { bg: 'bg-background', text: 'text-slate' };
  return gradeColour(pointsToGrade(pts));
}

/**
 * Convenience: map mean grade points to a Recharts-compatible hex colour.
 * Combines pointsToGrade + gradeColourHex.
 */
export function pointsToColourHex(pts: number | null): string {
  if (pts === null) return '#e5e7eb'; // grey-200 — no data
  return gradeColourHex(pointsToGrade(pts));
}

/** All KCSE grades in descending order (A → E). */
export const ALL_GRADES: KcseGrade[] = [
  'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E',
];
