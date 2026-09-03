/**
 * Parent portal utility functions.
 * Pure functions — no Prisma imports, no side effects.
 */

export interface PeriodStats {
  mean: number;
  percentage: number;
  count: number;
}

/**
 * Computes summary statistics for a list of assessment items.
 *
 * - Filters out items with a null numericScore.
 * - Returns `null` when there are no numeric scores to aggregate.
 * - `mean`       = sum / count, rounded to 2 decimal places.
 * - `percentage` = mean (max score is 100, so percentage === mean),
 *                  rounded to 1 decimal place.
 * - `count`      = number of non-null scores used in the computation.
 */
export function computePeriodStats(
  items: { numericScore: number | null }[]
): PeriodStats | null {
  const scores = items
    .map((i) => i.numericScore)
    .filter((n): n is number => n !== null);

  if (scores.length === 0) return null;

  const sum = scores.reduce((a, b) => a + b, 0);
  const mean = +((sum / scores.length).toFixed(2));
  const percentage = +(mean.toFixed(1));

  return { mean, percentage, count: scores.length };
}
