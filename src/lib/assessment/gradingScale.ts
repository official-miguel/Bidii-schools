/**
 * Data-driven CBE grading scale service.
 *
 * Replaces the hardcoded GRADE_BANDS / scoreToGrade() call chain with a
 * database-backed lookup that:
 *   1. Checks for an active school-specific scale (schoolId = given school).
 *   2. Falls back to the government default (schoolId IS NULL) when none exists.
 *
 * The government default rows are the KNEC CBE Achievement Level scale
 * (EE1–BE2, 8 bands), seeded by migration
 * 20260906100000_cbe_grading_scale_knec_default.
 *
 * The 8-4-4 / KCSE grading (grading844.ts / scoreToGrade()) is completely
 * separate and is not affected by this module.
 *
 * This module is SERVER-ONLY (imports Prisma).
 */

import { prisma } from "@/lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GradeBand {
  id: string;
  schoolId: string | null;
  bandName: string;
  achievementLevel: number;
  minPercentage: number;
  maxPercentage: number;
  points: number;
  description: string;
  isActive: boolean;
}

export interface CbeGradeResult {
  rawScore: number;
  totalMarks: number;
  percentage: number;
  bandName: string;
  achievementLevel: number;
  points: number;
  description: string;
  /** true when the school has no custom scale and the default was used */
  usedDefault: boolean;
}

// ---------------------------------------------------------------------------
// Validation helpers (used by both service and API route)
// ---------------------------------------------------------------------------

export interface BandValidationError {
  field: string;
  message: string;
}

/**
 * Validate a candidate set of band rows before saving as a custom scale.
 * Returns an array of errors; empty array means the scale is valid.
 *
 * Rules enforced:
 *   - At least one band.
 *   - All minPercentage / maxPercentage values in [0, 100].
 *   - min < max for every band.
 *   - No two bands overlap (their ranges must be disjoint).
 *   - No gaps between the lowest min and the highest max
 *     (the complete 0–100 range must be covered — same contract as the
 *      government default).
 *   - bandName and description are non-empty strings.
 *   - achievementLevel and points are positive integers.
 */
export function validateBands(
  bands: Array<{
    bandName: string;
    achievementLevel: number;
    minPercentage: number;
    maxPercentage: number;
    points: number;
    description?: string;
  }>
): BandValidationError[] {
  const errors: BandValidationError[] = [];

  if (!bands || bands.length === 0) {
    errors.push({ field: "bands", message: "At least one band is required." });
    return errors;
  }

  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    const prefix = `bands[${i}]`;

    if (!b.bandName || b.bandName.trim() === "") {
      errors.push({ field: `${prefix}.bandName`, message: "Band name is required." });
    }
    if (!Number.isInteger(b.achievementLevel) || b.achievementLevel < 1) {
      errors.push({ field: `${prefix}.achievementLevel`, message: "Achievement level must be a positive integer." });
    }
    if (!Number.isInteger(b.points) || b.points < 1) {
      errors.push({ field: `${prefix}.points`, message: "Points must be a positive integer." });
    }
    if (typeof b.minPercentage !== "number" || b.minPercentage < 0 || b.minPercentage > 100) {
      errors.push({ field: `${prefix}.minPercentage`, message: "Min percentage must be between 0 and 100." });
    }
    if (typeof b.maxPercentage !== "number" || b.maxPercentage < 0 || b.maxPercentage > 100) {
      errors.push({ field: `${prefix}.maxPercentage`, message: "Max percentage must be between 0 and 100." });
    }
    if (
      typeof b.minPercentage === "number" &&
      typeof b.maxPercentage === "number" &&
      b.minPercentage >= b.maxPercentage
    ) {
      errors.push({ field: `${prefix}.minPercentage`, message: `min (${b.minPercentage}) must be less than max (${b.maxPercentage}).` });
    }
  }

  // Stop here if basic field errors exist — overlap/gap checks need valid ranges.
  if (errors.length > 0) return errors;

  // Sort by minPercentage ascending for gap/overlap checks.
  const sorted = [...bands].sort((a, b) => a.minPercentage - b.minPercentage);

  // The full scale must cover 0–100 (same contract as the government default).
  if (Math.abs(sorted[0].minPercentage - 0) > 0.001) {
    errors.push({ field: "bands", message: `Scale must start at 0% (lowest band starts at ${sorted[0].minPercentage}%).` });
  }
  if (Math.abs(sorted[sorted.length - 1].maxPercentage - 100) > 0.001) {
    errors.push({ field: "bands", message: `Scale must end at 100% (highest band ends at ${sorted[sorted.length - 1].maxPercentage}%).` });
  }

  // Check for overlaps and gaps between adjacent bands.
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur  = sorted[i];
    const next = sorted[i + 1];

    // Overlap: current max >= next min.
    if (cur.maxPercentage >= next.minPercentage) {
      errors.push({
        field: "bands",
        message: `Bands "${cur.bandName}" (${cur.minPercentage}–${cur.maxPercentage}%) and "${next.bandName}" (${next.minPercentage}–${next.maxPercentage}%) overlap.`,
      });
    }

    // Gap: next.min > cur.max + allowed-step.
    // We allow two legitimate stepping conventions:
    //   • Float-step: e.g. 74.99 → 75.00  (gap ≈ 0.01) — old KCSE style
    //   • Integer-step: e.g. 10 → 11       (gap = 1.0)  — KNEC CBE style
    // Anything larger than 1 integer point is a real gap and is rejected.
    const gap = next.minPercentage - cur.maxPercentage;
    if (gap > 1.0) {
      errors.push({
        field: "bands",
        message: `Gap between "${cur.bandName}" (ends ${cur.maxPercentage}%) and "${next.bandName}" (starts ${next.minPercentage}%) — no gaps allowed.`,
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/** Fetch the government default scale (schoolId IS NULL, isActive = true). */
export async function getGovernmentDefaultScale(): Promise<GradeBand[]> {
  return db.cbeGradingScale.findMany({
    where: { schoolId: null, isActive: true },
    orderBy: { minPercentage: "desc" },
  }) as Promise<GradeBand[]>;
}

/**
 * Fetch the active custom scale for a school.
 * Returns an empty array when the school has not set a custom scale.
 */
export async function getSchoolCustomScale(schoolId: string): Promise<GradeBand[]> {
  return db.cbeGradingScale.findMany({
    where: { schoolId, isActive: true },
    orderBy: { minPercentage: "desc" },
  }) as Promise<GradeBand[]>;
}

/**
 * Returns the scale that should be used for a given school:
 *   • School custom scale if one exists (isActive = true rows for that school).
 *   • Government default otherwise (schoolId IS NULL).
 *
 * Also returns a flag indicating which was used.
 */
export async function resolveScale(
  schoolId: string
): Promise<{ bands: GradeBand[]; usedDefault: boolean }> {
  const custom = await getSchoolCustomScale(schoolId);
  if (custom.length > 0) {
    return { bands: custom, usedDefault: false };
  }
  const defaults = await getGovernmentDefaultScale();
  return { bands: defaults, usedDefault: true };
}

// ---------------------------------------------------------------------------
// Core grading function
// ---------------------------------------------------------------------------

/**
 * Convert a raw score to a CBE grade band using the school's active scale
 * (or the government default if the school has no custom scale).
 *
 * This is the single replacement for every direct `scoreToGrade(percentage)`
 * call in the CBE pathway.  Call sites previously did:
 *
 *   const grade = scoreToGrade(weightedPct).grade;  // → KcseGrade string
 *
 * They should now do:
 *
 *   const result = await resolveCbeGrade(schoolId, rawScore, totalMarks);
 *   const bandName = result.bandName;   // e.g. "B+"
 *   const points   = result.points;     // e.g. 10
 *
 * When the pathway score is already pre-computed as a percentage (0–100),
 * pass totalMarks = 100 and rawScore = percentage.
 *
 * Returns null only when the database has no bands at all (should never
 * happen after migration, but callers should handle it gracefully).
 */
export async function resolveCbeGrade(
  schoolId: string,
  rawScore: number,
  totalMarks: number
): Promise<CbeGradeResult | null> {
  if (totalMarks <= 0) return null;

  // Full-precision percentage for lookup.
  // We round to 10 decimal places to eliminate floating-point artifacts such
  // as (58 / 100) * 100 = 57.99999999999999 in IEEE-754 arithmetic.
  // The displayed value is further rounded to 1 d.p. for UI purposes only.
  const rawPct     = Math.round((rawScore / totalMarks) * 100 * 1e10) / 1e10;
  const percentage = Math.round(rawPct * 10) / 10; // 1 d.p. — display only
  const { bands, usedDefault } = await resolveScale(schoolId);

  if (bands.length === 0) return null;

  // Match the original GRADE_BANDS semantics exactly: sort bands by
  // minPercentage descending and return the first band where
  // rawPct >= minPercentage.  This is identical to the old:
  //   for (const [lower, grade, points] of GRADE_BANDS)
  //     if (clamped >= lower) return ...
  // The maxPercentage column in the DB is informational (used for the UI
  // table and gap/overlap validation) but NOT used for lookup.
  const sorted  = [...bands].sort((a, b) => b.minPercentage - a.minPercentage);
  const clamped = Math.max(0, Math.min(100, rawPct));
  const band    = sorted.find((b) => clamped >= b.minPercentage);

  if (!band) {
    // Shouldn't happen after migration, but defensively return lowest band.
    return {
      rawScore,
      totalMarks,
      percentage,
      bandName:         sorted[sorted.length - 1].bandName,
      achievementLevel: sorted[sorted.length - 1].achievementLevel,
      points:           sorted[sorted.length - 1].points,
      description:      sorted[sorted.length - 1].description,
      usedDefault,
    };
  }

  return {
    rawScore,
    totalMarks,
    percentage,
    bandName:         band.bandName,
    achievementLevel: band.achievementLevel,
    points:           band.points,
    description:      band.description,
    usedDefault,
  };
}

// ---------------------------------------------------------------------------
// Scale management (used by the API route)
// ---------------------------------------------------------------------------

/**
 * Save a custom scale for a school.  Wraps everything in a transaction:
 *   1. Deactivate all existing custom rows for this school.
 *   2. Insert the new rows (all isActive = true).
 *
 * Callers MUST validate the bands first using validateBands().
 */
export async function saveCustomScale(
  schoolId: string,
  bands: Array<{
    bandName: string;
    achievementLevel: number;
    minPercentage: number;
    maxPercentage: number;
    points: number;
    description: string;
  }>
): Promise<GradeBand[]> {
  await prisma.$transaction(async (tx) => {
    // Deactivate existing custom rows for this school.
    await (tx as any).cbeGradingScale.updateMany({
      where: { schoolId, isActive: true },
      data:  { isActive: false },
    });

    // Insert new rows.
    for (const band of bands) {
      await (tx as any).cbeGradingScale.create({
        data: {
          schoolId,
          bandName:         band.bandName,
          achievementLevel: band.achievementLevel,
          minPercentage:    band.minPercentage,
          maxPercentage:    band.maxPercentage,
          points:           band.points,
          description:      band.description,
          isActive:         true,
        },
      });
    }
  });

  return getSchoolCustomScale(schoolId);
}

/**
 * Remove a school's custom scale, reverting them to the government default.
 * Soft-delete: sets isActive = false on all custom rows rather than hard
 * deleting — preserves history and is easily reversible.
 */
export async function resetToDefault(schoolId: string): Promise<void> {
  await db.cbeGradingScale.updateMany({
    where: { schoolId, isActive: true },
    data:  { isActive: false },
  });
}
