/**
 * Pure CBE grading functions.
 * No Prisma or server-only imports — safe to use in both Server and Client
 * Components.
 */

export type PerformanceLevel = "EE" | "ME" | "AE" | "BE";

export interface LevelResult {
  level: PerformanceLevel;
  /** Integer 1–4 for aggregation purposes. */
  points: number;
  label: string;
}

/** Numeric point value for each performance level (for mean computation). */
export const LEVEL_POINTS: Record<PerformanceLevel, number> = {
  EE: 4,
  ME: 3,
  AE: 2,
  BE: 1,
};

/** Full human-readable label for each level. */
export const LEVEL_LABELS: Record<PerformanceLevel, string> = {
  EE: "Exceeds Expectation",
  ME: "Meets Expectation",
  AE: "Approaches Expectation",
  BE: "Below Expectation",
};

/** Short display label (used in grid headers and badges). */
export const LEVEL_SHORT: Record<PerformanceLevel, string> = {
  EE: "EE",
  ME: "ME",
  AE: "AE",
  BE: "BE",
};

/**
 * Tailwind colour classes for each performance level.
 * Used by CbeJuniorGrid, CbeDashboard, and report components.
 */
export function levelColour(level: PerformanceLevel): { bg: string; text: string; border: string } {
  switch (level) {
    case "EE":
      return { bg: "bg-green-100",  text: "text-green-800",  border: "border-green-300" };
    case "ME":
      return { bg: "bg-blue-100",   text: "text-blue-800",   border: "border-blue-300"  };
    case "AE":
      return { bg: "bg-amber-100",  text: "text-amber-800",  border: "border-amber-300" };
    case "BE":
      return { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" };
  }
}

/**
 * Compute the mean attainment score (1–4 scale) from an array of performance
 * levels. Null entries (Not_Yet_Entered) are excluded from the average.
 * Returns null if there are no valid entries.
 * Rounded to 2 decimal places.
 */
export function meanAttainment(levels: (PerformanceLevel | null)[]): number | null {
  const valid = levels.filter((l): l is PerformanceLevel => l !== null);
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, l) => acc + LEVEL_POINTS[l], 0);
  return Math.round((sum / valid.length) * 100) / 100;
}

/**
 * Map a mean attainment score (1–4) back to the closest performance level.
 * Used for learning area / class summaries.
 */
export function attainmentToLevel(mean: number): PerformanceLevel {
  if (mean >= 3.5) return "EE";
  if (mean >= 2.5) return "ME";
  if (mean >= 1.5) return "AE";
  return "BE";
}

/**
 * Compute the weighted pathway score (0–100 percentage) from SBA and exam
 * components. Returns null if either required score is null (Not_Entered).
 *
 * @param sbaScore    Raw SBA score (0..sbaMaxMarks) or null
 * @param examScore   Raw exam score (0..examMaxMarks) or null
 * @param sbaWeight   Fraction of final score from SBA (e.g. 0.6)
 * @param examWeight  Fraction of final score from exam (e.g. 0.4)
 * @param sbaMaxMarks Maximum marks for SBA component
 * @param examMaxMarks Maximum marks for exam component
 */
export function pathwayScore(
  sbaScore: number | null,
  examScore: number | null,
  sbaWeight: number,
  examWeight: number,
  sbaMaxMarks: number,
  examMaxMarks: number
): number | null {
  if (sbaScore === null || examScore === null) return null;
  if (sbaMaxMarks <= 0 || examMaxMarks <= 0) return null;
  return (sbaScore / sbaMaxMarks) * sbaWeight * 100 +
         (examScore / examMaxMarks) * examWeight * 100;
}

/** All performance levels in descending order (EE → BE). */
export const ALL_LEVELS: PerformanceLevel[] = ["EE", "ME", "AE", "BE"];

/**
 * A single grading band as returned by GET /api/assessments/cbe/grading-scale
 * (school custom scale if configured, government KNEC default otherwise).
 */
export interface CbeBand {
  bandName: string;
  minPercentage: number;
  points: number;
}

/**
 * Client-safe percentage → band lookup, mirroring the matching rule in
 * resolveCbeGrade() (src/lib/assessment/gradingScale.ts, server-only): bands
 * sorted by minPercentage descending, return the first one the percentage
 * meets or exceeds. Used by CBE pathway grids/report views, which render
 * many cells synchronously and can't await a server call per cell — instead
 * they fetch `bands` once and resolve every cell against that same array,
 * so the grade shown always matches what the report card computes.
 */
export function bandForPercentage(pct: number, bands: CbeBand[]): CbeBand | null {
  if (bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => b.minPercentage - a.minPercentage);
  const clamped = Math.max(0, Math.min(100, pct));
  return sorted.find((b) => clamped >= b.minPercentage) ?? sorted[sorted.length - 1];
}

/** Tailwind colour classes by percentage — used where a band has no fixed
 * colour of its own (custom scales can have arbitrary band counts/names). */
export function cbePercentageColour(pct: number): { bg: string; text: string } {
  if (pct >= 75) return { bg: "bg-green-100",  text: "text-green-800" };
  if (pct >= 60) return { bg: "bg-blue-100",   text: "text-blue-800"  };
  if (pct >= 40) return { bg: "bg-amber-100",  text: "text-amber-800" };
  return             { bg: "bg-red-100",    text: "text-red-800"   };
}

/** Default pathway weights when no PathwayWeight row is configured. */
export const DEFAULT_PATHWAY_WEIGHT = {
  sbaWeight:    0.6,
  examWeight:   0.4,
  sbaMaxMarks:  100,
  examMaxMarks: 100,
} as const;
