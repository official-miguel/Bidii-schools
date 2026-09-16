/**
 * Server-only companion to ./subjectMark: loads the Head-of-Department mark
 * formulas for an exam period so analysis routes can resolve subject marks the
 * same way the mark sheet does.
 */

import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/**
 * A `(subjectId, form) → formula` lookup for one exam period, built from a
 * single query.
 *
 * Mirrors the resolution order of
 * /api/assessments/department-formulas/for-marksheet:
 *   1. the formula set for that exact class level, then
 *   2. the subject-wide formula (form 0), then
 *   3. none.
 */
export type FormulaResolver = (subjectId: string, form: number) => string | null;

/** A resolver that reports "no formula configured" for everything. */
export const NO_FORMULAS: FormulaResolver = () => null;

/**
 * Build one resolver per requested period in a single query — analysis screens
 * need every period at once for their trend charts, and a query per period
 * would turn that into N round-trips.
 *
 * Periods with no configured formulas still get a resolver, so callers can
 * index the map without null-checking.
 */
export async function loadFormulaResolvers(
  schoolId: string,
  periodIds: string[]
): Promise<Map<string, FormulaResolver>> {
  const resolvers = new Map<string, FormulaResolver>();
  for (const id of periodIds) resolvers.set(id, NO_FORMULAS);
  if (periodIds.length === 0) return resolvers;

  let configs: Array<{ periodId: string; subjectId: string; form: number; formula: string }> = [];
  try {
    configs = await db.departmentFormulaConfig.findMany({
      where: { schoolId, periodId: { in: periodIds } },
      select: { periodId: true, subjectId: true, form: true, formula: true },
    });
  } catch {
    // Table not migrated yet — behave as if no formulas are configured.
    return resolvers;
  }

  const byPeriod = new Map<string, Map<string, string>>();
  for (const c of configs) {
    if (!c.formula || c.formula.trim() === "") continue;
    let byKey = byPeriod.get(c.periodId);
    if (!byKey) { byKey = new Map(); byPeriod.set(c.periodId, byKey); }
    byKey.set(`${c.subjectId}:${c.form}`, c.formula);
  }

  for (const [periodId, byKey] of byPeriod) {
    resolvers.set(periodId, (subjectId, form) =>
      byKey.get(`${subjectId}:${form}`) ?? byKey.get(`${subjectId}:0`) ?? null
    );
  }

  return resolvers;
}
