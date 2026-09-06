/**
 * SQL fragments for KCSE 8-4-4 grading pushed into PostgreSQL.
 *
 * scoreToGrade() maps a 0–100 percentage to integer points 1–12.
 * This file exposes the same mapping as a CASE WHEN expression so
 * analytics queries can use AVG / SUM / GROUP BY over grade points
 * directly in the database, rather than loading raw scores into Node
 * and running the lookup table there.
 *
 * Server-only — never imported in Client Components.
 */

/**
 * Returns a SQL CASE WHEN expression that maps a numeric column
 * (expected 0–100) to its KCSE integer grade points (1–12).
 *
 * The bands mirror GRADE_BANDS in grading844.ts exactly:
 *   ≥75 → 12 (A), ≥70 → 11 (A-), ≥65 → 10 (B+), ≥60 → 9 (B),
 *   ≥55 → 8 (B-), ≥50 → 7 (C+), ≥45 → 6 (C), ≥40 → 5 (C-),
 *   ≥35 → 4 (D+), ≥30 → 3 (D), ≥25 → 2 (D-), else → 1 (E)
 *
 * @param col  SQL expression for the percentage value, e.g. `"numericScore"`
 */
export function scoreToGradeSql(col: string): string {
  return `CASE
    WHEN ${col} >= 75 THEN 12
    WHEN ${col} >= 70 THEN 11
    WHEN ${col} >= 65 THEN 10
    WHEN ${col} >= 60 THEN  9
    WHEN ${col} >= 55 THEN  8
    WHEN ${col} >= 50 THEN  7
    WHEN ${col} >= 45 THEN  6
    WHEN ${col} >= 40 THEN  5
    WHEN ${col} >= 35 THEN  4
    WHEN ${col} >= 30 THEN  3
    WHEN ${col} >= 25 THEN  2
    ELSE                     1
  END`;
}

/**
 * CBE performance-level numeric mapping, mirroring LEVEL_POINTS in gradingCbe.ts:
 *   'EE' → 4, 'ME' → 3, 'AE' → 2, 'BE' → 1
 *
 * @param col  SQL expression for the performanceLevel enum column
 */
export function levelToPointsSql(col: string): string {
  return `CASE ${col}
    WHEN 'EE' THEN 4
    WHEN 'ME' THEN 3
    WHEN 'AE' THEN 2
    WHEN 'BE' THEN 1
    ELSE NULL
  END`;
}
